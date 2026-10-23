import { Buffer } from "buffer";
import type { AgentStreamEventPayload, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { resolveVoiceUnavailableMessage } from "@/utils/server-info-capabilities";
import type { DaemonServerInfo } from "@/stores/session-store";
import type { AudioEngine } from "@/audio";
import type { VoiceBackground, VoiceMicOffReason } from "./voice-background";
import type { PersistedVoiceSession, VoiceSessionStore } from "./voice-session-store";

const PCM_MIME_TYPE = "audio/pcm;rate=16000;bits=16";
const KEEP_AWAKE_TAG = "paseo:voice";
const DISPLAY_VOLUME_PUBLISH_INTERVAL_MS = 120;
const DISPLAY_VOLUME_CHANGE_EPSILON = 0.02;
const DISPLAY_VOLUME_ATTACK = 0.35;
const DISPLAY_VOLUME_RELEASE = 0.18;
/**
 * Re-enabling voice mode on a host that just restarted can outlast the client's 60 s RPC
 * timeout (seen: 60.7 s). Voice mode stays on locally, so keep asking until the host says yes.
 */
const RESYNC_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 30_000];
/** Reopening the microphone after the OS cut it (iOS interruption, or an older Android build). */
const CAPTURE_RESTART_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 15_000];
/** How long the user's words may be lost before hizuri tells them. */
const MIC_OFF_NOTICE_DELAY_MS = 20_000;

type TurnEventType = Extract<
  AgentStreamEventPayload["type"],
  "turn_started" | "turn_completed" | "turn_failed" | "turn_canceled"
>;

export type VoiceRuntimePhase =
  | "disabled"
  | "starting"
  | "listening"
  | "submitting"
  | "waiting"
  | "playing"
  | "stopping";

export interface VoiceRuntimeSnapshot {
  phase: VoiceRuntimePhase;
  isVoiceMode: boolean;
  isVoiceSwitching: boolean;
  isMuted: boolean;
  activeServerId: string | null;
  activeAgentId: string | null;
  /**
   * Hizuri (session persist): the conversation that survives a closed window, a reload and a
   * dropped connection, and the mode the user chose for it. Only “End session” clears it.
   */
  session: PersistedVoiceSession | null;
}

export interface VoiceRuntimeTelemetrySnapshot {
  volume: number;
  isSpeaking: boolean;
  segmentDuration: number;
}

export interface VoiceSessionAdapter {
  serverId: string;
  setVoiceMode(
    enabled: boolean,
    agentId?: string,
    options?: { keepSession?: boolean },
  ): Promise<void>;
  sendVoiceAudioChunk(audioData: string, mimeType: string, outputRoute?: string): Promise<void>;
  audioPlayed(chunkId: string): Promise<void>;
  abortRequest(): Promise<void>;
  setAssistantAudioPlaying(isPlaying: boolean): void;
}

export interface VoiceRuntimeDeps {
  engine: AudioEngine;
  getServerInfo(serverId: string): DaemonServerInfo | null;
  activateKeepAwake(tag: string): Promise<void>;
  deactivateKeepAwake(tag: string): Promise<void>;
  /** Keeps capture and playback running while the app is hidden (Android foreground service). */
  background?: VoiceBackground;
  /** Where the session lives across reloads; absent = only in memory. */
  sessionStore?: VoiceSessionStore;
  /** The app log buffer (tag `voice`), sent to the host's app logs. */
  log?(level: "info" | "warn", message: string): void;
}

interface RuntimeSessionState {
  adapter: VoiceSessionAdapter;
  connected: boolean;
}

interface ContinuousVoiceUploader {
  reset(): void;
  pushPcmChunk(chunk: Uint8Array): void;
}

interface RuntimeState {
  snapshot: VoiceRuntimeSnapshot;
  telemetry: VoiceRuntimeTelemetrySnapshot;
  turnInProgress: boolean;
  serverSpeechDetected: boolean;
  transportReady: boolean;
  generation: number;
  segmentDurationTimer: ReturnType<typeof setInterval> | null;
  lastDisplayVolumePublishMs: number;
  serverSpeechStartedAt: number | null;
  /** Bumped to cancel an in-flight voice-mode resync and its retries. */
  resyncEpoch: number;
  resyncAttempt: number;
  resyncTimer: ReturnType<typeof setTimeout> | null;
  captureInterrupted: boolean;
  captureRestartAttempt: number;
  captureRestartTimer: ReturnType<typeof setTimeout> | null;
  micOffTimer: ReturnType<typeof setTimeout> | null;
  micOffNotified: boolean;
  /** A failed automatic resume waits for the next connection or the user's own action. */
  autoResumeBlocked: boolean;
  autoResuming: boolean;
}

type AudioOutputPayload = Extract<SessionOutboundMessage, { type: "audio_output" }>["payload"];

interface StreamingPlaybackChunk {
  id: string;
  chunkIndex: number;
  source: { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string };
}

interface StreamingPlaybackGroup {
  groupId: string;
  isVoiceMode: boolean;
  shouldPlay: boolean;
  chunks: Map<number, StreamingPlaybackChunk>;
  nextChunkToPlay: number;
  finalChunkIndex: number | null;
  started: boolean;
  ackedChunkIds: Set<string>;
}

interface RuntimePlaybackState {
  groups: Map<string, StreamingPlaybackGroup>;
  orderedGroupIds: string[];
  activeGroupId: string | null;
  processing: boolean;
  generation: number;
}

const INITIAL_SNAPSHOT: VoiceRuntimeSnapshot = {
  phase: "disabled",
  isVoiceMode: false,
  isVoiceSwitching: false,
  isMuted: false,
  activeServerId: null,
  activeAgentId: null,
  session: null,
};

const INITIAL_TELEMETRY: VoiceRuntimeTelemetrySnapshot = {
  volume: 0,
  isSpeaking: false,
  segmentDuration: 0,
};

let nextVoiceRuntimeInstanceId = 1;

function snapshotsEqual(left: VoiceRuntimeSnapshot, right: VoiceRuntimeSnapshot): boolean {
  return (
    left.phase === right.phase &&
    left.isVoiceMode === right.isVoiceMode &&
    left.isVoiceSwitching === right.isVoiceSwitching &&
    left.isMuted === right.isMuted &&
    left.activeServerId === right.activeServerId &&
    left.activeAgentId === right.activeAgentId &&
    sessionsEqual(left.session, right.session)
  );
}

function sessionsEqual(
  left: PersistedVoiceSession | null,
  right: PersistedVoiceSession | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.serverId === right.serverId &&
      left.agentId === right.agentId &&
      left.mode === right.mode)
  );
}

function telemetryEqual(
  left: VoiceRuntimeTelemetrySnapshot,
  right: VoiceRuntimeTelemetrySnapshot,
): boolean {
  return (
    left.volume === right.volume &&
    left.isSpeaking === right.isSpeaking &&
    left.segmentDuration === right.segmentDuration
  );
}

export interface VoiceRuntime {
  subscribe(listener: () => void): () => void;
  getSnapshot(): VoiceRuntimeSnapshot;
  subscribeTelemetry(listener: () => void): () => void;
  getTelemetrySnapshot(): VoiceRuntimeTelemetrySnapshot;
  registerSession(adapter: VoiceSessionAdapter): () => void;
  updateSessionConnection(serverId: string, connected: boolean): void;
  handleCapturePcm(chunk: Uint8Array): void;
  handleCaptureVolume(level: number): void;
  /** The OS stopped capture. Voice mode stays on; capture restarts by itself. */
  handleCaptureInterrupted(): void;
  /** The host answered set_voice_mode with voice on, possibly after the request timed out. */
  onVoiceModeConfirmed(serverId: string, agentId: string | null): void;
  handleAudioOutput(serverId: string, payload: AudioOutputPayload): void;
  startVoice(serverId: string, agentId: string): Promise<void>;
  /**
   * Hizuri (voice move): voice to this agent in one tap. A session with another agent ends on
   * its host first; returns that session, or null when there was none to move from.
   */
  moveVoice(serverId: string, agentId: string): Promise<PersistedVoiceSession | null>;
  /** Ends the voice session: voice mode off on the host, the agent's prompt restored. */
  stopVoice(): Promise<void>;
  /** Hizuri: voice off, the session kept (the host keeps the agent in voice mode). */
  switchToText(): Promise<void>;
  /** Hizuri: “End session”, in voice or in text; the only way a session ends. */
  endSession(): Promise<void>;
  /** The host can keep a session in text mode (server_info.features.voiceSessionPersist). */
  canKeepSession(serverId: string): boolean;
  isSessionForAgent(serverId: string, agentId: string): boolean;
  /** Voice is being turned on for this agent (the host may take ~20 s on a first start). */
  isVoiceStartingForAgent(serverId: string, agentId: string): boolean;
  /** The host moved this agent's voice to another connection: switch to text, keep the session. */
  onVoiceModeMoved(serverId: string, agentId: string): void;
  /** Stops locally only: the host keeps the session for the next connection. */
  destroy(): Promise<void>;
  /** The session saved on this device, once storage has been read (null = none). */
  loadedSession(): Promise<PersistedVoiceSession | null>;
  /**
   * Hizuri (first open): a session the host keeps for an agent, taken by a device that has none
   * saved. A voice one resumes by itself like a saved one; a device with its own session ignores it.
   */
  adoptHostSession(session: PersistedVoiceSession): Promise<void>;
  toggleMute(): void;
  isVoiceModeForAgent(serverId: string, agentId: string): boolean;
  shouldPlayVoiceAudio(serverId: string): boolean;
  onAssistantAudioStarted(serverId: string): void;
  onAssistantAudioFinished(serverId: string): void;
  onTranscriptionResult(serverId: string, text: string): void;
  onServerSpeechStateChanged(serverId: string, isSpeaking: boolean): void;
  onTurnEvent(serverId: string, agentId: string, eventType: TurnEventType): void;
}

export function createVoiceRuntime(deps: VoiceRuntimeDeps): VoiceRuntime {
  const instanceId = nextVoiceRuntimeInstanceId++;
  const listeners = new Set<() => void>();
  const telemetryListeners = new Set<() => void>();
  const sessions = new Map<string, RuntimeSessionState>();
  const state: RuntimeState = {
    snapshot: INITIAL_SNAPSHOT,
    telemetry: INITIAL_TELEMETRY,
    turnInProgress: false,
    serverSpeechDetected: false,
    transportReady: false,
    generation: 0,
    segmentDurationTimer: null,
    lastDisplayVolumePublishMs: 0,
    serverSpeechStartedAt: null,
    resyncEpoch: 0,
    resyncAttempt: 0,
    resyncTimer: null,
    captureInterrupted: false,
    captureRestartAttempt: 0,
    captureRestartTimer: null,
    micOffTimer: null,
    micOffNotified: false,
    autoResumeBlocked: false,
    autoResuming: false,
  };
  const playback: RuntimePlaybackState = {
    groups: new Map(),
    orderedGroupIds: [],
    activeGroupId: null,
    processing: false,
    generation: 0,
  };
  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function emitTelemetry(): void {
    for (const listener of telemetryListeners) {
      listener();
    }
  }

  function patchSnapshot(
    patch:
      | Partial<VoiceRuntimeSnapshot>
      | ((previous: VoiceRuntimeSnapshot) => VoiceRuntimeSnapshot),
  ): void {
    const next =
      typeof patch === "function" ? patch(state.snapshot) : { ...state.snapshot, ...patch };
    if (snapshotsEqual(next, state.snapshot)) {
      return;
    }
    state.snapshot = next;
    emit();
  }

  function patchTelemetry(
    patch:
      | Partial<VoiceRuntimeTelemetrySnapshot>
      | ((previous: VoiceRuntimeTelemetrySnapshot) => VoiceRuntimeTelemetrySnapshot),
  ): void {
    const next =
      typeof patch === "function" ? patch(state.telemetry) : { ...state.telemetry, ...patch };
    if (telemetryEqual(next, state.telemetry)) {
      return;
    }
    state.telemetry = next;
    emitTelemetry();
  }

  function getActiveSession(): RuntimeSessionState | null {
    if (!state.snapshot.activeServerId) {
      return null;
    }
    return sessions.get(state.snapshot.activeServerId) ?? null;
  }

  function decodeAudioChunk(base64: string): Uint8Array {
    return Buffer.from(base64, "base64");
  }

  function toPlaybackSource(
    bytes: Uint8Array,
    format: string,
  ): { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string } {
    let mimeType: string;
    if (format === "pcm") mimeType = "audio/pcm;rate=24000;bits=16";
    else if (format === "mp3") mimeType = "audio/mpeg";
    else mimeType = `audio/${format}`;

    return {
      size: bytes.byteLength,
      type: mimeType,
      async arrayBuffer() {
        return Uint8Array.from(bytes).buffer;
      },
    };
  }

  function resetPlaybackState(): void {
    playback.generation += 1;
    playback.groups.clear();
    playback.orderedGroupIds = [];
    playback.activeGroupId = null;
    playback.processing = false;
  }

  function activateNextPlaybackGroup(): void {
    while (playback.orderedGroupIds.length > 0) {
      const groupId = playback.orderedGroupIds[0];
      if (playback.groups.has(groupId)) {
        playback.activeGroupId = groupId;
        return;
      }
      playback.orderedGroupIds.shift();
    }
    playback.activeGroupId = null;
  }

  function retireFinishedGroup(
    group: { groupId: string; started: boolean; isVoiceMode: boolean },
    serverId: string,
  ): void {
    playback.groups.delete(group.groupId);
    if (playback.orderedGroupIds[0] === group.groupId) {
      playback.orderedGroupIds.shift();
    } else {
      playback.orderedGroupIds = playback.orderedGroupIds.filter(
        (value) => value !== group.groupId,
      );
    }
    if (group.started && group.isVoiceMode) {
      api.onAssistantAudioFinished(serverId);
    }
  }

  async function acknowledgeChunk(chunkId: string): Promise<void> {
    const activeSession = getActiveSession();
    if (!activeSession) {
      return;
    }
    await activeSession.adapter.audioPlayed(chunkId);
  }

  /**
   * The reply's last chunk settles once it has been heard, not when the engine takes the next one:
   * the daemon ends the assistant's turn (barge hold, echo filter) on that chunk's confirmation.
   */
  async function playGroupChunk(
    group: StreamingPlaybackGroup,
    chunk: StreamingPlaybackChunk,
  ): Promise<void> {
    await deps.engine.play(chunk.source);
    if (chunk.chunkIndex === group.finalChunkIndex) {
      await deps.engine.waitForOutputDrain?.();
    }
  }

  async function processPlaybackQueue(serverId: string): Promise<void> {
    if (playback.processing) {
      return;
    }

    playback.processing = true;
    const generation = playback.generation;
    try {
      while (playback.activeGroupId) {
        if (generation !== playback.generation) {
          return;
        }

        const group = playback.groups.get(playback.activeGroupId);
        if (!group) {
          activateNextPlaybackGroup();
          continue;
        }

        const nextChunk = group.chunks.get(group.nextChunkToPlay);
        if (!nextChunk) {
          const groupIsFinished =
            group.finalChunkIndex !== null && group.nextChunkToPlay > group.finalChunkIndex;
          if (!groupIsFinished) {
            return;
          }
          retireFinishedGroup(group, serverId);
          activateNextPlaybackGroup();
          continue;
        }

        group.chunks.delete(group.nextChunkToPlay);

        if (group.shouldPlay && !group.started && group.isVoiceMode) {
          group.started = true;
          api.onAssistantAudioStarted(serverId);
        }

        try {
          if (group.shouldPlay) {
            await playGroupChunk(group, nextChunk);
          }
        } catch (error) {
          if (generation !== playback.generation) {
            return;
          }
          console.error(`[VoiceRuntime] play error chunk=${group.nextChunkToPlay}:`, error);
        }

        if (generation !== playback.generation) {
          return;
        }

        if (!group.ackedChunkIds.has(nextChunk.id)) {
          group.ackedChunkIds.add(nextChunk.id);
          void acknowledgeChunk(nextChunk.id).catch((error) => {
            console.warn("[VoiceRuntime] Failed to confirm audio playback:", error);
          });
        }

        group.nextChunkToPlay += 1;
      }
    } finally {
      if (generation === playback.generation) {
        playback.processing = false;
      }
    }
  }

  function clearSegmentDurationTimer(): void {
    if (state.segmentDurationTimer) {
      clearInterval(state.segmentDurationTimer);
      state.segmentDurationTimer = null;
    }
  }

  function reconcileSegmentDurationTimer(): void {
    if (!state.serverSpeechDetected) {
      clearSegmentDurationTimer();
      patchTelemetry((prev) => ({ ...prev, segmentDuration: 0 }));
      return;
    }

    if (state.segmentDurationTimer) {
      return;
    }

    state.segmentDurationTimer = setInterval(() => {
      const startedAt = state.serverSpeechStartedAt;
      patchTelemetry((prev) => ({
        ...prev,
        segmentDuration: startedAt ? Date.now() - startedAt : 0,
      }));
    }, 100);
  }

  function resetCaptureTelemetry(): void {
    clearSegmentDurationTimer();
    state.serverSpeechStartedAt = null;
    patchTelemetry({ ...INITIAL_TELEMETRY });
  }

  const uploader: ContinuousVoiceUploader = {
    reset() {},
    pushPcmChunk(chunk) {
      const activeSession = getActiveSession();
      if (
        !activeSession ||
        !state.transportReady ||
        !state.snapshot.isVoiceMode ||
        chunk.byteLength === 0
      ) {
        return;
      }

      const base64 = Buffer.from(chunk).toString("base64");

      const outputRoute = deps.engine.outputRoute?.();
      void activeSession.adapter
        .sendVoiceAudioChunk(base64, PCM_MIME_TYPE, outputRoute)
        .catch((error) => {
          console.error(`[VoiceRuntime#${instanceId}] Failed to send audio chunk:`, error);
        });
    },
  };

  function resetToDisabledState(): void {
    state.transportReady = false;
    state.turnInProgress = false;
    state.serverSpeechDetected = false;
    state.lastDisplayVolumePublishMs = 0;
    cancelResync();
    cancelCaptureRestart();
    uploader.reset();
    resetCaptureTelemetry();
    // The session outlives voice mode: only “End session” clears it.
    patchSnapshot({ ...INITIAL_SNAPSHOT, session: state.snapshot.session });
    reconcileMicHealth();
  }

  /**
   * Hizuri: the voice/text toggle in flight. A repeat press meanwhile gets the same promise and
   * sends nothing: a second request used to queue on the host behind the first (~20 s) and turn
   * voice off right after it came on.
   */
  let modeChange: Promise<void> | null = null;

  function runModeChange(run: () => Promise<void>): Promise<void> {
    if (modeChange) {
      return modeChange;
    }
    const change = run().finally(() => {
      if (modeChange === change) {
        modeChange = null;
      }
    });
    modeChange = change;
    return change;
  }

  /** “End session” is never ignored: it waits for the toggle in flight, then ends. */
  async function settleModeChange(): Promise<void> {
    await modeChange?.catch(() => undefined);
  }

  function setSession(next: PersistedVoiceSession | null): void {
    patchSnapshot({ session: next });
    // Written even when unchanged here: another tab of the same browser shares the storage.
    void deps.sessionStore?.save(next).catch((error) => {
      console.warn(`[VoiceRuntime#${instanceId}] Failed to save the voice session:`, error);
    });
  }

  function canKeepSession(serverId: string): boolean {
    return deps.getServerInfo(serverId)?.features?.voiceSessionPersist === true;
  }

  /**
   * Hizuri (session persist): a session left in voice mode comes back by itself once its host
   * is connected: after a reload, an app restart, a new connection. A failure waits for the
   * next connection or the user's own tap.
   */
  function maybeResumeSession(serverId: string): void {
    const session = state.snapshot.session;
    if (
      !session ||
      session.mode !== "voice" ||
      session.serverId !== serverId ||
      state.autoResumeBlocked ||
      state.autoResuming ||
      modeChange !== null ||
      state.snapshot.isVoiceMode ||
      state.snapshot.isVoiceSwitching ||
      !sessions.get(serverId)?.connected
    ) {
      return;
    }
    state.autoResuming = true;
    console.info(`[VoiceRuntime#${instanceId}] Resuming the voice session with ${session.agentId}`);
    void runModeChange(() => startVoiceSession(serverId, session.agentId, { automatic: true }))
      .catch((error) => {
        state.autoResumeBlocked = true;
        console.warn(`[VoiceRuntime#${instanceId}] The voice session did not resume:`, error);
      })
      .finally(() => {
        state.autoResuming = false;
      });
  }

  /** “End session” for a session not live here (text mode). */
  async function endHostSession(session: PersistedVoiceSession): Promise<void> {
    const host = sessions.get(session.serverId);
    if (!host) {
      // A host this app no longer knows: nothing left to tell, the session ends here.
      console.warn(`[VoiceRuntime#${instanceId}] Ending a session on an unknown host locally`);
      return;
    }
    if (!host.connected) {
      throw new Error(`Host ${session.serverId} is not connected`);
    }
    await host.adapter.setVoiceMode(false, session.agentId);
  }

  async function startVoiceSession(
    serverId: string,
    agentId: string,
    options: { automatic: boolean },
  ): Promise<void> {
    const session = sessions.get(serverId);
    if (!session) {
      throw new Error(`Voice runtime is not ready for host ${serverId}`);
    }
    if (!session.connected) {
      throw new Error(`Host ${serverId} is not connected`);
    }

    const serverInfo = deps.getServerInfo(serverId);
    const unavailableMessage = resolveVoiceUnavailableMessage({
      serverInfo,
      mode: "voice",
    });
    if (unavailableMessage) {
      throw new Error(unavailableMessage);
    }

    // One session at a time, and only “End session” ends one.
    const current = state.snapshot.session;
    if (current && (current.serverId !== serverId || current.agentId !== agentId)) {
      throw new Error(`A session with agent ${current.agentId} is running; end it first`);
    }
    const keepSession = canKeepSession(serverId);
    const generation = state.generation + 1;
    let enabledCurrentVoiceMode = false;
    state.generation = generation;
    state.transportReady = false;
    cancelResync();
    cancelCaptureRestart();
    patchSnapshot((prev) => ({
      ...prev,
      isVoiceSwitching: true,
      phase: "starting",
      activeServerId: serverId,
      activeAgentId: agentId,
    }));

    try {
      await deps.activateKeepAwake(KEEP_AWAKE_TAG).catch((error) => {
        console.warn("[VoiceRuntime] Failed to activate keep-awake:", error);
      });

      await deps.background?.prepare().catch((error) => {
        console.warn("[VoiceRuntime] Background voice setup failed:", error);
      });
      await initializePlayback(options.automatic);
      await session.adapter.setVoiceMode(true, agentId);
      enabledCurrentVoiceMode = true;
      await deps.engine.startCapture();
      if (state.generation !== generation) {
        // Stopped while the microphone was opening (moved elsewhere, or the app closing); no
        // other start can run meanwhile (runModeChange), so this microphone is ours to close.
        await deps.engine.stopCapture().catch(() => undefined);
        return;
      }
      // Android refuses a microphone foreground service before RECORD_AUDIO is granted, and
      // startCapture() is where that permission is asked.
      await deps.background?.start().catch((error) => {
        console.warn("[VoiceRuntime] Background voice failed to start:", error);
      });

      state.transportReady = true;
      state.turnInProgress = false;
      state.autoResumeBlocked = false;
      uploader.reset();
      resetCaptureTelemetry();
      patchSnapshot((prev) => ({
        ...prev,
        isVoiceMode: true,
        isVoiceSwitching: false,
        phase: "listening",
        isMuted: deps.engine.isMuted(),
      }));
      setSession({ serverId, agentId, mode: "voice" });
      reconcileMicHealth();
    } catch (error) {
      if (enabledCurrentVoiceMode) {
        await rollBackHostVoice({ adapter: session.adapter, serverId, agentId, keepSession });
      }
      await performLocalStop();
      throw error;
    }
  }

  /**
   * Hizuri (voice move): voice in another agent's chat moves there in one tap,
   * no “End session” first. The other agent's session ends on its host the way “End session”
   * ends it: its agent keeps running and its chat stays; voice in its chat moves back the same
   * way. A reply it was speaking stops at once. Still one session at a time.
   */
  async function moveVoiceSession(
    serverId: string,
    agentId: string,
  ): Promise<PersistedVoiceSession | null> {
    const from = state.snapshot.session;
    if (!from || (from.serverId === serverId && from.agentId === agentId)) {
      await startVoiceSession(serverId, agentId, { automatic: false });
      return null;
    }
    deps.log?.("info", `voice move ${from.agentId} (${from.mode}) -> ${agentId}: start`);
    const failure = state.snapshot.isVoiceMode
      ? await leaveVoiceMode({ keepSession: false })
      : await endHostSession(from).then(
          () => null,
          (error: unknown) => error,
        );
    if (failure) {
      // Its host may still hold it (offline, say); voice here goes on with the new agent.
      deps.log?.("warn", `voice move: ${from.agentId} did not end on its host: ${String(failure)}`);
    }
    setSession(null);
    try {
      await startVoiceSession(serverId, agentId, { automatic: false });
    } catch (error) {
      deps.log?.("warn", `voice move ${from.agentId} -> ${agentId}: failed: ${String(error)}`);
      throw error;
    }
    deps.log?.("info", `voice move ${from.agentId} -> ${agentId}: done`);
    return from;
  }

  async function initializePlayback(automatic: boolean): Promise<void> {
    if (!automatic) {
      await deps.engine.initialize();
      return;
    }
    // A page that just reloaded may not play audio before the user's first tap (browser autoplay
    // rules); the microphone and the host session still come back, and playback retries.
    await deps.engine.initialize().catch((error) => {
      console.warn("[VoiceRuntime] Audio playback is not ready yet:", error);
    });
  }

  /** The start failed after the host enabled voice: keep it as a text session if it can. */
  async function rollBackHostVoice(args: {
    adapter: VoiceSessionAdapter;
    serverId: string;
    agentId: string;
    keepSession: boolean;
  }): Promise<void> {
    const { adapter, serverId, agentId, keepSession } = args;
    if (!keepSession) {
      await adapter.setVoiceMode(false, agentId).catch(() => undefined);
      return;
    }
    await adapter.setVoiceMode(false, agentId, { keepSession: true }).catch(() => undefined);
    if (state.snapshot.session?.agentId !== agentId) {
      setSession({ serverId, agentId, mode: "text" });
    }
  }

  function retryDelay(schedule: readonly number[], attempt: number): number {
    return schedule[Math.min(attempt, schedule.length - 1)];
  }

  function isRecoverablePhase(): boolean {
    const { phase } = state.snapshot;
    return phase !== "disabled" && phase !== "starting" && phase !== "stopping";
  }

  /** Words spoken now reach the host: connected, voice mode confirmed, microphone open. */
  function isMicDelivering(): boolean {
    const session = getActiveSession();
    return Boolean(session?.connected) && state.transportReady && !state.captureInterrupted;
  }

  function resolveMicOffReason(): VoiceMicOffReason {
    if (!getActiveSession()?.connected) {
      return "connection";
    }
    if (state.captureInterrupted) {
      return "capture";
    }
    return "voice-mode";
  }

  function shouldWatchMic(): boolean {
    return state.snapshot.isVoiceMode && !state.snapshot.isMuted && isRecoverablePhase();
  }

  /**
   * The user only learns that voice broke when an answer never comes. Once the microphone has
   * been cut off from the host for MIC_OFF_NOTICE_DELAY_MS, say so; take it back once audio flows.
   */
  function reconcileMicHealth(): void {
    if (!shouldWatchMic() || isMicDelivering()) {
      if (state.micOffTimer) {
        clearTimeout(state.micOffTimer);
        state.micOffTimer = null;
      }
      if (state.micOffNotified) {
        state.micOffNotified = false;
        console.info(`[VoiceRuntime#${instanceId}] Microphone reaches the host again`);
        void deps.background?.clearMicOff?.().catch(() => undefined);
      }
      return;
    }
    if (state.micOffTimer || state.micOffNotified) {
      return;
    }
    state.micOffTimer = setTimeout(() => {
      state.micOffTimer = null;
      if (!shouldWatchMic() || isMicDelivering()) {
        return;
      }
      const reason = resolveMicOffReason();
      state.micOffNotified = true;
      console.warn(
        `[VoiceRuntime#${instanceId}] Microphone has not reached the host for ${MIC_OFF_NOTICE_DELAY_MS} ms (${reason})`,
      );
      void deps.background?.showMicOff?.(reason).catch((error) => {
        console.warn("[VoiceRuntime] Failed to show the microphone alert:", error);
      });
    }, MIC_OFF_NOTICE_DELAY_MS);
  }

  function cancelResync(): void {
    state.resyncEpoch += 1;
    state.resyncAttempt = 0;
    if (state.resyncTimer) {
      clearTimeout(state.resyncTimer);
      state.resyncTimer = null;
    }
  }

  function canResync(serverId: string, epoch: number): boolean {
    return (
      epoch === state.resyncEpoch &&
      state.snapshot.isVoiceMode &&
      isRecoverablePhase() &&
      state.snapshot.activeServerId === serverId &&
      Boolean(state.snapshot.activeAgentId) &&
      Boolean(getActiveSession()?.connected)
    );
  }

  function markTransportReady(): void {
    state.transportReady = true;
    state.resyncAttempt = 0;
    reconcileMicHealth();
  }

  /**
   * After a reconnect the host has a fresh session with voice mode off. Microphone audio is
   * held back until the host confirms voice mode (it would otherwise go to plain dictation), so
   * this must not give up: a timeout or a dropped socket only means "ask again".
   */
  async function resyncVoiceMode(serverId: string, epoch: number): Promise<void> {
    if (!canResync(serverId, epoch)) {
      return;
    }
    const session = getActiveSession();
    const agentId = state.snapshot.activeAgentId;
    if (!session || !agentId) {
      return;
    }
    try {
      await session.adapter.setVoiceMode(true, agentId);
    } catch (error) {
      if (!canResync(serverId, epoch) || state.transportReady) {
        return;
      }
      const delayMs = retryDelay(RESYNC_RETRY_DELAYS_MS, state.resyncAttempt);
      state.resyncAttempt += 1;
      console.warn(
        `[VoiceRuntime#${instanceId}] Voice mode resync failed (attempt ${state.resyncAttempt}); retrying in ${delayMs} ms:`,
        error,
      );
      state.resyncTimer = setTimeout(() => {
        state.resyncTimer = null;
        void resyncVoiceMode(serverId, epoch);
      }, delayMs);
      return;
    }
    if (epoch !== state.resyncEpoch || state.snapshot.activeServerId !== serverId) {
      return;
    }
    if (!state.snapshot.isVoiceMode) {
      return;
    }
    markTransportReady();
  }

  function cancelCaptureRestart(): void {
    state.captureInterrupted = false;
    state.captureRestartAttempt = 0;
    if (state.captureRestartTimer) {
      clearTimeout(state.captureRestartTimer);
      state.captureRestartTimer = null;
    }
  }

  function scheduleCaptureRestart(): void {
    if (state.captureRestartTimer) {
      clearTimeout(state.captureRestartTimer);
    }
    const generation = state.generation;
    const delayMs = retryDelay(CAPTURE_RESTART_DELAYS_MS, state.captureRestartAttempt);
    state.captureRestartTimer = setTimeout(() => {
      state.captureRestartTimer = null;
      void restartCapture(generation);
    }, delayMs);
  }

  /**
   * Reopen the microphone in place. The Android foreground service (type microphone) stays up
   * for the whole voice session, which is what lets a hidden app open the microphone again;
   * stopping it here would make the restart impossible until the user opens the app.
   */
  async function restartCapture(generation: number): Promise<void> {
    if (generation !== state.generation || !state.captureInterrupted || !shouldRecover()) {
      return;
    }
    try {
      await deps.engine.startCapture();
    } catch (error) {
      if (generation !== state.generation || !state.captureInterrupted) {
        return;
      }
      state.captureRestartAttempt += 1;
      console.warn(
        `[VoiceRuntime#${instanceId}] Microphone restart failed (attempt ${state.captureRestartAttempt}):`,
        error,
      );
      scheduleCaptureRestart();
      return;
    }
    if (generation !== state.generation || !state.snapshot.isVoiceMode) {
      // Voice mode ended while the microphone was reopening.
      await deps.engine.stopCapture().catch(() => undefined);
      return;
    }
    state.captureInterrupted = false;
    state.captureRestartAttempt = 0;
    if (state.snapshot.isMuted && !deps.engine.isMuted()) {
      // The engine forgets mute on an interruption.
      deps.engine.toggleMute();
    }
    console.info(`[VoiceRuntime#${instanceId}] Microphone reopened after an interruption`);
    reconcileMicHealth();
  }

  function shouldRecover(): boolean {
    return state.snapshot.isVoiceMode && isRecoverablePhase();
  }

  function publishDisplayVolume(level: number, nowMs: number): void {
    const previousVolume = state.telemetry.volume;
    const smoothing = level >= previousVolume ? DISPLAY_VOLUME_ATTACK : DISPLAY_VOLUME_RELEASE;
    const nextVolume = Math.max(
      0,
      Math.min(1, previousVolume + (level - previousVolume) * smoothing),
    );
    const enoughTimeElapsed =
      nowMs - state.lastDisplayVolumePublishMs >= DISPLAY_VOLUME_PUBLISH_INTERVAL_MS;
    const enoughChange = Math.abs(nextVolume - previousVolume) >= DISPLAY_VOLUME_CHANGE_EPSILON;

    if (!enoughTimeElapsed && !enoughChange) {
      return;
    }

    state.lastDisplayVolumePublishMs = nowMs;
    patchTelemetry((prev) => ({
      ...prev,
      volume: Number(nextVolume.toFixed(3)),
    }));
  }

  /**
   * Voice mode off here: playback and the microphone stop whatever the host answers. With
   * keepSession the host keeps the agent in voice mode (text mode); without it the session ends.
   * Returns the host's failure, if any.
   */
  async function leaveVoiceMode(options: { keepSession: boolean }): Promise<unknown> {
    const activeSession = getActiveSession();
    const agentId = state.snapshot.activeAgentId;
    const generation = state.generation + 1;
    state.generation = generation;
    cancelResync();
    cancelCaptureRestart();
    patchSnapshot((prev) => ({
      ...prev,
      isVoiceSwitching: true,
      phase: "stopping",
    }));
    reconcileMicHealth();

    let failure: unknown = null;
    try {
      uploader.reset();
      state.transportReady = false;
      resetPlaybackState();
      deps.engine.stop();
      deps.engine.clearQueue();
      activeSession?.adapter.setAssistantAudioPlaying(false);
      if (activeSession) {
        const target = agentId ?? undefined;
        await (
          options.keepSession
            ? activeSession.adapter.setVoiceMode(false, target, { keepSession: true })
            : activeSession.adapter.setVoiceMode(false, target)
        ).catch((error: unknown) => {
          failure = error;
        });
      }
      await deps.engine.stopCapture();
      await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    } finally {
      if (state.generation === generation) {
        await deps.background?.stop().catch(() => undefined);
        // startVoice() may have begun during the await.
        if (state.generation === generation) {
          resetToDisabledState();
        }
      }
    }
    return failure;
  }

  async function performLocalStop(): Promise<void> {
    uploader.reset();
    resetPlaybackState();
    deps.engine.stop();
    deps.engine.clearQueue();
    await deps.engine.stopCapture().catch(() => undefined);
    await deps.background?.stop().catch(() => undefined);
    await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    getActiveSession()?.adapter.setAssistantAudioPlaying(false);
    resetToDisabledState();
  }

  const api: VoiceRuntime = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state.snapshot;
    },

    subscribeTelemetry(listener) {
      telemetryListeners.add(listener);
      return () => {
        telemetryListeners.delete(listener);
      };
    },

    getTelemetrySnapshot() {
      return state.telemetry;
    },

    registerSession(adapter) {
      sessions.set(adapter.serverId, {
        adapter,
        connected: true,
      });
      // Its connection state lands right after registration (the same render commit).
      const resumeTimer = setTimeout(() => maybeResumeSession(adapter.serverId), 0);

      return () => {
        clearTimeout(resumeTimer);
        const activeServerId = state.snapshot.activeServerId;
        sessions.delete(adapter.serverId);
        if (activeServerId === adapter.serverId) {
          void performLocalStop();
        }
      };
    },

    updateSessionConnection(serverId, connected) {
      const session = sessions.get(serverId);
      if (!session) {
        return;
      }
      session.connected = connected;
      if (connected) {
        // A new connection: a resume that failed before may work now.
        state.autoResumeBlocked = false;
      }
      if (state.snapshot.activeServerId !== serverId) {
        if (connected) {
          maybeResumeSession(serverId);
        }
        return;
      }
      state.transportReady = false;
      cancelResync();
      if (connected) {
        void resyncVoiceMode(serverId, state.resyncEpoch);
      }
      reconcileMicHealth();
    },

    handleCapturePcm(chunk) {
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        return;
      }
      uploader.pushPcmChunk(chunk);
    },

    handleCaptureInterrupted() {
      if (!shouldRecover()) {
        return;
      }
      console.warn(`[VoiceRuntime#${instanceId}] Microphone interrupted by the OS; reopening it`);
      state.captureInterrupted = true;
      state.captureRestartAttempt = 0;
      scheduleCaptureRestart();
      reconcileMicHealth();
    },

    onVoiceModeConfirmed(serverId, agentId) {
      if (
        serverId !== state.snapshot.activeServerId ||
        state.transportReady ||
        !shouldRecover() ||
        (agentId !== null && agentId !== state.snapshot.activeAgentId) ||
        !getActiveSession()?.connected
      ) {
        return;
      }
      cancelResync();
      markTransportReady();
    },

    handleCaptureVolume(level) {
      const nowMs = Date.now();
      const displayLevel = state.snapshot.isMuted ? 0 : level;
      publishDisplayVolume(displayLevel, nowMs);
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        patchTelemetry((prev) => ({
          ...prev,
          isSpeaking: false,
          segmentDuration: 0,
        }));
        return;
      }

      patchTelemetry((prev) => ({
        ...prev,
        isSpeaking: state.serverSpeechDetected,
      }));
      reconcileSegmentDurationTimer();
    },

    handleAudioOutput(serverId, payload) {
      if (
        serverId !== state.snapshot.activeServerId ||
        !state.snapshot.isVoiceMode ||
        !payload.isVoiceMode
      ) {
        return;
      }

      const groupId = payload.groupId ?? payload.id;
      const chunkIndex = payload.chunkIndex ?? 0;
      const decoded = decodeAudioChunk(payload.audio);

      let group = playback.groups.get(groupId);
      if (!group) {
        group = {
          groupId,
          isVoiceMode: payload.isVoiceMode,
          shouldPlay: api.shouldPlayVoiceAudio(serverId),
          chunks: new Map(),
          nextChunkToPlay: 0,
          finalChunkIndex: null,
          started: false,
          ackedChunkIds: new Set(),
        };
        playback.groups.set(groupId, group);
        playback.orderedGroupIds.push(groupId);
        if (!playback.activeGroupId) {
          playback.activeGroupId = groupId;
        }
      }

      group.chunks.set(chunkIndex, {
        id: payload.id,
        chunkIndex,
        source: toPlaybackSource(decoded, payload.format),
      });
      if (payload.isLastChunk) {
        group.finalChunkIndex = chunkIndex;
      }

      void processPlaybackQueue(serverId);
    },

    startVoice(serverId, agentId) {
      return runModeChange(() => startVoiceSession(serverId, agentId, { automatic: false }));
    },

    async moveVoice(serverId, agentId) {
      await settleModeChange();
      let from: PersistedVoiceSession | null = null;
      await runModeChange(async () => {
        from = await moveVoiceSession(serverId, agentId);
      });
      return from;
    },

    loadedSession() {
      return sessionLoaded;
    },

    async adoptHostSession(session) {
      await sessionLoaded;
      if (state.snapshot.session || state.snapshot.isVoiceMode || state.snapshot.isVoiceSwitching) {
        return;
      }
      console.info(
        `[VoiceRuntime#${instanceId}] Taking the host's ${session.mode} session with ${session.agentId}`,
      );
      setSession(session);
      maybeResumeSession(session.serverId);
    },

    async stopVoice() {
      await settleModeChange();
      const ending = state.snapshot.session;
      const failure = await leaveVoiceMode({ keepSession: false });
      if (failure) {
        // The host may still hold the session: keep it so “End session” can be tried again.
        if (ending) {
          setSession({ ...ending, mode: "text" });
        }
        throw failure;
      }
      if (sessionsEqual(state.snapshot.session, ending)) {
        setSession(null);
      }
    },

    switchToText() {
      return runModeChange(async () => {
        const serverId = state.snapshot.activeServerId;
        const agentId = state.snapshot.activeAgentId;
        if (!state.snapshot.isVoiceMode || !serverId || !agentId) {
          return;
        }
        if (!canKeepSession(serverId)) {
          throw new Error("This host cannot keep the session in text mode; update the host");
        }
        setSession({ serverId, agentId, mode: "text" });
        const failure = await leaveVoiceMode({ keepSession: true });
        if (failure) {
          throw failure;
        }
      });
    },

    async endSession() {
      await settleModeChange();
      if (state.snapshot.isVoiceMode || state.snapshot.isVoiceSwitching) {
        await api.stopVoice();
        return;
      }
      const session = state.snapshot.session;
      if (!session) {
        return;
      }
      await endHostSession(session);
      if (sessionsEqual(state.snapshot.session, session)) {
        setSession(null);
      }
    },

    canKeepSession,

    isVoiceStartingForAgent(serverId, agentId) {
      return (
        state.snapshot.phase === "starting" &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.activeAgentId === agentId
      );
    },

    isSessionForAgent(serverId, agentId) {
      const session = state.snapshot.session;
      return session !== null && session.serverId === serverId && session.agentId === agentId;
    },

    onVoiceModeMoved(serverId, agentId) {
      const session = state.snapshot.session;
      if (!session || session.serverId !== serverId || session.agentId !== agentId) {
        return;
      }
      console.info(
        `[VoiceRuntime#${instanceId}] The voice session moved to another connection; text here`,
      );
      setSession({ ...session, mode: "text" });
      if (state.snapshot.activeServerId === serverId && state.snapshot.activeAgentId === agentId) {
        state.generation += 1;
        void performLocalStop();
      }
    },

    async destroy() {
      // The host keeps the session; the next start of the app resumes it.
      state.generation += 1;
      await performLocalStop().catch(() => undefined);
      await deps.engine.destroy();
      listeners.clear();
      telemetryListeners.clear();
      sessions.clear();
    },

    toggleMute() {
      const nextMuted = deps.engine.toggleMute();
      if (nextMuted) {
        uploader.reset();
        resetCaptureTelemetry();
        patchSnapshot((prev) => ({
          ...prev,
          isMuted: true,
        }));
        reconcileMicHealth();
        return;
      }

      patchSnapshot((prev) => ({ ...prev, isMuted: false }));
      reconcileMicHealth();
    },

    isVoiceModeForAgent(serverId, agentId) {
      return (
        state.snapshot.isVoiceMode &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.activeAgentId === agentId
      );
    },

    shouldPlayVoiceAudio(serverId) {
      return (
        state.snapshot.isVoiceMode &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.phase !== "stopping" &&
        state.snapshot.phase !== "disabled"
      );
    },

    onAssistantAudioStarted(serverId) {
      if (!state.snapshot.isVoiceMode || state.snapshot.activeServerId !== serverId) {
        return;
      }
      getActiveSession()?.adapter.setAssistantAudioPlaying(true);
      patchSnapshot((prev) => ({ ...prev, phase: "playing" }));
    },

    onAssistantAudioFinished(serverId) {
      if (state.snapshot.activeServerId !== serverId) {
        return;
      }

      getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      if (!state.snapshot.isVoiceMode) {
        return;
      }

      if (state.turnInProgress) {
        patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
        return;
      }

      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
    },

    onTranscriptionResult(serverId, text) {
      if (serverId !== state.snapshot.activeServerId || !state.snapshot.isVoiceMode) {
        return;
      }

      if (text.trim()) {
        state.turnInProgress = true;
        patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
        return;
      }

      state.turnInProgress = false;
      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
    },

    onServerSpeechStateChanged(serverId, isSpeaking) {
      if (serverId !== state.snapshot.activeServerId || !state.snapshot.isVoiceMode) {
        return;
      }

      state.serverSpeechDetected = isSpeaking;
      state.serverSpeechStartedAt = isSpeaking ? (state.serverSpeechStartedAt ?? Date.now()) : null;
      if (isSpeaking) {
        const shouldInterruptPlayback =
          state.snapshot.phase === "playing" || playback.groups.size > 0;
        resetPlaybackState();
        if (shouldInterruptPlayback) {
          deps.engine.stop();
          deps.engine.clearQueue();
        }
        getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      }
      patchTelemetry((prev) => ({
        ...prev,
        isSpeaking,
      }));
      reconcileSegmentDurationTimer();
    },

    onTurnEvent(serverId, agentId, eventType) {
      if (
        !state.snapshot.isVoiceMode ||
        state.snapshot.activeServerId !== serverId ||
        state.snapshot.activeAgentId !== agentId
      ) {
        return;
      }

      if (eventType === "turn_started") {
        state.turnInProgress = true;
        if (state.snapshot.phase !== "playing") {
          patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
        }
        return;
      }

      state.turnInProgress = false;
      if (state.snapshot.phase !== "playing") {
        patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      }
    },
  };

  const sessionLoaded: Promise<PersistedVoiceSession | null> = (
    deps.sessionStore?.load() ?? Promise.resolve(null)
  )
    .then((loaded) => {
      if (loaded && !state.snapshot.session) {
        patchSnapshot({ session: loaded });
        maybeResumeSession(loaded.serverId);
      }
      return state.snapshot.session;
    })
    .catch((error) => {
      console.warn(`[VoiceRuntime#${instanceId}] Failed to load the voice session:`, error);
      return state.snapshot.session;
    });

  return api;
}
