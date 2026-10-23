import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "pino";
import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentLaunchContext,
  AgentMode,
  AgentModelDefinition,
  AgentPermissionRequest,
  AgentPersistenceHandle,
  AgentPromptInput,
  AgentProvider,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeInfo,
  AgentSession,
  AgentSessionConfig,
  AgentStreamEvent,
  AgentTimelineItem,
  AgentUsage,
  ProviderCatalog,
  ToolCallTimelineItem,
} from "../../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../../provider-launch-config.js";
import {
  addModelVisibleStructuredContent,
  serializePaseoToolInputParameters,
} from "../../tools/paseo-tool-serialization.js";
import type { PaseoToolCatalog, PaseoToolResult } from "../../tools/types.js";
import { resolvePaseoHome } from "../../../paseo-home.js";
import {
  FreeBrainLimitError,
  FreeBrainRelayClient,
  type FreeBrainMessage,
  type FreeBrainTool,
  type FreeBrainToolCall,
} from "./relay-client.js";
import { FREE_BRAIN_ROLE_PROMPT } from "./role-prompt.js";

export const FREE_BRAIN_PROVIDER_ID = "hizuri-free";
const FREE_BRAIN_MODEL_ID = "free";
const FREE_BRAIN_MODE_ID = "default";

/**
 * Our relay's public https address, once it has one (own-domain backlog item). Until then a
 * daemon has a free brain only when `PASEO_FREE_BRAIN_URL` names a relay.
 */
export const DEFAULT_FREE_BRAIN_RELAY_URL: string | null = null;

/**
 * Paseo tools the free brain may call. Every tool's schema rides in every request and we pay for
 * those tokens, so only voice and the Show tab are offered. `PASEO_FREE_BRAIN_TOOLS` overrides.
 */
const DEFAULT_TOOLS = ["speak", "mark_phrases", "stage_open", "stage_update", "stage_close"];

/** A turn stops after this many model calls, so a tool loop cannot burn the user's cap. */
const MAX_STEPS_PER_TURN = 6;

const CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: false,
  supportsMcpServers: false,
  supportsNativePaseoTools: true,
  supportsReasoningStream: false,
  supportsToolInvocations: true,
};

const MODES: AgentMode[] = [
  { id: FREE_BRAIN_MODE_ID, label: "Free", description: "hizuri's free starter brain" },
];

const MODELS: AgentModelDefinition[] = [
  {
    provider: FREE_BRAIN_PROVIDER_ID,
    id: FREE_BRAIN_MODEL_ID,
    label: "hizuri free",
    description: "A small fast model hizuri pays for, with a daily limit",
    isDefault: true,
  },
];

export interface FreeBrainSettings {
  relayUrl: string | null;
  enabled: boolean;
  tools: string[];
  stateDir: string;
  /** Who the free brain is; `PASEO_FREE_BRAIN_ROLE_FILE` replaces it (hosted demos). */
  rolePrompt: string;
}

function readRolePrompt(file: string | undefined): string {
  if (!file?.trim()) return FREE_BRAIN_ROLE_PROMPT;
  try {
    return readFileSync(file.trim(), "utf8").trim() || FREE_BRAIN_ROLE_PROMPT;
  } catch {
    return FREE_BRAIN_ROLE_PROMPT;
  }
}

/** Knobs: env of the daemon, or `agents.providers.hizuri-free.env` in config.json. */
export function resolveFreeBrainSettings(
  runtimeSettings?: ProviderRuntimeSettings,
  env: NodeJS.ProcessEnv = process.env,
): FreeBrainSettings {
  const read = (name: string) => runtimeSettings?.env?.[name] ?? env[name];
  const tools = read("PASEO_FREE_BRAIN_TOOLS");
  return {
    relayUrl: read("PASEO_FREE_BRAIN_URL")?.trim() || DEFAULT_FREE_BRAIN_RELAY_URL,
    enabled: read("PASEO_FREE_BRAIN") !== "0",
    tools:
      tools !== undefined
        ? tools
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean)
        : DEFAULT_TOOLS,
    stateDir: path.join(resolvePaseoHome(env), "free-brain"),
    rolePrompt: readRolePrompt(read("PASEO_FREE_BRAIN_ROLE_FILE")),
  };
}

interface StoredSession {
  messages: FreeBrainMessage[];
}

function promptToText(prompt: AgentPromptInput): string {
  if (typeof prompt === "string") return prompt;
  return prompt
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

function resultText(result: PaseoToolResult): string {
  const visible = addModelVisibleStructuredContent(result);
  const text = visible.content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
  return text || (result.isError ? "error" : "ok");
}

function parseArguments(raw: string): unknown {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toolCallItem(input: {
  call: FreeBrainToolCall;
  args: unknown;
  status: ToolCallTimelineItem["status"];
  output?: string;
  error?: string;
}): ToolCallTimelineItem {
  const { call, args, status } = input;
  const name = call.function.name;
  const speakText =
    name === "speak" && args && typeof args === "object" ? (args as { text?: unknown }).text : null;
  const detail =
    typeof speakText === "string"
      ? { type: "unknown" as const, input: speakText, output: null }
      : { type: "unknown" as const, input: args, output: input.output ?? null };
  const base = { type: "tool_call" as const, callId: call.id, name, detail };
  if (status === "failed") return { ...base, status, error: { message: input.error ?? "failed" } };
  return { ...base, status, error: null };
}

/** Rebuilds the timeline a stored conversation showed, for history and resume. */
function timelineFromMessages(messages: FreeBrainMessage[]): AgentTimelineItem[] {
  const items: AgentTimelineItem[] = [];
  const outputs = new Map<string, string>();
  for (const message of messages) {
    if (message.role === "tool") outputs.set(message.tool_call_id, message.content);
  }
  for (const message of messages) {
    if (message.role === "user") items.push({ type: "user_message", text: message.content });
    if (message.role !== "assistant") continue;
    if (message.content) items.push({ type: "assistant_message", text: message.content });
    for (const call of message.tool_calls ?? []) {
      items.push(
        toolCallItem({
          call,
          args: parseArguments(call.function.arguments),
          status: "completed",
          output: outputs.get(call.id),
        }),
      );
    }
  }
  return items;
}

interface ActiveTurn {
  turnId: string;
  abort: AbortController;
  done: Promise<AgentRunResult>;
}

export class FreeBrainAgentSession implements AgentSession {
  readonly provider: AgentProvider = FREE_BRAIN_PROVIDER_ID;
  readonly capabilities = CAPABILITIES;
  readonly id: string;
  private readonly listeners = new Set<(event: AgentStreamEvent) => void>();
  private messages: FreeBrainMessage[];
  private active: ActiveTurn | null = null;

  constructor(
    private readonly options: {
      sessionId: string;
      config: AgentSessionConfig;
      messages: FreeBrainMessage[];
      relay: FreeBrainRelayClient;
      settings: FreeBrainSettings;
      tools: PaseoToolCatalog | null;
      logger: Logger;
    },
  ) {
    this.id = options.sessionId;
    this.messages = options.messages;
  }

  private get sessionFile(): string {
    return path.join(this.options.settings.stateDir, "sessions", `${this.id}.json`);
  }

  private async persist(): Promise<void> {
    const file = this.sessionFile;
    await mkdir(path.dirname(file), { recursive: true });
    const stored: StoredSession = { messages: this.messages };
    await writeFile(`${file}.tmp`, JSON.stringify(stored), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  }

  private systemPrompt(): string {
    const { config } = this.options;
    return [this.options.settings.rolePrompt, config.systemPrompt, config.daemonAppendSystemPrompt]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  private offeredTools(): FreeBrainTool[] {
    const catalog = this.options.tools;
    if (!catalog) return [];
    const tools: FreeBrainTool[] = [];
    for (const name of this.options.settings.tools) {
      const tool = catalog.getTool(name);
      if (!tool) continue;
      tools.push({
        type: "function",
        function: {
          name,
          description: tool.description,
          parameters: serializePaseoToolInputParameters(tool),
        },
      });
    }
    return tools;
  }

  private emit(event: AgentStreamEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.options.logger.warn({ err: error }, "Free brain listener failed");
      }
    }
  }

  private emitItem(turnId: string, item: AgentTimelineItem): void {
    this.emit({ type: "timeline", provider: this.provider, turnId, item });
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    await this.startTurn(prompt, options);
    return this.active!.done;
  }

  async startTurn(
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.active) throw new Error("The free brain already has an active turn");
    const turnId = randomUUID();
    const abort = new AbortController();
    const text = promptToText(prompt);
    this.emit({ type: "turn_started", provider: this.provider, turnId });
    this.emitItem(turnId, {
      type: "user_message",
      text,
      messageId: randomUUID(),
      ...(options?.clientMessageId ? { clientMessageId: options.clientMessageId } : {}),
    });
    this.messages.push({ role: "user", content: text });
    const turn: ActiveTurn = {
      turnId,
      abort,
      done: Promise.resolve().then(() => this.runTurn(turnId, abort.signal)),
    };
    this.active = turn;
    void turn.done.finally(() => {
      if (this.active === turn) this.active = null;
    });
    return { turnId };
  }

  private async runTurn(turnId: string, signal: AbortSignal): Promise<AgentRunResult> {
    const usage: AgentUsage = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
    let finalText = "";
    try {
      for (let step = 0; step < MAX_STEPS_PER_TURN; step += 1) {
        const step_ = await this.runStep(turnId, signal, usage);
        finalText = step_.text || finalText;
        if (!step_.continueTurn) break;
      }
      await this.persist();
      this.emit({ type: "turn_completed", provider: this.provider, turnId, usage });
      return { sessionId: this.id, finalText, usage, timeline: [] };
    } catch (error) {
      if (signal.aborted) {
        await this.persist().catch(() => undefined);
        this.emit({
          type: "turn_canceled",
          provider: this.provider,
          turnId,
          reason: "Interrupted",
        });
        return { sessionId: this.id, finalText, timeline: [], canceled: true };
      }
      if (error instanceof FreeBrainLimitError) {
        await this.sayLimit(turnId, error.message);
        await this.persist().catch(() => undefined);
        this.emit({ type: "turn_completed", provider: this.provider, turnId, usage });
        return { sessionId: this.id, finalText: error.message, usage, timeline: [] };
      }
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger.warn({ err: error }, "Free brain turn failed");
      this.emit({ type: "turn_failed", provider: this.provider, turnId, error: message });
      return { sessionId: this.id, finalText, timeline: [] };
    }
  }

  /**
   * The relay's cap message reaches the user as the assistant's reply, aloud when voice mode is on.
   */
  private async sayLimit(turnId: string, text: string): Promise<void> {
    this.messages.push({ role: "assistant", content: text });
    const catalog = this.options.tools;
    if (!catalog?.getTool("speak")) {
      this.emitItem(turnId, { type: "assistant_message", text, messageId: randomUUID() });
      return;
    }
    const call: FreeBrainToolCall = {
      id: `limit-${randomUUID()}`,
      type: "function",
      function: { name: "speak", arguments: JSON.stringify({ text }) },
    };
    this.emitItem(turnId, toolCallItem({ call, args: { text }, status: "running" }));
    const result = await catalog.executeTool("speak", { text }).catch(() => null);
    this.emitItem(
      turnId,
      toolCallItem({ call, args: { text }, status: "completed", output: result ? "ok" : "" }),
    );
  }

  private async runStep(
    turnId: string,
    signal: AbortSignal,
    usage: AgentUsage,
  ): Promise<{ text: string; continueTurn: boolean }> {
    const messageId = randomUUID();
    let text = "";
    const calls: Array<{ id: string; name: string; arguments: string }> = [];
    const stream = this.options.relay.streamChat(
      {
        messages: [{ role: "system", content: this.systemPrompt() }, ...this.messages],
        tools: this.offeredTools(),
      },
      signal,
    );
    for await (const chunk of stream) {
      if (chunk.text) {
        text += chunk.text;
        this.emitItem(turnId, { type: "assistant_message", text: chunk.text, messageId });
      }
      for (const delta of chunk.toolCalls ?? []) {
        const call = (calls[delta.index] ??= { id: "", name: "", arguments: "" });
        if (delta.id) call.id = delta.id;
        if (delta.name) call.name += delta.name;
        if (delta.arguments) call.arguments += delta.arguments;
      }
      if (chunk.usage) {
        usage.inputTokens = (usage.inputTokens ?? 0) + chunk.usage.inputTokens;
        usage.outputTokens = (usage.outputTokens ?? 0) + chunk.usage.outputTokens;
        usage.totalCostUsd = (usage.totalCostUsd ?? 0) + (chunk.usage.costUsd ?? 0);
        this.emit({ type: "usage_updated", provider: this.provider, turnId, usage: { ...usage } });
      }
    }
    const toolCalls: FreeBrainToolCall[] = calls
      .filter((call) => call.name)
      .map((call) => ({
        id: call.id || `call-${randomUUID()}`,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));
    this.messages.push({
      role: "assistant",
      content: text || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
    for (const call of toolCalls) {
      await this.runToolCall(turnId, call, signal);
    }
    return { text, continueTurn: toolCalls.length > 0 };
  }

  private async runToolCall(
    turnId: string,
    call: FreeBrainToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    const args = parseArguments(call.function.arguments);
    this.emitItem(turnId, toolCallItem({ call, args, status: "running" }));
    let output: string;
    let failed = false;
    const offered = this.options.settings.tools.includes(call.function.name);
    const catalog = this.options.tools;
    if (!offered || !catalog?.getTool(call.function.name)) {
      output = `Unknown tool ${call.function.name}`;
      failed = true;
    } else if (args === null) {
      output = "The arguments were not valid JSON";
      failed = true;
    } else {
      try {
        const result = await catalog.executeTool(call.function.name, args, { signal });
        output = resultText(result);
        failed = result.isError === true;
      } catch (error) {
        output = error instanceof Error ? error.message : String(error);
        failed = true;
      }
    }
    this.messages.push({ role: "tool", tool_call_id: call.id, content: output });
    this.emitItem(
      turnId,
      failed
        ? toolCallItem({ call, args, status: "failed", error: output })
        : toolCallItem({ call, args, status: "completed", output }),
    );
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    for (const item of timelineFromMessages(this.messages)) {
      yield { type: "timeline", provider: this.provider, item };
    }
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return {
      provider: this.provider,
      sessionId: this.id,
      model: FREE_BRAIN_MODEL_ID,
      modeId: FREE_BRAIN_MODE_ID,
    };
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return MODES;
  }

  async getCurrentMode(): Promise<string | null> {
    return FREE_BRAIN_MODE_ID;
  }

  async setMode(): Promise<void> {}

  getPendingPermissions(): AgentPermissionRequest[] {
    return [];
  }

  async respondToPermission(): Promise<void> {}

  describePersistence(): AgentPersistenceHandle {
    return {
      provider: this.provider,
      sessionId: this.id,
      metadata: {
        model: FREE_BRAIN_MODEL_ID,
        modeId: FREE_BRAIN_MODE_ID,
        cwd: this.options.config.cwd,
      },
    };
  }

  async interrupt(): Promise<void> {
    const turn = this.active;
    if (!turn) return;
    turn.abort.abort();
    await turn.done.catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.interrupt();
  }
}

/** hizuri: the free brain. A cheap model on our relay, the default when nothing else is set up. */
export class FreeBrainAgentClient implements AgentClient {
  readonly provider: AgentProvider = FREE_BRAIN_PROVIDER_ID;
  readonly capabilities = CAPABILITIES;
  private readonly settings: FreeBrainSettings;
  private readonly relay: FreeBrainRelayClient | null;
  private readonly logger: Logger;

  constructor(options: {
    logger: Logger;
    runtimeSettings?: ProviderRuntimeSettings;
    fetch?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  }) {
    this.logger = options.logger.child({ provider: FREE_BRAIN_PROVIDER_ID });
    this.settings = resolveFreeBrainSettings(options.runtimeSettings, options.env);
    this.relay = this.settings.relayUrl
      ? new FreeBrainRelayClient({
          relayUrl: this.settings.relayUrl,
          stateDir: this.settings.stateDir,
          fetch: options.fetch,
        })
      : null;
  }

  private requireRelay(): FreeBrainRelayClient {
    if (!this.relay) throw new Error("The free brain has no relay address (PASEO_FREE_BRAIN_URL)");
    return this.relay;
  }

  async createSession(
    config: AgentSessionConfig,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    return new FreeBrainAgentSession({
      sessionId: randomUUID(),
      config,
      messages: [],
      relay: this.requireRelay(),
      settings: this.settings,
      tools: launchContext?.paseoTools ?? null,
      logger: this.logger,
    });
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    const file = path.join(this.settings.stateDir, "sessions", `${handle.sessionId}.json`);
    let messages: FreeBrainMessage[] = [];
    try {
      messages = (JSON.parse(await readFile(file, "utf8")) as StoredSession).messages;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const metadata = (handle.metadata ?? {}) as { cwd?: string };
    return new FreeBrainAgentSession({
      sessionId: handle.sessionId,
      config: {
        cwd: metadata.cwd ?? overrides?.cwd ?? process.cwd(),
        ...overrides,
        provider: FREE_BRAIN_PROVIDER_ID,
      },
      messages,
      relay: this.requireRelay(),
      settings: this.settings,
      tools: launchContext?.paseoTools ?? null,
      logger: this.logger,
    });
  }

  async fetchCatalog(): Promise<ProviderCatalog> {
    return { models: MODELS, modes: MODES, defaultModeId: FREE_BRAIN_MODE_ID };
  }

  /** No network here: every provider refresh asks, and a dead relay must not slow the list. */
  async isAvailable(): Promise<boolean> {
    return this.settings.enabled && this.relay !== null;
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    if (!this.settings.enabled)
      return { diagnostic: "Free brain switched off (PASEO_FREE_BRAIN=0)." };
    if (!this.relay)
      return { diagnostic: "Free brain has no relay address (PASEO_FREE_BRAIN_URL)." };
    const reachable = await this.relay.health(AbortSignal.timeout(4_000));
    return {
      diagnostic: `Free brain relay ${this.settings.relayUrl}: ${
        reachable ? "reachable" : "not reachable"
      }. Tools offered: ${this.settings.tools.join(", ") || "none"}.`,
    };
  }
}
