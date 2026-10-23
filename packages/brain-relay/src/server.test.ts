import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, type RelayConfig } from "./config.js";
import { createRelay, type Relay, type RelayLogEntry } from "./server.js";

const UPSTREAM_KEY = "sk-upstream-secret-0000";
const ADMIN_TOKEN = "admin-secret-for-tests-0000";
const USER_TEXT = "my bank pin is 4242, remember it";
const REPLY_TEXT = "I will not remember your pin";

interface UpstreamCall {
  headers: IncomingMessage["headers"];
  body: Record<string, unknown>;
}

function sseReply(text: string): string {
  const chunks = [
    { choices: [{ index: 0, delta: { role: "assistant", content: text.slice(0, 5) } }] },
    { choices: [{ index: 0, delta: { content: text.slice(5) }, finish_reason: "stop" }] },
    {
      choices: [],
      usage: { prompt_tokens: 120, completion_tokens: 9, total_tokens: 129, cost: 0.00004 },
    },
  ];
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

async function startUpstream(calls: UpstreamCall[], status = 200): Promise<Server> {
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    calls.push({ headers: req.headers, body: JSON.parse(raw) });
    if (status !== 200) {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: `upstream says no; key ${UPSTREAM_KEY}` } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(sseReply(REPLY_TEXT));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function urlOf(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("brain relay", () => {
  let upstream: Server;
  let calls: UpstreamCall[];
  let relay: Relay;
  let base: string;
  let logs: RelayLogEntry[];
  let now: Date;
  let stateDir: string;

  async function start(overrides: Partial<RelayConfig> = {}, upstreamStatus = 200) {
    calls = [];
    upstream = await startUpstream(calls, upstreamStatus);
    const config: RelayConfig = {
      host: "127.0.0.1",
      port: 0,
      upstream: "gemini",
      upstreamBaseUrl: urlOf(upstream),
      upstreamKey: UPSTREAM_KEY,
      model: "gemini-3.1-flash-lite",
      reasoningEffort: "minimal",
      maxOutputTokens: 512,
      maxBodyBytes: 64 * 1024,
      limits: { ...DEFAULT_LIMITS },
      stateFile: join(stateDir, "state.json"),
      trustProxy: false,
      ipSalt: "test",
      prices: { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
      adminToken: ADMIN_TOKEN,
      ...overrides,
    };
    relay = createRelay({ config, now: () => now, log: (entry) => logs.push(entry) });
    await relay.listen();
    base = relay.url();
  }

  async function install(): Promise<string> {
    const response = await fetch(`${base}/v1/install`, { method: "POST" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    return body.token;
  }

  function chat(token: string | null, body: Record<string, unknown> = {}) {
    return fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: "anything-the-client-wants",
        stream: true,
        max_tokens: 100_000,
        messages: [{ role: "user", content: USER_TEXT }],
        tools: [
          {
            type: "function",
            function: { name: "speak", parameters: { type: "object", properties: {} } },
          },
        ],
        ...body,
      }),
    });
  }

  beforeEach(() => {
    logs = [];
    now = new Date("2026-10-19T10:00:00Z");
    stateDir = mkdtempSync(join(tmpdir(), "brain-relay-"));
  });

  afterEach(async () => {
    await relay?.close();
    await new Promise<void>((resolve) => upstream?.close(() => resolve()));
    rmSync(stateDir, { recursive: true, force: true });
  });

  it("issues an install token and caps installs per address per day", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, ipDailyInstalls: 2 } });
    const first = await install();
    const second = await install();
    expect(first).toMatch(/^hzf_/);
    expect(second).not.toBe(first);

    const third = await fetch(`${base}/v1/install`, { method: "POST" });
    expect(third.status).toBe(429);
    expect(await third.json()).toMatchObject({ error: { code: "install_limit_reached" } });

    now = new Date("2026-10-20T00:00:01Z");
    expect(await install()).toMatch(/^hzf_/);
  });

  it("refuses a chat without a known install token", async () => {
    await start();
    expect((await chat(null)).status).toBe(401);
    expect((await chat("hzf_made-up")).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("forwards the chat with our key and model, thinking at minimum, and streams it back", async () => {
    await start();
    const token = await install();
    const response = await chat(token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toBe(sseReply(REPLY_TEXT));

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.headers.authorization).toBe(`Bearer ${UPSTREAM_KEY}`);
    expect(call.body).toMatchObject({
      model: "gemini-3.1-flash-lite",
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "minimal",
      max_tokens: 512,
      messages: [{ role: "user", content: USER_TEXT }],
    });
    expect(call.body.tools).toHaveLength(1);
    // The client's token never goes upstream.
    expect(JSON.stringify(call)).not.toContain(token);
  });

  it("asks OpenRouter for minimal reasoning in its own field", async () => {
    await start({ upstream: "openrouter", model: "google/gemini-3.1-flash-lite" });
    const token = await install();
    await (await chat(token)).text();
    expect(calls[0].body).toMatchObject({
      model: "google/gemini-3.1-flash-lite",
      reasoning: { effort: "minimal", exclude: true },
    });
    expect(calls[0].body).not.toHaveProperty("reasoning_effort");
  });

  it("stops an install at its daily cap with a connect-Claude-Code answer, and lets it back the next day", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, installDailyRequests: 2 } });
    const token = await install();
    await (await chat(token)).text();
    await (await chat(token)).text();

    const capped = await chat(token);
    expect(capped.status).toBe(429);
    const body = (await capped.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("free_limit_reached");
    expect(body.error.message).toContain("Claude Code");
    expect(calls).toHaveLength(2);

    const usage = await fetch(`${base}/v1/usage`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await usage.json()).toMatchObject({ usedToday: 2, dailyLimit: 2, usedTotal: 2 });

    now = new Date("2026-10-20T08:00:00Z");
    expect((await chat(token)).status).toBe(200);
  });

  it("stops an install for good at its lifetime cap", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, installTotalRequests: 1 } });
    const token = await install();
    await (await chat(token)).text();
    now = new Date("2026-10-25T08:00:00Z");
    const capped = await chat(token);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: { code: "free_used_up" } });
  });

  it("caps one address across all its installs", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, ipDailyRequests: 2 } });
    const a = await install();
    const b = await install();
    await (await chat(a)).text();
    await (await chat(b)).text();
    const capped = await chat(a);
    expect(capped.status).toBe(429);
    expect(await capped.json()).toMatchObject({ error: { code: "ip_limit_reached" } });
  });

  it("logs counts and tokens per install, never message text, keys or tokens", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, installDailyRequests: 1 } });
    const token = await install();
    await (await chat(token)).text();
    await (await chat(token)).text();

    const chatLogs = logs.filter((entry) => entry.event === "chat");
    expect(chatLogs).toHaveLength(2);
    expect(chatLogs[0]).toMatchObject({
      status: 200,
      model: "gemini-3.1-flash-lite",
      inputTokens: 120,
      outputTokens: 9,
      usedToday: 1,
    });
    expect(chatLogs[0].install).toMatch(/^[0-9a-f]{12}$/);
    expect(chatLogs[1]).toMatchObject({ status: 429, code: "free_limit_reached" });

    const everything = JSON.stringify(logs);
    for (const secret of [USER_TEXT, REPLY_TEXT, UPSTREAM_KEY, token, "4242", "127.0.0.1"]) {
      expect(everything).not.toContain(secret);
    }
  });

  it("keeps usage across a restart, with no text in the state file", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, installDailyRequests: 1 } });
    const token = await install();
    await (await chat(token)).text();
    await relay.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));

    await start({ limits: { ...DEFAULT_LIMITS, installDailyRequests: 1 } });
    expect((await chat(token)).status).toBe(429);

    const state = readFileSync(join(stateDir, "state.json"), "utf8");
    for (const secret of [USER_TEXT, REPLY_TEXT, UPSTREAM_KEY, token]) {
      expect(state).not.toContain(secret);
    }
    expect(state).toContain('"inputTokens":120');
  });

  it("turns an upstream failure into a plain 502 without leaking what the upstream said", async () => {
    await start({}, 500);
    const token = await install();
    const response = await chat(token);
    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(UPSTREAM_KEY);
    expect(text).toContain("free_brain_unavailable");
  });

  it("refuses an oversized body before it reaches the upstream", async () => {
    await start({ maxBodyBytes: 1024 });
    const token = await install();
    const response = await chat(token, { messages: [{ role: "user", content: "x".repeat(4096) }] });
    expect(response.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  function admin(method: string, path: string, body?: unknown, token = ADMIN_TOKEN) {
    return fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("hides the admin endpoints without the admin token", async () => {
    await start();
    expect((await admin("POST", "/v1/admin/installs", {}, "wrong")).status).toBe(404);
    await relay.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    await start({ adminToken: null });
    expect((await admin("GET", "/v1/admin/installs")).status).toBe(404);
  });

  it("issues managed installs that bypass the address cap and revokes them", async () => {
    await start({ limits: { ...DEFAULT_LIMITS, ipDailyInstalls: 0 } });
    expect((await fetch(`${base}/v1/install`, { method: "POST" })).status).toBe(429);

    const issued = (await (
      await admin("POST", "/v1/admin/installs", { label: "env-a", capUsd: 1 })
    ).json()) as { token: string; installId: string };
    expect(issued.token).toMatch(/^hzf_/);
    const ok = await chat(issued.token);
    expect(ok.status).toBe(200);
    await ok.text();

    const list = (await (await admin("GET", "/v1/admin/installs")).json()) as {
      installs: Array<{ installId: string; label: string; requests: number; capUsd: number }>;
    };
    expect(list.installs).toEqual([
      expect.objectContaining({
        installId: issued.installId,
        label: "env-a",
        requests: 1,
        capUsd: 1,
      }),
    ]);
    expect(JSON.stringify(list)).not.toContain(issued.token);

    expect((await admin("DELETE", `/v1/admin/installs/${issued.installId}`)).status).toBe(200);
    expect((await chat(issued.token)).status).toBe(401);
  });

  it("stops an install at its spend cap, counting calls still on their way", async () => {
    await start();
    const { token } = (await (
      await admin("POST", "/v1/admin/installs", { label: "env-b", capUsd: 0.0012 })
    ).json()) as { token: string };
    // Worst case per call: ~600 request bytes at $0.25/M plus 512 output tokens at $1.5/M
    // ≈ $0.00092, so the first call fits and a second, reserved at the same time, does not.
    const [first, second] = await Promise.all([chat(token), chat(token)]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 429]);
    const denied = first.status === 429 ? first : second;
    expect(await denied.json()).toMatchObject({ error: { code: "trial_budget_spent" } });
    await (first.status === 200 ? first : second).text();

    // The first call really cost $0.00004 (the upstream's figure), so there is room again.
    const third = await chat(token);
    expect(third.status).toBe(200);
    await third.text();
    const usage = (await (
      await fetch(`${base}/v1/usage`, { headers: { authorization: `Bearer ${token}` } })
    ).json()) as { spentUsd: number; capUsd: number };
    expect(usage.capUsd).toBe(0.0012);
    expect(usage.spentUsd).toBeCloseTo(0.00008, 8);
  });

  it("prices calls from tokens when the upstream reports no cost", async () => {
    await start();
    const { callCostUsd } = await import("./server.js");
    const config = {
      prices: { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 },
    } as RelayConfig;
    expect(callCostUsd(config, { inputTokens: 1_000_000, outputTokens: 0, costUsd: 0 })).toBe(0.25);
    expect(callCostUsd(config, { inputTokens: 0, outputTokens: 1_000_000, costUsd: 0 })).toBe(1.5);
    expect(callCostUsd(config, { inputTokens: 5, outputTokens: 5, costUsd: 0.5 })).toBe(0.5);
  });
});
