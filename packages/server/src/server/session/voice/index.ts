import {
  VOICE_MOVED_REQUEST_ID,
  type SessionInboundMessage,
  type SessionOutboundMessage,
} from "../../messages.js";
import type { OwnedOperation, SessionDelivery } from "../owned-subscriptions/index.js";
import { VoiceRegistry, type VoiceHolder } from "./voice-registry.js";
import { VoiceSession, type VoiceSessionOptions } from "./voice-session.js";

type VoiceMessage = Extract<
  SessionInboundMessage,
  {
    type:
      | "voice_audio_chunk"
      | "abort_request"
      | "audio_played"
      | "set_voice_mode"
      | "dictation_stream_start"
      | "dictation_stream_chunk"
      | "dictation_stream_finish"
      | "dictation_stream_cancel";
  }
>;

interface ActiveVoiceSource {
  source: object;
  /** Replaced when this source takes over a voice that lives on from another connection. */
  voice: VoiceSession;
  owner: OwnedOperation;
  pending: Set<Promise<void>>;
  closing: boolean;
  /** The voice went on with another connection or ended: releasing this source leaves it alone. */
  handedOff: boolean;
  holder: VoiceHolder;
}

/**
 * Audio conversations belong to their requesting socket, including bootstrap and finalization.
 * Hizuri (session persist): a voice whose agent is in voice mode outlives its socket. When the
 * socket goes (closed tab, reload, dropped connection, expired client session) the voice is
 * parked in the daemon-wide registry, and the next socket that asks for voice with that agent
 * takes it over. Voice mode turned off without keepSession ends it, and so does archiving the agent.
 */
export class VoiceSessions {
  private readonly sources = new Map<object, ActiveVoiceSource>();
  /** Sockets whose voice went on elsewhere: their stray microphone audio is dropped. */
  private readonly movedFrom = new WeakSet<object>();

  constructor(
    private readonly options: VoiceSessionOptions,
    private readonly delivery: SessionDelivery,
    private readonly demandChanged: () => void,
    private readonly registry: VoiceRegistry = new VoiceRegistry(),
    // COMPAT(voiceLiveTranscript): added in hizuri, remove after 2027-04-17 once every client
    // advertises CLIENT_CAPS.voiceLiveTranscript.
    private readonly supportsLiveTranscript: (source: object) => boolean = () => false,
    // COMPAT(voiceThinkHint): added in hizuri, remove after 2027-04-21 once every client
    // advertises CLIENT_CAPS.voiceThinkHint.
    private readonly supportsThinkHint: (source: object) => boolean = () => false,
  ) {}

  get hasDemand(): boolean {
    return [...this.sources.values()].some((source) => !source.closing);
  }

  /** Every voice session on the daemon, for voice.session.list.request. */
  list(): { agentId: string; held: boolean }[] {
    return this.registry.list();
  }

  isActiveForAgent(agentId: string): boolean {
    return [...this.sources.values()].some(
      (source) => !source.closing && source.voice.isActiveForAgent(agentId),
    );
  }

  handleMessage(message: VoiceMessage): Promise<void> {
    const source = this.delivery.currentSource;
    if (!source) throw new Error("Voice request has no source");
    if (this.movedFrom.has(source)) {
      if (message.type === "voice_audio_chunk") return Promise.resolve();
      this.movedFrom.delete(source);
    }
    const existing = this.sources.get(source);
    if (existing?.closing) return existing.owner.release().then(() => this.handleMessage(message));
    const active = existing ?? this.startSource(source);
    const pending = Promise.resolve().then(() => {
      if (active.closing) return undefined;
      if (message.type === "set_voice_mode") return this.setVoiceMode(active, message);
      return this.dispatch(active.voice, message);
    });
    active.pending.add(pending);
    const finished = () => {
      active.pending.delete(pending);
      this.releaseIdle(active);
      return undefined;
    };
    void pending.then(finished, finished);
    return pending;
  }

  private startSource(source: object): ActiveVoiceSource {
    const accepts = (message: SessionOutboundMessage) =>
      isVoiceOutput(message) &&
      (message.type !== "voice_live_transcript" || this.supportsLiveTranscript(owner.source)) &&
      (message.type !== "voice_think_hint" || this.supportsThinkHint(owner.source));
    const owner = this.delivery.operation(accepts, async () => {
      active.closing = true;
      this.demandChanged();
      try {
        if (!active.handedOff) await this.releaseVoice(active);
      } finally {
        if (this.sources.get(source) === active) this.sources.delete(source);
      }
    });
    const active: ActiveVoiceSource = {
      source,
      owner,
      pending: new Set(),
      closing: false,
      handedOff: false,
      holder: {
        handOff: () => this.handOff(active),
        end: (agentId) => this.endArchived(active, agentId),
      },
      voice: new VoiceSession({
        ...this.options,
        host: { ...this.options.host, emit: (message) => active.owner.emit(message) },
        onIdle: () => this.releaseIdle(active),
      }),
    };
    this.registry.setHolder(active.voice, active.holder);
    this.sources.set(source, active);
    this.demandChanged();
    return active;
  }

  /**
   * The socket went away or the voice went idle. A voice with an agent in voice mode is parked:
   * nobody hears it, its agent keeps the voice prompt and speak tools, and it waits for a
   * client. Anything else ends as before.
   */
  private async releaseVoice(active: ActiveVoiceSource): Promise<void> {
    const voice = active.voice;
    const agentId = voice.armedAgentId ?? this.registry.agentOf(voice);
    if (agentId) {
      this.registry.setHolder(voice, null);
      voice.attachClient({ ...this.options.host, emit: () => {} }, undefined);
      this.options.logger.info({ agentId }, "voice.parked");
      try {
        // After any voice-mode change still in flight (an enable outlives its socket).
        await voice.suspend("client-detached");
      } finally {
        this.registry.reconcile(voice);
      }
      return;
    }
    try {
      // Cancel input immediately; restore agent configuration after bootstrap has settled.
      voice.cancel();
    } finally {
      await Promise.allSettled(active.pending);
      await voice.cleanup();
      this.registry.reconcile(voice);
    }
  }

  /** Another socket takes this source's voice over; tell this client so it switches to text. */
  private handOff(active: ActiveVoiceSource): void {
    if (active.handedOff) return;
    this.letGo(active, active.voice.armedAgentId ?? this.registry.agentOf(active.voice));
  }

  /**
   * The agent was archived: this client hears its voice is gone (the same message as a move, so
   * it stops the microphone), and the voice ends without reloading the archived agent.
   */
  private async endArchived(active: ActiveVoiceSource, agentId: string): Promise<void> {
    if (active.handedOff) return;
    this.letGo(active, agentId);
    const voice = active.voice;
    try {
      await voice.cleanup({ restoreAgent: false });
    } finally {
      this.registry.reconcile(voice);
    }
    this.options.logger.info({ agentId }, "voice.ended_archived");
  }

  /** This source lets its voice go: the client switches to text and its stray audio is dropped. */
  private letGo(active: ActiveVoiceSource, agentId: string | null): void {
    active.handedOff = true;
    active.owner.emit({
      type: "set_voice_mode_response",
      payload: {
        requestId: VOICE_MOVED_REQUEST_ID,
        enabled: false,
        agentId,
        accepted: true,
        error: null,
      },
    });
    this.movedFrom.add(active.source);
    if (this.sources.get(active.source) === active) this.sources.delete(active.source);
    void active.owner
      .release()
      .catch((error) =>
        this.options.logger.error({ err: error }, "Failed to release a handed-off voice source"),
      );
  }

  private async setVoiceMode(
    active: ActiveVoiceSource,
    message: Extract<VoiceMessage, { type: "set_voice_mode" }>,
  ): Promise<void> {
    const agentId = message.agentId?.trim();
    if (agentId) {
      this.takeOver(active, agentId);
      if (message.enabled) this.registry.claim(agentId, active.voice);
    }
    const voice = active.voice;
    try {
      await this.dispatch(voice, message);
    } finally {
      this.registry.reconcile(voice);
    }
  }

  /**
   * The agent's voice lives on elsewhere: parked after its socket went away, or still held by a
   * stale socket, another tab or another device. It moves to this source as it is; the agent
   * is not reloaded.
   */
  private takeOver(active: ActiveVoiceSource, agentId: string): void {
    const entry = this.registry.get(agentId);
    if (!entry || entry.voice === active.voice) return;
    const parked = entry.holder === null;
    entry.holder?.handOff();
    const previous = active.voice;
    active.voice = entry.voice;
    this.registry.setHolder(entry.voice, active.holder);
    entry.voice.attachClient(
      { ...this.options.host, emit: (message) => active.owner.emit(message) },
      () => this.releaseIdle(active),
    );
    this.options.logger.info({ agentId, parked }, "voice.taken_over");
    // Archiving the previous voice's chat while it ends must not reach this source's new voice.
    this.registry.forget(previous);
    void this.endVoice(previous);
  }

  /** The voice a source had before it took another one over. */
  private async endVoice(voice: VoiceSession): Promise<void> {
    try {
      voice.cancel();
      await voice.cleanup();
    } catch (error) {
      this.options.logger.warn({ err: error }, "Failed to end a replaced voice");
    } finally {
      this.registry.reconcile(voice);
    }
  }

  private releaseIdle(source: ActiveVoiceSource): void {
    if (source.closing || source.pending.size > 0 || source.voice.hasDemand) return;
    void source.owner
      .release()
      .catch((error) =>
        this.options.logger.error({ err: error }, "Failed to release voice source"),
      );
  }

  private async dispatch(voice: VoiceSession, message: VoiceMessage): Promise<void> {
    switch (message.type) {
      case "voice_audio_chunk":
        return voice.handleAudioChunk(message);
      case "abort_request":
        return voice.handleAbort();
      case "audio_played":
        return voice.handleAudioPlayed(message.id);
      case "set_voice_mode":
        return voice.handleSetVoiceMode(message.enabled, message.agentId, message.requestId, {
          keepSession: message.keepSession === true,
        });
      case "dictation_stream_start":
        return voice.handleDictationStreamStart(message);
      case "dictation_stream_chunk":
        return voice.handleDictationChunk({
          dictationId: message.dictationId,
          seq: message.seq,
          audioBase64: message.audio,
          format: message.format,
        });
      case "dictation_stream_finish":
        return voice.handleDictationFinish(message.dictationId, message.finalSeq);
      case "dictation_stream_cancel":
        return voice.handleDictationCancel(message.dictationId);
    }
  }
}

function isVoiceOutput(message: SessionOutboundMessage): boolean {
  switch (message.type) {
    case "audio_output":
    case "transcription_result":
    case "voice_input_state":
    case "voice_live_transcript":
    case "voice_think_hint":
    case "set_voice_mode_response":
    case "dictation_stream_ack":
    case "dictation_stream_partial":
    case "dictation_stream_final":
    case "dictation_stream_error":
    case "dictation_stream_finish_accepted":
    case "activity_log":
      return true;
    default:
      return false;
  }
}
