import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { RelayConfig } from "./config.js";
import { UsageStore, type DenyCode } from "./usage-store.js";

/** One line per request. Counts, tokens and hashed ids only: never text, keys or tokens. */
export interface RelayLogEntry {
  event: "install" | "chat" | "usage" | "admin";
  status: number;
  install?: string;
  ip?: string;
  code?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  usedToday?: number;
  ms?: number;
}

export interface Relay {
  listen(): Promise<void>;
  url(): string;
  close(): Promise<void>;
}

const CONNECT_CLAUDE_CODE =
  "Connect Claude Code to keep going: it is your own brain, with no limit from us.";

/** What the user reads (and hears) when a cap stops the free brain. */
const DENY_MESSAGES: Record<DenyCode, string> = {
  free_limit_reached: `The free brain has done all it can for today. ${CONNECT_CLAUDE_CODE} The free brain comes back tomorrow.`,
  free_used_up: `The free brain on this device is used up. ${CONNECT_CLAUDE_CODE}`,
  ip_limit_reached: `The free brain has reached today's limit for your network. ${CONNECT_CLAUDE_CODE}`,
  free_brain_busy: `The free brain is resting until tomorrow. ${CONNECT_CLAUDE_CODE}`,
  install_limit_reached: "Too many new installs from your network today. Try again tomorrow.",
  trial_budget_spent:
    "The trial brain has used its whole budget on this hizuri. Connect your own Claude or ChatGPT plan, or paste your own API key, to keep going.",
};

/** Fields a client may set; the relay owns the model, thinking and output size. */
const CLIENT_FIELDS = ["messages", "tools", "tool_choice", "temperature", "stop"] as const;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  sendJson(res, status, { error: { code, message, type: code } });
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) {
      throw new HttpError(
        413,
        "request_too_large",
        "The conversation is too long for the free brain.",
      );
    }
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new HttpError(400, "bad_request", "The request body must be a JSON object.");
}

function bearerToken(req: IncomingMessage): string {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Reads the usage object from an OpenAI-style stream or body; the text itself is never kept. */
class UsageSniffer {
  private pending = "";
  usage: TokenUsage | null = null;

  constructor(private readonly streaming: boolean) {}

  push(chunk: Buffer): void {
    this.pending += chunk.toString("utf8");
    if (!this.streaming) return;
    const lines = this.pending.split("\n");
    this.pending = lines.pop() ?? "";
    for (const line of lines) this.readLine(line);
  }

  finish(): void {
    if (this.streaming) {
      this.readLine(this.pending);
    } else {
      this.readJson(this.pending);
    }
    this.pending = "";
  }

  private readLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (data && data !== "[DONE]" && data.includes('"usage"')) this.readJson(data);
  }

  private readJson(text: string): void {
    try {
      const usage = (JSON.parse(text) as { usage?: Record<string, unknown> }).usage;
      if (!usage) return;
      this.usage = {
        inputTokens: Number(usage.prompt_tokens) || 0,
        outputTokens: Number(usage.completion_tokens) || 0,
        costUsd: Number(usage.cost) || 0,
      };
    } catch {
      // not a JSON line
    }
  }
}

export function buildUpstreamBody(
  config: RelayConfig,
  clientBody: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(clientBody.messages) || clientBody.messages.length === 0) {
    throw new HttpError(400, "bad_request", "messages must be a non-empty array.");
  }
  const body: Record<string, unknown> = {};
  for (const field of CLIENT_FIELDS) {
    if (clientBody[field] !== undefined) body[field] = clientBody[field];
  }
  const requested = Number(clientBody.max_tokens);
  const stream = clientBody.stream === true;
  Object.assign(body, {
    model: config.model,
    stream,
    max_tokens:
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, config.maxOutputTokens)
        : config.maxOutputTokens,
  });
  if (config.upstream === "gemini") {
    body.reasoning_effort = config.reasoningEffort;
    if (stream) body.stream_options = { include_usage: true };
  } else {
    // OpenRouter reports usage on every response by itself.
    body.reasoning = { effort: config.reasoningEffort, exclude: true };
  }
  return body;
}

/** What a call cost: the upstream's own figure when it gives one, else tokens times our prices. */
export function callCostUsd(config: RelayConfig, usage: TokenUsage): number {
  if (usage.costUsd > 0) return usage.costUsd;
  return (
    (usage.inputTokens * config.prices.inputPerMillionUsd +
      usage.outputTokens * config.prices.outputPerMillionUsd) /
    1_000_000
  );
}

/**
 * The most a call can cost: every request byte as an input token (a token is never shorter than
 * a byte, and the tool schemas and roles ride in the same bytes) plus the full output cap.
 */
export function worstCaseCostUsd(
  config: RelayConfig,
  upstreamBody: Record<string, unknown>,
): number {
  const inputBytes = Buffer.byteLength(JSON.stringify(upstreamBody));
  const outputTokens = Number(upstreamBody.max_tokens) || config.maxOutputTokens;
  return (
    (inputBytes * config.prices.inputPerMillionUsd +
      outputTokens * config.prices.outputPerMillionUsd) /
    1_000_000
  );
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** The operator's own machine only: clients of the relay may share its port, never this API. */
function isAdmin(config: RelayConfig, req: IncomingMessage): boolean {
  if (!config.adminToken || !LOOPBACK.has(req.socket.remoteAddress ?? "")) return false;
  const given = Buffer.from(bearerToken(req));
  const expected = Buffer.from(config.adminToken);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function optionalNumber(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new HttpError(400, "bad_request", `${name} must be a number of at least 0.`);
  }
  return number;
}

export function createRelay(options: {
  config: RelayConfig;
  now?: () => Date;
  log?: (entry: RelayLogEntry) => void;
  fetch?: typeof fetch;
}): Relay {
  const { config } = options;
  const now = options.now ?? (() => new Date());
  const log = options.log ?? ((entry) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  const doFetch = options.fetch ?? fetch;
  const store = new UsageStore({ limits: config.limits, stateFile: config.stateFile, now });

  function clientIpHash(req: IncomingMessage): string {
    const forwarded = config.trustProxy
      ? String(req.headers["x-forwarded-for"] ?? "")
          .split(",")[0]
          ?.trim()
      : "";
    const ip = forwarded || req.socket.remoteAddress || "unknown";
    return createHash("sha256").update(`${config.ipSalt}:${ip}`).digest("hex").slice(0, 16);
  }

  async function handleInstall(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const ip = clientIpHash(req);
    const issued = store.issueInstall(ip);
    if ("denied" in issued) {
      log({ event: "install", status: 429, ip: ip.slice(0, 8), code: issued.denied });
      sendError(res, 429, issued.denied, DENY_MESSAGES[issued.denied]);
      return;
    }
    log({ event: "install", status: 200, install: issued.installId, ip: ip.slice(0, 8) });
    sendJson(res, 200, {
      token: issued.token,
      limits: {
        dailyRequests: config.limits.installDailyRequests,
        totalRequests: config.limits.installTotalRequests,
      },
    });
  }

  function handleUsage(req: IncomingMessage, res: ServerResponse): void {
    const usage = store.usage(bearerToken(req));
    if (!usage) {
      sendError(res, 401, "unknown_install", "Unknown install token.");
      return;
    }
    sendJson(res, 200, usage);
  }

  async function handleChat(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const token = bearerToken(req);
    if (!store.findInstall(token)) {
      sendError(res, 401, "unknown_install", "Unknown install token.");
      return;
    }
    const clientBody = await readBody(req, config.maxBodyBytes);
    const upstreamBody = buildUpstreamBody(config, clientBody);
    const ip = clientIpHash(req);
    const reserveUsd = worstCaseCostUsd(config, upstreamBody);
    const admission = store.admit(token, ip, reserveUsd);
    if (!admission.ok) {
      log({
        event: "chat",
        status: 429,
        install: admission.installId ?? undefined,
        ip: ip.slice(0, 8),
        code: admission.code,
      });
      sendError(res, 429, admission.code, DENY_MESSAGES[admission.code]);
      return;
    }

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let upstream: Response;
    try {
      upstream = await doFetch(`${config.upstreamBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.upstreamKey}`,
        },
        body: JSON.stringify(upstreamBody),
        signal: abort.signal,
      });
    } catch {
      upstream = new Response(null, { status: 599 });
    }
    const usedToday = store.usage(token)?.usedToday;
    if (!upstream.ok || !upstream.body) {
      // The upstream's own words may echo the request or our account; none of it goes out.
      await upstream.body?.cancel().catch(() => undefined);
      store.recordTokens(token, { inputTokens: 0, outputTokens: 0, costUsd: 0 }, reserveUsd);
      log({
        event: "chat",
        status: 502,
        install: admission.installId,
        ip: ip.slice(0, 8),
        code: `upstream_${upstream.status}`,
        model: config.model,
        usedToday,
        ms: Date.now() - started,
      });
      sendError(res, 502, "free_brain_unavailable", "The free brain is unavailable right now.");
      return;
    }

    const streaming = upstreamBody.stream === true;
    const sniffer = new UsageSniffer(streaming);
    res.writeHead(200, {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    });
    try {
      for await (const chunk of upstream.body as unknown as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk);
        sniffer.push(buffer);
        res.write(buffer);
      }
    } catch {
      // the client went away or the upstream dropped; usage stays what was seen
    }
    sniffer.finish();
    res.end();
    const seen = sniffer.usage;
    // A stream cut before its usage line is charged at its worst case, so the cap still holds.
    const usage = seen
      ? { ...seen, costUsd: callCostUsd(config, seen) }
      : { inputTokens: 0, outputTokens: 0, costUsd: reserveUsd };
    store.recordTokens(token, usage, reserveUsd);
    log({
      event: "chat",
      status: 200,
      install: admission.installId,
      ip: ip.slice(0, 8),
      model: config.model,
      ...usage,
      usedToday,
      ms: Date.now() - started,
    });
  }

  async function handleAdmin(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<void> {
    if (!isAdmin(config, req)) {
      sendError(res, 404, "not_found", "Not found.");
      return;
    }
    if (req.method === "POST" && path === "/v1/admin/installs") {
      const body = await readBody(req, 4096);
      const label = typeof body.label === "string" ? body.label.slice(0, 80) : undefined;
      const issued = store.issueManagedInstall({
        label,
        capUsd: optionalNumber(body.capUsd, "capUsd"),
        capRequests: optionalNumber(body.capRequests, "capRequests"),
      });
      log({ event: "admin", status: 200, install: issued.installId, code: "issue" });
      sendJson(res, 200, issued);
      return;
    }
    if (req.method === "GET" && path === "/v1/admin/installs") {
      sendJson(res, 200, { installs: store.listManaged() });
      return;
    }
    const revoke = /^\/v1\/admin\/installs\/([0-9a-f]{12})$/.exec(path);
    if (req.method === "DELETE" && revoke) {
      const removed = store.revoke(revoke[1]);
      log({ event: "admin", status: removed ? 200 : 404, install: revoke[1], code: "revoke" });
      sendJson(res, removed ? 200 : 404, { removed });
      return;
    }
    sendError(res, 404, "not_found", "Not found.");
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const route = `${req.method} ${path}`;
    const handled = (async () => {
      if (path.startsWith("/v1/admin/")) {
        await handleAdmin(req, res, path);
        return;
      }
      switch (route) {
        case "GET /health":
          sendJson(res, 200, { ok: true });
          return;
        case "POST /v1/install":
          await handleInstall(req, res);
          return;
        case "GET /v1/usage":
          handleUsage(req, res);
          return;
        case "POST /v1/chat/completions":
          await handleChat(req, res);
          return;
        default:
          sendError(res, 404, "not_found", "Not found.");
      }
    })();
    handled.catch((error: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        sendError(res, error.status, error.code, error.message);
        return;
      }
      sendError(res, 500, "internal_error", "The relay failed.");
    });
  });

  return {
    listen: () =>
      new Promise<void>((resolve) => server.listen(config.port, config.host, () => resolve())),
    url: () => `http://${config.host}:${(server.address() as AddressInfo).port}`,
    close: async () => {
      store.flush();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
