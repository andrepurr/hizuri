import { readFileSync } from "node:fs";
import { join } from "node:path";
import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentStorage } from "../agent/agent-storage.js";
import { type SpokenInputMeta, wrapTypedInput } from "../voice-config.js";
import { StageSession, isStageRequest, type StageSessionOptions } from "../stage/stage-session.js";
import type { StageStore } from "../stage/store.js";
import type { SecretService } from "../secrets/service.js";
import { drawLiveScene } from "../stage/live-tab.js";
import { type CompactHold, sharedCompactHold } from "./voice/compact-hold.js";
import { resolveVoiceGraph } from "./voice/voice-graph.js";
import { resolveVoiceOwnerOptions, type VoiceOwnerOptions } from "./voice/voice-owner.js";
import type { VoiceRegistry } from "./voice/voice-registry.js";
import type { VoiceSessionHost } from "./voice/voice-session.js";

/**
 * Hizuri's part of a client session, kept out of Paseo's session.ts so upstream merges stay
 * small: the stage, the vault behind secure forms, the voice registry, the compact hold, the
 * companion agent and the voice host's extra powers. Session builds one and calls it at three
 * marked `hizuri:` points (the voice host, the voice owner options, the message dispatch).
 */

/** Session options only hizuri sets. */
export interface HizuriSessionOptions {
  /** Hizuri (session persist): voice sessions that outlive their socket, shared daemon-wide. */
  voiceRegistry?: VoiceRegistry;
  /** Hizuri: the stage, Zuri's tabs on the user's screen (stage.* requests). */
  stage?: StageStore | null;
  /** Hizuri: the vault behind the secure forms on the stage (secret.store requests). */
  secrets?: SecretService | null;
}

export interface HizuriSendOptions {
  spokenInput?: boolean;
  steer?: boolean;
  spokenMeta?: SpokenInputMeta;
}

/**
 * A typed message longer than this many lines is a paste (a log, a config, a page of docs), not a
 * phrase: keyboard dictation stays within a dozen or so lines, pastes run to dozens.
 */
const TYPED_PASTE_LINES = 20;

/** Who sent a typed message: only the user's own, from the app, becomes a phrase. */
export interface TypedSender {
  /** The hello's clientType: "mobile" is the app (web included); the CLI and MCP are agents. */
  clientType: string | null;
  /** Set when another agent sent it. */
  sourceAgentId?: string;
}

/** A message for an agent, sent the way the user's own messages are. */
export interface HizuriAgentMessage {
  agentId: string;
  text: string;
  /** Set for a steer: the agent manager records the accepted steer under it. */
  messageId?: string;
  options: HizuriSendOptions;
}

type SendResult = { ok: true } | { ok: false; error: string };
type AppLogsUploadRequest = Extract<SessionInboundMessage, { type: "app.logs.upload.request" }>;
type SecretStoreRequest = Extract<SessionInboundMessage, { type: "secret.store.request" }>;

/** What hizuri needs from the Session it lives in. */
export interface HizuriSessionDeps {
  options: HizuriSessionOptions;
  paseoHome: string;
  /** The daemon logger the shared compact hold logs to. */
  daemonLogger: pino.Logger;
  sessionLogger: pino.Logger;
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  emit(msg: SessionOutboundMessage): void;
  beginStageSubscription: StageSessionOptions["beginSubscription"];
  /** Session's own send path (handleSendAgentMessage). */
  sendAgentMessage(message: HizuriAgentMessage): Promise<SendResult>;
  hasActiveAgentRun(agentId: string | null): boolean;
  interruptAgentIfRunning(agentId: string): Promise<void>;
  listVoiceSessions(): { agentId: string; held: boolean }[];
  handleAppLogsUpload(msg: AppLogsUploadRequest): Promise<void>;
  newMessageId(): string;
}

/** A message hizuri took; `result` is what the dispatcher returns for it. */
export interface HizuriDispatch {
  result: Promise<void> | undefined;
}

export class HizuriSession {
  private readonly compactHold: CompactHold;
  private readonly stageSession: StageSession | null;

  constructor(private readonly deps: HizuriSessionDeps) {
    this.compactHold = sharedCompactHold(deps.agentManager, () => ({
      subscribe: (listener) => deps.agentManager.subscribe(listener, { replayState: false }),
      hasActiveRun: (agentId) => deps.agentManager.hasInFlightRun(agentId),
      logger: deps.daemonLogger,
    }));
    this.stageSession = this.createStageSession(deps.options.stage);
  }

  /** Paseo's voice host with hizuri's entries added or put in place of Paseo's. */
  voiceHost(base: VoiceSessionHost): VoiceSessionHost {
    const { deps } = this;
    const stage = deps.options.stage;
    return {
      ...base,
      isAgentArchived: async (agentId) =>
        Boolean((await deps.agentStorage.get(agentId))?.archivedAt),
      // Hizuri: steer = a spoken "by the way" into the running turn. The client message id
      // makes the agent manager record the accepted steer, so the chat shows what was said.
      sendSpokenInput: (agentId, text, steer, meta) =>
        this.sendSpokenInput(agentId, text, steer, meta),
      interruptAgentIfRunning: async (agentId) => {
        // Hizuri (compact hold): the user's words never cancel the assistant's compaction.
        if (this.compactHold.state(agentId)) {
          deps.sessionLogger.info({ agentId }, "voice.compact_hold.interrupt_skipped");
          return;
        }
        await deps.interruptAgentIfRunning(agentId);
      },
      compactHold: (agentId) => this.compactHold.state(agentId),
      companionOf: (agentId) => this.voiceCompanionOf(agentId),
      agentTimeline: (agentId) =>
        deps.agentManager.getAgent(agentId) ? deps.agentManager.getTimeline(agentId) : [],
      agentProvider: (agentId) => deps.agentManager.getAgent(agentId)?.provider ?? null,
      // The voice session draws the visual front's scenes into the live tab when the stage is on.
      ...(stage ? { showLive: (input) => drawLiveScene(stage, input) } : {}),
    };
  }

  /** The user's voice data and filters (speaker gate, journal, archive, wake words). */
  voiceOwner(): VoiceOwnerOptions {
    return resolveVoiceOwnerOptions(this.deps.paseoHome);
  }

  /**
   * Hizuri: a typed message as the agent gets it. Text typed in the app joins the voice graph with
   * an id, like a spoken message; anything else (another agent, the CLI, a paste, the graph off)
   * goes on as it was.
   */
  typedInput(text: string, sender: TypedSender): string {
    if (sender.clientType !== "mobile" || sender.sourceAgentId || !text.trim()) {
      return text;
    }
    if (text.split("\n").length > TYPED_PASTE_LINES) {
      return text;
    }
    const graph = resolveVoiceGraph(this.deps.paseoHome);
    if (!graph) {
      return text;
    }
    const id = graph.nextPhraseId();
    const now = Date.now();
    graph.phrase({ id, spokenAt: now, text, delivery: "normal", deliveredAt: now, message: id });
    return wrapTypedInput(text, id);
  }

  /** Hizuri's own requests; null = not hizuri's, Paseo's dispatch goes on. */
  handleMessage(msg: SessionInboundMessage): HizuriDispatch | null {
    if (isStageRequest(msg)) return { result: this.dispatchStageMessage(msg) };
    switch (msg.type) {
      case "secret.store.request":
        return { result: this.storeSecret(msg) };
      case "voice.session.list.request":
        this.deps.emit({
          type: "voice.session.list.response",
          payload: { requestId: msg.requestId, sessions: this.deps.listVoiceSessions() },
        });
        return { result: undefined };
      case "app.logs.upload.request":
        return { result: this.deps.handleAppLogsUpload(msg) };
      default:
        return null;
    }
  }

  private sendSpokenInput(
    agentId: string,
    text: string,
    steer: boolean | undefined,
    meta: SpokenInputMeta | undefined,
  ): Promise<SendResult> {
    const { deps } = this;
    // Hizuri (two Zuris, on trial): the companion hears every phrase too, first, as a
    // "by the way" when it is busy. Its delivery never decides the main one's result.
    const companionId = this.voiceCompanionOf(agentId);
    if (companionId) {
      const companionSteer = deps.hasActiveAgentRun(companionId);
      if (!this.holdWhileCompacting(companionId, text, companionSteer, meta)) {
        void this.deliver(companionId, text, {
          spokenInput: true,
          steer: companionSteer,
          ...(meta ? { spokenMeta: meta } : {}),
        });
      }
    }
    if (this.holdWhileCompacting(agentId, text, steer === true, meta)) {
      return Promise.resolve({ ok: true as const });
    }
    return this.deliver(agentId, text, {
      spokenInput: true,
      steer: steer === true,
      ...(meta ? { spokenMeta: meta } : {}),
    });
  }

  /** A steer carries a fresh message id, so the chat shows what went into the running turn. */
  private deliver(agentId: string, text: string, options: HizuriSendOptions): Promise<SendResult> {
    return this.deps.sendAgentMessage({
      agentId,
      text,
      ...(options.steer ? { messageId: this.deps.newMessageId() } : {}),
      options,
    });
  }

  /**
   * Hizuri (compact hold, compact-hold.ts): while the agent compacts, a spoken message waits and
   * goes with the others as one message when the compaction ends. True = held.
   */
  private holdWhileCompacting(
    agentId: string,
    text: string,
    steer: boolean,
    meta: SpokenInputMeta | undefined,
  ): boolean {
    return this.compactHold.hold(agentId, { text, meta: meta ?? null, steer }, (merged, steerNow) =>
      this.deliver(agentId, merged, { steer: steerNow }),
    );
  }

  /**
   * Hizuri (two Zuris, on trial): `$PASEO_HOME/voice-companion.json` maps a voice agent's id to
   * its companion's id; read on every call, so pairing changes without a restart.
   */
  private voiceCompanionOf(agentId: string): string | null {
    try {
      const map = JSON.parse(
        readFileSync(join(this.deps.paseoHome, "voice-companion.json"), "utf8"),
      ) as Record<string, unknown>;
      const companion = map[agentId];
      return typeof companion === "string" && companion && companion !== agentId ? companion : null;
    } catch {
      return null;
    }
  }

  private createStageSession(store: StageStore | null | undefined): StageSession | null {
    if (!store) return null;
    const { deps } = this;
    return new StageSession({
      store,
      emit: (msg) => deps.emit(msg),
      beginSubscription: deps.beginStageSubscription,
      sendToAgent: (agentId, text) =>
        this.deliver(agentId, text, { steer: deps.hasActiveAgentRun(agentId) }),
      logger: deps.sessionLogger.child({ module: "stage" }),
    });
  }

  private dispatchStageMessage(msg: Parameters<StageSession["handle"]>[0]): Promise<void> {
    if (!this.stageSession) {
      this.deps.sessionLogger.warn({ type: msg.type }, "Stage request on a daemon without a stage");
      return Promise.resolve();
    }
    return this.stageSession.handle(msg);
  }

  /**
   * Hizuri: the user's values for a secret form go to the vault. Nothing here logs the message: it
   * holds the values. A form answered after secret_request stopped waiting reaches the agent as a
   * note.
   */
  private async storeSecret(msg: SecretStoreRequest): Promise<void> {
    const { deps } = this;
    const secrets = deps.options.secrets;
    const reply = (stored: boolean, name: string | null, error: string | null) =>
      deps.emit({
        type: "secret.store.response",
        payload: { requestId: msg.requestId, stored, name, error },
      });
    if (!secrets) {
      reply(false, null, "This host has no vault.");
      return;
    }
    const result = await secrets.submit({
      agentId: msg.agentId,
      form: msg.form,
      ...(msg.values ? { values: msg.values } : {}),
      ...(msg.decline ? { decline: true } : {}),
    });
    reply(result.stored, result.name, result.error);
    if (result.lateNote) {
      await this.deliver(msg.agentId, result.lateNote, {
        steer: deps.hasActiveAgentRun(msg.agentId),
      }).catch(() => undefined);
    }
  }
}
