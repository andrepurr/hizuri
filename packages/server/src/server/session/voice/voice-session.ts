import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import type pino from "pino";
import { getErrorMessage } from "@getpaseo/protocol/error-utils";
import {
  VOICE_MOVED_REQUEST_ID,
  type SessionInboundMessage,
  type SessionOutboundMessage,
} from "../../messages.js";
import { TTSManager } from "../../agent/tts-manager.js";
import { STTManager } from "../../agent/stt-manager.js";
import type { SpeechToTextProvider, TextToSpeechProvider } from "../../speech/speech-provider.js";
import type { TurnDetectionProvider } from "../../speech/turn-detection-provider.js";
import { maybePersistTtsDebugAudio } from "../../agent/tts-debug.js";
import { isPaseoDictationDebugEnabled } from "../../agent/recordings-debug.js";
import {
  DictationStreamManager,
  type DictationStreamOutboundMessage,
} from "../../dictation/dictation-stream-manager.js";
import { getSpeechDenoiser } from "../../speech/speech-denoiser.js";
import {
  createVoiceTurnController,
  type VoiceTurnController,
  type VoiceTurnControllerCallbacks,
} from "./voice-turn-controller.js";
import {
  buildVoiceModeSystemPrompt,
  type SpokenInputMeta,
  stripVoiceModeSystemPrompt,
} from "../../voice-config.js";
import type { VoiceCallerContext, VoiceSpeakHandler, VoiceSpeakResult } from "../../voice-types.js";
import type { ManagedAgent } from "../../agent/agent-manager.js";
import type { AgentSessionConfig, AgentTimelineItem } from "../../agent/agent-sdk-types.js";
import type { LocalSpeechModelId } from "../../speech/providers/local/models.js";
import { toResolver, type Resolvable } from "../../speech/provider-resolver.js";
import type { SpeechReadinessSnapshot, SpeechReadinessState } from "../../speech/speech-runtime.js";
import { envFlag, envNonNegative, envNumber, envPositive, envString } from "../../voice-env.js";
import { defaultBargeStopPattern } from "../../voice-language/languages.js";
import { SessionLanguage } from "../../voice-language/detect.js";
import type { VoiceLanguage } from "../../voice-language/types.js";
import { type SpeechJobEnd, type SpeechResult, spokenBody } from "../../agent/speech-queue.js";
import {
  type BargeHold,
  type BargeVerdict,
  bargeStopMode,
  CONTINUE_WORDS,
  createBargeHold,
  createCheckLane,
  DROP_WORDS,
  userStopWord,
  isForOthers,
  isPausePhrase,
  nameWords,
  pauseWords,
  STOP_ANYWHERE,
} from "./barge-hold.js";
import { EchoFilter, stems as speechStems } from "./echo-filter.js";
import { isAssistantEcho, type OutputRoute, outputRouteOf, stopWordsOnlyOn } from "./echo-route.js";
import type { StopSpotter } from "./stop-spotter.js";
import { fastReply, fastReplyConfigFromEnv } from "./fast-reply.js";
import {
  type FastFrontInput,
  fastFrontFacts,
  fastFrontMode,
  fastFrontStream,
  sharedFastFront,
} from "./fast-front.js";
import { buildFrontFacts } from "./front-facts.js";
import type { LiveSceneDraw } from "../../stage/live-tab.js";
import { sharedVisualFrontModel, VisualFront, visualFrontMode } from "./visual-front.js";
import { ForeignQueue, foreignMessage, foreignNote, waitsAsForeign } from "./foreign-queue.js";
import {
  FloorManager,
  holdSignal,
  isBackchannel,
  type HoldSignal,
  type ZuriVerdict,
  type ZuriWaitReason,
} from "./floor-manager.js";
import {
  endsOpen,
  type FrontAnswer,
  type FrontAskKind,
  FrontStream,
  type FrontStreamResult,
} from "./front-stream.js";
import {
  type PhraseSituation,
  SituationTracker,
  situationLine,
  situationNote,
} from "./situation.js";
import { buildStatusLine } from "./status-line.js";
import { createSecretaryFromEnv, type Secretary } from "./secretary.js";
import { pcmSampleRate, RawAudioRecorder } from "./raw-recorder.js";
import { EchoLag, ReplyReference } from "./reply-reference.js";
import { EchoCanceller, echoCancelEngine } from "./echo-canceller.js";
import { type VoiceMode, voiceMode } from "./voice-mode.js";
import { type ShortPhraseInfo, shortPhraseNote } from "./short-phrase.js";
import { ThinkHint } from "./think-hint.js";
import { isJunkTranscript, type VoiceComparison } from "./speaker-gate.js";
import type { PhraseDelivery, PhraseEventInput, ReplyOutcome, VoiceGraph } from "./voice-graph.js";
import { readWakePattern, type VoiceOwnerOptions } from "./voice-owner.js";
import { type CompactHoldState, compactHoldLine } from "./compact-hold.js";
import { moduleKernel } from "../../modules/kernel.js";

const PCM_SAMPLE_RATE = 16000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;
const PCM_BYTES_PER_MS = (PCM_SAMPLE_RATE * PCM_CHANNELS * (PCM_BITS_PER_SAMPLE / 8)) / 1000;
const MIN_STREAMING_SEGMENT_DURATION_MS = 1000;
const MIN_STREAMING_SEGMENT_BYTES = Math.round(
  PCM_BYTES_PER_MS * MIN_STREAMING_SEGMENT_DURATION_MS,
);
const AgentIdSchema = z.guid();

type ProcessingPhase = "idle" | "transcribing";

interface VoiceModeBaseConfig {
  systemPrompt?: string;
}

interface AudioBufferState {
  chunks: Buffer[];
  format: string;
  isPCM: boolean;
  totalPCMBytes: number;
}

interface VoiceTranscriptionResultPayload {
  text: string;
  requestId: string;
  language?: string;
  duration?: number;
  avgLogprob?: number;
  isLowConfidence?: boolean;
  byteLength?: number;
  format?: string;
  debugRecordingPath?: string;
  /**
   * Hizuri (phrase graph): the phrase id, when the user started and stopped, and why it was
   * dropped.
   */
  phraseId?: string;
  spokenAt?: number;
  endedAt?: number;
  dropReason?: string;
  droppedText?: string;
  /** Hizuri: a quick draft of the phrase; its final may follow as a correction. */
  draft?: boolean;
  /** Hizuri: a short phrase Zuri judges by context (short-phrase.ts). */
  shortPhrase?: ShortPhraseInfo;
  /** Hizuri: the room and the voice print around the phrase (situation.ts). */
  situation?: PhraseSituation;
}

/** Hizuri (phrase graph): one of the user's phrases on its way to the agent. */
interface PhraseMeta {
  id: string;
  spokenAt: number;
  endedAt?: number;
  text: string;
  /** The text is the recogniser's quick draft. */
  draft?: boolean;
  short?: ShortPhraseInfo;
}

/**
 * Hizuri (phrase graph): one reply of the assistant's, from the speak call to its graph record.
 * `userSpeechAt` = the user started speaking during it; `cutByUser` = the user's words stopped it
 * (barge-in or the user's phrase) or it was held behind the user's phrase.
 */
interface ReplyRecord {
  id: string;
  text: string;
  replyTo: string[];
  /** Earlier replies whose unheard part this one says again (speak's carries). */
  carries: string[];
  source: "speak" | "fast-reply";
  queuedAt: number;
  jobId: string | null;
  playStartedAt: number | null;
  state: "live" | "ended";
  userSpeechAt: number | null;
  cutByUser: boolean;
  byDrop: boolean;
  noticed: boolean;
  endedAt: number | null;
  delivered: boolean;
  /** Hizuri (floor gate): a newer reply replaced it while it waited for the user's pause. */
  superseded: boolean;
  /** Hizuri (floor gate): the reply this one goes on from (“— and then…”), still unplayed. */
  continues: ReplyRecord | null;
}

const REPLY_LEDGER_SIZE = 40;
/** How long after the assistant's line ends its words may still come back through the speaker. */
const ASSISTANT_ECHO_TAIL_MS = 10_000;
// Hizuri (stop-spotter.ts): a spotted stop word counts only right after the user's own loud voice
// (the spotter lags the word by ~0.7 s), and the voice check looks at this much of the mic.
const SPOTTED_LOUD_WITHIN_MS = 2000;
const SPOTTED_CLIP_MS = 2000;
const SPOTTED_PRE_ROLL_MS = 600;
/**
 * The user's phrase holds the floor after it stopped the assistant at most this long without the
 * user's voice.
 */
const FLOOR_MAX_MS = 60_000;
/**
 * A reply that goes on from the assistant's previous one: a dash, an ellipsis or a small letter
 * first.
 */
const CONTINUATION = /^(?:[—–\-…]|\p{Ll})/u;
/** How often a reply waiting for the user's pause looks again (floor gate). */
const FLOOR_POLL_MS = 100;
/** voice-floor.json is rewritten at least this often while a hold is on. */
const FLOOR_FILE_REFRESH_MS = 5000;

/** Resolves when the signal aborts; never when there is none. */
function aborted(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((done) => {
    if (signal?.aborted) {
      done();
    } else {
      signal?.addEventListener("abort", () => done(), { once: true });
    }
  });
}

interface VoiceFeatureUnavailableContext {
  reasonCode: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  message: string;
  retryable: boolean;
  missingModelIds: LocalSpeechModelId[];
}

interface VoiceFeatureUnavailableResponseMetadata {
  reasonCode?: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  retryable?: boolean;
  missingModelIds?: LocalSpeechModelId[];
}

class VoiceFeatureUnavailableError extends Error {
  readonly reasonCode: SpeechReadinessSnapshot["voiceFeature"]["reasonCode"];
  readonly retryable: boolean;
  readonly missingModelIds: LocalSpeechModelId[];

  constructor(context: VoiceFeatureUnavailableContext) {
    super(context.message);
    this.name = "VoiceFeatureUnavailableError";
    this.reasonCode = context.reasonCode;
    this.retryable = context.retryable;
    this.missingModelIds = [...context.missingModelIds];
  }
}

function convertPCMToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const headerSize = 44;
  const wavBuffer = Buffer.alloc(headerSize + pcmBuffer.length);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;

  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  wavBuffer.write("WAVE", 8);
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16);
  wavBuffer.writeUInt16LE(1, 20);
  wavBuffer.writeUInt16LE(channels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer;
}

/** Hizuri: the text with leading punctuation removed, and its word count. */
function plainWords(text: string): { plain: string; words: number } {
  const plain = text.replace(/^[^\p{L}]+/u, "");
  return { plain, words: (plain.match(/\p{L}+/gu) ?? []).length };
}

/** Hizuri: int16 rms of 16-bit PCM. */
// Noise comes back as syllables: only a phrase with a real word of 4+ letters interrupts the
// assistant (stop words and its name are handled apart). A short "yes" or "mm-hm" never cuts it
// off.
function hasTooFewWords(text: string, sttLanguage: string): boolean {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  return letters < 4 || !/\p{L}{4,}/u.test(text) || isJunkTranscript(text, sttLanguage);
}

/**
 * Step 1: echo is the assistant's own timbre in the mic — never decided by words (the user may
 * repeat the assistant's words back). And only the user's voice interrupts the assistant: anyone
 * else's words (other people in the room, the TV) do not cut its replies. The assistant's name
 * skips the user check — a second of its name is too short for the voice print.
 */
function bargeVoiceReject(voices: VoiceComparison, calledByName: boolean): string | null {
  if (voices.owner !== null && voices.assistant !== null && voices.assistant > voices.owner) {
    return "assistant-voice";
  }
  const ownerMin = envNumber("PASEO_BARGE_OWNER_MIN", 0.14);
  if (!calledByName && voices.owner !== null && voices.owner < ownerMin) {
    return "not-owner";
  }
  return null;
}

/**
 * Hizuri: while the assistant talks, only a stop word, the drop word or its name cuts it
 * off; anything else the user (or anyone in the room) says waits and reaches it after the reply.
 * Otherwise any voice cuts the assistant when people talk nearby.
 * PASEO_BARGE_STOP_WORDS_ONLY=0 restores barge-in on any real words.
 */
function stopWordsOnly(): boolean {
  return envFlag("PASEO_BARGE_STOP_WORDS_ONLY", true);
}

/**
 * Hizuri (room turns): the room decides what cuts the assistant and what holds its reply
 * (floor-manager.ts). Alone, quiet or noisy, the user's real words cut the assistant; with other
 * voices nearby only a stop word, the drop word or its name does. PASEO_VOICE_ROOM_TURNS=0 restores
 * PASEO_BARGE_STOP_WORDS_ONLY everywhere and the floor gate's fixed quiet time.
 */
function roomTurns(): boolean {
  return envFlag("PASEO_VOICE_ROOM_TURNS", true);
}

/**
 * Hizuri: in a noisy room only a stop word, the drop word or the assistant's name cuts it, like
 * other voices. The voice print cannot tell a noisy room from other people talking in it reliably,
 * so noise is used as the signal. PASEO_ROOM_NOISY_STOP_WORDS=0 turns
 * it off.
 */
function noisyStopWordsOnly(): boolean {
  return envFlag("PASEO_ROOM_NOISY_STOP_WORDS", true);
}

/**
 * Hizuri: with room turns on, one table picks what cuts the assistant and when it may start from
 * the route and the room (voice-mode.ts). PASEO_VOICE_MODES=0 keeps the route and room rules apart.
 */
function voiceModes(): boolean {
  return envFlag("PASEO_VOICE_MODES", false);
}

/**
 * Hizuri: the agent keeps its voice prompt when a session ends, so the next
 * “Start session” needs no 20-30 s reload. PASEO_VOICE_KEEP_PROMPT=0 restores the old behaviour.
 */
function keepVoicePrompt(): boolean {
  return envFlag("PASEO_VOICE_KEEP_PROMPT", true);
}

/** Hizuri (phrase graph): the phrase a transcript belongs to; null without an id (no graph). */
function phraseOf(result: VoiceTranscriptionResultPayload, text: string): PhraseMeta | null {
  if (!result.phraseId) {
    return null;
  }
  return {
    id: result.phraseId,
    spokenAt: result.spokenAt ?? Date.now(),
    ...(result.endedAt !== undefined ? { endedAt: result.endedAt } : {}),
    text,
    ...(result.draft ? { draft: true } : {}),
    ...(result.shortPhrase ? { short: result.shortPhrase } : {}),
  };
}

/**
 * Hizuri: a short phrase the voice print did not accept is not the user's until Zuri says so: it
 * reaches the assistant, but never cuts its reply or counts as the user talking over it.
 */
function isUnverifiedShort(short: ShortPhraseInfo | undefined): boolean {
  return short?.verified === false;
}

/** Hizuri: the text the agent reads for one part: a short phrase carries its note. */
function withShortNote(text: string, short: ShortPhraseInfo | null | undefined): string {
  return short ? `${text} ${shortPhraseNote(short)}` : text;
}

/**
 * Hizuri (fast front): a line the front said aloud; cutZuri = it cut the assistant's reply to say
 * it.
 */
interface FrontSaid {
  line: string;
  cutZuri: boolean;
}

/** Hizuri (fast front): Zuri hears every line the fast front said for it. */
function frontNote(said: FrontSaid | null): string {
  if (!said) {
    return "";
  }
  if (said.cutZuri) {
    return `\n\n[Your fast front (a quick model in your voice) cut your reply short to acknowledge the user's new words aloud: “${said.line}”. Drop the answer that no longer fits and re-plan: first say in a few words, in order, what you took from the user, then go through the items one by one, the first ones right away. Do not repeat its line.]`;
  }
  return `\n\n[Your fast front (a quick model in your voice) already said aloud: “${said.line}”. It only acknowledges; do not repeat it. If it promised or got anything wrong, correct it aloud.]`;
}

/**
 * Hizuri (front-stream.ts, PASEO_FAST_FRONT_STREAM): the user's live words go to the fast front as
 * the user speaks. With the front on, its answer decides when the thought goes to Zuri; with
 * shadow, it only logs. Read on every phrase.
 */
function streamDecides(): boolean {
  return fastFrontStream() && fastFrontMode() === "on";
}

/** Hizuri: the front's line may cut Zuri's reply. */
function frontMayCut(): boolean {
  return envFlag("PASEO_FAST_FRONT_CUT", false);
}

/**
 * Hizuri (situation.ts): the situation tag rides on every message to Zuri while
 * PASEO_VOICE_SITUATION is on, and always while the fast front's stream is on.
 */
function situationTags(): boolean {
  return envFlag("PASEO_VOICE_SITUATION", false) || fastFrontStream();
}

/**
 * Hizuri (front stream): the front held the user's thought as unfinished and the user said nothing
 * more.
 */
function unfinishedNote(quietMs: number): string {
  return `\n\n[The user went quiet for ${(quietMs / 1000).toFixed(1)} s in the middle of a thought (your quick check judged it unfinished); the user may go on. Answer only if it already makes sense, else wait for the user or ask one short question.]`;
}

/** Hizuri (phrase graph): why a final transcript reaches the session empty, and what it said. */
function whyDropped(input: {
  dropReason?: string;
  droppedText?: string;
  isLowConfidence?: boolean;
  transcript: string;
}): { dropReason?: string; droppedText?: string } {
  if (input.dropReason) {
    return { dropReason: input.dropReason, droppedText: input.droppedText ?? "" };
  }
  if (input.isLowConfidence && input.transcript.trim()) {
    return { dropReason: "low-confidence", droppedText: input.transcript };
  }
  return {};
}

function pcmRms(pcm: Buffer): number {
  let sumSquares = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const v = pcm.readInt16LE(i);
    sumSquares += v * v;
  }
  return Math.sqrt(sumSquares / Math.max(1, pcm.length / 2));
}

/**
 * The agent-facing operations VoiceSession needs from the session that owns it.
 * VoiceSession owns all voice/audio state; it reaches back through this narrow
 * seam only to deliver transcripts to the agent, drive TTS playback, and
 * abort/inspect the active agent run.
 */
/** A cut-off reply older than this is not merged into the user's next phrase. */
const INTERRUPTED_REPLY_TTL_MS = 120_000;

export interface VoiceSessionHost {
  emit(msg: SessionOutboundMessage): void;
  loadAgent(agentId: string): Promise<ManagedAgent>;
  /** Hizuri: an archived agent gets no voice and is never loaded for one; Unarchive gives it back. */
  isAgentArchived?(agentId: string): Promise<boolean>;
  reloadAgentSession(
    agentId: string,
    overrides: Partial<AgentSessionConfig>,
  ): Promise<ManagedAgent>;
  /**
   * Hizuri: steer = deliver into the running turn as a "by the way" instead of interrupting it;
   * meta = the phrase id Zuri signs for. `{ ok: false }` = the agent never got it.
   */
  sendSpokenInput(
    agentId: string,
    text: string,
    steer?: boolean,
    meta?: SpokenInputMeta,
  ): Promise<void | { ok: true } | { ok: false; error: string }>;
  interruptAgentIfRunning(agentId: string): Promise<void>;
  hasActiveAgentRun(agentId: string | null): boolean;
  /**
   * Hizuri (two Zuris, on trial): the companion agent that hears every phrase of `agentId` and
   * may speak too; null = none. Read live, so pairing needs no restart.
   */
  companionOf?(agentId: string): string | null;
  /** Hizuri (fast front): the agent's timeline, for its status line; [] when not loaded. */
  agentTimeline?(agentId: string): AgentTimelineItem[];
  /** Hizuri (fast front): the agent's provider id (“claude”, “codex”…); null when not loaded. */
  agentProvider?(agentId: string): string | null;
  /**
   * Hizuri (compact hold): the agent compacts and the user's phrases wait; null = not compacting.
   */
  compactHold?(agentId: string): CompactHoldState | null;
  /**
   * Hizuri (visual front): draws a scene on the agent's live tab "Now"; returns why it was not
   * drawn, or null when it was. Absent = the daemon has no stage.
   */
  showLive?(input: LiveSceneDraw): Promise<string | null>;
}

export interface VoiceSessionOptions {
  host: VoiceSessionHost;
  logger: pino.Logger;
  sessionId: string;
  onIdle?: () => void;
  sttLanguage?: string;
  tts: Resolvable<TextToSpeechProvider | null>;
  stt: Resolvable<SpeechToTextProvider | null>;
  voice?: {
    turnDetection?: Resolvable<TurnDetectionProvider | null>;
  };
  voiceBridge?: {
    registerVoiceSpeakHandler?: (agentId: string, handler: VoiceSpeakHandler) => void;
    unregisterVoiceSpeakHandler?: (agentId: string) => void;
    registerVoiceCallerContext?: (agentId: string, context: VoiceCallerContext) => void;
    unregisterVoiceCallerContext?: (agentId: string) => void;
  };
  dictation?: {
    finalTimeoutMs?: number;
    stt?: Resolvable<SpeechToTextProvider | null>;
    sttLanguage?: string;
    getSpeechReadiness?: () => SpeechReadinessSnapshot;
  };
  /** Hizuri: the user's voice data and filters (voice-owner.ts); absent = no filters. */
  owner?: VoiceOwnerOptions;
}

/**
 * Owns the voice half of a client session: speech-to-text/text-to-speech
 * managers, dictation streaming, the barge-in audio-buffering state machine,
 * voice-turn detection, and the MCP voice bridge. The session delegates the
 * voice/dictation/abort message types here and otherwise knows nothing about
 * audio buffering or processing phases.
 */
export class VoiceSession {
  /** Replaced when another connection takes the voice over (attachClient). */
  private host: VoiceSessionHost;
  private readonly sessionLogger: pino.Logger;
  private readonly sessionId: string;
  private readonly sttLanguage: string;
  /**
   * The language the user speaks: the assistant's fixed lines follow it (voice-language/detect.ts).
   */
  private readonly spokenLanguage: SessionLanguage;

  private abortController: AbortController;
  private closed = false;
  private onIdle: (() => void) | undefined;
  /** Hizuri (session persist): voice-mode changes run one at a time, in arrival order. */
  private modeChain: Promise<void> = Promise.resolve();
  private processingPhase: ProcessingPhase = "idle";

  private isVoiceMode = false;
  /**
   * Hizuri: when voice last paused (text mode, a dropped connection); the user's phrases said
   * before it still reach the agent.
   */
  private voiceSuspendedAt: number | null = null;
  private speechInProgress = false;

  private readonly dictationStreamManager: DictationStreamManager;
  private readonly resolveVoiceTurnDetection: () => TurnDetectionProvider | null;
  private voiceTurnController: VoiceTurnController | null = null;
  private voiceInputChunkCount = 0;
  private voiceInputBytes = 0;
  private voiceInputWindowStartedAt = Date.now();

  // Audio buffering for interruption handling
  private pendingAudioSegments: Array<{ audio: Buffer; format: string }> = [];
  private bufferTimeout: ReturnType<typeof setTimeout> | null = null;
  private audioBuffer: AudioBufferState | null = null;

  // Optional TTS debug capture (persisted per utterance)
  private readonly ttsDebugStreams = new Map<string, { format: string; chunks: Buffer[] }>();

  private readonly ttsManager: TTSManager;
  private readonly sttManager: STTManager;

  private readonly registerVoiceSpeakHandler?: (
    agentId: string,
    handler: VoiceSpeakHandler,
  ) => void;
  private readonly unregisterVoiceSpeakHandler?: (agentId: string) => void;
  private readonly registerVoiceCallerContext?: (
    agentId: string,
    context: VoiceCallerContext,
  ) => void;
  private readonly unregisterVoiceCallerContext?: (agentId: string) => void;
  private readonly getSpeechReadiness?: () => SpeechReadinessSnapshot;

  private voiceModeAgentId: string | null = null;
  private voiceModeBaseConfig: VoiceModeBaseConfig | null = null;
  // Hizuri (two Zuris): the companion speaking alongside the voice agent, and its prompt before.
  private voiceCompanion: { agentId: string; baseConfig: VoiceModeBaseConfig } | null = null;
  // Hizuri (two Zuris): what each of them said lately, to drop a reply that repeats the other.
  private recentSpeeches: { agentId: string; at: number; stems: Set<string> }[] = [];

  // Hizuri: owner data, the echo check of this session's replies, and the barge-in hold.
  private readonly owner: VoiceOwnerOptions | null;
  private readonly echoFilter: EchoFilter;
  /** Where the phone plays the assistant's voice now (echo-route.ts); from every mic chunk. */
  private outputRoute: OutputRoute = "unknown";
  private readonly bargeHoldMachine: BargeHold;
  private bargeHoldWasOn = false;
  /** Hizuri (stop-spotter.ts): stop words in the mic while a reply is armed; null = off. */
  private stopSpotter: StopSpotter | null = null;
  /** The secretary in shadow mode (secretary.ts): judges every phrase, only journals. */
  private readonly secretary: Secretary | null;
  private recentPhrases: { at: number; text: string; decision?: string }[] = [];
  /** The last reply Zuri started to speak (the secretary and the fast brain read it). */
  private lastSpokenReply: { text: string; at: number } | null = null;
  /**
   * The phrase graph (voice-graph.ts; null = off), the assistant's recent replies, and the floor:
   * after the user's words stopped the assistant, the phrase holds it until it reaches the agent,
   * and replies sent meanwhile are held instead of each being cut by the next part of the same
   * phrase.
   */
  private readonly graph: VoiceGraph | null;
  private replies: ReplyRecord[] = [];
  private replyCounter = 0;
  private floor: { since: number } | null = null;
  /**
   * Numbers of the user's phrases already delivered, to mark one that arrives after a later one.
   */
  private deliveredPhraseNumbers: number[] = [];
  /**
   * The graph record of the user's recent phrases that reached the agent, by id (draft
   * corrections).
   */
  private phraseDeliveries = new Map<string, PhraseEventInput>();
  /**
   * Hizuri (face): the assistant's recent gaps from delivery to its first played answer
   * (think-hint.ts).
   */
  private readonly thinkHint = new ThinkHint();
  /**
   * Phrases whose gap is already counted: only the assistant's first played answer to each counts.
   */
  private readonly thinkGapCounted = new Set<string>();
  /** When the phrase the user is saying now began (the turn controller's speech start). */
  private speechStartedAt: number | null = null;
  /**
   * Hizuri (room turns): the user's live words in the phrase now open, or the one that just closed.
   */
  private liveWords = "";
  /** The fast brain's reaction being spoken; the agent's reply waits for it (fast-reply.ts). */
  private fastReplyPlaying: Promise<void> | null = null;
  /**
   * Hizuri (compact hold): the compaction the front already told the user about (its start time).
   */
  private compactToldSince: number | null = null;
  /** Hizuri (fast front): when its line may be spoken (floor-manager.ts). */
  private readonly floorManager = new FloorManager(
    () => envNonNegative("PASEO_FAST_FRONT_GAP_MS", 6000),
    () => envNonNegative("PASEO_VOICE_BACKCHANNEL_MS", 1600),
  );
  /** Hizuri (floor gate): the assistant's replies waiting for the user's pause (waitForFloor). */
  private readonly waitingReplies = new Set<ReplyRecord>();
  /**
   * Hizuri (hold): watches the user's silence while a hold is on; when voice-floor.json was last
   * written.
   */
  private holdTicker: ReturnType<typeof setInterval> | null = null;
  private floorFileWrittenAt = 0;
  private fastReplyTurn = 0;
  /** Hizuri (front-stream.ts): the user's live words to the fast front; created on first use. */
  private frontStream: FrontStream | null = null;
  /** Hizuri (front-facts.ts): the facts last logged, so the log shows each change once. */
  private frontFactsLogged: string | null = null;
  /** Hizuri (visual front): the live tab's scenes for this voice session; made on first use. */
  private visualFront: VisualFront | null = null;
  /** Hizuri (situation.ts): other voices heard lately, for the situation tag. */
  private readonly situationTracker = new SituationTracker();
  /** Every byte of microphone audio, always (raw-recorder.ts); null = off. */
  private rawRecorder: RawAudioRecorder | null = null;
  /** Hizuri: the assistant's played audio on the mic clock (reply-reference.ts). */
  private readonly replyReference = new ReplyReference();
  /**
   * The assistant's played audio next to the raw mic, sample for sample (PASEO_RAW_RECORD_REPLY);
   * null = off.
   */
  private replyRecorder: RawAudioRecorder | null = null;
  /**
   * The assistant's echo taken out of the mic before the detector and the STT (PASEO_ECHO_CANCEL);
   * null = off.
   */
  private echoCanceller: EchoCanceller | null = null;
  /** The canceller's reference moved to where the echo really is, measured per reply. */
  private echoLag: EchoLag | null = null;
  /** The mic audio after the canceller, next to the raw one (with PASEO_RAW_RECORD_REPLY). */
  private cleanRecorder: RawAudioRecorder | null = null;
  private echoCancelLoggedAt = 0;
  /** The voice mode last logged (voice-mode.ts), so the log shows each change once. */
  private modeLogged: string | null = null;
  /**
   * The fast brain starts on the user's words as they arrive, while the monologue gap still runs.
   */
  private fastReplyPending: { text: string; reply: Promise<string | null> } | null = null;
  /**
   * §5.5: the user's monologue is one request that arrives in parts. Parts wait here
   * until the user is silent and every spoken part is transcribed, then go to the agent together.
   */
  private monologue: {
    agentId: string;
    parts: string[];
    speaking: boolean;
    awaited: number;
    gapTimer: ReturnType<typeof setTimeout> | null;
    capTimer: ReturnType<typeof setTimeout> | null;
    /** The phrase graph's view of each part (same order as parts; absent without ids). */
    phrases: PhraseMeta[];
    /** Hizuri: each part's short-phrase note, null for an ordinary part (same order as parts). */
    shorts: (ShortPhraseInfo | null)[];
    /** Hizuri (situation.ts): the room and voice print of each part that has them. */
    situations: PhraseSituation[];
    /**
     * Hizuri (front stream): the last part came while the assistant was busy: deliver it as a
     * steer.
     */
    steer: boolean;
    /** Hizuri (front stream): since when the front holds the thought as unfinished. */
    heldAt: number | null;
    /** Hizuri (front stream): since when the thought waits for the front's answer. */
    askedAt: number | null;
  } = {
    agentId: "",
    parts: [],
    shorts: [],
    situations: [],
    steer: false,
    heldAt: null,
    askedAt: null,
    speaking: false,
    awaited: 0,
    gapTimer: null,
    capTimer: null,
    phrases: [],
  };
  // Hizuri: one quick barge-in transcription in flight at a time (the STT takes few uploads).
  private readonly bargeCheckLane = createCheckLane();
  /** Hizuri (foreign-queue.ts): other voices wait while the assistant works instead of steering. */
  private readonly foreignQueue: ForeignQueue<PhraseMeta>;

  constructor(options: VoiceSessionOptions) {
    const { host, logger, sessionId, sttLanguage, tts, stt, voice, voiceBridge, dictation } =
      options;
    this.host = host;
    this.onIdle = options.onIdle;
    this.sessionLogger = logger;
    this.sessionId = sessionId;
    this.sttLanguage = sttLanguage ?? "en";
    this.spokenLanguage = new SessionLanguage(this.sttLanguage);
    this.abortController = new AbortController();

    this.resolveVoiceTurnDetection = toResolver(voice?.turnDetection ?? null);
    this.registerVoiceSpeakHandler = voiceBridge?.registerVoiceSpeakHandler;
    this.unregisterVoiceSpeakHandler = voiceBridge?.unregisterVoiceSpeakHandler;
    this.registerVoiceCallerContext = voiceBridge?.registerVoiceCallerContext;
    this.unregisterVoiceCallerContext = voiceBridge?.unregisterVoiceCallerContext;
    this.getSpeechReadiness = dictation?.getSpeechReadiness;

    this.ttsManager = new TTSManager(this.sessionId, this.sessionLogger, tts);
    this.sttManager = new STTManager(this.sessionId, this.sessionLogger, stt, {
      language: sttLanguage,
    });
    this.owner = options.owner ?? null;
    this.graph = this.owner?.graph ?? null;
    this.foreignQueue = new ForeignQueue<PhraseMeta>({
      shouldWait: (agentId) => this.host.hasActiveAgentRun(agentId) || this.userWordsPending(),
      deliver: (agentId, phrases) => this.deliverForeign(agentId, phrases),
      logger: this.sessionLogger,
    });
    this.secretary = createSecretaryFromEnv(
      this.owner?.journal ?? null,
      this.sessionLogger.child({ component: "secretary" }),
    );
    if (this.secretary) {
      this.secretary.onDecision = (at, decision) => {
        const phrase = this.recentPhrases.find((p) => p.at === at);
        if (phrase) {
          phrase.decision = decision;
        }
      };
    }
    // Hizuri: PASEO_ECHO_RECENT_MS > 0 compares with everything said in that window.
    this.echoFilter = new EchoFilter({ recentMs: () => envNonNegative("PASEO_ECHO_RECENT_MS", 0) });
    // Hizuri: barge-in on verified words (barge-hold.ts + agent/tts-pacer.ts), off unless
    // PASEO_BARGE_HOLD=1. The machine always exists, so the knob can turn it on mid-session.
    this.bargeHoldMachine = createBargeHold({
      logger: this.sessionLogger.child({ component: "barge-hold" }),
      hold: this.ttsManager.hold,
      verify: (info) => this.verifyBargeHold(info),
      onStop: (reason, info) => this.stopReplyPlayback(reason, info.speechStartedAt),
    });
    this.dictationStreamManager = new DictationStreamManager({
      logger: this.sessionLogger,
      sessionId: this.sessionId,
      emit: (msg) => this.handleDictationManagerMessage(msg),
      stt: dictation?.stt ?? null,
      language: dictation?.sttLanguage,
      finalTimeoutMs: dictation?.finalTimeoutMs,
      onIdle: () => this.onIdle?.(),
    });
  }

  /**
   * The barge-in check while PASEO_BARGE_HOLD is on, read on every use (voice-settings.json).
   * Turning it off releases a hold in force, or the assistant's reply would stay paused.
   */
  private get bargeHold(): BargeHold | null {
    const on = envFlag("PASEO_BARGE_HOLD", false);
    if (!on && this.bargeHoldWasOn) {
      this.bargeHoldMachine.resume("settings-off");
    }
    this.bargeHoldWasOn = on;
    return on ? this.bargeHoldMachine : null;
  }

  get hasDemand(): boolean {
    return (
      this.isVoiceMode ||
      this.dictationStreamManager.hasDemand ||
      this.processingPhase !== "idle" ||
      this.audioBuffer !== null ||
      this.pendingAudioSegments.length > 0
    );
  }

  isActiveForAgent(agentId: string): boolean {
    return this.isVoiceMode && this.voiceModeAgentId === agentId;
  }

  /**
   * Hizuri (session persist): the agent this voice put in voice mode (voice prompt and speak
   * tools), live or paused; null = none. It stays armed until voice mode is turned off without
   * keepSession, so a returning client resumes without reloading the agent.
   */
  get armedAgentId(): string | null {
    return this.voiceModeAgentId;
  }

  /** Hizuri (session persist): another connection takes this voice over. */
  attachClient(host: VoiceSessionHost, onIdle: (() => void) | undefined): void {
    this.host = host;
    this.onIdle = onIdle;
  }

  /**
   * Hizuri (session persist): voice paused, session kept: the microphone stream and playback
   * stop, the agent stays in voice mode and its speak calls show as text. Runs after any
   * voice-mode change already in flight.
   */
  suspend(reason: string): Promise<void> {
    return this.inModeOrder(() => this.suspendVoice(reason));
  }

  private inModeOrder(run: () => Promise<void>): Promise<void> {
    const next = this.modeChain.then(run);
    this.modeChain = next.catch(() => undefined);
    return next;
  }

  private async suspendVoice(reason: string): Promise<void> {
    this.isVoiceMode = false;
    this.voiceSuspendedAt = Date.now();
    // The user's words already transcribed still reach the agent; nobody hears a quick spoken
    // reaction.
    this.fastReplyPending = null;
    this.flushMonologue(reason);
    this.ttsManager.cancelPendingPlaybacks(reason);
    this.rawRecorder?.close();
    this.replyRecorder?.close();
    this.cleanRecorder?.close();
    await this.stopVoiceTurnController();
    this.sessionLogger.info({ agentId: this.voiceModeAgentId, reason }, "voice.suspended");
  }

  handleDictationChunk(params: {
    dictationId: string;
    seq: number;
    audioBase64: string;
    format: string;
  }): Promise<void> {
    return this.dictationStreamManager.handleChunk(params);
  }

  handleDictationFinish(dictationId: string, finalSeq: number): Promise<void> {
    return this.dictationStreamManager.handleFinish(dictationId, finalSeq);
  }

  handleDictationCancel(dictationId: string): void {
    this.dictationStreamManager.handleCancel(dictationId);
  }

  async handleDictationStreamStart(
    msg: Extract<SessionInboundMessage, { type: "dictation_stream_start" }>,
  ): Promise<void> {
    const unavailable = this.resolveVoiceFeatureUnavailableContext("dictation");
    if (unavailable) {
      this.emit({
        type: "dictation_stream_error",
        payload: {
          dictationId: msg.dictationId,
          error: unavailable.message,
          retryable: unavailable.retryable,
          reasonCode: unavailable.reasonCode,
          missingModelIds: unavailable.missingModelIds,
        },
      });
      return;
    }
    await this.dictationStreamManager.handleStart(msg.dictationId, msg.format);
  }

  private toVoiceFeatureUnavailableContext(
    state: SpeechReadinessState,
  ): VoiceFeatureUnavailableContext {
    return {
      reasonCode: state.reasonCode,
      message: state.message,
      retryable: state.retryable,
      missingModelIds: [...state.missingModelIds],
    };
  }

  private resolveModeReadinessState(
    readiness: SpeechReadinessSnapshot,
    mode: "voice_mode" | "dictation",
  ): SpeechReadinessState {
    if (mode === "voice_mode") {
      return readiness.realtimeVoice;
    }
    return readiness.dictation;
  }

  private getVoiceFeatureUnavailableResponseMetadata(
    error: unknown,
  ): VoiceFeatureUnavailableResponseMetadata {
    if (!(error instanceof VoiceFeatureUnavailableError)) {
      return {};
    }
    return {
      reasonCode: error.reasonCode,
      retryable: error.retryable,
      missingModelIds: error.missingModelIds,
    };
  }

  private resolveVoiceFeatureUnavailableContext(
    mode: "voice_mode" | "dictation",
  ): VoiceFeatureUnavailableContext | null {
    const readiness = this.getSpeechReadiness?.();
    if (!readiness) {
      return null;
    }

    const modeReadiness = this.resolveModeReadinessState(readiness, mode);
    if (!modeReadiness.enabled) {
      return this.toVoiceFeatureUnavailableContext(modeReadiness);
    }
    if (!readiness.voiceFeature.available) {
      return this.toVoiceFeatureUnavailableContext(readiness.voiceFeature);
    }
    if (!modeReadiness.available) {
      return this.toVoiceFeatureUnavailableContext(modeReadiness);
    }
    return null;
  }

  /**
   * Handle voice mode toggle. Hizuri: `keepSession` with `enabled: false` = text mode, the voice
   * session kept (suspend); without it voice mode ends and the agent's prompt is restored.
   */
  handleSetVoiceMode(
    enabled: boolean,
    agentId?: string,
    requestId?: string,
    options?: { keepSession?: boolean },
  ): Promise<void> {
    return this.inModeOrder(() =>
      this.applyVoiceMode(enabled, agentId, requestId, options?.keepSession === true),
    );
  }

  private async applyVoiceMode(
    enabled: boolean,
    agentId: string | undefined,
    requestId: string | undefined,
    keepSession: boolean,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      this.sessionLogger.info(
        { enabled, requestedAgentId: agentId ?? null, requestId: requestId ?? null },
        "set_voice_mode started",
      );
      if (enabled) {
        const unavailable = this.resolveVoiceFeatureUnavailableContext("voice_mode");
        if (unavailable) {
          throw new VoiceFeatureUnavailableError(unavailable);
        }

        const normalizedAgentId = this.parseVoiceTargetAgentId(agentId ?? "", "set_voice_mode");
        await this.refuseArchivedAgent(normalizedAgentId);

        if (this.voiceModeAgentId && this.voiceModeAgentId !== normalizedAgentId) {
          this.sessionLogger.info(
            {
              previousAgentId: this.voiceModeAgentId,
              nextAgentId: normalizedAgentId,
              elapsedMs: Date.now() - startedAt,
            },
            "set_voice_mode disabling previous active voice agent",
          );
          await this.disableVoiceModeForActiveAgent(true);
        }

        // Hizuri (session persist): an agent already in voice mode (voice paused, or taken over
        // from a closed connection) resumes without the ~20 s reload that cancels its turn.
        if (this.voiceModeAgentId === normalizedAgentId) {
          this.sessionLogger.info(
            { agentId: normalizedAgentId, elapsedMs: Date.now() - startedAt },
            "set_voice_mode resuming: agent already in voice mode",
          );
        } else {
          this.sessionLogger.info(
            { agentId: normalizedAgentId, elapsedMs: Date.now() - startedAt },
            "set_voice_mode enabling voice for agent",
          );
          const refreshedAgentId = await this.enableVoiceModeForAgent(normalizedAgentId);
          this.voiceModeAgentId = refreshedAgentId;
          if (this.closed) {
            await this.disableVoiceModeForActiveAgent(true);
            return;
          }
          this.sessionLogger.info(
            { agentId: refreshedAgentId, elapsedMs: Date.now() - startedAt },
            "set_voice_mode agent enable complete",
          );
        }

        this.sessionLogger.info(
          { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
          "set_voice_mode starting voice turn controller",
        );
        await this.startVoiceTurnController();
        this.sessionLogger.info(
          { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
          "set_voice_mode voice turn controller started",
        );
        this.isVoiceMode = !this.closed;
        this.sessionLogger.info(
          {
            agentId: this.voiceModeAgentId,
            elapsedMs: Date.now() - startedAt,
          },
          "Voice mode enabled for existing agent",
        );
        if (requestId) {
          this.emit({
            type: "set_voice_mode_response",
            payload: {
              requestId,
              enabled: true,
              agentId: this.voiceModeAgentId,
              accepted: true,
              error: null,
            },
          });
        }
        return;
      }

      if (keepSession && this.voiceModeAgentId) {
        await this.switchToTextKeepingSession(requestId);
        return;
      }

      this.sessionLogger.info(
        { agentId: this.voiceModeAgentId, elapsedMs: Date.now() - startedAt },
        "set_voice_mode disabling active voice mode",
      );
      if (!keepSession) {
        await this.restoreStaleVoicePrompt(agentId);
      }
      await this.disableVoiceModeForActiveAgent(true);
      this.isVoiceMode = false;
      this.sessionLogger.info({ elapsedMs: Date.now() - startedAt }, "Voice mode disabled");
      if (requestId) {
        this.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId,
            enabled: false,
            agentId: null,
            accepted: true,
            error: null,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to set voice mode";
      const unavailable = this.getVoiceFeatureUnavailableResponseMetadata(error);
      this.sessionLogger.error(
        {
          err: error,
          enabled,
          requestedAgentId: agentId ?? null,
          elapsedMs: Date.now() - startedAt,
        },
        "set_voice_mode failed",
      );
      if (requestId) {
        this.emit({
          type: "set_voice_mode_response",
          payload: {
            requestId,
            enabled: this.isVoiceMode,
            agentId: this.voiceModeAgentId,
            accepted: false,
            error: errorMessage,
            ...unavailable,
          },
        });
        return;
      }
      throw error;
    }
  }

  /** Hizuri (session persist): text mode, the agent kept in voice mode. */
  private async switchToTextKeepingSession(requestId: string | undefined): Promise<void> {
    await this.suspendVoice("text-mode");
    if (requestId) {
      this.emit({
        type: "set_voice_mode_response",
        payload: {
          requestId,
          enabled: false,
          agentId: this.voiceModeAgentId,
          accepted: true,
          error: null,
        },
      });
    }
  }

  /**
   * Hizuri (session persist): the session ends for an agent no voice in this daemon holds (the
   * daemon restarted since): its persisted config may still carry the voice-mode prompt.
   */
  private async restoreStaleVoicePrompt(rawAgentId: string | undefined): Promise<void> {
    if (this.voiceModeAgentId || !rawAgentId) {
      return;
    }
    const agentId = this.parseVoiceTargetAgentId(rawAgentId, "set_voice_mode");
    if (await this.host.isAgentArchived?.(agentId)) return;
    const agent = await this.host.loadAgent(agentId);
    const prompt = agent.config.systemPrompt;
    const base = stripVoiceModeSystemPrompt(prompt);
    if (prompt !== buildVoiceModeSystemPrompt(base, true) || keepVoicePrompt()) {
      return;
    }
    this.sessionLogger.info({ agentId }, "set_voice_mode restoring a stale voice-mode prompt");
    await this.host.reloadAgentSession(agentId, {
      systemPrompt: buildVoiceModeSystemPrompt(base, false),
    });
  }

  /**
   * Hizuri: an archived agent gets no voice; Unarchive gives it back. A client still asking for
   * it (its saved session, or a resync after a host restart) hears the voice is gone, the same
   * message as a move, so it closes its microphone instead of asking again.
   */
  private async refuseArchivedAgent(agentId: string): Promise<void> {
    if (!(await this.host.isAgentArchived?.(agentId))) return;
    this.emit({
      type: "set_voice_mode_response",
      payload: {
        requestId: VOICE_MOVED_REQUEST_ID,
        enabled: false,
        agentId,
        accepted: true,
        error: null,
      },
    });
    throw new Error(`Agent ${agentId} is archived`);
  }

  private parseVoiceTargetAgentId(rawId: string, source: string): string {
    const parsed = AgentIdSchema.safeParse(rawId.trim());
    if (!parsed.success) {
      throw new Error(`${source}: agentId must be a UUID`);
    }
    return parsed.data;
  }

  private async enableVoiceModeForAgent(agentId: string): Promise<string> {
    const startedAt = Date.now();
    this.sessionLogger.info({ agentId }, "enableVoiceModeForAgent.ensureAgentLoaded.start");
    const existing = await this.host.loadAgent(agentId);
    if (this.closed) throw new Error("Voice source is closed");
    this.sessionLogger.info(
      { agentId, elapsedMs: Date.now() - startedAt },
      "enableVoiceModeForAgent.ensureAgentLoaded.done",
    );

    this.registerVoiceBridgeForAgent(agentId);
    if (fastFrontMode() !== "off") {
      sharedFastFront(this.sessionLogger).warm();
    }
    if (visualFrontMode() !== "off" && !this.frontSkipsAgent(agentId)) {
      sharedVisualFrontModel(this.sessionLogger).warm();
    }

    const baseConfig: VoiceModeBaseConfig = {
      systemPrompt: stripVoiceModeSystemPrompt(existing.config.systemPrompt),
    };
    this.voiceModeBaseConfig = baseConfig;
    const refreshOverrides: Partial<AgentSessionConfig> = {
      systemPrompt: buildVoiceModeSystemPrompt(baseConfig.systemPrompt, true),
    };

    // Hizuri: the voice prompt stays on the agent, so starting a session
    // after the first one never reloads it (a reload took 20-30 s on the big session file).
    if (keepVoicePrompt() && existing.config.systemPrompt === refreshOverrides.systemPrompt) {
      this.sessionLogger.info(
        { agentId },
        "enableVoiceModeForAgent.no_reload (voice prompt already on)",
      );
      await this.enableVoiceCompanion(agentId);
      return agentId;
    }

    try {
      this.sessionLogger.info(
        { agentId, elapsedMs: Date.now() - startedAt },
        "enableVoiceModeForAgent.reloadAgentSession.start",
      );
      const refreshed = await this.host.reloadAgentSession(agentId, refreshOverrides);
      this.sessionLogger.info(
        { agentId, refreshedAgentId: refreshed.id, elapsedMs: Date.now() - startedAt },
        "enableVoiceModeForAgent.reloadAgentSession.done",
      );
      await this.enableVoiceCompanion(refreshed.id);
      return refreshed.id;
    } catch (error) {
      this.unregisterVoiceSpeakHandler?.(agentId);
      this.unregisterVoiceCallerContext?.(agentId);
      this.voiceModeBaseConfig = null;
      throw error;
    }
  }

  /**
   * Hizuri (two Zuris, on trial): the companion gets the speak tools and the voice prompt too. It
   * hears every phrase through the host and speaks into the same queue, so the two never talk
   * over each other. A failure leaves voice mode working with the main agent alone.
   */
  private async enableVoiceCompanion(agentId: string): Promise<void> {
    const companionId = this.host.companionOf?.(agentId) ?? null;
    if (!companionId || companionId === agentId) {
      return;
    }
    try {
      const existing = await this.host.loadAgent(companionId);
      this.registerVoiceBridgeForAgent(companionId);
      const baseConfig: VoiceModeBaseConfig = {
        systemPrompt: stripVoiceModeSystemPrompt(existing.config.systemPrompt),
      };
      await this.host.reloadAgentSession(companionId, {
        systemPrompt: buildVoiceModeSystemPrompt(baseConfig.systemPrompt, true),
      });
      this.voiceCompanion = { agentId: companionId, baseConfig };
      this.sessionLogger.info({ agentId, companionId }, "voice_companion.enabled");
    } catch (error) {
      this.unregisterVoiceSpeakHandler?.(companionId);
      this.unregisterVoiceCallerContext?.(companionId);
      this.sessionLogger.warn({ err: error, agentId, companionId }, "voice_companion.failed");
    }
  }

  private async disableVoiceCompanion(restoreAgentConfig: boolean): Promise<void> {
    const companion = this.voiceCompanion;
    if (!companion) {
      return;
    }
    this.voiceCompanion = null;
    this.unregisterVoiceSpeakHandler?.(companion.agentId);
    this.unregisterVoiceCallerContext?.(companion.agentId);
    if (!restoreAgentConfig) {
      return;
    }
    try {
      await this.host.reloadAgentSession(companion.agentId, {
        systemPrompt: buildVoiceModeSystemPrompt(companion.baseConfig.systemPrompt, false),
      });
    } catch (error) {
      this.sessionLogger.warn(
        { err: error, companionId: companion.agentId },
        "voice_companion.restore_failed",
      );
    }
  }

  private async disableVoiceModeForActiveAgent(restoreAgentConfig: boolean): Promise<void> {
    // Hizuri: nobody will hear queued or paused replies any more.
    this.ttsManager.cancelPendingPlaybacks("voice-mode-off");
    this.rawRecorder?.close();
    this.replyRecorder?.close();
    this.cleanRecorder?.close();
    await this.stopVoiceTurnController();
    await this.disableVoiceCompanion(restoreAgentConfig);

    const agentId = this.voiceModeAgentId;
    if (!agentId) {
      this.voiceModeBaseConfig = null;
      return;
    }

    if (restoreAgentConfig && this.voiceModeBaseConfig && !keepVoicePrompt()) {
      const baseConfig = this.voiceModeBaseConfig;
      try {
        await this.host.reloadAgentSession(agentId, {
          systemPrompt: buildVoiceModeSystemPrompt(baseConfig.systemPrompt, false),
        });
      } catch (error) {
        this.sessionLogger.warn(
          { err: error, agentId },
          "Failed to restore agent config while disabling voice mode",
        );
      }
    }

    this.unregisterVoiceSpeakHandler?.(agentId);
    this.unregisterVoiceCallerContext?.(agentId);
    this.voiceModeBaseConfig = null;
    this.voiceModeAgentId = null;
  }

  private handleDictationManagerMessage(msg: DictationStreamOutboundMessage): void {
    this.emit(msg as unknown as SessionOutboundMessage);
  }

  private async startVoiceTurnController(): Promise<void> {
    if (this.voiceTurnController) {
      this.sessionLogger.info("startVoiceTurnController skipped: already running");
      return;
    }

    const turnDetection = this.resolveVoiceTurnDetection();
    if (!turnDetection) {
      throw new Error("Voice turn detection is not configured");
    }
    const stt = this.sttManager.getProvider();
    if (!stt) {
      throw new Error("Voice speech-to-text is not configured");
    }

    this.sessionLogger.info(
      { providerId: turnDetection.id },
      "startVoiceTurnController creating controller",
    );

    const controller = createVoiceTurnController({
      logger: this.sessionLogger.child({ component: "voice-turn-controller" }),
      turnDetection,
      stt,
      sttLanguage: this.sttLanguage,
      // Hizuri: echo, junk and owner-voice checks on every final transcript.
      filters: {
        echo: this.echoFilter,
        speakerGate: this.owner?.speakerGate ?? null,
        journal: this.owner?.journal ?? null,
      },
      nextPhraseId: () => this.graph?.nextPhraseId() ?? null,
      denoiser: this.owner?.denoise
        ? getSpeechDenoiser(this.owner.denoise, this.sessionLogger)
        : null,
      callbacks: {
        onSpeechStarted: async () => {
          this.sessionLogger.debug("Voice VAD speech_started");
          this.speechStartedAt = Date.now();
          this.restartStopSpotter();
          // Hizuri: the client stops playback on this signal, so noise must not send it. By
          // default it goes out once a transcript with words arrived
          // (handleTranscriptionResultPayload); PASEO_VOICE_BARGE_IN_ON_VAD=1 restores the
          // upstream interruption on the detector's event.
          if (this.bargeInOnVad()) {
            this.emit({
              type: "voice_input_state",
              payload: {
                isSpeaking: true,
              },
            });
          }
          this.bargeHold?.onSpeechStarted();
          moduleKernel.phraseOpened(this); // hizuri: module versions switch only between phrases
          this.monologueSpeechStarted();
          await this.handleVoiceSpeechStart();
        },
        onPartialTranscript: async ({ segmentId, transcript }) => {
          // Hizuri: a streaming STT sends live text about every second while the user speaks.
          this.sessionLogger.info({ segmentId, transcript }, "Voice partial transcript");
          // Hizuri: the user's live words on screen, the sign that they are heard. The assistant's
          // own reply coming back through the speaker is not the user's.
          const assistantWords =
            this.ttsManager.isSpeaking() &&
            isAssistantEcho(this.echoFilter, transcript, {
              startedAt: this.speechStartedAt ?? Date.now(),
              endedAt: Date.now(),
            });
          if (!assistantWords) {
            if (/\p{L}/u.test(transcript)) {
              this.floorManager.noteUserWords();
              this.liveWords = transcript;
            }
            this.emit({ type: "voice_live_transcript", payload: { segmentId, text: transcript } });
            this.streamLive(transcript);
            if (!this.ttsManager.isSpeaking() && this.voiceModeAgentId) {
              const thought = [this.monologueQuickText(), transcript.trim()]
                .filter(Boolean)
                .join(" ");
              this.showPhrase(this.voiceModeAgentId, thought, { live: true });
            }
          }
          this.bargeOnPartial(transcript);
        },
        onSpeechStopped: async () => {
          this.monologueSpeechStopped();
          this.handleVoiceSpeechStopped();
          this.setPhase("transcribing");
          this.emit({
            type: "activity_log",
            payload: {
              id: uuidv4(),
              timestamp: new Date(),
              type: "system",
              content: "Transcribing audio...",
            },
          });
        },
        onFinalTranscript: async ({
          transcript,
          language,
          durationMs,
          avgLogprob,
          isLowConfidence,
          phraseId,
          startedAt,
          endedAt,
          dropReason,
          droppedText,
          draft,
          correctionOf,
          shortPhrase,
          situation,
        }) => {
          if (correctionOf !== undefined) {
            await this.handleDraftCorrection({
              text: transcript.trim(),
              draftText: correctionOf,
              ...(phraseId ? { phraseId } : {}),
            });
            return;
          }
          const requestId = uuidv4();
          const transcriptText = isLowConfidence ? "" : transcript.trim();
          if (isLowConfidence) {
            this.sessionLogger.debug(
              { text: transcript, avgLogprob },
              "Filtered low-confidence transcription (likely non-speech)",
            );
          }
          this.sessionLogger.info(
            {
              requestId,
              isVoiceMode: this.isVoiceMode,
              transcriptLength: transcriptText.length,
              transcript: transcriptText,
            },
            "Transcription result",
          );
          await this.handleTranscriptionResultPayload({
            text: transcriptText,
            requestId,
            ...(language ? { language } : {}),
            duration: durationMs,
            ...(avgLogprob !== undefined ? { avgLogprob } : {}),
            ...(isLowConfidence !== undefined ? { isLowConfidence } : {}),
            ...(phraseId ? { phraseId } : {}),
            ...(startedAt !== undefined ? { spokenAt: startedAt } : {}),
            ...(endedAt !== undefined ? { endedAt } : {}),
            ...whyDropped({ dropReason, droppedText, isLowConfidence, transcript }),
            ...(draft ? { draft: true } : {}),
            ...(shortPhrase ? { shortPhrase } : {}),
            ...(situation ? { situation } : {}),
          });
        },
        onError: (error) => {
          this.sessionLogger.error({ err: error }, "Voice turn controller failed");
        },
        // Hizuri: pause/resume barge-in.
        onVadFrame: (detected, frameMs, loud) => {
          this.bargeHold?.onFrame(detected, frameMs, loud);
        },
        onVadSpeechStopped: () => {
          this.bargeHold?.onSpeechStopped();
          moduleKernel.phraseClosed(this); // hizuri: a waiting module switch applies here
        },
        onMicAudio: (pcm16k) => this.spotStopWord(pcm16k),
        ...this.fallbackCallback(),
        // Hizuri: the STT refused the phrase (busy): transcribe its audio again.
        retranscribe: async (pcm16k) => {
          const wav = convertPCMToWavBuffer(
            pcm16k,
            PCM_SAMPLE_RATE,
            PCM_CHANNELS,
            PCM_BITS_PER_SAMPLE,
          );
          return this.sttManager.transcribe(wav, "audio/wav", {
            requestId: uuidv4(),
            label: "voice-retry",
          });
        },
      },
    });

    this.sessionLogger.info("startVoiceTurnController connecting controller");
    // The spotter's model loads here (about a second, once per daemon), before any reply plays.
    // A model that fails to load leaves the quick check alone in charge, never voice mode off.
    try {
      this.stopSpotter ??= this.owner?.stopSpotter?.createSpotter() ?? null;
    } catch (error) {
      this.sessionLogger.error({ err: error }, "stop_spotter.load_failed");
    }
    this.voiceTurnController = controller;
    await controller.start();
    if (this.closed) await controller.stop();
    this.sessionLogger.info("startVoiceTurnController connected");
  }

  /** Hizuri: the fallback recogniser for phrases the STT gave no text for (fallback-stt.ts). */
  private fallbackCallback(): Pick<VoiceTurnControllerCallbacks, "transcribeFallback"> {
    const fallback = this.owner?.fallbackStt;
    if (!fallback) {
      return {};
    }
    return {
      transcribeFallback: async (pcm16k) => ({
        text: await fallback.transcribe(pcm16k, this.sttLanguage),
      }),
    };
  }

  private async stopVoiceTurnController(): Promise<void> {
    if (!this.voiceTurnController) {
      return;
    }

    const controller = this.voiceTurnController;
    this.voiceTurnController = null;
    await controller.stop();
  }

  private handleVoiceSpeechStopped(): void {
    this.sessionLogger.info("voice_input_state emitting isSpeaking=false");
    this.emit({
      type: "voice_input_state",
      payload: {
        isSpeaking: false,
      },
    });
  }

  private async ensureAudioBufferForFormat(
    chunkFormat: string,
    isPCMChunk: boolean,
  ): Promise<AudioBufferState> {
    if (!this.audioBuffer) {
      this.audioBuffer = {
        chunks: [],
        format: chunkFormat,
        isPCM: isPCMChunk,
        totalPCMBytes: 0,
      };
      return this.audioBuffer;
    }
    if (this.audioBuffer.isPCM !== isPCMChunk) {
      this.sessionLogger.debug(
        {
          oldFormat: this.audioBuffer.isPCM ? "pcm" : this.audioBuffer.format,
          newFormat: chunkFormat,
        },
        `Audio format changed mid-stream, flushing current buffer`,
      );
      const finalized = this.finalizeBufferedAudio();
      if (finalized) {
        await this.processCompletedAudio(finalized.audio, finalized.format);
      }
      this.audioBuffer = {
        chunks: [],
        format: chunkFormat,
        isPCM: isPCMChunk,
        totalPCMBytes: 0,
      };
      return this.audioBuffer;
    }
    if (!this.audioBuffer.isPCM) {
      this.audioBuffer.format = chunkFormat;
    }
    return this.audioBuffer;
  }

  private async forwardAudioChunkToVoiceTurn(
    msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
    chunkFormat: string,
  ): Promise<void> {
    if (!this.voiceTurnController) {
      throw new Error("Voice mode is enabled but the voice turn controller is not running");
    }
    const chunkBytes = Buffer.byteLength(msg.audio, "base64");
    const mic = Buffer.from(msg.audio, "base64");
    const reference = this.recordRawChunk(mic, chunkFormat);
    const audioBase64 = reference ? this.cancelEcho(mic, reference) : msg.audio;
    this.voiceInputChunkCount += 1;
    this.voiceInputBytes += chunkBytes;
    const now = Date.now();
    if (this.voiceInputChunkCount % 50 === 0 || now - this.voiceInputWindowStartedAt >= 1000) {
      this.sessionLogger.info(
        {
          chunkCount: this.voiceInputChunkCount,
          audioBytes: this.voiceInputBytes,
          windowMs: now - this.voiceInputWindowStartedAt,
          format: chunkFormat,
        },
        "Voice input chunk summary",
      );
      this.voiceInputWindowStartedAt = now;
      this.voiceInputChunkCount = 0;
      this.voiceInputBytes = 0;
    }
    await this.voiceTurnController.appendClientChunk({ audioBase64, format: chunkFormat });
  }

  private noteOutputRoute(wire: string | undefined): void {
    const route = outputRouteOf(wire);
    if (route === this.outputRoute) {
      return;
    }
    this.sessionLogger.info({ from: this.outputRoute, to: route }, "voice.output_route");
    this.outputRoute = route;
  }

  /**
   * Hizuri: the assistant's echo out of a 16 kHz mic chunk, as base64 for the turn controller; the
   * chunk unchanged while PASEO_ECHO_CANCEL is off or the canceller is missing.
   */
  private cancelEcho(mic: Buffer, reference: Int16Array): string {
    if (!envFlag("PASEO_ECHO_CANCEL", false)) {
      if (this.echoCanceller) {
        this.echoCanceller.close();
        this.echoCanceller = null;
        this.echoLag = null;
        this.sessionLogger.info("echo_cancel.off");
      }
      return mic.toString("base64");
    }
    const engine = echoCancelEngine();
    if (this.echoCanceller && this.echoCanceller.stats.engine !== engine) {
      this.echoCanceller.close();
      this.echoCanceller = null;
    }
    if (!this.echoCanceller) {
      this.echoCanceller = EchoCanceller.create(this.sessionLogger, engine);
      if (!this.echoCanceller) {
        return mic.toString("base64");
      }
      this.sessionLogger.info({ engine }, "echo_cancel.on");
    }
    this.echoLag ??= new EchoLag((lagMs, match) =>
      this.sessionLogger.info({ lagMs, match: Number(match.toFixed(2)) }, "echo_cancel.lag"),
    );
    const micSamples = new Int16Array(
      mic.buffer.slice(mic.byteOffset, mic.byteOffset + (mic.length & ~1)),
    );
    const clean = this.echoCanceller.process(mic, this.echoLag.align(micSamples, reference));
    const rawDir = this.owner?.rawDir;
    if (rawDir && envFlag("PASEO_RAW_RECORD_REPLY", false)) {
      this.cleanRecorder ??= new RawAudioRecorder(
        rawDir,
        `${this.sessionId.slice(0, 8)}_clean`,
        this.sessionLogger,
      );
      this.cleanRecorder.append(clean, 16_000);
    }
    const now = Date.now();
    if (now - this.echoCancelLoggedAt >= 60_000) {
      this.echoCancelLoggedAt = now;
      this.sessionLogger.info({ ...this.echoCanceller.stats }, "echo_cancel.stats");
    }
    return clean.toString("base64");
  }

  /**
   * Records the raw chunk; returns the assistant's reference for a 16 kHz chunk, null for any other
   * format.
   */
  private recordRawChunk(pcm: Buffer, format: string): Int16Array | null {
    const rawDir = this.owner?.rawDir;
    const sampleRate = pcmSampleRate(format);
    // The assistant's reference advances with every 16 kHz mic chunk, recorded or not.
    const reference =
      sampleRate === 16_000 ? this.replyReference.take(Math.floor(pcm.length / 2)) : null;
    if (!rawDir || sampleRate === null) {
      return reference;
    }
    const now = Date.now();
    const tag = this.sessionId.slice(0, 8);
    this.rawRecorder ??= new RawAudioRecorder(rawDir, tag, this.sessionLogger);
    this.rawRecorder.append(pcm, sampleRate, now);
    if (reference && envFlag("PASEO_RAW_RECORD_REPLY", false)) {
      this.replyRecorder ??= new RawAudioRecorder(rawDir, `${tag}_reply`, this.sessionLogger);
      this.replyRecorder.append(
        Buffer.from(reference.buffer, reference.byteOffset, reference.byteLength),
        sampleRate,
        now,
      );
    } else if (this.replyRecorder) {
      this.replyRecorder.close();
      this.replyRecorder = null;
    }
    return reference;
  }

  async handleAudioChunk(
    msg: Extract<SessionInboundMessage, { type: "voice_audio_chunk" }>,
  ): Promise<void> {
    if (!this.isVoiceMode) {
      this.sessionLogger.warn(
        "Received voice_audio_chunk while voice mode is disabled; transcript will be emitted but voice assistant turn is skipped",
      );
    }

    const chunkFormat = msg.format || "audio/wav";
    this.noteOutputRoute(msg.outputRoute);

    if (this.isVoiceMode) {
      await this.forwardAudioChunkToVoiceTurn(msg, chunkFormat);
      return;
    }

    const chunkBuffer = Buffer.from(msg.audio, "base64");
    const isPCMChunk = chunkFormat.toLowerCase().includes("pcm");

    const buffer = await this.ensureAudioBufferForFormat(chunkFormat, isPCMChunk);

    buffer.chunks.push(chunkBuffer);
    if (buffer.isPCM) {
      buffer.totalPCMBytes += chunkBuffer.length;
    }

    // In non-voice mode, use streaming threshold to process chunks
    const reachedStreamingThreshold =
      !this.isVoiceMode && buffer.isPCM && buffer.totalPCMBytes >= MIN_STREAMING_SEGMENT_BYTES;

    if (!msg.isLast && reachedStreamingThreshold) {
      return;
    }

    const bufferedState = this.audioBuffer;
    const finalized = this.finalizeBufferedAudio();
    if (!finalized) {
      return;
    }

    if (!msg.isLast && reachedStreamingThreshold) {
      this.sessionLogger.debug(
        {
          minDuration: MIN_STREAMING_SEGMENT_DURATION_MS,
          pcmBytes: bufferedState?.totalPCMBytes ?? 0,
        },
        `Minimum chunk duration reached (~${MIN_STREAMING_SEGMENT_DURATION_MS}ms, ${
          bufferedState?.totalPCMBytes ?? 0
        } PCM bytes) – triggering STT`,
      );
    } else {
      this.sessionLogger.debug(
        { audioBytes: finalized.audio.length, chunks: bufferedState?.chunks.length ?? 0 },
        `Complete audio segment (${finalized.audio.length} bytes, ${bufferedState?.chunks.length ?? 0} chunk(s))`,
      );
    }

    await this.processCompletedAudio(finalized.audio, finalized.format);
  }

  private finalizeBufferedAudio(): { audio: Buffer; format: string } | null {
    if (!this.audioBuffer) {
      return null;
    }

    const bufferState = this.audioBuffer;
    this.audioBuffer = null;

    if (bufferState.isPCM) {
      const pcmBuffer = Buffer.concat(bufferState.chunks);
      const wavBuffer = convertPCMToWavBuffer(
        pcmBuffer,
        PCM_SAMPLE_RATE,
        PCM_CHANNELS,
        PCM_BITS_PER_SAMPLE,
      );
      return {
        audio: wavBuffer,
        format: "audio/wav",
      };
    }

    return {
      audio: Buffer.concat(bufferState.chunks),
      format: bufferState.format,
    };
  }

  private async processCompletedAudio(audio: Buffer, format: string): Promise<void> {
    if (this.processingPhase === "transcribing") {
      this.sessionLogger.debug(
        { phase: this.processingPhase, segmentCount: this.pendingAudioSegments.length + 1 },
        `Buffering audio segment (phase: ${this.processingPhase})`,
      );
      this.pendingAudioSegments.push({
        audio,
        format,
      });
      this.setBufferTimeout();
      return;
    }

    if (this.pendingAudioSegments.length > 0) {
      this.pendingAudioSegments.push({
        audio,
        format,
      });
      this.sessionLogger.debug(
        { segmentCount: this.pendingAudioSegments.length },
        `Processing ${this.pendingAudioSegments.length} buffered segments together`,
      );

      const pendingSegments = [...this.pendingAudioSegments];
      this.pendingAudioSegments = [];
      this.clearBufferTimeout();

      const combinedAudio = Buffer.concat(pendingSegments.map((segment) => segment.audio));
      const combinedFormat = pendingSegments[pendingSegments.length - 1].format;

      await this.processAudio(combinedAudio, combinedFormat);
      return;
    }

    await this.processAudio(audio, format);
  }

  private async flushPendingAudioSegments(reason: string): Promise<void> {
    if (this.processingPhase === "transcribing" || this.pendingAudioSegments.length === 0) {
      return;
    }

    const pendingSegments = [...this.pendingAudioSegments];
    this.pendingAudioSegments = [];
    this.clearBufferTimeout();

    this.sessionLogger.debug(
      { reason, segmentCount: pendingSegments.length },
      `Flushing ${pendingSegments.length} buffered audio segment(s)`,
    );

    const combinedAudio = Buffer.concat(pendingSegments.map((segment) => segment.audio));
    const combinedFormat = pendingSegments[pendingSegments.length - 1].format;

    await this.processAudio(combinedAudio, combinedFormat);
  }

  /**
   * Process audio through STT and then LLM
   */
  private async processAudio(audio: Buffer, format: string): Promise<void> {
    this.setPhase("transcribing");

    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "system",
        content: "Transcribing audio...",
      },
    });

    try {
      const requestId = uuidv4();
      const result = await this.sttManager.transcribe(audio, format, {
        requestId,
        label: this.isVoiceMode ? "voice" : "buffered",
      });

      const transcriptText = result.text.trim();
      this.sessionLogger.info(
        {
          requestId,
          isVoiceMode: this.isVoiceMode,
          transcriptLength: transcriptText.length,
          transcript: transcriptText,
        },
        "Transcription result",
      );

      await this.handleTranscriptionResultPayload({
        text: result.text,
        language: result.language,
        duration: result.duration,
        requestId,
        avgLogprob: result.avgLogprob,
        isLowConfidence: result.isLowConfidence,
        byteLength: result.byteLength,
        format: result.format,
        debugRecordingPath: result.debugRecordingPath,
      });
    } catch (error) {
      this.setPhase("idle");
      this.clearSpeechInProgress("transcription error");
      await this.flushPendingAudioSegments("transcription error");
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "error",
          content: `Transcription error: ${getErrorMessage(error)}`,
        },
      });
      throw error;
    }
  }

  /** The language the assistant's fixed lines are in: the one the user speaks. */
  private get language(): VoiceLanguage {
    return this.spokenLanguage.current;
  }

  /** The user's phrase tells which language they speak (voice-language/detect.ts). */
  private observeLanguage(text: string): void {
    if (this.spokenLanguage.observe(text)) {
      this.sessionLogger.info({ language: this.language.code }, "Voice language follows the user");
    }
  }

  /** Shadow secretary: judges the phrase with what a live secretary would know; never blocks. */
  private observeBySecretary(text: string, zuriSpeaking: boolean): void {
    if (!this.secretary) {
      return;
    }
    const at = Date.now();
    this.secretary.observe({
      phrase: text,
      at,
      previous: this.recentPhrases.slice(-5),
      assistantLastLine: this.lastSpokenReply?.text ?? null,
      assistantSpeaking: zuriSpeaking,
      language: this.language,
    });
    this.recentPhrases = [...this.recentPhrases.slice(-9), { at, text }];
  }

  private async handleTranscriptionResultPayload(
    result: VoiceTranscriptionResultPayload,
  ): Promise<void> {
    const transcriptText = result.text.trim();
    this.monologue.awaited = Math.max(0, this.monologue.awaited - 1);
    this.noteSituation(result);
    this.archiveOwnerPhrase(transcriptText, result.duration);
    const phrase = phraseOf(result, transcriptText);

    // Hizuri: an empty result makes the client stop whatever audio is playing (it cancels its
    // "thinking" cue), cutting the reply mid-sentence; and any result during a paced reply starts
    // that cue between its chunks. Neither reaches the client while a reply is playing, queued or
    // paused; the phrase itself still reaches the agent below.
    const replyPlaying = this.ttsManager.isSpeaking();
    if (replyPlaying && (!transcriptText || this.bargeHold)) {
      this.sessionLogger.info(
        { empty: !transcriptText },
        "Transcription while a reply is playing: not sent to the client",
      );
    } else {
      this.emitTranscriptionResult(result);
    }

    if (!transcriptText) {
      this.dropPhrase(phrase, result.dropReason ?? "empty", result.droppedText ?? "");
      await this.handleEmptyTranscript();
      // The words the user said before this segment wait for every pending transcript; this was the
      // last one, so they go after the usual gap instead of the 20 s cap.
      this.scheduleMonologueFlush();
      return;
    }

    this.observeLanguage(transcriptText);
    this.observeBySecretary(transcriptText, replyPlaying);
    this.noteBackchannel(phrase, transcriptText);
    const hold = holdSignal(transcriptText, this.assistantSpokeDuring(phrase));
    const consumedAs = this.handleHoldWords(transcriptText, replyPlaying);
    if (consumedAs) {
      this.applyHoldSignal(hold);
      this.dropPhrase(phrase, consumedAs, transcriptText);
      this.maybeReleaseFloor(consumedAs);
      this.scheduleMonologueFlush();
      return;
    }
    // The user's words while the assistant speaks: the replies the user talked over (§5.6).
    const dropWord = DROP_WORDS.test(transcriptText);
    this.noteUserSpeech(phrase, transcriptText, dropWord, result.shortPhrase);
    if (this.queueForeign(phrase, transcriptText, result.shortPhrase)) {
      return;
    }
    if (!isUnverifiedShort(result.shortPhrase)) {
      this.applyHoldSignal(hold);
    }
    if (await this.steerWhileBusy(transcriptText, replyPlaying, phrase, result)) {
      return;
    }
    if (!isUnverifiedShort(result.shortPhrase)) {
      await this.cutForUserPhrase(phrase, dropWord);
    }

    // Hizuri: phrases may be recorded for the user's voice profile; keep the "Saved input audio"
    // lines out of the chat unless PASEO_SHOW_SAVED_AUDIO=1.
    if (result.debugRecordingPath && envFlag("PASEO_SHOW_SAVED_AUDIO", false)) {
      this.emit({
        type: "activity_log",
        payload: {
          id: uuidv4(),
          timestamp: new Date(),
          type: "system",
          content: `Saved input audio: ${result.debugRecordingPath}`,
          metadata: {
            recordingPath: result.debugRecordingPath,
            ...(result.format ? { format: result.format } : {}),
            requestId: result.requestId,
          },
        },
      });
    }

    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "transcript",
        content: result.text,
        metadata: {
          ...(result.language ? { language: result.language } : {}),
          ...(result.duration !== undefined ? { duration: result.duration } : {}),
        },
      },
    });

    this.clearSpeechInProgress("transcription complete");
    this.setPhase("idle");
    if (!this.isVoiceMode && !this.saidBeforeSuspend(phrase)) {
      this.sessionLogger.debug(
        { requestId: result.requestId },
        "Skipping voice agent processing because voice mode is disabled",
      );
      this.dropPhrase(phrase, "voice-off", transcriptText);
      await this.flushPendingAudioSegments("voice mode disabled");
      return;
    }

    const agentId = this.voiceModeAgentId;
    if (!agentId) {
      this.sessionLogger.warn(
        { requestId: result.requestId },
        "Skipping voice agent processing because no agent is currently voice-enabled",
      );
      this.dropPhrase(phrase, "no-agent", transcriptText);
      await this.flushPendingAudioSegments("no active voice agent");
      return;
    }

    this.queueMonologuePart({
      agentId,
      text: result.text,
      phrase,
      short: result.shortPhrase,
      situation: result.situation,
      steer: false,
    });
    await this.flushPendingAudioSegments("transcription complete");
  }

  /**
   * Hizuri (room turns): a phrase long enough to hold the assistant that was only a backchannel
   * (“uh-huh”, “yes”) holds nothing.
   */
  private noteBackchannel(phrase: PhraseMeta | null, text: string): void {
    if (!phrase || phrase.endedAt === undefined || !isBackchannel(text)) {
      return;
    }
    if (phrase.endedAt - phrase.spokenAt >= envNonNegative("PASEO_VOICE_BACKCHANNEL_MS", 1600)) {
      this.floorManager.noteBackchannel();
    }
  }

  /** Hizuri (situation.ts): every phrase back from the recogniser, for the situation tag. */
  private noteSituation(result: VoiceTranscriptionResultPayload): void {
    if (result.situation) {
      const words = result.text.trim() || result.droppedText?.trim();
      this.situationTracker.note(Date.now(), result.situation, Boolean(words));
    }
  }

  /**
   * Hizuri: a phrase the user began while voice was on, whose text came after voice paused
   * (switched to text mode, the connection dropped): the user's words, so they reach the agent like
   * the words already transcribed at the pause.
   */
  private saidBeforeSuspend(phrase: PhraseMeta | null): boolean {
    return Boolean(
      phrase &&
      this.voiceModeAgentId &&
      this.voiceSuspendedAt !== null &&
      phrase.spokenAt <= this.voiceSuspendedAt,
    );
  }

  /**
   * The user's phrase cuts whatever the assistant is saying or about to say, and goes along with it
   * (§5.6).
   */
  private async cutForUserPhrase(phrase: PhraseMeta | null, dropWord: boolean): Promise<void> {
    // Hizuri: the barge-in waits for a phrase with words (see onSpeechStarted).
    if (this.isVoiceMode && !this.bargeInOnVad()) {
      // The drop word abandons it: nothing of it goes along.
      this.markCutByUser(phrase?.spokenAt ?? Date.now(), dropWord);
      this.emit({ type: "voice_input_state", payload: { isSpeaking: true } });
      await this.handleAbort();
      this.emit({ type: "voice_input_state", payload: { isSpeaking: false } });
    }

    // Has content - abort any in-progress stream now
    this.createAbortController();
  }

  private async handleEmptyTranscript(): Promise<void> {
    this.sessionLogger.debug("Empty transcription (false positive), not aborting");
    // Hizuri: tell the user a phrase was heard but not recognised, instead of silence.
    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "error",
        content: this.language.emptyPhrase,
      },
    });
    this.setPhase("idle");
    this.clearSpeechInProgress("empty transcription");
    this.maybeReleaseFloor("no-phrase");
    await this.flushPendingAudioSegments("empty transcription");
  }

  private monologueSpeechStarted(): void {
    this.monologue.speaking = true;
    this.liveWords = "";
    this.floorManager.noteUserVoice(true, Date.now());
    this.clearMonologueGap();
    // Only a stop word cuts the front's line, as it cuts the assistant's (stopWordsOnly; the
    // barge-in paths stop any reply playing): brief room noise can open a phrase and otherwise cut
    // it.
    if (!stopWordsOnly() && this.floorManager.userSpeechStarted()) {
      this.sessionLogger.info("voice.fast_front_cut");
    }
  }

  private monologueSpeechStopped(): void {
    this.monologue.speaking = false;
    this.floorManager.noteUserVoice(false, Date.now());
    this.monologue.awaited += 1;
    this.judgeThoughtAtClose();
    this.scheduleMonologueFlush();
  }

  /**
   * Hizuri (room turns, floor-manager.ts): the moment the user's phrase closes, is the thought
   * finished? Judged on the words said, never by a timer: with the front's stream on, its answer
   * about these live words (it was asked while the user spoke; no new call); without it, the words
   * do not end on a joining word (“and”, “so that”…). Finished: the waiting reply may start now.
   * Otherwise it waits until the thought goes to the assistant (thoughtSent), and a later stream
   * answer checks again.
   */
  private judgeThoughtAtClose(): void {
    const live = this.liveWords.trim();
    if (!roomTurns() || this.monologue.speaking || !live || isBackchannel(live)) {
      return;
    }
    const thought = [this.monologueQuickText(), live].filter(Boolean).join(" ");
    const finished = streamDecides()
      ? this.frontStream?.peek(thought, true)?.state === "done"
      : !endsOpen(thought);
    if (finished) {
      this.sessionLogger.info({ front: streamDecides() }, "voice.room_turns.thought_finished");
      this.floorManager.thoughtSent();
    }
  }

  private queueMonologuePart(part: {
    agentId: string;
    text: string;
    phrase: PhraseMeta | null;
    short: ShortPhraseInfo | undefined;
    situation: PhraseSituation | undefined;
    /** Hizuri (front stream): the assistant is busy: the thought goes into the running turn. */
    steer: boolean;
  }): void {
    const m = this.monologue;
    if (m.parts.length > 0 && m.agentId !== part.agentId) {
      this.flushMonologue("agent changed");
    }
    m.agentId = part.agentId;
    m.parts.push(part.text);
    m.shorts.push(part.short ?? null);
    m.steer = part.steer;
    // New words: the front judges the thought afresh (a sound with no words keeps its clocks).
    m.heldAt = null;
    m.askedAt = null;
    if (part.situation) {
      m.situations.push(part.situation);
    }
    if (part.phrase) {
      m.phrases.push(part.phrase);
    }
    this.startFastReply(this.monologueQuickText());
    this.showPhrase(part.agentId, this.monologueQuickText(), { endedAt: part.phrase?.endedAt });
    if (m.capTimer) {
      clearTimeout(m.capTimer);
    }
    // Never hold a part forever, e.g. when a spoken part never comes back as a transcript.
    m.capTimer = setTimeout(
      () => this.flushMonologue("cap"),
      envPositive("PASEO_VOICE_MONOLOGUE_MAX_WAIT_MS", 20_000),
    );
    this.scheduleMonologueFlush();
  }

  private clearMonologueGap(): void {
    if (this.monologue.gapTimer) {
      clearTimeout(this.monologue.gapTimer);
      this.monologue.gapTimer = null;
    }
  }

  /**
   * The user is silent and every part spoken is transcribed: send after a short gap. With the
   * front's stream on, the front decides instead of the gap (decideThought).
   */
  private scheduleMonologueFlush(): void {
    const m = this.monologue;
    this.clearMonologueGap();
    if (!this.userWordsPending()) {
      // Every phrase of the user's came back empty, as noise, another voice or a hold word: the
      // thought holds none of the assistant's replies (room turns).
      this.floorManager.thoughtSent();
    }
    if (m.parts.length === 0 || m.speaking || m.awaited > 0) {
      return;
    }
    if (streamDecides() && this.isVoiceMode) {
      this.decideThought();
      return;
    }
    m.gapTimer = setTimeout(
      () => this.flushMonologue("silence"),
      envNonNegative("PASEO_VOICE_MONOLOGUE_GAP_MS", 1200),
    );
  }

  /**
   * Hizuri (front-stream.ts): the fast front, not a silence timer, says whether the user's thought
   * is finished. Finished: it goes to Zuri now, with the front's line. WAIT: it waits for more
   * words up to PASEO_FAST_FRONT_STREAM_HOLD_MS of silence, then goes with a note. The answer is
   * still coming: its arrival calls this again (at most PASEO_FAST_FRONT_STREAM_MAX_WAIT_MS). No
   * answer (timeout, budget): the old gap.
   */
  private decideThought(): void {
    const m = this.monologue;
    const text = this.monologueQuickText();
    const verdict = text ? this.stream().verdict(text) : null;
    switch (verdict?.state) {
      case "done":
        this.flushMonologue("front-done");
        return;
      case "wait": {
        m.heldAt ??= Date.now();
        const leftMs =
          envNonNegative("PASEO_FAST_FRONT_STREAM_HOLD_MS", 5000) - (Date.now() - m.heldAt);
        if (leftMs <= 0) {
          this.flushMonologue("front-wait-timeout");
          return;
        }
        this.sessionLogger.info({ leftMs }, "voice.front_stream.hold");
        m.gapTimer = setTimeout(() => this.flushMonologue("front-wait-timeout"), leftMs);
        return;
      }
      case "pending": {
        m.askedAt ??= Date.now();
        const leftMs =
          envPositive("PASEO_FAST_FRONT_STREAM_MAX_WAIT_MS", 5000) - (Date.now() - m.askedAt);
        if (leftMs <= 0) {
          this.flushMonologue("front-slow");
          return;
        }
        m.gapTimer = setTimeout(() => this.flushMonologue("front-slow"), leftMs);
        return;
      }
      default:
        // Only unverified short parts (the front never answers those), or no answer: the old gap.
        m.gapTimer = setTimeout(
          () => this.flushMonologue("silence"),
          envNonNegative("PASEO_VOICE_MONOLOGUE_GAP_MS", 1200),
        );
    }
  }

  /** Hizuri (front-stream.ts): the stream of this voice session, created on first use. */
  private stream(): FrontStream {
    this.frontStream ??= new FrontStream({
      ask: (text, kind) => this.askFront(text, kind),
      onAnswer: () => {
        this.judgeThoughtAtClose();
        this.scheduleMonologueFlush();
      },
      log: (event, message) => this.sessionLogger.info(event, message),
      minLiveWords: () => envPositive("PASEO_FAST_FRONT_STREAM_MIN_WORDS", 2),
    });
    return this.frontStream;
  }

  /**
   * Hizuri: chats whose provider gets no fast front (PASEO_FAST_FRONT_SKIP_PROVIDERS, comma list,
   * empty by default; configured in the user's profile). The front speaks as Zuri: in a chat with
   * another persona it would contradict that chat's own model.
   */
  private frontSkipsAgent(agentId: string): boolean {
    const skip = envString("PASEO_FAST_FRONT_SKIP_PROVIDERS", "")
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean);
    const provider = this.host.agentProvider?.(agentId) ?? null;
    return provider !== null && skip.includes(provider);
  }

  /** Hizuri (visual-front.ts): the live tab's scenes, made on first use. */
  private visual(): VisualFront {
    this.visualFront ??= new VisualFront({
      ask: (message) => sharedVisualFrontModel(this.sessionLogger).ask(message),
      draw: (input) => this.host.showLive?.(input) ?? Promise.resolve("no-stage"),
      facts: () => buildFrontFacts()?.text ?? null,
      mode: () => visualFrontMode(),
      log: (fields, message) => this.sessionLogger.info(fields, message),
    });
    return this.visualFront;
  }

  /**
   * Hizuri (visual front): the user's words so far go to the live tab; not in the chats the front
   * skips.
   */
  private showPhrase(
    agentId: string,
    text: string,
    options: { endedAt?: number; live?: boolean },
  ): void {
    if (!this.isVoiceMode || !text || this.frontSkipsAgent(agentId)) return;
    this.visual().phrase(agentId, text, options);
  }

  /**
   * Hizuri: the user's live words while speaking (a partial transcript): the thought so far, asked.
   */
  private streamLive(partial: string): void {
    if (
      !this.isVoiceMode ||
      !this.voiceModeAgentId ||
      !fastFrontStream() ||
      this.frontSkipsAgent(this.voiceModeAgentId)
    ) {
      return;
    }
    const thought = [this.monologueQuickText(), partial.trim()].filter(Boolean).join(" ");
    this.stream().live(thought);
  }

  /** Hizuri (front's cut): the assistant's own reply is playing, not the front's line. */
  private zuriSpeaks(): boolean {
    return this.ttsManager.isSpeaking() && this.fastReplyPlaying === null;
  }

  /** Hizuri (fast front): what Zuri is doing and the facts of its work, read fresh per question. */
  private frontWork(agentId: string): Pick<FastFrontInput, "status" | "facts"> {
    const items = this.host.agentTimeline?.(agentId) ?? [];
    const facts = fastFrontFacts() ? buildFrontFacts() : null;
    if ((facts?.text ?? null) !== this.frontFactsLogged) {
      this.frontFactsLogged = facts?.text ?? null;
      this.sessionLogger.info({ facts: this.frontFactsLogged }, "voice.fast_front.facts");
    }
    const status = buildStatusLine(items, this.host.hasActiveAgentRun(agentId), {
      tasks: !facts?.board,
    });
    return { status, facts };
  }

  /** Hizuri: one question to the fast front about the user's words so far (front-stream.ts). */
  private async askFront(text: string, kind: FrontAskKind): Promise<FrontStreamResult> {
    const agentId = this.voiceModeAgentId;
    if (!agentId || this.frontSkipsAgent(agentId)) {
      return { line: null, raw: "", why: "error", ms: 0, call: 0 };
    }
    const zuriSpeaking = frontMayCut() && this.zuriSpeaks();
    const result = await sharedFastFront(this.sessionLogger).respond({
      phrase: text,
      at: Date.now(),
      ...this.frontWork(agentId),
      graphDir: this.graph?.dir ?? null,
      language: this.language,
      stream: kind,
      situation: situationLine(
        this.situationTracker.situation(Date.now(), this.monologue.situations),
      ),
      ...(zuriSpeaking ? { zuriSpeaking: true } : {}),
    });
    return { ...result, ...(zuriSpeaking ? { zuriSpeaking: true } : {}) };
  }

  private flushMonologue(reason: string): void {
    const m = this.monologue;
    this.clearMonologueGap();
    if (m.capTimer) {
      clearTimeout(m.capTimer);
      m.capTimer = null;
    }
    if (m.parts.length === 0 || !m.agentId) {
      return;
    }
    this.visualFront?.sent();
    const text = m.parts.map((part, index) => withShortNote(part, m.shorts[index])).join(" ");
    const quickText = this.monologueQuickText();
    const parts = m.parts.length;
    const phrases = m.phrases;
    const situations = m.situations;
    // The front's answer about these words, when its stream judged them (front-stream.ts).
    const answer = fastFrontStream() ? (this.frontStream?.peek(quickText, true) ?? null) : null;
    const asks = this.frontStream?.asks ?? 0;
    const unfinishedMs =
      reason === "front-wait-timeout" && m.heldAt !== null ? Date.now() - m.heldAt : null;
    const steer = m.steer;
    m.parts = [];
    m.shorts = [];
    m.phrases = [];
    m.situations = [];
    m.steer = false;
    m.heldAt = null;
    m.askedAt = null;
    m.awaited = 0;
    this.floorManager.thoughtSent();
    this.frontStream?.reset();
    const lastEndedAt = phrases.at(-1)?.endedAt;
    this.sessionLogger.info(
      {
        parts,
        reason,
        textLength: text.length,
        ...(lastEndedAt !== undefined ? { sinceStopMs: Date.now() - lastEndedAt } : {}),
        ...(fastFrontStream() ? { front: answer?.state ?? "none", frontAsks: asks } : {}),
      },
      "voice.monologue_sent",
    );
    void this.sendMonologue({
      agentId: m.agentId,
      text,
      phrases,
      quickText,
      answer,
      unfinishedMs,
      steer,
      situations,
    }).catch((error: unknown) => {
      this.sessionLogger.warn({ err: error }, "voice.monologue_send_failed");
      this.recordDelivery(phrases, "normal", null, { ok: false, error: getErrorMessage(error) });
    });
  }

  /**
   * The fast brain (fast-reply.ts) or the fast front reacts aloud first; the agent gets the user's
   * words plus what was already said, and thinks the full answer meanwhile. With the front's stream
   * on, its line is already there (`answer`): no model call between the last word and the delivery.
   */
  private async sendMonologue(params: {
    agentId: string;
    text: string;
    phrases: PhraseMeta[];
    quickText: string;
    answer: FrontAnswer | null;
    unfinishedMs: number | null;
    steer: boolean;
    situations: PhraseSituation[];
  }): Promise<void> {
    const { agentId, text, phrases, quickText, answer } = params;
    // The user's phrase reaches the assistant now: replies sent from here on play again.
    this.releaseFloor("delivered");
    const pending = this.fastReplyPending;
    this.fastReplyPending = null;
    // Started when the last part arrived; only a stale guess (other words) is redone. Unverified
    // short parts never reach the quick voice: it would answer them aloud before Zuri judged them.
    let reply: Promise<string | null> | null = null;
    let said: FrontSaid | null = null;
    if (streamDecides()) {
      said = this.frontSpeaksStreamed(answer, quickText, phrases);
    } else if (fastFrontMode() !== "off") {
      said = await this.frontSays(quickText, phrases);
      if (fastFrontStream()) {
        this.sessionLogger.info(
          { answer, phrase: quickText.slice(0, 160) },
          "voice.front_stream.shadow_verdict",
        );
      }
    } else if (quickText) {
      reply = pending?.text === quickText ? pending.reply : this.fastReplyFor(quickText);
    }
    // After the front: a reply its line cut is one the user did not hear (withInterruptedReply).
    let message = this.withInterruptedReply(text) + frontNote(said);
    let quickSaid = false;
    if (reply) {
      const quick = await reply;
      if (quick) {
        quickSaid = true;
        this.fastReplyPlaying = this.speakFastReply(quick, phrases[0]?.id);
        message += `\n\n[Your quick voice already said aloud: “${quick}”. Do not repeat it; go straight to the substance.]`;
      }
    }
    if (params.unfinishedMs !== null) {
      message += unfinishedNote(params.unfinishedMs);
    }
    message += this.holdNote();
    message += this.situationSuffix(params.situations);
    const meta = this.spokenMeta(phrases);
    // Hizuri (front stream): a thought said while the assistant was busy goes into its running
    // turn.
    const steer = params.steer && this.host.hasActiveAgentRun(agentId);
    const result = await this.host.sendSpokenInput(agentId, message, steer, meta ?? undefined);
    this.recordDelivery(phrases, steer ? "steered" : "normal", meta, result);
    if (!(result && result.ok === false)) {
      // The face page sizes the thinking footage by it; a line already said aloud means a long
      // answer.
      this.emit({
        type: "voice_think_hint",
        payload: {
          thinkSeconds: this.thinkHint.seconds(said !== null || quickSaid),
          ...(phrases[0] ? { phraseId: phrases[0].id } : {}),
        },
      });
    }
  }

  /** Hizuri (situation.ts): the tag at the end of a message to Zuri; "" when tags are off. */
  private situationSuffix(phrases: readonly (PhraseSituation | null | undefined)[]): string {
    if (!situationTags()) {
      return "";
    }
    return `\n\n${situationNote(this.situationTracker.situation(Date.now(), phrases))}`;
  }

  private startFastReply(text: string): void {
    // The fast front answers the whole thought once, at the flush (each call enters its context).
    const reply = text && fastFrontMode() === "off" ? this.fastReplyFor(text) : null;
    this.fastReplyPending = reply ? { text, reply } : null;
  }

  /** Hizuri: the monologue's words for the quick voice, without unverified short phrases. */
  private monologueQuickText(): string {
    const m = this.monologue;
    return m.parts.filter((_, index) => !isUnverifiedShort(m.shorts[index] ?? undefined)).join(" ");
  }

  private fastReplyFor(text: string): Promise<string | null> | null {
    const config = this.isVoiceMode ? fastReplyConfigFromEnv() : null;
    if (!config) {
      return null;
    }
    return fastReply(
      config,
      {
        said: text,
        lastReply: this.lastSpokenReply?.text,
        turn: this.fastReplyTurn++,
        language: this.language,
      },
      this.sessionLogger,
    );
  }

  /**
   * Hizuri (fast front, fast-front.ts): one short line in Zuri's voice right after the user's
   * phrase; the floor manager decides whether it may be spoken now. Returns the line spoken, if
   * any; shadow mode only logs it.
   */
  private async frontSays(text: string, phrases: PhraseMeta[]): Promise<FrontSaid | null> {
    const mode = fastFrontMode();
    const agentId = this.voiceModeAgentId;
    if (mode === "off" || !this.isVoiceMode || !agentId || !text.trim()) {
      return null;
    }
    if (this.frontSkipsAgent(agentId)) {
      return null;
    }
    const compacting = this.compactingNow(agentId);
    if (compacting) {
      return this.frontSaysCompacting(compacting, mode, phrases);
    }
    const askedAt = Date.now();
    const zuriSpeaking = frontMayCut() && this.zuriSpeaks();
    const result = await sharedFastFront(this.sessionLogger).respond({
      phrase: text,
      at: askedAt,
      ...this.frontWork(agentId),
      graphDir: this.graph?.dir ?? null,
      language: this.language,
      ...(zuriSpeaking ? { zuriSpeaking: true } : {}),
    });
    return this.voiceFrontLine({
      mode,
      line: result.line,
      mayCutZuri: zuriSpeaking,
      phraseAt: askedAt,
      phrases,
      log: {
        call: result.call,
        ms: result.ms,
        ttftMs: result.ttftMs,
        phrase: text.slice(0, 160),
        raw: result.raw.slice(0, 200),
        why: result.why,
      },
    });
  }

  /**
   * Hizuri (front stream): the front's line was decided while the user spoke; it goes out now, as
   * the thought goes to Zuri. No line (WAIT ran out, SKIP, no answer): nothing is said.
   */
  private frontSpeaksStreamed(
    answer: FrontAnswer | null,
    text: string,
    phrases: PhraseMeta[],
  ): FrontSaid | null {
    if (!this.isVoiceMode || !this.voiceModeAgentId || !text.trim()) {
      return null;
    }
    const line = answer?.state === "done" ? answer.line : null;
    let why: string | undefined = "no-answer";
    if (answer?.state === "done") {
      why = answer.why;
    } else if (answer?.state === "none") {
      why = answer.why;
    } else if (answer) {
      why = answer.state;
    }
    return this.voiceFrontLine({
      mode: "on",
      line,
      mayCutZuri: answer?.state === "done" && answer.zuriSpeaking === true && frontMayCut(),
      phraseAt: Date.now(),
      phrases,
      log: { stream: true, phrase: text.slice(0, 160), why },
    });
  }

  /** Hizuri (fast front): the floor manager's say on a line, then the line spoken (or logged). */
  private voiceFrontLine(params: {
    mode: "on" | "shadow";
    line: string | null;
    mayCutZuri: boolean;
    phraseAt: number;
    phrases: PhraseMeta[];
    log: Record<string, unknown> & { why?: string };
  }): FrontSaid | null {
    const { mode, line, phrases } = params;
    const lastEndedAt = phrases.at(-1)?.endedAt;
    const floor = line
      ? this.floorManager.decide({
          userSpeech: this.monologue.speaking,
          zuriSpeaking: this.ttsManager.isSpeaking(),
          mayCutZuri: params.mayCutZuri,
          phraseAt: params.phraseAt,
          now: Date.now(),
        })
      : null;
    const spoken = mode === "on" && line !== null && floor?.speak === true;
    const cutZuri = spoken && floor?.speak === true && floor.cutZuri === true;
    this.sessionLogger.info(
      {
        mode,
        ...params.log,
        line,
        why: params.log.why ?? (floor && !floor.speak ? floor.reason : undefined),
        spoken,
        ...(cutZuri ? { cutZuri: true } : {}),
        ...(lastEndedAt !== undefined ? { sinceStopMs: Date.now() - lastEndedAt } : {}),
      },
      "voice.fast_front",
    );
    if (!spoken || !line) {
      return null;
    }
    if (cutZuri) {
      // The front cuts the assistant's reply to take the user's new item; the assistant re-plans.
      this.stopReplyPlayback("front-cut");
    }
    const playing = this.speakFastReply(line, phrases[0]?.id, this.floorManager.frontSignal());
    this.fastReplyPlaying = playing;
    this.floorManager.frontStarted(playing, Date.now());
    // Its answers to live words are never heard; only this one was, and it must know which.
    sharedFastFront(this.sessionLogger).noteZuri(line);
    return { line, cutZuri };
  }

  private compactingNow(agentId: string): CompactHoldState | null {
    return this.host.compactHold?.(agentId) ?? null;
  }

  /**
   * Hizuri (compact hold): while the assistant compacts, the front says so once per compaction,
   * then only "noted". Code picks the line, so it is said at once and never promises more.
   */
  private frontSaysCompacting(
    compacting: CompactHoldState,
    mode: "shadow" | "on",
    phrases: PhraseMeta[],
  ): FrontSaid | null {
    const first = this.compactToldSince !== compacting.since;
    const line = compactHoldLine(first, this.language);
    const now = Date.now();
    const floor = this.floorManager.decide({
      userSpeech: this.monologue.speaking,
      zuriSpeaking: this.ttsManager.isSpeaking(),
      phraseAt: now,
      now,
    });
    // The first line goes even right after another front line: the user must hear why the assistant
    // is silent.
    const free = floor.speak || (first && floor.reason === "front-spoke-recently");
    const spoken = mode === "on" && free;
    this.sessionLogger.info(
      {
        mode,
        line,
        why: floor.speak ? "compacting" : floor.reason,
        held: compacting.held,
        spoken,
      },
      "voice.fast_front",
    );
    if (!spoken) {
      return null;
    }
    if (first) {
      this.compactToldSince = compacting.since;
    }
    const playing = this.speakFastReply(line, phrases[0]?.id, this.floorManager.frontSignal());
    this.fastReplyPlaying = playing;
    this.floorManager.frontStarted(playing, now);
    sharedFastFront(this.sessionLogger).noteZuri(line);
    return { line, cutZuri: false };
  }

  private async speakFastReply(
    text: string,
    phraseId: string | undefined,
    signal?: AbortSignal,
  ): Promise<void> {
    const reply = this.openReply(text, phraseId ? [phraseId] : [], "fast-reply");
    try {
      await this.speakWhole({ text, signal, reply });
      this.emitAssistantText(text);
    } catch (error) {
      this.sessionLogger.warn({ err: getErrorMessage(error) }, "voice.fast_reply_speak_failed");
    } finally {
      this.fastReplyPlaying = null;
    }
  }

  /**
   * §5.6: when the user's words cut Zuri off, the new request carries what it was saying, so it
   * answers both in one reply instead of dropping the old answer. Every reply the user did not hear
   * goes along: the one the user's words cut and the ones held or cut behind it. Other voices that
   * waited while the assistant worked go along too (foreign-queue.ts).
   */
  private withInterruptedReply(spoken: string): string {
    const text = this.withWaitingForeign(spoken);
    const now = Date.now();
    const unheard = this.replies.filter(
      (reply) =>
        reply.source === "speak" &&
        !reply.noticed &&
        !reply.byDrop &&
        (reply.cutByUser || (reply.state === "ended" && !reply.delivered && reply.userSpeechAt)) &&
        now - (reply.endedAt ?? now) <= INTERRUPTED_REPLY_TTL_MS,
    );
    if (unheard.length === 0) {
      return text;
    }
    for (const reply of unheard) {
      reply.noticed = true;
    }
    const quote = (said: string) => (said.length > 600 ? `${said.slice(0, 600)}…` : said);
    const [first, ...later] = unheard;
    const heard = this.heardSoFar(first);
    const heardNote = heard ? ` The user heard only: “${quote(heard)}”.` : "";
    const laterNote =
      later.length > 0
        ? ` The user did not hear your next ${later.length === 1 ? "reply" : "replies"} either: ${later
            .map((reply) => `“${quote(reply.text)}”`)
            .join("; ")}.`
        : "";
    this.sessionLogger.info(
      { replies: unheard.map((reply) => reply.id), interruptedLength: first.text.length },
      "voice.interrupted_reply_merged",
    );
    return `${text}\n\n[The user interrupted you while you were saying: “${quote(first.text)}”.${heardNote}${laterNote} Give one answer that covers ${later.length > 0 ? "all of it" : "both"}. Add the rest of what you were saying only if it still matters, briefly, without repeating what the user already heard; link it the way people do (“about X you asked earlier: …”), never with a set word like “finishing”. Drop what the user corrected or overtook. Then answer the user's new words.]`;
  }

  /** The whole sentences of a reply the user heard before speaking (empty when unknown). */
  private heardSoFar(reply: ReplyRecord): string {
    if (!reply.jobId) {
      return "";
    }
    const cutoff = this.heardCutoff(reply, this.ttsManager.firstAudioAt(reply.jobId), "cut");
    return this.ttsManager.heardSplit(reply.jobId, cutoff ?? Date.now())?.heard ?? "";
  }

  /**
   * Hizuri (phrase graph): the wall-clock time up to which a reply counts as heard. When the user
   * started speaking during it, the sentence they started in is unheard, with
   * PASEO_VOICE_HEARD_MARGIN_MS (2000) before the start, since the start comes before the stop;
   * a reply cut for another reason counts up to the same margin before the cut. Null = all heard.
   */
  private heardCutoff(
    reply: ReplyRecord,
    playStartedAt: number | null,
    outcome: ReplyOutcome,
  ): number | null {
    const marginMs = envNonNegative("PASEO_VOICE_HEARD_MARGIN_MS", 2000);
    if (reply.userSpeechAt !== null) {
      return Math.max(reply.userSpeechAt, playStartedAt ?? reply.userSpeechAt) - marginMs;
    }
    return outcome === "played" ? null : Date.now() - marginMs;
  }

  private openReply(
    text: string,
    replyTo: string[],
    source: ReplyRecord["source"],
    carries: string[] = [],
  ): ReplyRecord {
    this.replyCounter += 1;
    const reply: ReplyRecord = {
      id: this.graph?.nextReplyId() ?? `r${this.replyCounter}`,
      text,
      replyTo,
      carries,
      source,
      queuedAt: Date.now(),
      jobId: null,
      playStartedAt: null,
      state: "live",
      userSpeechAt: null,
      cutByUser: false,
      byDrop: false,
      noticed: false,
      endedAt: null,
      delivered: false,
      superseded: false,
      continues: null,
    };
    this.replies = [...this.replies.slice(1 - REPLY_LEDGER_SIZE), reply];
    return reply;
  }

  private replyStartedAt(reply: ReplyRecord): number | null {
    return reply.playStartedAt ?? (reply.jobId ? this.ttsManager.firstAudioAt(reply.jobId) : null);
  }

  /**
   * Hizuri (face): the gap from the user's phrase's delivery to the assistant's first played answer
   * to it.
   */
  private recordThinkGap(reply: ReplyRecord): void {
    const startedAt = this.replyStartedAt(reply);
    if (reply.source !== "speak" || startedAt === null) {
      return;
    }
    for (const id of reply.replyTo) {
      const deliveredAt = this.phraseDeliveries.get(id)?.deliveredAt;
      if (deliveredAt === undefined || this.thinkGapCounted.has(id)) {
        continue;
      }
      this.thinkGapCounted.add(id);
      this.thinkHint.recordGap(startedAt - deliveredAt);
    }
    while (this.thinkGapCounted.size > 100) {
      const oldest = this.thinkGapCounted.values().next().value;
      if (oldest === undefined) {
        break;
      }
      this.thinkGapCounted.delete(oldest);
    }
  }

  /** The reply is over: its graph record, with what the user heard of it. */
  private endReply(
    reply: ReplyRecord,
    end: {
      outcome: ReplyOutcome;
      heard: string;
      unheard: string;
      cutReason?: string;
      firstAudioMs?: number | null;
      emitted?: number;
      chunks?: number;
    },
  ): void {
    reply.state = "ended";
    reply.endedAt = Date.now();
    this.recordThinkGap(reply);
    reply.delivered = end.outcome === "played" && end.unheard === "";
    // The app's stop button and the user's phrase share the abort; the user's phrase is named
    // apart.
    const cutReason =
      reply.cutByUser && end.cutReason === "abort request" ? "user-phrase" : end.cutReason;
    this.graph?.reply({
      id: reply.id,
      text: reply.text,
      replyTo: reply.replyTo,
      ...(reply.carries.length ? { carries: reply.carries } : {}),
      source: reply.source,
      jobId: reply.jobId,
      queuedAt: reply.queuedAt,
      playStartedAt: this.replyStartedAt(reply),
      endedAt: reply.endedAt,
      outcome: end.outcome,
      delivered: reply.delivered,
      heardText: end.heard,
      unheardText: end.unheard,
      ...(cutReason ? { cutReason } : {}),
      ...(reply.cutByUser ? { interrupted: true } : {}),
      userSpeechAt: reply.userSpeechAt,
      ...(end.firstAudioMs !== undefined ? { firstAudioMs: end.firstAudioMs } : {}),
      ...(end.emitted !== undefined ? { emitted: end.emitted } : {}),
      ...(end.chunks !== undefined ? { chunks: end.chunks } : {}),
      session: this.sessionId.slice(0, 8),
    });
  }

  private endQueuedReply(reply: ReplyRecord, info: SpeechJobEnd): void {
    reply.jobId = info.jobId;
    reply.playStartedAt = info.firstAudioAt;
    let outcome: ReplyOutcome = "played";
    if (info.outcome === "error") {
      outcome = "error";
    } else if (info.cancelReason === "superseded") {
      outcome = "superseded";
    } else if (info.outcome !== "played") {
      outcome = info.emitted > 0 ? "cut" : "never-started";
    }
    const cutoff = this.heardCutoff(reply, info.firstAudioAt, outcome);
    const split = this.ttsManager.heardSplit(info.jobId, cutoff ?? Number.MAX_SAFE_INTEGER) ?? {
      heard: "",
      unheard: spokenBody(reply.text),
    };
    this.endReply(reply, {
      outcome,
      heard: split.heard,
      unheard: split.unheard,
      cutReason: info.cancelReason ?? (info.outcome === "timeout" ? "timeout" : undefined),
      firstAudioMs: info.firstAudioMs,
      emitted: info.emitted,
      chunks: info.chunks,
    });
  }

  /** The non-queue path knows only whether the whole reply played. */
  private endWholeReply(reply: ReplyRecord, outcome: ReplyOutcome): void {
    const body = spokenBody(reply.text);
    const allHeard = outcome === "played" && reply.userSpeechAt === null;
    this.endReply(reply, {
      outcome,
      heard: allHeard ? body : "",
      unheard: allHeard ? "" : body,
      ...(outcome === "played" ? {} : { cutReason: reply.cutByUser ? "user-phrase" : "cancelled" }),
    });
  }

  /**
   * The user's phrase came while the assistant was speaking (or right after a reply that started
   * during it): the replies the user talked over. A live reply gets the user's start time; a reply
   * that already played in full gets a correction (`heard` event). A short "yes" or "mm-hm" does
   * not count.
   */
  private noteUserSpeech(
    phrase: PhraseMeta | null,
    text: string,
    dropWord: boolean,
    short: ShortPhraseInfo | undefined,
  ): void {
    if (isUnverifiedShort(short) || hasTooFewWords(text, this.sttLanguage)) {
      return;
    }
    const startAt = phrase?.spokenAt ?? Date.now();
    const endAt = phrase?.endedAt ?? Date.now();
    for (const reply of this.replies) {
      const started = this.replyStartedAt(reply);
      if (started === null || started > endAt) {
        continue;
      }
      if (reply.state === "live") {
        reply.userSpeechAt = Math.min(reply.userSpeechAt ?? startAt, startAt);
        reply.byDrop = reply.byDrop || dropWord;
      } else if (phrase && reply.delivered && (reply.endedAt ?? 0) >= startAt) {
        this.correctTalkedOver(reply, phrase, started);
      }
    }
  }

  /**
   * A reply that played in full while the user talked: the graph learns the user did not hear all
   * of it.
   */
  private correctTalkedOver(reply: ReplyRecord, phrase: PhraseMeta, started: number): void {
    if (!reply.jobId) {
      return;
    }
    reply.userSpeechAt = phrase.spokenAt;
    const cutoff = this.heardCutoff(reply, started, "played") ?? Date.now();
    const split = this.ttsManager.heardSplit(reply.jobId, cutoff);
    if (split && split.unheard) {
      reply.delivered = false;
      this.graph?.heard({
        id: reply.id,
        heardText: split.heard,
        unheardText: split.unheard,
        byPhrase: phrase.id,
        userSpeechAt: phrase.spokenAt,
      });
    }
  }

  /**
   * The user's words stop whatever the assistant says or is about to say; the drop word drops it
   * for good.
   */
  private markCutByUser(at: number, dropWord: boolean): void {
    for (const reply of this.replies) {
      if (reply.state !== "live") {
        continue;
      }
      reply.cutByUser = true;
      reply.byDrop = reply.byDrop || dropWord;
      if (this.replyStartedAt(reply) !== null) {
        reply.userSpeechAt = Math.min(reply.userSpeechAt ?? at, at);
      }
    }
  }

  /**
   * The user's words stopped the assistant: the phrase holds the floor until it reaches the agent.
   */
  private takeFloor(): void {
    if (!this.floor) {
      this.floor = { since: Date.now() };
      this.sessionLogger.info("voice.floor_taken");
    }
  }

  private releaseFloor(reason: string): void {
    if (this.floor) {
      this.sessionLogger.info(
        { reason, heldMs: Date.now() - this.floor.since },
        "voice.floor_released",
      );
      this.floor = null;
    }
  }

  /** Nothing of the user's is pending any more (an empty or consumed phrase): the floor is free. */
  private maybeReleaseFloor(reason: string): void {
    const m = this.monologue;
    if (!m.speaking && m.awaited === 0 && m.parts.length === 0) {
      this.releaseFloor(reason);
    }
  }

  /**
   * True while the user's phrase holds the floor; a stale floor (no phrase came) is released here.
   */
  private holdsFloor(): boolean {
    const floor = this.floor;
    if (!floor) {
      return false;
    }
    const m = this.monologue;
    const idle = !m.speaking && m.awaited === 0 && m.parts.length === 0;
    const ageMs = Date.now() - floor.since;
    if ((idle && ageMs > 3000) || ageMs > FLOOR_MAX_MS) {
      this.releaseFloor(idle ? "no-phrase" : "max");
      return false;
    }
    return true;
  }

  /**
   * Hizuri (floor gate, floor-manager.ts): the assistant's reply starts only in the user's pause.
   * True = play, false = a newer reply superseded it. The speak call returns (“waiting”) at once
   * during a hold, and after PASEO_TTS_DETACH_HOLD_MS of waiting otherwise; the reply waits on.
   * Outside a hold, after PASEO_VOICE_FLOOR_MAX_WAIT_MS it starts in the next gap even when the
   * gap is short: a television talking for minutes must not mute the assistant.
   */
  private async waitForFloor(
    reply: ReplyRecord,
    gate: { waiting(reason: string): void; cancelled: Promise<void> },
  ): Promise<boolean> {
    if (!envFlag("PASEO_VOICE_FLOOR_GATE", true)) {
      return true;
    }
    const state = { cancelled: false };
    void gate.cancelled.then(() => {
      state.cancelled = true;
      return undefined;
    });
    const startedAt = Date.now();
    let waitedFor: ZuriWaitReason | null = null;
    this.waitingReplies.add(reply);
    try {
      while (!state.cancelled && !reply.superseded) {
        const now = Date.now();
        const verdict = this.mayStartNow(now);
        if (verdict.start) {
          break;
        }
        const waitedMs = now - startedAt;
        const maxMs = envNonNegative("PASEO_VOICE_FLOOR_MAX_WAIT_MS", 60_000);
        // The cap lets it start in the user's next gap, never over an open phrase or during a hold.
        const gap = verdict.reason === "short-pause" || verdict.reason === "user-thought";
        if (gap && maxMs > 0 && waitedMs >= maxMs) {
          this.sessionLogger.info({ replyId: reply.id, waitedMs }, "voice.floor_wait_cap");
          break;
        }
        if (waitedFor === null) {
          this.sessionLogger.info(
            { replyId: reply.id, reason: verdict.reason },
            "voice.floor_wait",
          );
        }
        waitedFor = verdict.reason;
        const detachMs = envNonNegative("PASEO_TTS_DETACH_HOLD_MS", 8000);
        if (verdict.reason === "hold" || (detachMs > 0 && waitedMs >= detachMs)) {
          gate.waiting(verdict.reason);
        }
        await Promise.race([
          new Promise((done) => setTimeout(done, FLOOR_POLL_MS)),
          gate.cancelled,
        ]);
      }
    } finally {
      this.waitingReplies.delete(reply);
    }
    if (waitedFor !== null) {
      this.sessionLogger.info(
        {
          replyId: reply.id,
          waitedMs: Date.now() - startedAt,
          last: waitedFor,
          ...(reply.superseded ? { superseded: true } : {}),
        },
        "voice.floor_free",
      );
    }
    return !reply.superseded;
  }

  /**
   * A reply of the assistant's was audible during the user's phrase (a stop word in it is then
   * meant for the assistant).
   */
  private assistantSpokeDuring(phrase: PhraseMeta | null): boolean {
    if (this.ttsManager.replyStarted()) {
      return true;
    }
    const from = phrase?.spokenAt ?? Date.now();
    const to = phrase?.endedAt ?? Date.now();
    return this.replies.some((reply) => {
      const started = this.replyStartedAt(reply);
      return (
        started !== null && started <= to && (reply.endedAt ?? Number.POSITIVE_INFINITY) >= from
      );
    });
  }

  /**
   * Hizuri (hold, floor-manager.ts): “wait, let me finish” holds every reply of the assistant's
   * until the user asks something, gives an order, says they are done, or stays silent
   * PASEO_VOICE_HOLD_SILENCE_MS. PASEO_VOICE_HOLD=0 turns it off.
   */
  private applyHoldSignal(signal: HoldSignal | null): void {
    if (!signal || !this.isVoiceMode) {
      return;
    }
    if (signal.kind === "start") {
      if (!envFlag("PASEO_VOICE_HOLD", true)) {
        return;
      }
      if (this.floorManager.startHold(signal.reason, Date.now())) {
        this.sessionLogger.info({ reason: signal.reason }, "voice.hold_on");
        this.holdTicker = setInterval(() => this.checkHoldSilence(), 250);
        this.writeFloorFile();
      }
      return;
    }
    this.endHold(signal.reason);
  }

  private endHold(reason: string): void {
    const ended = this.floorManager.endHold();
    if (this.holdTicker) {
      clearInterval(this.holdTicker);
      this.holdTicker = null;
    }
    if (ended) {
      this.sessionLogger.info(
        { reason, started: ended.reason, heldMs: Date.now() - ended.since },
        "voice.hold_off",
      );
      this.writeFloorFile({ endReason: reason });
    }
  }

  private checkHoldSilence(): void {
    const now = Date.now();
    if (
      this.floorManager.holdSilenceOver(now, envPositive("PASEO_VOICE_HOLD_SILENCE_MS", 20_000))
    ) {
      this.endHold("silence");
    } else if (now - this.floorFileWrittenAt >= FLOOR_FILE_REFRESH_MS) {
      this.writeFloorFile();
    }
  }

  /** While a hold is on, every message to the assistant says so. */
  private holdNote(): string {
    const hold = this.floorManager.hold();
    if (!hold) {
      return "";
    }
    const silenceS = Math.round(envPositive("PASEO_VOICE_HOLD_SILENCE_MS", 20_000) / 1000);
    return `\n\n[Hold: the user asked you to let them finish (${hold.reason}). Any speak now waits until the user asks you something, gives an order, says they are done, or is silent ${silenceS} s. Sign the user's phrases as recorded (mark_phrases); answer when the user is done.]`;
  }

  /**
   * `<paseoHome>/voice-floor.json` for the assistant's hooks: {hold, since, reason, updatedAt}.
   * Rewritten every few seconds while a hold is on, so a reader treats an old `updatedAt` as no
   * hold (a daemon that died mid-hold).
   */
  private writeFloorFile(extra: { endReason?: string } = {}): void {
    const file = this.owner?.floorFile;
    if (!file) {
      return;
    }
    const now = Date.now();
    this.floorFileWrittenAt = now;
    const hold = this.floorManager.hold();
    const body = JSON.stringify({
      hold: hold !== null,
      since: hold ? new Date(hold.since).toISOString() : null,
      reason: hold?.reason ?? null,
      ...(extra.endReason ? { endReason: extra.endReason } : {}),
      updatedAt: new Date(now).toISOString(),
    });
    const tmp = `${file}.${process.pid}.tmp`;
    void writeFile(tmp, `${body}\n`)
      .then(() => rename(tmp, file))
      .catch((error: unknown) => {
        this.sessionLogger.warn({ err: getErrorMessage(error) }, "voice.floor_file_failed");
      });
  }

  /** A new reply of the assistant's replaces every older one still waiting for the user's pause. */
  private supersedeWaiting(newer: ReplyRecord): void {
    // The assistant often says one answer in two calls ("The plan is ready," + "— and it has three
    // steps"): the second goes on from the first and plays after it. Without this a half sentence
    // would play alone.
    const previous = this.replies.findLast(
      (reply) => reply !== newer && reply.source === "speak" && reply.state === "live",
    );
    if (previous && CONTINUATION.test(spokenBody(newer.text))) {
      newer.continues = previous;
      return;
    }
    for (const reply of this.waitingReplies) {
      if (reply !== newer && !reply.superseded) {
        this.supersede(reply, newer);
      }
    }
  }

  /** The reply, and every unplayed reply going on from it, will not be said. */
  private supersede(reply: ReplyRecord, by: ReplyRecord): void {
    reply.superseded = true;
    this.sessionLogger.info({ replyId: reply.id, by: by.id }, "voice.reply_superseded");
    for (const later of this.replies) {
      if (later.continues === reply && later.state === "live" && !later.superseded) {
        this.supersede(later, by);
      }
    }
  }

  /** A reply sent while the user's phrase holds the floor: never played, listed for the agent. */
  private holdReply(reply: ReplyRecord): void {
    reply.cutByUser = true;
    this.sessionLogger.info(
      { replyId: reply.id, textLength: reply.text.length },
      "voice.reply_held",
    );
    this.endReply(reply, {
      outcome: "held",
      heard: "",
      unheard: spokenBody(reply.text),
      cutReason: "held",
    });
  }

  private dropPhrase(phrase: PhraseMeta | null, reason: string, text: string): void {
    if (!phrase || !this.graph) {
      return;
    }
    this.graph.phrase({
      id: phrase.id,
      spokenAt: phrase.spokenAt,
      ...(phrase.endedAt !== undefined ? { endedAt: phrase.endedAt } : {}),
      text,
      delivery: "dropped",
      reason,
      ...(phrase.short ? { short: phrase.short } : {}),
      session: this.sessionId.slice(0, 8),
    });
  }

  /**
   * The id Zuri signs for; late when a phrase the user started later already reached the assistant.
   */
  private spokenMeta(phrases: PhraseMeta[]): SpokenInputMeta | null {
    if (phrases.length === 0) {
      return null;
    }
    const numbers = phrases.map((phrase) => Number(phrase.id.slice(1))).filter(Number.isFinite);
    const highest = Math.max(...numbers);
    const later = this.deliveredPhraseNumbers.filter((n) => n > highest);
    this.deliveredPhraseNumbers = [...this.deliveredPhraseNumbers, ...numbers].slice(-200);
    return {
      id: phrases[0].id,
      ...(phrases.length > 1 ? { parts: phrases.map((phrase) => phrase.id) } : {}),
      ...(later.length > 0 ? { late: true, saidBefore: `p${Math.min(...later)}` } : {}),
      ...(phrases.some((phrase) => phrase.short) ? { short: true } : {}),
    };
  }

  /** Every phrase of a message gets its graph record: delivered, or dropped when the send failed. */
  private recordDelivery(
    phrases: PhraseMeta[],
    delivery: Exclude<PhraseDelivery, "dropped">,
    meta: SpokenInputMeta | null,
    result: void | { ok: true } | { ok: false; error: string },
  ): void {
    const failed = result && result.ok === false ? result.error : null;
    const deliveredAt = Date.now();
    phrases.forEach((phrase, index) => {
      if (failed !== null) {
        this.dropPhrase(phrase, `send-failed: ${failed}`, phrase.text);
        return;
      }
      const record: PhraseEventInput = {
        id: phrase.id,
        spokenAt: phrase.spokenAt,
        ...(phrase.endedAt !== undefined ? { endedAt: phrase.endedAt } : {}),
        text: phrase.text,
        ...(phrase.draft ? { draft: true } : {}),
        delivery,
        deliveredAt,
        ...(meta ? { message: meta.id } : {}),
        ...(index === 0 && meta?.parts ? { parts: meta.parts } : {}),
        ...(meta?.late ? { late: true, saidBefore: meta.saidBefore } : {}),
        ...(phrase.short ? { short: phrase.short } : {}),
        session: this.sessionId.slice(0, 8),
      };
      this.phraseDeliveries.set(phrase.id, record);
      while (this.phraseDeliveries.size > 100) {
        const oldest = this.phraseDeliveries.keys().next().value;
        if (oldest === undefined) {
          break;
        }
        this.phraseDeliveries.delete(oldest);
      }
      this.graph?.phrase(record);
    });
  }

  /**
   * Hizuri (drafts): the recogniser's final text of a phrase that went on as a quick draft and says
   * other words. A phrase still waiting in the monologue gets the text in place; a phrase the agent
   * already has gets a short correction tied to its id, steered into the assistant's turn so it
   * never cuts its answer; a phrase that never reached it (a stop word, voice off) stays as it was.
   */
  private async handleDraftCorrection(input: {
    text: string;
    draftText: string;
    phraseId?: string;
  }): Promise<void> {
    const { text, draftText, phraseId } = input;
    const m = this.monologue;
    // Parts and phrases line up when the graph gives ids; without it only parts exist.
    const byId = phraseId !== undefined && m.parts.length === m.phrases.length;
    const index = byId
      ? m.phrases.findIndex((phrase) => phrase.id === phraseId)
      : m.parts.lastIndexOf(draftText);
    if (index >= 0 && m.parts[index] === draftText) {
      this.applyHoldSignal(holdSignal(text, this.ttsManager.replyStarted()));
      m.parts[index] = text;
      const phrase = m.phrases[index];
      if (phrase) {
        m.phrases[index] = { ...phrase, text, draft: false };
      }
      this.startFastReply(this.monologueQuickText());
      this.sessionLogger.info({ phraseId, draftText, text }, "voice.draft_corrected_in_place");
      return;
    }
    // A phrase of another voice still waiting takes the final text in place (foreign-queue.ts).
    if (phraseId && this.foreignQueue.correct(phraseId, text)) {
      this.sessionLogger.info({ phraseId, draftText, text }, "voice.draft_corrected_in_queue");
      return;
    }
    const delivered = phraseId ? this.phraseDeliveries.get(phraseId) : undefined;
    const agentId = this.voiceModeAgentId;
    // A phrase the assistant already has is corrected even after voice paused.
    if ((phraseId && !delivered) || !agentId || (!this.isVoiceMode && !delivered)) {
      this.sessionLogger.info({ phraseId, draftText, text }, "voice.draft_correction_skipped");
      return;
    }
    this.sessionLogger.info({ phraseId, draftText, text }, "voice.draft_correction_sent");
    this.applyHoldSignal(holdSignal(text, this.ttsManager.replyStarted()));
    const result = await this.host.sendSpokenInput(agentId, text, true, {
      id: phraseId ?? "",
      correction: true,
    });
    if (delivered) {
      // The latest line of an id is its state: the same record with the final text.
      const { draft: _draft, ...rest } = delivered;
      const corrected: PhraseEventInput = {
        ...rest,
        text,
        correctedFrom: draftText,
        ...(result && result.ok === false ? { reason: `correction-failed: ${result.error}` } : {}),
      };
      this.phraseDeliveries.set(delivered.id, corrected);
      this.graph?.phrase(corrected);
    }
  }

  /** Hizuri: PASEO_VOICE_BARGE_IN_ON_VAD=1 interrupts on the detector's event (upstream). */
  private bargeInOnVad(): boolean {
    return envFlag("PASEO_VOICE_BARGE_IN_ON_VAD", false);
  }

  private emitTranscriptionResult(result: VoiceTranscriptionResultPayload): void {
    this.emit({
      type: "transcription_result",
      payload: {
        text: result.text,
        ...(result.language ? { language: result.language } : {}),
        ...(result.duration !== undefined ? { duration: result.duration } : {}),
        requestId: result.requestId,
        ...(result.avgLogprob !== undefined ? { avgLogprob: result.avgLogprob } : {}),
        ...(result.isLowConfidence !== undefined
          ? { isLowConfidence: result.isLowConfidence }
          : {}),
        ...(result.byteLength !== undefined ? { byteLength: result.byteLength } : {}),
        ...(result.format ? { format: result.format } : {}),
        ...(result.debugRecordingPath ? { debugRecordingPath: result.debugRecordingPath } : {}),
      },
    });
  }

  /**
   * Hizuri: PASEO_OWNER_RECORD_DIR keeps every phrase as a WAV (the phrase plus ~1.5 s around it
   * from the recent-audio buffer), named by time and transcript; unrecognised ones too.
   */
  private archiveOwnerPhrase(transcriptText: string, durationMs: number | undefined): void {
    const recordDir = this.owner?.recordDir;
    if (!recordDir || !this.voiceTurnController) {
      return;
    }
    const ms = Math.min(30_000, (durationMs || 4000) + 1500);
    const snap = this.voiceTurnController.snapshotSpeech(ms);
    if (snap.pcm.length === 0) {
      return;
    }
    const label = transcriptText
      ? transcriptText.slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, "-")
      : "_unrecognised";
    const name = `${new Date().toISOString().replace(/[:.]/g, "-")}_${label}.wav`;
    const wav = convertPCMToWavBuffer(snap.pcm, PCM_SAMPLE_RATE, PCM_CHANNELS, PCM_BITS_PER_SAMPLE);
    mkdir(recordDir, { recursive: true })
      .then(() => writeFile(path.join(recordDir, name), wav))
      .catch((error) =>
        this.sessionLogger.warn({ err: getErrorMessage(error) }, "owner_record.failed"),
      );
  }

  /**
   * Hizuri: stop, continue and drop words while a reply is spoken (PASEO_BARGE_HOLD=1, both
   * modes). A pure pause request ("Zuri, wait, someone's calling me", isPausePhrase) pauses the reply
   * until a continue word; neither phrase reaches the agent. The drop word drops the reply and still
   * goes to the agent. Returns why the phrase was consumed (the graph's drop reason), else null.
   */
  private handleHoldWords(transcriptText: string, replyPlaying: boolean): string | null {
    const bargeHold = this.bargeHold;
    if (!this.isVoiceMode || !bargeHold) {
      return null;
    }
    // Speech of a turn: the agent's turn runs now, or its paused/queued speech came from one.
    // Speech started outside any turn keeps the old path (a stop word is a message).
    const turnSpeech =
      (this.voiceModeAgentId !== null && this.host.hasActiveAgentRun(this.voiceModeAgentId)) ||
      this.ttsManager.hasTurnSpeech();
    const { plain, words } = plainWords(transcriptText);
    if (DROP_WORDS.test(plain) && this.ttsManager.isSpeaking()) {
      this.ttsManager.dropAllSpeech("drop-word");
      bargeHold.resume("drop-word");
      this.stopReplyPlayback("drop-word");
      this.sessionLogger.info({ transcript: transcriptText }, "barge_hold.drop_word");
    }
    if (bargeHold.isSticky() && words <= 4 && CONTINUE_WORDS.test(plain)) {
      bargeHold.resume("continue-word");
      this.sessionLogger.info({ transcript: transcriptText }, "barge_hold.continue_word");
      this.setPhase("idle");
      this.clearSpeechInProgress("continue word");
      return "continue-word";
    }
    // Only a bare stop phrase holds until a continue word; a sentence that merely starts with
    // one ("wait, the main question…") is an ordinary interruption.
    if (replyPlaying && turnSpeech && isPausePhrase(plain) && bargeHold.stickyHold("stop-word")) {
      this.sessionLogger.info({ transcript: transcriptText }, "barge_hold.stop_word");
      this.setPhase("idle");
      this.clearSpeechInProgress("stop word");
      return "stop-word";
    }
    // A stop word and then something real (3+ words): the user moved on. The paused rest is
    // dropped so the answer is not stuck behind it; PASEO_STICKY_DROP_ON_SPEECH=0 keeps it.
    if (
      bargeHold.isSticky() &&
      words >= 3 &&
      !pauseWords().test(plain) &&
      envFlag("PASEO_STICKY_DROP_ON_SPEECH", true)
    ) {
      this.ttsManager.dropHeadSpeech("user-moved-on");
      bargeHold.resume("user-moved-on");
      this.sessionLogger.info({ transcript: transcriptText }, "barge_hold.sticky_dropped");
    }
    return null;
  }

  /**
   * Hizuri (foreign-queue.ts): while the assistant works, a phrase the voice print calls another
   * voice waits instead of steering into its turn. True = the phrase is queued (graph:
   * `queued-foreign`).
   */
  private queueForeign(
    phrase: PhraseMeta | null,
    transcriptText: string,
    short: ShortPhraseInfo | undefined,
  ): boolean {
    const agentId = this.voiceModeAgentId;
    if (
      !phrase ||
      !agentId ||
      (!this.isVoiceMode && !this.saidBeforeSuspend(phrase)) ||
      !this.host.hasActiveAgentRun(agentId) ||
      !waitsAsForeign(transcriptText, short)
    ) {
      return false;
    }
    this.setPhase("idle");
    this.clearSpeechInProgress("other voice, queued");
    this.foreignQueue.add(agentId, phrase);
    this.graph?.phrase({
      id: phrase.id,
      spokenAt: phrase.spokenAt,
      ...(phrase.endedAt !== undefined ? { endedAt: phrase.endedAt } : {}),
      text: transcriptText,
      delivery: "queued-foreign",
      reason: "other-voice",
      ...(phrase.short ? { short: phrase.short } : {}),
      session: this.sessionId.slice(0, 8),
    });
    this.maybeReleaseFloor("foreign-queued");
    this.scheduleMonologueFlush();
    return true;
  }

  /**
   * The user's words are on their way to the assistant (and will carry the waiting phrases along).
   */
  private userWordsPending(): boolean {
    const m = this.monologue;
    return m.speaking || m.awaited > 0 || m.parts.length > 0;
  }

  /** The other voices that waited, after the user's words in the same message. */
  private withWaitingForeign(text: string): string {
    const agentId = this.voiceModeAgentId;
    const phrases = agentId ? this.foreignQueue.take(agentId) : [];
    if (phrases.length === 0) {
      return text;
    }
    this.recordDelivery(phrases, "queued-foreign", this.foreignMeta(phrases), undefined);
    return `${text}\n\n${foreignNote(phrases)}`;
  }

  /**
   * One id signs them all; no “said this before” or short-phrase notes: they are not the user's.
   */
  private foreignMeta(phrases: PhraseMeta[]): SpokenInputMeta | null {
    const meta = this.spokenMeta(phrases);
    return meta ? { id: meta.id, ...(meta.parts ? { parts: meta.parts } : {}) } : null;
  }

  /** The other voices that waited, as a message of their own once the assistant's turn ended. */
  private async deliverForeign(agentId: string, phrases: PhraseMeta[]): Promise<void> {
    const meta = this.foreignMeta(phrases);
    const steer = this.host.hasActiveAgentRun(agentId);
    const message = foreignMessage(phrases);
    let result = await this.host.sendSpokenInput(agentId, message, steer, meta ?? undefined);
    if (steer && result && !result.ok) {
      // A steer can lose a race with the turn that just ended: once more as a plain message.
      result = await this.host.sendSpokenInput(agentId, message, false, meta ?? undefined);
    }
    this.recordDelivery(phrases, "queued-foreign", meta, result);
  }

  /**
   * Hizuri: while the agent is busy, only a phrase that starts with a wake word interrupts it;
   * anything else goes into the running turn as a "by the way" (steer) and the work goes on. Off by
   * default (§5: the user's phrase interrupts the running answer and goes as a new request);
   * PASEO_VOICE_BUSY_STEER=1 steers it into the running turn. True = the phrase is consumed. An
   * unverified short phrase is always steered and never stops anything, wake word or not: a stop
   * word while the assistant speaks is caught by the barge-in check, which needs no voice match.
   */
  private async steerWhileBusy(
    transcriptText: string,
    replyPlaying: boolean,
    phrase: PhraseMeta | null,
    result: Pick<VoiceTranscriptionResultPayload, "shortPhrase" | "situation">,
  ): Promise<boolean> {
    const agentId = this.voiceModeAgentId;
    const short = result.shortPhrase;
    const unverified = isUnverifiedShort(short);
    if (
      (!this.isVoiceMode && !this.saidBeforeSuspend(phrase)) ||
      !agentId ||
      !(unverified || envFlag("PASEO_VOICE_BUSY_STEER", false)) ||
      !this.host.hasActiveAgentRun(agentId)
    ) {
      return false;
    }
    const { plain } = plainWords(transcriptText);
    // Barge-in fallback (PASEO_BARGE_MODE=stop): during a paced reply a phrase that starts with
    // a stop word (PASEO_BARGE_STOP_RE) cuts the rest of the reply; the turn goes on.
    const stopRe = envString("PASEO_BARGE_STOP_RE", defaultBargeStopPattern());
    const stopMode = bargeStopMode();
    if (
      !unverified &&
      this.bargeHold &&
      stopMode &&
      replyPlaying &&
      stopRe &&
      new RegExp(stopRe, "iu").test(plain)
    ) {
      this.stopReplyPlayback("stop-word");
    }
    if (!unverified && readWakePattern(this.owner?.wakeFile ?? null).test(plain)) {
      return false;
    }
    this.sessionLogger.info({ transcript: transcriptText }, "speaker_gate.busy_steer");
    this.setPhase("idle");
    this.clearSpeechInProgress("busy, steered");
    await this.deliverSteered({ agentId, text: transcriptText, phrase, result });
    return true;
  }

  /** A phrase said while the assistant is busy goes into its running turn as a "by the way". */
  private async deliverSteered(input: {
    agentId: string;
    text: string;
    phrase: PhraseMeta | null;
    result: Pick<VoiceTranscriptionResultPayload, "shortPhrase" | "situation">;
  }): Promise<void> {
    const { agentId, text, phrase, result } = input;
    const short = result.shortPhrase;
    if (streamDecides() && this.isVoiceMode) {
      // Hizuri (front stream): the busy phrase joins the user's thought; the front says when it is
      // finished, and the whole thought then goes into the assistant's running turn
      // (sendMonologue).
      this.queueMonologuePart({
        agentId,
        text,
        phrase,
        short,
        situation: result.situation,
        steer: true,
      });
      return;
    }
    this.releaseFloor("delivered");
    if (!this.userWordsPending()) {
      this.floorManager.thoughtSent();
    }
    const phrases = phrase ? [phrase] : [];
    if (!isUnverifiedShort(short)) this.showPhrase(agentId, text, { endedAt: phrase?.endedAt });
    const said = isUnverifiedShort(short) ? null : await this.frontSays(text, phrases);
    const message =
      this.withInterruptedReply(withShortNote(text, short)) +
      frontNote(said) +
      this.holdNote() +
      this.situationSuffix(result.situation ? [result.situation] : []);
    const meta = this.spokenMeta(phrases);
    const sent = await this.host.sendSpokenInput(agentId, message, true, meta ?? undefined);
    this.recordDelivery(phrases, "steered", meta, sent);
  }

  private registerVoiceBridgeForAgent(agentId: string): void {
    this.registerVoiceSpeakHandler?.(agentId, async ({ text, signal, replyTo, carries }) => {
      const reply = this.openReply(text, replyTo ?? [], "speak", carries ?? []);
      this.sessionLogger.info(
        {
          agentId,
          textLength: text.length,
          preview: text.slice(0, 160),
          replyId: reply.id,
          ...(replyTo?.length ? { replyTo } : {}),
        },
        "Voice speak tool call received by session handler",
      );
      this.lastSpokenReply = { text, at: Date.now() };
      this.floorManager.noteZuri(Date.now());
      if (fastFrontMode() !== "off") {
        sharedFastFront(this.sessionLogger).noteZuri(text);
      }
      if (this.isVoiceMode && !this.frontSkipsAgent(agentId)) {
        this.visual().reply(agentId, spokenBody(text));
      }
      // Hizuri: with voice mode off nobody plays or confirms the audio: no synthesis, no wait;
      // the text still lands in the chat. Text without voice signs and delivers nothing.
      if (!this.isVoiceMode) {
        this.sessionLogger.info(
          { agentId, textLength: text.length },
          "Voice speak skipped: voice mode off",
        );
        this.emitAssistantText(text);
        this.endReply(reply, { outcome: "text-only", heard: "", unheard: spokenBody(text) });
        return { replyId: reply.id, outcome: "text-only" };
      }
      if (this.isRepeatOfOtherZuri(agentId, text)) {
        this.sessionLogger.info(
          { agentId, replyId: reply.id, preview: text.slice(0, 120) },
          "voice_companion.duplicate_dropped",
        );
        this.endReply(reply, { outcome: "duplicate", heard: "", unheard: "" });
        return { replyId: reply.id, outcome: "duplicate" };
      }
      this.supersedeWaiting(reply);
      if (this.holdsFloor()) {
        this.holdReply(reply);
        this.emitAssistantText(text);
        return { replyId: reply.id, outcome: "held" };
      }
      // The fast brain's reaction plays first; the full answer follows it, never over it.
      await this.fastReplyPlaying?.catch(() => undefined);
      const bargeHold = this.bargeHold;
      if (bargeHold && this.ttsManager.canQueue()) {
        return this.speakQueued({ agentId, text, signal, bargeHold, reply });
      }
      if (
        !(await this.waitForFloor(reply, { waiting: () => undefined, cancelled: aborted(signal) }))
      ) {
        this.endReply(reply, { outcome: "superseded", heard: "", unheard: spokenBody(text) });
        this.emitAssistantText(text);
        return { replyId: reply.id, outcome: "superseded" };
      }
      const outcome = await this.speakWhole({ text, signal, reply });
      this.sessionLogger.info(
        { agentId, textLength: text.length, replyId: reply.id, outcome },
        "Voice speak tool call finished playback",
      );
      this.emitAssistantText(text);
      return { replyId: reply.id, outcome };
    });

    this.registerVoiceCallerContext?.(agentId, {
      childAgentDefaultLabels: {},
      allowCustomCwd: false,
      enableVoiceTools: true,
    });
  }

  /**
   * Hizuri (two Zuris): both hear every phrase, so both may answer it. A reply that mostly repeats
   * what the other one said or queued in the last minute is dropped. Every reply that goes on is
   * remembered here.
   */
  private isRepeatOfOtherZuri(agentId: string, text: string): boolean {
    const now = Date.now();
    this.recentSpeeches = this.recentSpeeches.filter((s) => now - s.at < 60_000);
    const words = speechStems(spokenBody(text));
    const repeat =
      this.voiceCompanion !== null &&
      words.length >= 3 &&
      this.recentSpeeches.some(
        (s) =>
          s.agentId !== agentId && words.filter((w) => s.stems.has(w)).length / words.length >= 0.6,
      );
    if (!repeat) {
      this.recentSpeeches.push({ agentId, at: now, stems: new Set(words) });
    }
    return repeat;
  }

  private emitAssistantText(text: string): void {
    this.emit({
      type: "activity_log",
      payload: {
        id: uuidv4(),
        timestamp: new Date(),
        type: "assistant",
        content: text,
      },
    });
  }

  /**
   * Hizuri: a client holding an unfinished audio group blocks every later reply; the barge-in
   * signal resets its playback.
   */
  private resetClientPlayback(): void {
    this.sessionLogger.info("tts.paced_incomplete: resetting client playback");
    this.replyReference.cut();
    this.emit({ type: "voice_input_state", payload: { isSpeaking: true } });
    this.emit({ type: "voice_input_state", payload: { isSpeaking: false } });
  }

  /**
   * Hizuri: the speech queue (see agent/speech-queue.ts): part-by-part synthesis, and a stop
   * word returns this call at once while the rest of the speech stays paused.
   */
  private async speakQueued(params: {
    agentId: string;
    text: string;
    signal: AbortSignal | undefined;
    bargeHold: BargeHold;
    reply: ReplyRecord;
  }): Promise<VoiceSpeakResult> {
    const { agentId, text, signal, bargeHold, reply } = params;
    const result: SpeechResult = await this.ttsManager.enqueueSpeech({
      text,
      // Speech from inside a turn; speech started outside any turn keeps getting a stop word as
      // a message.
      meta: { fromTurn: this.host.hasActiveAgentRun(agentId) },
      emitMessage: (msg) => this.emit(msg),
      mcpSignal: signal,
      sessionSignal: this.abortController.signal,
      isVoiceMode: true,
      hooks: {
        // Counted per reply: replies can overlap (one paused, the next queued).
        onQueued: ({ jobId }) => {
          reply.jobId = jobId;
        },
        beforePlay: (gate) => this.waitForFloor(reply, gate),
        // Armed from its start: the user's words while it still waits for a pause keep it waiting.
        onStart: () => bargeHold.arm(true),
        // The assistant's line counts for the echo checks from its first sound, not from synthesis
        // start: the user's words in the seconds before it would look like a late echo.
        onFirstAudio: () => this.echoFilter.noteSpeakStart(spokenBody(text)),
        onEnd: (info) => {
          if (info.started) {
            this.echoFilter.noteSpeakEnd();
            bargeHold.arm(false);
          }
          if (info.incomplete) {
            this.resetClientPlayback();
          }
          this.endQueuedReply(reply, info);
        },
      },
    });
    this.sessionLogger.info(
      { agentId, textLength: text.length, replyId: reply.id, ...result },
      "Voice speak tool call finished playback",
    );
    this.emitAssistantText(text);
    if (result.outcome === "error" && !result.detached && !result.early) {
      throw new Error(`TTS synthesis failed: ${result.error ?? "no audio"}`);
    }
    return { replyId: reply.id, outcome: reply.superseded ? "superseded" : result.outcome };
  }

  /** The whole reply synthesized, then played (upstream path, paced with PASEO_BARGE_HOLD=1). */
  private async speakWhole(params: {
    text: string;
    signal: AbortSignal | undefined;
    reply: ReplyRecord;
  }): Promise<ReplyOutcome> {
    const { text, signal, reply } = params;
    const abortSignal = signal
      ? AbortSignal.any([signal, this.abortController.signal])
      : this.abortController.signal;
    // The same check disarms as armed, even when the knob changes during the reply.
    const bargeHold = this.bargeHold;
    bargeHold?.arm(true);
    reply.playStartedAt = Date.now();
    const cancels = this.ttsManager.cancelCount;
    let outcome: ReplyOutcome = "error";
    try {
      let audible = false;
      await this.ttsManager.generateAndWaitForPlayback(
        text,
        (msg) => {
          // As on the queued path: the assistant's line counts for the echo checks from its first
          // sound.
          if (!audible && msg.type === "audio_output") {
            audible = true;
            this.echoFilter.noteSpeakStart(spokenBody(text));
          }
          this.emit(msg);
        },
        abortSignal,
        true,
      );
      // A cancel resolves the playback early, like its end.
      const cut = abortSignal.aborted || this.ttsManager.cancelCount !== cancels;
      outcome = cut ? "cut" : "played";
    } finally {
      bargeHold?.arm(false);
      this.echoFilter.noteSpeakEnd();
      if (this.ttsManager.lastPlaybackIncomplete) {
        this.ttsManager.lastPlaybackIncomplete = false;
        this.resetClientPlayback();
        outcome = "cut";
      }
      this.endWholeReply(reply, outcome);
    }
    return outcome;
  }

  /**
   * Hizuri (barge-in): cut the rest of the reply now playing; the agent's turn goes on. A barge-in
   * also gives the user's phrase the floor: replies sent before it reaches the agent are held.
   */
  private stopReplyPlayback(reason: string, speechStartedAt?: number | null): void {
    // A reply still waiting for the user's pause is not cut: it waits on (waitForFloor).
    if (!this.ttsManager.replyStarted()) {
      return;
    }
    this.sessionLogger.info({ reason }, "barge.stop_reply");
    if (reason === "barge-stop") {
      // The user's start: the earlier of the hold's voiced run and the phrase the VAD has open.
      const phraseStart = this.monologue.speaking ? this.speechStartedAt : null;
      const starts = [speechStartedAt, phraseStart].filter((at): at is number => at != null);
      this.markCutByUser(starts.length > 0 ? Math.min(...starts) : Date.now(), false);
      this.takeFloor();
    } else {
      this.markCutByUser(Date.now(), reason === "drop-word");
    }
    this.ttsManager.hold.set(false);
    this.ttsManager.cancelPendingPlaybacks(reason);
  }

  /**
   * The assistant's lines playing now or ended in the last few seconds: what can come back through
   * the speaker.
   */
  private assistantRecentTexts(now = Date.now()): string[] {
    return this.replies
      .filter((r) => r.state === "live" || (r.endedAt ?? 0) > now - ASSISTANT_ECHO_TAIL_MS)
      .map((r) => r.text);
  }

  /**
   * Hizuri: the assistant goes quiet on the user's first real words. The streaming STT sends live
   * text about every second; while a reply plays, words that are neither the assistant's own reply
   * coming back nor meant for other people in the room stop it at once — no separate quick
   * transcription and no voice print: on a laptop mic the user score can be 0.05-0.11, so the print
   * would reject real interruptions and delay stops by 4-15 s. PASEO_BARGE_PARTIAL=0 turns it off;
   * PASEO_BARGE_PARTIAL_MIN_WORDS (2) words are needed unless it is a stop word or the assistant's
   * name.
   */
  // oxlint-disable-next-line complexity
  private bargeOnPartial(text: string): void {
    if (!this.bargeHold || !envFlag("PASEO_BARGE_PARTIAL", true)) {
      return;
    }
    if (!this.ttsManager.replyStarted()) {
      this.sessionLogger.info(
        { transcript: text, armed: this.bargeHold.state().armed },
        "barge.partial_idle",
      );
      return;
    }
    const { plain } = plainWords(text);
    const words = plain.match(/\p{L}+/gu) ?? [];
    const calledByName = nameWords().test(plain);
    const stopWord = pauseWords().test(plain) || STOP_ANYWHERE.test(plain);
    const startedAt = this.bargeHold.speechStartedAt() ?? this.speechStartedAt ?? Date.now();
    const roomSkip = calledByName || stopWord ? null : this.roomBargeSkip(plain);
    let reason: string | null = null;
    if (
      !calledByName &&
      !userStopWord(plain, this.assistantRecentTexts()) &&
      isAssistantEcho(this.echoFilter, text, { startedAt, endedAt: Date.now() })
    ) {
      reason = "assistant-words";
    } else if (!calledByName && isForOthers(plain)) {
      reason = "not-for-me";
    } else if (roomSkip) {
      reason = roomSkip;
    } else if (
      !calledByName &&
      !stopWord &&
      (words.length < envPositive("PASEO_BARGE_PARTIAL_MIN_WORDS", 2) ||
        hasTooFewWords(text, this.sttLanguage))
    ) {
      reason = "few-words";
    }
    if (reason) {
      this.sessionLogger.info({ transcript: text, reason }, "barge.partial_skip");
      return;
    }
    // A stop word, the drop word or the name cuts the reply without the voice check, as in the quick
    // check (verifyBargeHold): the letter check above already holds back the reply's own words.
    const controlWord = calledByName || stopWord || DROP_WORDS.test(plain);
    const voiceSkip = controlWord ? null : this.speakerPartialVoiceSkip(startedAt);
    if (voiceSkip) {
      this.sessionLogger.info({ transcript: text, ...voiceSkip }, "barge.partial_skip");
      return;
    }
    this.sessionLogger.info(
      { transcript: text, words: words.length, sinceSpeechMs: Date.now() - startedAt },
      "barge.partial_stop",
    );
    this.stopReplyPlayback("barge-stop", startedAt);
  }

  /**
   * Hizuri: on the phone's loudspeaker the live words may be the assistant's own reply left over
   * after the echo canceller, garbled past the letter check (two of the reply's words came back
   * as one of them plus a word it never said, and cut it). There the words cut the reply only
   * when the voice print says they are the user's, as in the quick check (bargeVoiceReject); a
   * stop word, the drop word or the name skips this.
   * Headphones skip this: a laptop mic can score the user 0.05-0.11. Null when the words may cut;
   * no voice print installed keeps the text rules alone.
   */
  private speakerPartialVoiceSkip(
    startedAt: number,
  ): { reason: string; owner?: number | null; assistant?: number | null } | null {
    const gate = this.owner?.speakerGate?.gate;
    if (this.outputRoute !== "speaker" || !gate) {
      return null;
    }
    const ms = Math.min(4000, Math.max(0, Date.now() - startedAt) + 300);
    const snap = this.voiceTurnController?.snapshotSpeech(ms);
    const voices = snap ? gate.compareVoices(snap.pcm, this.ttsManager.currentReplyPcm) : null;
    if (!voices) {
      // Too little audio for the print yet: the next live text or the quick check decides.
      return { reason: "no-voice-check" };
    }
    const reason = bargeVoiceReject(voices, false);
    return reason ? { reason, owner: voices.owner, assistant: voices.assistant } : null;
  }

  /**
   * Why the user's words (no stop word, not the assistant's name) do not cut the assistant here, or
   * null when they do: only a stop word or the drop word may (the assistant's voice on the phone's
   * loudspeaker, other voices nearby with room turns, or the knob), or they are only a backchannel.
   */
  private roomBargeSkip(plain: string): "speaker" | "not-stop-word" | "backchannel" | null {
    const dropWord = DROP_WORDS.test(plain);
    if (roomTurns() && voiceModes()) {
      const mode = this.currentMode(Date.now());
      if (mode.cuts === "stop-words" && !dropWord) {
        return mode.id.startsWith("speaker/") && !mode.id.endsWith("/voices")
          ? "speaker"
          : "not-stop-word";
      }
      return isBackchannel(plain) ? "backchannel" : null;
    }
    if (stopWordsOnlyOn(this.outputRoute) && !dropWord) {
      return "speaker";
    }
    const room = this.situationTracker.room(Date.now());
    const stopWordsHere = roomTurns()
      ? room === "voices" || (room === "noisy" && noisyStopWordsOnly())
      : stopWordsOnly();
    if (stopWordsHere && !dropWord) {
      return "not-stop-word";
    }
    return isBackchannel(plain) ? "backchannel" : null;
  }

  /**
   * May the assistant's waiting reply start now: by the fixed quiet time, the room, or the voice
   * mode.
   */
  private mayStartNow(now: number): ZuriVerdict {
    if (!roomTurns()) {
      return this.floorManager.zuriMayStart(
        now,
        envNonNegative("PASEO_VOICE_FLOOR_QUIET_MS", 1500),
      );
    }
    if (voiceModes()) {
      return this.floorManager.zuriMayStartInMode(this.currentMode(now).start);
    }
    return this.floorManager.zuriMayStartInRoom(this.situationTracker.room(now));
  }

  /** Hizuri (voice-mode.ts): the mode for the route and room now; each change is logged once. */
  private currentMode(now: number): VoiceMode {
    const mode = voiceMode(
      this.outputRoute,
      this.situationTracker.room(now),
      this.echoCanceller !== null,
    );
    const key = `${mode.id} ${mode.cuts} ${mode.start}`;
    if (key !== this.modeLogged) {
      this.sessionLogger.info({ from: this.modeLogged, to: key }, "voice.mode");
      this.modeLogged = key;
    }
    return mode;
  }

  /**
   * Hizuri (pause/resume barge-in): is what the user says right now worth pausing the reply for?
   * Real words (a quick transcription of the phrase so far), not the reply's own words coming back
   * through the speaker, and (optionally) not a voice closer to the reply than to the user.
   */
  // oxlint-disable-next-line complexity
  private async verifyBargeHold({ voicedMs }: { voicedMs: number }): Promise<BargeVerdict> {
    // The voiced time plus room for the pauses between words, at most 4 s.
    const snap = this.voiceTurnController?.snapshotSpeech(Math.min(4000, voicedMs + 700));
    if (!snap || snap.pcm.length < PCM_BYTES_PER_MS * 800) {
      return { accept: false, reason: "no-words", detail: "too little audio" };
    }
    // Digital silence (a phone's echo or noise suppression zeroes the mic): nothing to judge.
    const rms = pcmRms(snap.pcm);
    if (rms < 30) {
      return { accept: false, reason: "silent-audio", rms: Math.round(rms) };
    }
    const scores = this.compareBargeVoice(snap.pcm);
    if (scores.veto) {
      return { accept: false, reason: "assistant-voice", ...scores.values };
    }
    const text = await this.transcribeBargeSnapshot(snap.pcm);
    if (text === null) {
      return { accept: false, reason: "stt-timeout", ...scores.values };
    }
    const { plain } = plainWords(text);
    const calledByName = nameWords().test(plain);
    // Hizuri: the words heard are the reply now playing coming back through the mic (speaker or a
    // leaky headset). Clips under ~2 s skip the voice check below, so without this the Zuris cut
    // themselves off (with the timbre filter off).
    if (
      !calledByName &&
      !userStopWord(plain, this.assistantRecentTexts()) &&
      isAssistantEcho(this.echoFilter, text, {
        startedAt: Date.now() - voicedMs,
        endedAt: Date.now(),
      })
    ) {
      return { accept: false, reason: "assistant-words", text, ...scores.values };
    }
    if (!calledByName && isForOthers(plain)) {
      return { accept: false, reason: "not-for-me", text, ...scores.values };
    }
    // The drop word caught by the quick check already: drop the reply now (waiting for the full
    // transcript let it talk on ~4 s); the final transcript repeats the drop harmlessly.
    if (DROP_WORDS.test(plain) && this.ttsManager.isSpeaking()) {
      this.ttsManager.dropAllSpeech("drop-word");
      this.stopReplyPlayback("drop-word");
      this.sessionLogger.info({ transcript: text }, "barge_hold.drop_word_early");
      return { accept: true, reason: "drop-word", text, ...scores.values };
    }
    if (pauseWords().test(plain)) {
      return {
        accept: true,
        reason: "stop-word",
        sticky: isPausePhrase(plain),
        text,
        ...scores.values,
      };
    }
    if (STOP_ANYWHERE.test(plain)) {
      return { accept: true, reason: "stop-word", sticky: false, text, ...scores.values };
    }
    const roomSkip = calledByName ? null : this.roomBargeSkip(plain);
    if (roomSkip) {
      return { accept: false, reason: roomSkip, text, ...scores.values };
    }
    if (!calledByName && hasTooFewWords(text, this.sttLanguage)) {
      return { accept: false, reason: "no-words", text, ...scores.values };
    }
    const voices = this.owner?.speakerGate?.gate.compareVoices(
      snap.pcm,
      this.ttsManager.currentReplyPcm,
    );
    // Hizuri: a one-word piece never stops the assistant: on a loudspeaker its own reply can come
    // back as garbled single words and cut it off even with a voice score. Stop words and the
    // assistant's name were accepted above, so "stop", "wait" and its name still work; real
    // interruptions have two words or more.
    const oneWord = !calledByName && (plain.match(/\p{L}+/gu) ?? []).length <= 1;
    let voiceReason: ReturnType<typeof bargeVoiceReject> | "one-word" = null;
    if (oneWord) voiceReason = "one-word";
    else if (voices) voiceReason = bargeVoiceReject(voices, calledByName);
    if (voiceReason) {
      return { accept: false, reason: voiceReason, text, ...voices, ...scores.values };
    }
    return { accept: true, reason: calledByName ? "name" : "words", text, ...scores.values };
  }

  /**
   * Hizuri (stop-spotter.ts): while a reply is armed the mic audio goes to the stop-word spotter, so
   * a stop word stops the reply without waiting for the STT (with a slow STT every quick check timed
   * out after 3 s and a 10 s reply played over a stop phrase). The quick check still runs for
   * everything else and for the stop words the spotter missed.
   */
  private spotStopWord(pcm16k: Buffer): void {
    const spotter = this.stopSpotter;
    const hold = this.bargeHold;
    if (!spotter) {
      return;
    }
    if (!hold?.state().armed) {
      spotter.reset();
      return;
    }
    const text = this.runStopSpotter(() => spotter.feed(pcm16k));
    if (text) {
      this.stopWordSpotted(hold, text);
    }
  }

  /** A spotter that throws is turned off for the session: the mic feed to the STT must go on. */
  private runStopSpotter(run: () => string | null): string | null {
    try {
      return run();
    } catch (error) {
      this.stopSpotter = null;
      this.sessionLogger.error({ err: error }, "stop_spotter.failed");
      return null;
    }
  }

  /**
   * The user's voice started: the spotter starts over from SPOTTED_PRE_ROLL_MS of mic audio. Fed
   * on, it clipped the first word after the reply's echo (a stop word at the start came out as its
   * last letter); a fresh stream with 0.6 s before the detector fired heard it 0.2 s after the
   * start.
   */
  private restartStopSpotter(): void {
    const spotter = this.stopSpotter;
    const hold = this.bargeHold;
    const controller = this.voiceTurnController;
    if (!spotter || !hold?.state().armed || !controller) {
      return;
    }
    const text = this.runStopSpotter(() =>
      spotter.restart(controller.snapshotSpeech(SPOTTED_PRE_ROLL_MS).pcm),
    );
    if (text) {
      this.stopWordSpotted(hold, text);
    }
  }

  private stopWordSpotted(hold: BargeHold, text: string): void {
    const sinceLoudMs = hold.msSinceLoudVoice();
    const verdict = this.spottedVerdict(text, sinceLoudMs);
    // The drop word dropped the reply in spottedVerdict already.
    const acted = verdict.accept && (hold.spotted(verdict) || verdict.reason === "drop-word");
    this.sessionLogger.info(
      { ...verdict, sinceLoudMs: Number.isFinite(sinceLoudMs) ? sinceLoudMs : null, acted },
      "barge_hold.spotted",
    );
  }

  /**
   * The quick check's rules for a stop word, on the spotter's text: the user's own loud voice just
   * now, not a stop word of the assistant's line coming back, not words addressed to other people;
   * the assistant's voice in the clip vetoes it when the voice check is on.
   */
  private spottedVerdict(text: string, sinceLoudMs: number): BargeVerdict {
    if (sinceLoudMs > SPOTTED_LOUD_WITHIN_MS) {
      return { accept: false, reason: "no-loud-voice", text };
    }
    const { plain } = plainWords(text);
    const dropWord = DROP_WORDS.test(plain);
    const theirs = this.assistantRecentTexts();
    if (dropWord ? theirs.some((line) => DROP_WORDS.test(line)) : !userStopWord(plain, theirs)) {
      return { accept: false, reason: "assistant-words", text };
    }
    if (isForOthers(plain)) {
      return { accept: false, reason: "not-for-me", text };
    }
    const snap = this.voiceTurnController?.snapshotSpeech(SPOTTED_CLIP_MS);
    const scores = snap ? this.compareBargeVoice(snap.pcm) : { veto: false, values: {} };
    if (scores.veto) {
      return { accept: false, reason: "assistant-voice", text, ...scores.values };
    }
    if (dropWord && this.ttsManager.isSpeaking()) {
      this.ttsManager.dropAllSpeech("drop-word");
      this.stopReplyPlayback("drop-word");
      return { accept: true, reason: "drop-word", text, ...scores.values };
    }
    return {
      accept: true,
      reason: "stop-word",
      sticky: isPausePhrase(plain),
      text,
      ...scores.values,
    };
  }

  /**
   * Voice check (CAM++, blocks the event loop ~40-160 ms): PASEO_BARGE_HOLD_VOICE_CHECK=log only
   * logs the scores, =1 also vetoes a voice closer to the reply than to the user by more than
   * PASEO_BARGE_HOLD_VOICE_MARGIN (0.15). Off by default: CAM++ on 2-3 s clips is weak.
   */
  private compareBargeVoice(pcm: Buffer): {
    veto: boolean;
    values: { owner?: number | null; assistant?: number | null };
  } {
    const mode = envString("PASEO_BARGE_HOLD_VOICE_CHECK", "off");
    const gate = this.owner?.speakerGate?.gate;
    if (!gate || (mode !== "1" && mode !== "log")) {
      return { veto: false, values: {} };
    }
    const voices = gate.compareVoices(pcm, this.ttsManager.currentReplyPcm);
    if (!voices) {
      return { veto: false, values: {} };
    }
    const margin = envNumber("PASEO_BARGE_HOLD_VOICE_MARGIN", 0.15);
    const veto =
      mode === "1" &&
      voices.owner !== null &&
      voices.assistant !== null &&
      voices.assistant - voices.owner > margin;
    return { veto, values: { owner: voices.owner, assistant: voices.assistant } };
  }

  /**
   * The quick transcription; null on PASEO_BARGE_HOLD_STT_TIMEOUT_MS (3000), the wait for the
   * check before it included (createCheckLane).
   */
  private async transcribeBargeSnapshot(pcm: Buffer): Promise<string | null> {
    const wav = convertPCMToWavBuffer(pcm, PCM_SAMPLE_RATE, PCM_CHANNELS, PCM_BITS_PER_SAMPLE);
    const timeoutMs = envNumber("PASEO_BARGE_HOLD_STT_TIMEOUT_MS", 3000);
    const result = await this.bargeCheckLane.run(
      () =>
        this.sttManager.transcribe(wav, "audio/wav", {
          requestId: uuidv4(),
          label: "barge-hold",
        }),
      timeoutMs,
    );
    return result === null ? null : (result.text ?? "").trim();
  }

  /**
   * Handle abort request from client
   */
  async handleAbort(): Promise<void> {
    this.sessionLogger.info(
      { phase: this.processingPhase },
      `Abort request, phase: ${this.processingPhase}`,
    );

    this.abortController.abort();
    this.ttsManager.cancelPendingPlaybacks("abort request");

    // Voice abort should always interrupt active agent output immediately.
    if (this.isVoiceMode && this.voiceModeAgentId) {
      try {
        await this.host.interruptAgentIfRunning(this.voiceModeAgentId);
      } catch (error) {
        const message = `Voice interruption failed: ${getErrorMessage(error)}`;
        this.emit({
          type: "activity_log",
          payload: {
            id: uuidv4(),
            timestamp: new Date(),
            type: "error",
            content: message,
            metadata: { voiceAbortFailed: true },
          },
        });
        throw error;
      }
    }

    if (this.processingPhase === "transcribing") {
      // Still in STT phase - we'll buffer the next audio
      this.sessionLogger.debug("Will buffer next audio (currently transcribing)");
      // Phase stays as 'transcribing', handleAudioChunk will handle buffering
      return;
    }

    // Reset phase to idle and clear pending non-voice buffers.
    this.setPhase("idle");
    this.pendingAudioSegments = [];
    this.clearBufferTimeout();
  }

  /**
   * Handle audio playback confirmation from client
   */
  handleAudioPlayed(id: string): void {
    // Hizuri: logged to correlate missing confirmations with what the client did.
    this.sessionLogger.debug({ chunkId: id }, "voice.audio_played_received");
    this.ttsManager.confirmAudioPlayed(id);
  }

  /**
   * Mark speech detection start and abort any active playback/agent run.
   */
  private async handleVoiceSpeechStart(): Promise<void> {
    if (this.speechInProgress) {
      return;
    }

    const chunkReceivedAt = Date.now();
    const phaseBeforeAbort = this.processingPhase;
    const hadActiveStream = this.host.hasActiveAgentRun(this.voiceModeAgentId);

    this.speechInProgress = true;
    this.sessionLogger.debug("Voice speech detected – aborting playback and active agent run");

    if (this.pendingAudioSegments.length > 0) {
      this.sessionLogger.debug(
        { segmentCount: this.pendingAudioSegments.length },
        `Dropping ${this.pendingAudioSegments.length} buffered audio segment(s) due to voice speech`,
      );
      this.pendingAudioSegments = [];
    }

    if (this.audioBuffer) {
      this.sessionLogger.debug(
        { chunks: this.audioBuffer.chunks.length, pcmBytes: this.audioBuffer.totalPCMBytes },
        `Clearing partial audio buffer (${this.audioBuffer.chunks.length} chunk(s)${
          this.audioBuffer.isPCM ? `, ${this.audioBuffer.totalPCMBytes} PCM bytes` : ""
        })`,
      );
      this.audioBuffer = null;
    }

    this.clearBufferTimeout();

    // Hizuri: noise must not cut the reply or kill the agent run; by default the barge-in waits
    // for a transcript with words (handleTranscriptionResultPayload).
    if (this.bargeInOnVad()) {
      this.markCutByUser(chunkReceivedAt, false);
      this.abortController.abort();
      await this.handleAbort();
    }

    const latencyMs = Date.now() - chunkReceivedAt;
    this.sessionLogger.debug(
      { latencyMs, phaseBeforeAbort, hadActiveStream },
      "[Telemetry] barge_in.llm_abort_latency",
    );
  }

  /**
   * Clear speech-in-progress flag once the user turn has completed
   */
  private clearSpeechInProgress(reason: string): void {
    if (!this.speechInProgress) {
      return;
    }

    this.speechInProgress = false;
    this.sessionLogger.debug({ reason }, `Speech turn complete (${reason}) – resuming TTS`);
  }

  /**
   * Create new AbortController, aborting the previous one
   */
  private createAbortController(): AbortController {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.ttsDebugStreams.clear();
    return this.abortController;
  }

  /**
   * Set the processing phase
   */
  private setPhase(phase: ProcessingPhase): void {
    this.processingPhase = phase;
    if (phase === "idle") this.onIdle?.();
    this.sessionLogger.debug({ phase }, `Phase: ${phase}`);
  }

  /**
   * Set timeout to process buffered audio segments
   */
  private setBufferTimeout(): void {
    this.clearBufferTimeout();

    this.bufferTimeout = setTimeout(async () => {
      this.sessionLogger.debug("Buffer timeout reached, processing pending segments");

      if (this.processingPhase === "transcribing") {
        this.sessionLogger.debug(
          { segmentCount: this.pendingAudioSegments.length },
          "Buffer timeout deferred because transcription is still in progress",
        );
        this.setBufferTimeout();
        return;
      }

      if (this.pendingAudioSegments.length > 0) {
        const segments = [...this.pendingAudioSegments];
        this.pendingAudioSegments = [];
        this.bufferTimeout = null;

        const combined = Buffer.concat(segments.map((s) => s.audio));
        await this.processAudio(combined, segments[0].format);
      }
    }, 10000); // 10 second timeout
  }

  /**
   * Clear buffer timeout
   */
  private clearBufferTimeout(): void {
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
  }

  /**
   * Emit a message to the client. Captures TTS audio_output frames for optional
   * debug persistence before forwarding to the session emitter.
   */
  private emit(msg: SessionOutboundMessage): void {
    if (this.closed) return;
    if (this.isVoiceMode && msg.type === "audio_output" && msg.payload.format === "pcm") {
      // What the phone is about to play, for the echo canceller and the reply recording.
      this.replyReference.play(Buffer.from(msg.payload.audio, "base64"));
    }
    if (
      msg.type === "audio_output" &&
      (process.env.TTS_DEBUG_AUDIO_DIR || isPaseoDictationDebugEnabled()) &&
      msg.payload.groupId &&
      typeof msg.payload.audio === "string"
    ) {
      const groupId = msg.payload.groupId;
      const existing =
        this.ttsDebugStreams.get(groupId) ??
        ({ format: msg.payload.format, chunks: [] } satisfies {
          format: string;
          chunks: Buffer[];
        });

      try {
        existing.chunks.push(Buffer.from(msg.payload.audio, "base64"));
        existing.format = msg.payload.format;
        this.ttsDebugStreams.set(groupId, existing);
      } catch {
        // ignore malformed base64
      }

      if (msg.payload.isLastChunk) {
        const final = this.ttsDebugStreams.get(groupId);
        this.ttsDebugStreams.delete(groupId);
        if (final && final.chunks.length > 0) {
          void (async () => {
            const recordingPath = await maybePersistTtsDebugAudio(
              Buffer.concat(final.chunks),
              { sessionId: this.sessionId, groupId, format: final.format },
              this.sessionLogger,
            );
            if (recordingPath) {
              this.host.emit({
                type: "activity_log",
                payload: {
                  id: uuidv4(),
                  timestamp: new Date(),
                  type: "system",
                  content: `Saved TTS audio: ${recordingPath}`,
                  metadata: { recordingPath, format: final.format, groupId },
                },
              });
            }
          })();
        }
      }
    }
    this.host.emit(msg);
  }

  /** Stop input synchronously, including a source disconnected during bootstrap. */
  cancel(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortController.abort();
    this.clearBufferTimeout();
    this.pendingAudioSegments = [];
    this.audioBuffer = null;
    const failures: unknown[] = [];
    for (const cleanup of [
      () => this.ttsManager.cleanup(),
      () => this.sttManager.cleanup(),
      () => this.dictationStreamManager.cleanupAll(),
    ]) {
      try {
        cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Voice input cleanup failed");
  }

  /**
   * Restore the agent only after the caller has drained its in-flight requests. Hizuri:
   * `restoreAgent: false` for an archived agent: its voice ends without reloading it, and the
   * other voices waiting for it are dropped (a message would unarchive it).
   */
  async cleanup(options: { restoreAgent?: boolean } = {}): Promise<void> {
    this.endHold("closed");
    if (options.restoreAgent === false) {
      for (const phrase of this.foreignQueue.discard("agent-archived")) {
        this.dropPhrase(phrase, "agent-archived", phrase.text);
      }
    } else {
      this.foreignQueue.flushNow("closed");
    }
    this.rawRecorder?.close();
    this.replyRecorder?.close();
    this.cleanRecorder?.close();
    this.rawRecorder = null;
    this.replyRecorder = null;
    this.cleanRecorder = null;
    this.echoCanceller?.close();
    this.echoCanceller = null;
    this.clearMonologueGap();
    if (this.monologue.capTimer) {
      clearTimeout(this.monologue.capTimer);
    }
    this.monologue = {
      agentId: "",
      parts: [],
      shorts: [],
      situations: [],
      steer: false,
      heldAt: null,
      askedAt: null,
      speaking: false,
      awaited: 0,
      gapTimer: null,
      capTimer: null,
      phrases: [],
    };
    this.frontStream?.reset();
    try {
      this.cancel();
    } finally {
      try {
        await this.stopVoiceTurnController();
      } finally {
        await this.disableVoiceModeForActiveAgent(options.restoreAgent !== false);
        this.isVoiceMode = false;
      }
    }
  }
}
