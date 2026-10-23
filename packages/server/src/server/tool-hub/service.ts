import { createHash, randomBytes } from "node:crypto";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";
import { describeDrift, diffFingerprints, fingerprintTools, type ToolContract } from "./pinning.js";
import {
  hashJson,
  newReceiptId,
  signReceipt,
  verifyReceipt,
  type InstallKey,
  type Receipt,
} from "./receipts.js";
import type { ConnectTool, InstallPackage, SandboxKind, ToolConnection } from "./runner.js";
import {
  fetchRegistryServer,
  npmVersionExists,
  registryCandidate,
  searchAgentReviews,
  searchNohumans,
  searchRegistry,
  taskKeywords,
  wordsMatch,
  type FetchLike,
  type HubCandidate,
  type RegistryServer,
  type SourceContext,
  type SourceResult,
} from "./sources.js";
import {
  ToolHubStoreError,
  type ReviewScores,
  type ToolHubStore,
  type ToolInstall,
  type ToolLaunch,
  type ToolReview,
} from "./store.js";

// Hizuri (tool hub): one place where every hizuri agent finds a tool for a task, reads reviews
// other agents left (each backed by a signed receipt of a real run), installs it after the user's
// yes, calls it and leaves its own review. The five hub_* tools (tools.ts) are thin wrappers over
// this class; the daemon's agent MCP server also exposes every approved tool's commands directly
// and tells connected agents when that list changes.

export class ToolHubError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "not_installable"
      | "needs_keys"
      | "no_sandbox"
      | "no_approver"
      | "install_failed"
      | "start_failed"
      | "denied"
      | "blocked"
      | "bad_command"
      | "bad_receipt"
      | "not_your_receipt"
      | "duplicate_review"
      | "bad_task",
    message: string,
  ) {
    super(message);
    this.name = "ToolHubError";
  }
}

export interface ApprovalRequest {
  title: string;
  description: string;
  input: Record<string, unknown>;
}

export type ApprovalAnswer =
  | { approved: true; requestId: string }
  | { approved: false; reason: string };

export type RequestApproval = (request: ApprovalRequest) => Promise<ApprovalAnswer>;

export interface HubPick {
  rank: number;
  tool: string;
  title: string;
  source: "hizuri" | HubCandidate["source"];
  reason: string;
  installable: boolean;
  installed: boolean;
  url?: string;
}

export interface FindResult {
  task: string;
  keywords: string[];
  picks: HubPick[];
  alsoSeen: string[];
  sources: Array<{ source: string; status: string; found: number; note?: string }>;
}

export interface ExposedTool {
  name: string;
  install: ToolInstall;
  tool: ToolInstall["tools"][number];
}

export interface CallOutcome {
  result: CallToolResult;
  receipt: Receipt;
}

/** How long hub_add waits for the user's answer before it withdraws the request. */
export const HUB_APPROVAL_TIMEOUT_MS = 10 * 60_000;
const IDLE_CLOSE_MS = 10 * 60_000;
const PAID_HINT = /\bx402\b|\busdc\b|micropayment|pay-per-call/i;

export function slugForInstall(name: string, taken: ReadonlySet<string>): string {
  const base =
    (name.split("/").at(-1) ?? name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "tool";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/** MCP tool names an agent can call: [A-Za-z0-9_-], short enough for "mcp__paseo__" in front. */
export function exposedToolName(installId: string, toolName: string): string {
  const raw = `hub_${installId}__${toolName}`.replace(/[^A-Za-z0-9_-]/g, "_");
  if (raw.length <= 52) return raw;
  const tag = createHash("sha256").update(raw).digest("hex").slice(0, 6);
  return `${raw.slice(0, 45)}_${tag}`;
}

function relevance(
  candidate: { title: string; description: string; id: string },
  keywords: string[],
) {
  const words = `${candidate.id} ${candidate.title} ${candidate.description}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const hits = keywords.filter((keyword) => words.some((word) => wordsMatch(word, keyword)));
  return { score: keywords.length ? hits.length / keywords.length : 0, hits };
}

export class ToolHub {
  private readonly listeners = new Set<() => void>();
  private readonly connections = new Map<
    string,
    { conn: Promise<ToolConnection>; timer: NodeJS.Timeout }
  >();
  private readonly sourceContext: SourceContext;

  constructor(
    private readonly options: {
      store: ToolHubStore;
      key: InstallKey;
      connect: ConnectTool;
      installPackage: InstallPackage;
      /** The sandbox to run tools in; null while this machine has none. */
      sandbox: () => Promise<SandboxKind | null>;
      logger: Logger;
      fetch?: FetchLike;
    },
  ) {
    this.sourceContext = { store: options.store, fetch: options.fetch ?? fetch };
  }

  get installKeyId(): string {
    return this.options.key.id;
  }

  get publicKeyPem(): string {
    return this.options.key.publicKeyPem;
  }

  /** Called whenever the set of exposed tools changes (an add, a block, a re-approval). */
  onToolsChanged(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyToolsChanged(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (error) {
        this.options.logger.warn({ err: error }, "tool_hub.listener_failed");
      }
    }
  }

  /** Every active tool's commands, as the agent MCP server lists them. */
  exposedTools(): ExposedTool[] {
    return this.options.store
      .listInstalls()
      .filter((install) => install.status.state === "active")
      .flatMap((install) =>
        install.tools.map((tool) => ({
          name: exposedToolName(install.id, tool.name),
          install,
          tool,
        })),
      );
  }

  // ---------- hub_find ----------

  async find(task: string): Promise<FindResult> {
    const keywords = taskKeywords(task);
    if (keywords.length === 0) {
      throw new ToolHubError(
        "bad_task",
        "Describe the task in a few words, e.g. “fetch a web page as markdown”.",
      );
    }
    const ctx = this.sourceContext;
    const results: SourceResult[] = await Promise.all([
      searchRegistry(ctx, keywords),
      searchAgentReviews(ctx, keywords),
      searchNohumans(ctx, task),
    ]);
    const store = this.options.store;
    const installs = store.listInstalls();
    const installedNames = new Set(installs.map((install) => install.name));
    const scored = new Map<string, ScoredPick>();
    const entries = [
      // hizuri's own installs and receipt-backed reviews rank first.
      ...installs.map((install) =>
        scoreInstall(install, store.listReviews(install.name), keywords),
      ),
      ...results.flatMap((result) =>
        result.candidates.map((candidate) => scoreCandidate(candidate, keywords, installedNames)),
      ),
    ];
    for (const entry of entries) {
      if (!entry) continue;
      const previous = scored.get(entry.pick.tool);
      if (!previous || compareScored(entry, previous) < 0) scored.set(entry.pick.tool, entry);
    }
    const ranked = await this.withoutMissingPackages([...scored.values()].sort(compareScored));
    return {
      task,
      keywords,
      picks: ranked
        .slice(0, 3)
        .map((entry, index) => Object.assign({ rank: index + 1 }, entry.pick)),
      alsoSeen: ranked.slice(3, 10).map((entry) => entry.pick.tool),
      sources: [
        { source: "hizuri", status: "ok", found: installs.length },
        ...results.map((result) =>
          Object.assign(
            { source: result.source, status: result.status, found: result.candidates.length },
            result.note ? { note: result.note } : {},
          ),
        ),
      ],
    };
  }

  /**
   * The registry lists versions npm no longer serves (unpublished ones), so the first picks are
   * checked against npm and a missing one is moved out: the user is never asked to approve an
   * install that cannot happen.
   */
  private async withoutMissingPackages(ranked: ScoredPick[]): Promise<ScoredPick[]> {
    const head = ranked.slice(0, 6);
    const exists = await Promise.all(
      head.map((entry) =>
        entry.npm
          ? npmVersionExists(this.sourceContext, entry.npm.package, entry.npm.version)
          : Promise.resolve(true),
      ),
    );
    const missing = new Set(head.filter((_, i) => exists[i] === false));
    for (const entry of missing) {
      entry.pick.installable = false;
      entry.pick.reason = `${entry.pick.reason}; npm has no ${entry.npm?.package}@${entry.npm?.version}`;
    }
    return [...ranked.filter((entry) => !missing.has(entry)), ...missing];
  }

  // ---------- hub_reviews ----------

  reviews(tool: string) {
    const install = this.options.store.findInstallByName(tool);
    const name = install?.name ?? tool;
    const reviews = this.options.store.listReviews(name).map((review) =>
      Object.assign({}, review, {
        receiptVerified: verifyReceipt(review.receipt, this.options.key.publicKey),
      }),
    );
    return {
      tool: name,
      installed: install ? install.status.state : "no",
      count: reviews.length,
      average: reviews.length ? Number(averageScore(reviews).toFixed(2)) : null,
      reviews,
      verifyWith: {
        installKeyId: this.options.key.id,
        publicKeyPem: this.options.key.publicKeyPem,
        how: "Ed25519 over the canonical JSON (sorted keys) of the receipt without its signature field",
      },
    };
  }

  // ---------- hub_add ----------

  async add(params: { tool: string; reason?: string; requestApproval: RequestApproval | null }) {
    const existing = this.options.store.findInstallByName(params.tool);
    if (existing?.status.state === "active") {
      return {
        status: "already_installed" as const,
        install: existing,
        commands: this.commandsOf(existing),
      };
    }
    if (!params.requestApproval) {
      throw new ToolHubError(
        "no_approver",
        "Only a hizuri agent can ask the user to install a tool (no caller agent).",
      );
    }
    if (existing) return this.reapprove(existing, params.requestApproval);

    const { server, candidate, installId, launch, sandbox } = await this.prepareNew(params.tool);
    const answer = await params.requestApproval(
      installApprovalRequest({ server, candidate, launch, sandbox, reason: params.reason }),
    );
    if (!answer.approved) {
      throw new ToolHubError(
        "denied",
        `The user did not approve installing ${server.name}: ${answer.reason}`,
      );
    }
    if (launch.kind === "npm") {
      await this.options.installPackage({ installId, launch }).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        throw new ToolHubError(
          "install_failed",
          `npm could not install ${launch.package}@${launch.version}: ${detail.split("\n").slice(0, 4).join(" ")}`,
        );
      });
    }
    const draft: ToolInstall = {
      id: installId,
      name: server.name,
      ...(server.title ? { title: server.title } : {}),
      description: server.description ?? "",
      version: launch.kind === "npm" ? launch.version : (server.version ?? "latest"),
      launch,
      sandbox,
      fingerprint: { hash: "", tools: [] },
      tools: [],
      approvedAt: new Date().toISOString(),
      approvalRequestId: answer.requestId,
      status: { state: "active" },
    };
    const tools = await this.connection(draft)
      .then((conn) => conn.listTools())
      .catch(async (error: unknown) => {
        await this.dropConnection(draft.id);
        throw new ToolHubError(
          "start_failed",
          `${server.name} installed but did not answer: ${error instanceof Error ? error.message : String(error)}. Nothing was saved; pick another tool.`,
        );
      });
    const install: ToolInstall = {
      ...draft,
      fingerprint: fingerprintTools(tools),
      tools: tools.map(exposedShape),
    };
    await this.options.store.saveInstall(install);
    this.options.logger.info(
      { installId, name: install.name, toolsHash: install.fingerprint.hash },
      "tool_hub.installed",
    );
    this.notifyToolsChanged();
    return { status: "installed" as const, install, commands: this.commandsOf(install) };
  }

  /** Everything hub_add checks before it asks the user: the registry entry, keys, a sandbox. */
  private async prepareNew(tool: string) {
    const server = await fetchRegistryServer(this.sourceContext, tool);
    if (!server) {
      throw new ToolHubError(
        "not_found",
        `The official MCP Registry has no server named "${tool}" (or it is down). Use the exact name hub_find returned.`,
      );
    }
    const candidate = registryCandidate(server);
    const launch = candidate.launch;
    if (!launch) {
      throw new ToolHubError(
        "not_installable",
        `Can't install ${server.name}: ${candidate.notInstallable}.`,
      );
    }
    if (
      launch.kind === "npm" &&
      (await npmVersionExists(this.sourceContext, launch.package, launch.version)) === false
    ) {
      throw new ToolHubError(
        "not_installable",
        `npm has no ${launch.package}@${launch.version} (the registry lists a version npm does not serve). Pick another tool.`,
      );
    }
    const taken = new Set(this.options.store.listInstalls().map((install) => install.id));
    const installId = slugForInstall(server.name, taken);
    const secrets = await this.options.store.readSecrets([installId, server.name]);
    const missing = candidate.requiredSecrets.filter((name) => !secrets[name]);
    if (missing.length) {
      throw new ToolHubError(
        "needs_keys",
        `${server.name} needs ${missing.join(", ")}. Ask the user to put them in ${this.options.store.secretsFile} under "${server.name}" (never in the chat), then call hub_add again.`,
      );
    }
    const found = launch.kind === "npm" ? await this.options.sandbox() : null;
    if (launch.kind === "npm" && !found) {
      throw new ToolHubError(
        "no_sandbox",
        "This machine has no sandbox (bubblewrap, podman or landrun); the hub runs no tool without one.",
      );
    }
    const sandbox: ToolInstall["sandbox"] =
      launch.kind === "remote" ? "remote" : (found as SandboxKind);
    return { server, candidate, installId, launch, sandbox };
  }

  private async reapprove(install: ToolInstall, requestApproval: RequestApproval) {
    await this.dropConnection(install.id);
    const conn = await this.connection(install);
    const tools = await conn.listTools();
    const live = fingerprintTools(tools);
    const drift = describeDrift(diffFingerprints(install.fingerprint, live));
    const answer = await requestApproval({
      title: `Re-approve tool “${install.title ?? install.name}”?`,
      description: [
        `${install.name} changed its tool descriptions since you approved it (${drift}).`,
        "A changed description can carry hidden instructions to the agent. Approve only if you trust the new version.",
        ...tools
          .filter(
            (tool) =>
              !install.fingerprint.tools.some(
                (t) => t.name === tool.name && t.hash === hashJson(contractShape(tool)),
              ),
          )
          .map((tool) => `• ${tool.name}: ${(tool.description ?? "").slice(0, 400)}`),
      ].join("\n"),
      input: { tool: install.name, pinnedHash: install.fingerprint.hash, liveHash: live.hash },
    });
    if (!answer.approved) {
      throw new ToolHubError(
        "denied",
        `The user did not re-approve ${install.name}: ${answer.reason}`,
      );
    }
    const next: ToolInstall = {
      ...install,
      fingerprint: live,
      tools: tools.map(exposedShape),
      approvedAt: new Date().toISOString(),
      approvalRequestId: answer.requestId,
      status: { state: "active" },
    };
    await this.options.store.saveInstall(next);
    this.notifyToolsChanged();
    return { status: "reapproved" as const, install: next, commands: this.commandsOf(next) };
  }

  private commandsOf(install: ToolInstall) {
    return install.tools.map((tool) => ({
      command: tool.name,
      exposedAs: exposedToolName(install.id, tool.name),
      description: (tool.description ?? "").slice(0, 300),
    }));
  }

  // ---------- hub_call ----------

  async call(params: {
    tool: string;
    command?: string;
    args?: Record<string, unknown>;
    callerAgentId?: string;
  }): Promise<CallOutcome> {
    const install = this.options.store.findInstallByName(params.tool);
    if (!install) {
      throw new ToolHubError(
        "not_found",
        `${params.tool} is not installed. hub_add it first (the user approves).`,
      );
    }
    if (install.status.state === "blocked") {
      throw new ToolHubError("blocked", blockedMessage(install));
    }
    const command =
      params.command ?? (install.tools.length === 1 ? install.tools[0].name : undefined);
    if (!command || !install.tools.some((tool) => tool.name === command)) {
      throw new ToolHubError(
        "bad_command",
        `Name the command: ${install.name} has ${install.tools.map((tool) => tool.name).join(", ")}.`,
      );
    }
    const { conn, tools } = await this.liveTools(install);
    // Pin check on every call: a server can change its descriptions at any time, not only at start.
    const live = fingerprintTools(tools);
    if (live.hash !== install.fingerprint.hash) {
      const reason = describeDrift(diffFingerprints(install.fingerprint, live));
      const blocked: ToolInstall = {
        ...install,
        status: { state: "blocked", at: new Date().toISOString(), reason, liveHash: live.hash },
      };
      await this.options.store.saveInstall(blocked);
      await this.dropConnection(install.id);
      this.options.logger.warn(
        { installId: install.id, pinned: install.fingerprint.hash, live: live.hash, reason },
        "tool_hub.blocked_drift",
      );
      this.notifyToolsChanged();
      throw new ToolHubError("blocked", blockedMessage(blocked));
    }
    const args = params.args ?? {};
    let result: CallToolResult;
    try {
      result = await conn.callTool(command, args);
    } catch (error) {
      result = {
        content: [
          {
            type: "text",
            text: `Tool call failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
      await this.dropConnection(install.id);
    }
    const key = this.options.key;
    const receipt = await this.options.store.appendReceipt((previousReceiptHash) =>
      signReceipt(
        {
          v: 1,
          id: newReceiptId(),
          installKeyId: key.id,
          agentId: params.callerAgentId ?? "external",
          tool: install.name,
          command,
          toolsHash: install.fingerprint.hash,
          requestHash: hashJson({ tool: install.name, command, args }),
          responseHash: hashJson(result),
          outcome: result.isError ? "error" : "ok",
          at: new Date().toISOString(),
          previousReceiptHash,
        },
        key,
      ),
    );
    return { result, receipt };
  }

  // ---------- hub_review ----------

  async review(params: {
    receiptId: string;
    scores: ReviewScores;
    text: string;
    callerAgentId?: string;
  }): Promise<ToolReview> {
    const receipt = this.options.store.getReceipt(params.receiptId);
    if (
      !receipt ||
      receipt.installKeyId !== this.options.key.id ||
      !verifyReceipt(receipt, this.options.key.publicKey)
    ) {
      throw new ToolHubError(
        "bad_receipt",
        `No valid receipt ${params.receiptId} from this install. A review needs the receipt of a real hub_call.`,
      );
    }
    if (params.callerAgentId && receipt.agentId !== params.callerAgentId) {
      throw new ToolHubError(
        "not_your_receipt",
        "Only the agent that made the call can review it.",
      );
    }
    try {
      return await this.options.store.addReview({
        id: `rev_${randomBytes(8).toString("hex")}`,
        receiptId: receipt.id,
        tool: receipt.tool,
        agentId: receipt.agentId,
        scores: params.scores,
        text: params.text,
        at: new Date().toISOString(),
        receipt,
      });
    } catch (error) {
      if (error instanceof ToolHubStoreError && error.code === "duplicate_review") {
        throw new ToolHubError("duplicate_review", error.message);
      }
      throw error;
    }
  }

  // ---------- connections ----------

  /** The server's tools now; a server that died since the last call is started again once. */
  private async liveTools(install: ToolInstall) {
    try {
      const conn = await this.connection(install);
      return { conn, tools: await conn.listTools() };
    } catch {
      await this.dropConnection(install.id);
      const conn = await this.connection(install);
      return { conn, tools: await conn.listTools() };
    }
  }

  private connection(install: ToolInstall): Promise<ToolConnection> {
    const current = this.connections.get(install.id);
    if (current) {
      current.timer.refresh();
      return current.conn;
    }
    const conn = this.options.connect(install);
    const timer = setTimeout(() => void this.dropConnection(install.id), IDLE_CLOSE_MS);
    timer.unref();
    this.connections.set(install.id, { conn, timer });
    conn.catch(() => {
      if (this.connections.get(install.id)?.conn === conn) this.connections.delete(install.id);
    });
    return conn;
  }

  private async dropConnection(installId: string): Promise<void> {
    const current = this.connections.get(installId);
    if (!current) return;
    this.connections.delete(installId);
    clearTimeout(current.timer);
    await current.conn.then((conn) => conn.close()).catch(() => undefined);
  }

  async close(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((id) => this.dropConnection(id)));
  }
}

function contractShape(tool: ToolContract): ToolContract {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
  };
}

function exposedShape(tool: ToolContract): ToolInstall["tools"][number] {
  return {
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    ...(tool.description ? { description: tool.description } : {}),
    ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
  };
}

function installApprovalRequest(params: {
  server: RegistryServer;
  candidate: HubCandidate;
  launch: ToolLaunch;
  sandbox: ToolInstall["sandbox"];
  reason?: string;
}): ApprovalRequest {
  const { server, candidate, launch, sandbox } = params;
  const where =
    launch.kind === "npm"
      ? `npm package ${launch.package}@${launch.version}, installed without its install scripts, run in a ${sandbox} sandbox that cannot see your files`
      : `remote server ${launch.url} (runs on its publisher's machine)`;
  return {
    title: `Install tool “${server.title ?? server.name}”?`,
    description: [
      `An agent wants to add ${server.name} (${server.version ?? "latest"}) from the official MCP Registry.`,
      server.description ?? "",
      params.reason ? `Why: ${params.reason}` : "",
      `How: ${where}.`,
      candidate.requiredSecrets.length
        ? `Keys it gets: ${candidate.requiredSecrets.join(", ")}.`
        : "It gets no keys.",
      "Its tool descriptions are pinned by hash: if they ever change, calls stop until you approve again.",
    ]
      .filter(Boolean)
      .join("\n"),
    input: { tool: server.name, version: server.version, launch, sandbox },
  };
}

interface ScoredPick {
  pick: Omit<HubPick, "rank">;
  tier: number;
  score: number;
  /** For a registry npm package not yet installed: checked against npm before it is offered. */
  npm?: { package: string; version: string };
}

function compareScored(a: ScoredPick, b: ScoredPick): number {
  return a.tier - b.tier || b.score - a.score;
}

function scoreInstall(
  install: ToolInstall,
  reviews: readonly ToolReview[],
  keywords: string[],
): ScoredPick | null {
  const rel = relevance(
    { id: install.name, title: install.title ?? "", description: install.description },
    keywords,
  );
  if (rel.score === 0) return null;
  const avg = reviews.length ? averageScore(reviews) : 0;
  const reason = [
    reviews.length
      ? `hizuri: ${reviews.length} review(s) with signed receipts, average ${avg.toFixed(1)}/5`
      : "hizuri: installed, no reviews yet",
    `matches ${rel.hits.join(", ")}`,
    install.status.state === "blocked"
      ? "BLOCKED: its descriptions changed since approval"
      : "ready to call",
  ].join("; ");
  return {
    pick: {
      tool: install.name,
      title: install.title ?? install.name,
      source: "hizuri",
      reason,
      installable: true,
      installed: true,
    },
    tier: reviews.length ? 0 : 1,
    score: rel.score * 10 + avg + Math.log10(reviews.length + 1),
  };
}

/** Local first: a free package that runs here in a sandbox beats a free remote, which sees the input. */
function launchBonus(candidate: HubCandidate, free: boolean): number {
  if (!candidate.launch) return 0;
  if (!free) return 1;
  return candidate.launch.kind === "npm" ? 3 : 2;
}

function scoreCandidate(
  candidate: HubCandidate,
  keywords: string[],
  installedNames: ReadonlySet<string>,
): ScoredPick | null {
  const rel = relevance(candidate, keywords);
  if (rel.score === 0) return null;
  const paidHint = PAID_HINT.test(candidate.description);
  const installable = candidate.launch !== undefined;
  const free = installable && candidate.requiredSecrets.length === 0 && !paidHint;
  const rating = candidate.rating;
  const ratingBonus = rating
    ? (rating.overall - 3) * Math.min(1, Math.log10(rating.count + 1) / 2)
    : 0;
  const reason = [
    sourceReason(candidate),
    `matches ${rel.hits.join(", ")}`,
    installable ? launchReason(candidate) : `hub can't install: ${candidate.notInstallable}`,
    paidHint && installable ? "mentions paid calls (x402/USDC)" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return {
    pick: {
      tool: candidate.id,
      title: candidate.title,
      source: candidate.source,
      reason,
      installable,
      installed: installedNames.has(candidate.id),
      ...(candidate.url ? { url: candidate.url } : {}),
    },
    tier: 2,
    ...(candidate.launch?.kind === "npm" && !installedNames.has(candidate.id)
      ? { npm: { package: candidate.launch.package, version: candidate.launch.version } }
      : {}),
    score:
      rel.score * 10 +
      launchBonus(candidate, free) +
      ratingBonus -
      (paidHint || candidate.paid ? 2 : 0),
  };
}

function averageScore(reviews: readonly ToolReview[]): number {
  const total = reviews.reduce(
    (sum, review) =>
      sum + (review.scores.usefulness + review.scores.ease + review.scores.reliability) / 3,
    0,
  );
  return total / reviews.length;
}

function blockedMessage(install: ToolInstall): string {
  const status = install.status.state === "blocked" ? install.status : null;
  return `${install.name} is blocked: its tool descriptions changed since the user approved them (${status?.reason ?? "changed"}). Nothing was called. hub_add ${install.name} asks the user to re-approve.`;
}

function sourceReason(candidate: HubCandidate): string {
  switch (candidate.source) {
    case "registry":
      return "official MCP Registry";
    case "agent.reviews":
      return candidate.rating
        ? `agent.reviews: ${candidate.rating.overall}/5 from ${candidate.rating.count} self-reported reviews (no proof of a run)`
        : "agent.reviews (no rating yet)";
    case "nohumans":
      return candidate.paid
        ? `nohumans.directory: paid API, ${candidate.paid.price} ${candidate.paid.currency}/call${candidate.paid.verified ? ", bought and verified by them" : ""}`
        : "nohumans.directory";
  }
}

function launchReason(candidate: HubCandidate): string {
  const launch = candidate.launch;
  if (!launch) return "";
  const keys = candidate.requiredSecrets.length
    ? `needs keys ${candidate.requiredSecrets.join(", ")}`
    : "no keys";
  return launch.kind === "npm"
    ? `npm ${launch.package}@${launch.version}, ${keys}, runs sandboxed`
    : `remote ${new URL(launch.url).host}, ${keys}`;
}
