import { Buffer } from "node:buffer";
import type { Logger } from "pino";
import { v4 as uuidv4 } from "uuid";

import { Pcm16MonoResampler } from "../../agent/pcm16-resampler.js";
import { parsePcmRateFromFormat } from "../../speech/audio.js";
import {
  PhraseTranscriptionError,
  sameTranscriptWords,
  type SpeechToTextProvider,
  type StreamingTranscriptionEvent,
  type StreamingTranscriptionSession,
} from "../../speech/speech-provider.js";
import type { SpeechDenoiser } from "../../speech/speech-denoiser.js";
import type { DroppedSpeech, TurnDetectionProvider } from "../../speech/turn-detection-provider.js";
import { envNonNegative, envNumber } from "../../voice-env.js";
import { judgeEchoDrop } from "./echo-drop.js";
import { isAssistantEcho } from "./echo-route.js";
import { MicGain, rmsDb, VOICE_ABOVE_FLOOR_DB } from "./mic-gain.js";
import type { EchoFilter, PhraseSpan } from "./echo-filter.js";
import {
  describeShortPhrase,
  resolveShortPhraseConfig,
  ROOM_BEFORE_MS,
  ROOM_GAP_MS,
  RoomLevelMeter,
  roomKind,
  type ShortPhraseInfo,
} from "./short-phrase.js";
import type { PhraseSituation } from "./situation.js";
import { isJunkTranscript, type SpeakerGate, type SpeakerVerdict } from "./speaker-gate.js";
import type { VoiceJournal } from "./voice-journal.js";

// Hizuri: long phrases on a busy CPU, or an external STT, need more than a few seconds.
const VOICE_FINAL_TRANSCRIPT_TIMEOUT_MS = 30_000;
// Hizuri: audio kept before a phrase starts, for the speaker check.
const PRE_ROLL_MS = 1200;
// Hizuri: audio from before the detector fired goes to the STT with the phrase. With 1 s and an
// 800 ms start the first word before a short pause was cut off ("Listen, …", "Wait, …").
// Now the detector fires ~0.3 s into the voice, and 1.5 s keeps those words; 3 s let the assistant's echo in front of a short phrase hide it from the recogniser.
const DEFAULT_STT_PRE_ROLL_MS = 1500;
// The pre-roll starts this long before its first sound: the silence before it only costs time (the
// REST recogniser decodes the dead air too) and words (a long silence before a short word can make
// the recogniser return nothing).
const PRE_ROLL_LEAD_MS = 400;
// Hizuri: waits before each new try of a phrase the STT refused or never answered.
const RETRY_DELAYS_MS = [700, 2_000, 5_000];
// Hizuri: a phrase the STT could not take in time is tried again after it ended empty, and its
// text is delivered late. An STT restarting for ~15 s can make a 14 s phrase
// lose all three tries above.
const LATE_RETRY_DELAYS_MS = [10_000, 20_000, 30_000];
// Hizuri: one more listen to a phrase the STT heard nothing in : its
// raw microphone audio, before the mic gain, from 300 ms before the detector's start through 300 ms
// past its stop. The gain can clip short loud words that only the raw audio keeps, and the
// detector can stop while the user goes on, leaving words between two phrases. This window brings
// back more of them than one from the start of the pre-roll.
// PASEO_STT_SECOND_PASS_TAIL_MS (0 = off).
const DEFAULT_SECOND_PASS_TAIL_MS = 300;
const SECOND_PASS_LEAD_MS = 300;
// It waits for the user's pause, so it does not take a recogniser slot from a phrase being said.
const SECOND_PASS_WAIT_STEP_MS = 500;
const SECOND_PASS_MAX_WAIT_MS = 30_000;
// Hizuri: shorter phrases never go to the fallback recogniser (a cough, a click).
const FALLBACK_MIN_MS = 800;
// Hizuri: the audio of a phrase still waiting for its text is kept this long at most. Under load a
// long phrase's text can arrive more than a minute late; a shorter window keeps only its tail, the
// voice print scores that tail too low, and the phrase is dropped.
const RECENT_AUDIO_MS = 180_000;
// Hizuri: a short tail said right after a matched phrase is the user's. A second of audio is too
// little for the voice print to score reliably.
const OWNER_TAIL_MAX_MS = 2_500;
const OWNER_TAIL_GAP_MS = 2_000;

const FILLER_PARTIAL_WORDS = new Set([
  "uh",
  "um",
  "ah",
  "eh",
  "er",
  "hmm",
  "mm",
  "mmm",
  "mhm",
  "huh",
  "uhhuh",
  "uh-huh",
  "oh",
]);

function isFillerOnlyPartial(transcript: string): boolean {
  const tokens = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return true;
  }
  return tokens.every((token) => FILLER_PARTIAL_WORDS.has(token));
}

type VoiceInputState =
  | { status: "idle" }
  | { status: "listening" }
  | {
      status: "capturing";
      utteranceId: string;
      startedAt: number;
      /** Hizuri: the phrase id (voice-graph.ts), given when the user starts speaking. */
      phraseId: string | null;
      /** Hizuri: when the oldest audio handed to the STT for this phrase was heard. */
      sttFrom: number;
      /** Hizuri: the room level just before the user started (short-phrase.ts). */
      roomDb: number | null;
    };

export interface VoiceTurnControllerCallbacks {
  onSpeechStarted(): Promise<void>;
  onSpeechStopped(): Promise<void>;
  onPartialTranscript(input: { segmentId: string; transcript: string }): Promise<void>;
  onFinalTranscript(input: VoiceFinalTranscript): Promise<void>;
  onError(error: Error): void;
  /** Hizuri: every VAD window, for the barge-in hold. */
  onVadFrame?(detected: boolean, frameMs: number, loud: boolean): void;
  /** Hizuri: the VAD closed a phrase. */
  onVadSpeechStopped?(): void;
  /** Hizuri: every piece of mic audio as the VAD gets it (16 kHz), for the stop-word spotter. */
  onMicAudio?(pcm16k: Buffer): void;
  /** Hizuri: transcribe a phrase's 16 kHz audio again after the STT refused it. */
  retranscribe?(pcm16k: Buffer): Promise<{ text: string }>;
  /** Hizuri: a second recogniser for a phrase the STT failed on or heard nothing in. */
  transcribeFallback?(pcm16k: Buffer): Promise<{ text: string }>;
}

/** Hizuri: owner-voice filters run on every final transcript; absent filters let it through. */
export interface VoiceTurnFilters {
  echo?: EchoFilter;
  speakerGate?: { gate: SpeakerGate; advisory: boolean } | null;
  journal?: VoiceJournal | null;
}

export interface SpeechSnapshot {
  pcm: Buffer;
  startedAt: number;
}

export interface VoiceTurnController {
  start(): Promise<void>;
  stop(): Promise<void>;
  appendClientChunk(input: { audioBase64: string; format: string }): Promise<void>;
  /**
   * Hizuri: the last `ms` of 16 kHz microphone audio. Works before the VAD confirmed the phrase
   * too; startedAt is the phrase start while capturing.
   */
  snapshotSpeech(ms: number): SpeechSnapshot;
}

interface TimedPcm {
  t: number;
  pcm: Buffer;
  /** Hizuri: the same audio before the mic gain (absent when it had to be resampled). */
  raw?: Buffer;
}

interface TranscriptSegmentMeta {
  language?: string;
  avgLogprob?: number;
  isLowConfidence?: boolean;
}

interface VoiceFinalTranscript {
  segmentId: string;
  transcript: string;
  language?: string;
  avgLogprob?: number;
  isLowConfidence?: boolean;
  durationMs: number;
  /** Hizuri: the phrase graph's id and when the user started and stopped speaking. */
  phraseId?: string;
  startedAt?: number;
  endedAt?: number;
  /** Hizuri: a filter emptied the transcript: why, and what it said. */
  dropReason?: string;
  droppedText?: string;
  /** Hizuri: a quick draft of the phrase; its final may follow as a correction. */
  draft?: boolean;
  /** Hizuri: the phrase's final text replaces this draft text, already delivered. */
  correctionOf?: string;
  /** Hizuri: a short phrase the voice print did not judge alone (short-phrase.ts). */
  shortPhrase?: ShortPhraseInfo;
  /** Hizuri: the room and the voice print around the phrase, for every phrase (situation.ts). */
  situation?: PhraseSituation;
}

type FinalTranscriptReason = "complete" | "timeout" | "stt-failed";

interface FinalizingVoiceTurn {
  turnId: string;
  phraseId: string | null;
  startedAt: number;
  endedAt: number;
  /** Hizuri: the start of the audio the STT got (its pre-roll); the retry takes the same. */
  sttFrom: number;
  roomDb: number | null;
  retried: boolean;
  /** Hizuri: the empty phrase got its second listen (maybeSecondPass). */
  secondPass?: boolean;
  /** Hizuri: the fallback recogniser was asked (maybeFallback). */
  fallback?: boolean;
  /** Hizuri: the voice print rejected it and gets a second look on denoised audio. */
  voiceRecheck?: boolean;
  /** Hizuri: the voice print's verdict on the denoised audio, which stands for this turn. */
  speakerOverride?: SpeakerVerdict;
  /** The live text the STT showed while the user spoke; the last resort when no final comes. */
  partial: string;
  /**
   * Fired without text after speech because the STT failed or was late: a later text is the user's.
   */
  firedEmpty: boolean;
  committedSegmentIds: string[];
  transcriptsBySegmentId: Map<string, string>;
  finalTranscriptSegmentIds: Set<string>;
  transcriptMetaBySegmentId: Map<string, TranscriptSegmentMeta>;
  timeout: ReturnType<typeof setTimeout>;
  fired: boolean;
  /** Set when fired; delivered only after every earlier turn was delivered. */
  result?: VoiceFinalTranscript;
  /** Fired with the STT's draft of this segment; its final may correct it. */
  draft?: { segmentId: string; text: string };
}

export function createVoiceTurnController(params: {
  logger: Logger;
  turnDetection: TurnDetectionProvider;
  stt: SpeechToTextProvider;
  sttLanguage?: string;
  callbacks: VoiceTurnControllerCallbacks;
  filters?: VoiceTurnFilters;
  /** Hizuri: phrase ids follow the order the user started speaking in (voice-graph.ts). */
  nextPhraseId?: () => string | null;
  /** Hizuri: speech enhancement (speech-denoiser.ts); null = off. */
  denoiser?: SpeechDenoiser | null;
}): VoiceTurnController {
  const detector = params.turnDetection.createSession({
    logger: params.logger.child({ component: "turn-detection" }),
  });

  let state: VoiceInputState = { status: "idle" };
  let resampler: Pcm16MonoResampler | null = null;
  let sttSession: StreamingTranscriptionSession | null = null;
  let sttResampler: Pcm16MonoResampler | null = null;
  let inputRate = detector.requiredSampleRate;
  let sttInputRate = 0;
  let queued = Promise.resolve();
  let activeTranscriptSegmentId: string | null = null;
  // Hizuri: every new partial goes to the session (live text while the user speaks); upstream sent
  // only the first one of a turn.
  let lastPartialTranscript = "";
  let reconnectAttemptedForTurn = false;
  const sealedTranscriptSegmentIds = new Set<string>();
  let currentFinalizingTurn: FinalizingVoiceTurn | null = null;
  // Hizuri: finished phrases go to the session on their own queue. On the audio queue every
  // delivery (which waits for the agent, 0.5-1.6 s) stalled the microphone: no VAD, no barge-in
  // check, then a burst of chunks at once. Phrases still arrive one at a time, in order.
  let deliveries: Promise<void> = Promise.resolve();
  // Hizuri: turns whose transcript had not arrived when the next phrase began. Upstream dropped
  // them, which lost the first half of a phrase spoken with a short pause in the middle.
  let pendingFinalizingTurns: FinalizingVoiceTurn[] = [];
  // Turns in the order the user spoke them. A short phrase is transcribed faster than a long one
  // said before it, and delivering in finishing order sent the later phrase first.
  let turnsInSpokenOrder: FinalizingVoiceTurn[] = [];
  let sttPreRoll: TimedPcm[] = [];
  let sttFedBytes = 0;
  // Hizuri: recent 16 kHz audio for the speaker check, the STT retry and snapshotSpeech().
  let recentAudio: TimedPcm[] = [];
  // Hizuri: push-to-talk users mute right after speaking, so the silence that ends a phrase
  // never arrives. No chunk for this long while capturing ends the phrase (0 = off).
  // Every knob is read where it is used, so voice-settings.json changes it mid-session.
  const micGapEndMs = () => envNonNegative("PASEO_MIC_GAP_END_MS", 900);
  const sttPreRollMs = () => envNonNegative("PASEO_STT_PRE_ROLL_MS", DEFAULT_STT_PRE_ROLL_MS);
  const secondPassTailMs = () =>
    envNonNegative("PASEO_STT_SECOND_PASS_TAIL_MS", DEFAULT_SECOND_PASS_TAIL_MS);
  // Turns that ended without text after speech, by segment and turn id: a text that still arrives
  // for them is delivered late instead of dropped.
  const lateTurns = new Map<string, FinalizingVoiceTurn>();
  // Hizuri: empty phrases waiting for the tail of their second listen keep their audio.
  const secondPassTurns = new Set<FinalizingVoiceTurn>();
  // Hizuri: turns fired with a draft, by segment id, until the segment's final arrives.
  const draftTurns = new Map<string, FinalizingVoiceTurn>();
  // Hizuri: the fallback recogniser takes one phrase at a time.
  let fallbacks: Promise<void> = Promise.resolve();
  let micGapTimer: ReturnType<typeof setTimeout> | null = null;
  // Hizuri: a long monologue is sent in pieces: after chunkMs of capture the phrase ends at the
  // next pause of chunkPauseMs, or at chunkMaxMs regardless.
  const chunkMs = () => envNonNegative("PASEO_CHUNK_MS", 30_000);
  const chunkPauseMs = () => envNonNegative("PASEO_CHUNK_PAUSE_MS", 250);
  const chunkMaxMs = () => envNonNegative("PASEO_CHUNK_MAX_MS", 45_000);
  // Hizuri: the user's voice is brought to a steady level before the detector and the recogniser.
  const micGain = new MicGain();
  let lastVoicedAt = 0;
  // When the user's last phrase that matched the voice print ended (see OWNER_TAIL_GAP_MS).
  let ownerSpokeUntil = 0;
  const roomMeter = new RoomLevelMeter();

  function forgetPendingTurn(turn: FinalizingVoiceTurn): void {
    pendingFinalizingTurns = pendingFinalizingTurns.filter((pending) => pending !== turn);
  }

  function audioBetween(from: number, to = Infinity): Buffer {
    return Buffer.concat(recentAudio.filter((c) => c.t >= from && c.t <= to).map((c) => c.pcm));
  }

  /** Hizuri: the same span before the mic gain (the gained audio where no raw copy was kept). */
  function rawAudioBetween(from: number, to: number): Buffer {
    return Buffer.concat(
      recentAudio.filter((c) => c.t >= from && c.t <= to).map((c) => c.raw ?? c.pcm),
    );
  }

  function fail(error: unknown): void {
    params.callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }

  function firePartialTranscript(segmentId: string, transcript: string): void {
    if (transcript === lastPartialTranscript || state.status !== "capturing") {
      return;
    }

    lastPartialTranscript = transcript;
    void runSerial(async () => {
      await params.callbacks.onPartialTranscript({ segmentId, transcript });
    });
  }

  function getFinalizingTurnForSegment(segmentId: string): FinalizingVoiceTurn | null {
    const pending = pendingFinalizingTurns.find((turn) =>
      turn.committedSegmentIds.includes(segmentId),
    );
    if (pending) {
      return pending;
    }
    if (!currentFinalizingTurn) {
      return null;
    }

    if (currentFinalizingTurn.committedSegmentIds.includes(segmentId)) {
      return currentFinalizingTurn;
    }

    if (currentFinalizingTurn.committedSegmentIds.length > 0) {
      return null;
    }

    if (activeTranscriptSegmentId && activeTranscriptSegmentId !== segmentId) {
      return null;
    }

    return currentFinalizingTurn;
  }

  function getOrderedFinalSegmentIds(turn: FinalizingVoiceTurn): string[] {
    if (turn.committedSegmentIds.length === 0) {
      return [...turn.finalTranscriptSegmentIds];
    }

    return turn.committedSegmentIds.filter((segmentId) =>
      turn.finalTranscriptSegmentIds.has(segmentId),
    );
  }

  function assembleFinalTranscript(turn: FinalizingVoiceTurn): VoiceFinalTranscript {
    const orderedFinalSegmentIds = getOrderedFinalSegmentIds(turn);
    const transcript = orderedFinalSegmentIds
      .map((segmentId) => turn.transcriptsBySegmentId.get(segmentId)?.trim() ?? "")
      .filter((segment) => segment.length > 0)
      .join(" ")
      .trim();
    const orderedFinalMeta = orderedFinalSegmentIds
      .map((segmentId) => turn.transcriptMetaBySegmentId.get(segmentId))
      .filter((meta): meta is TranscriptSegmentMeta => Boolean(meta));
    const language = orderedFinalMeta.find((meta) => meta.language)?.language;
    const singleSegmentMeta = orderedFinalMeta.length === 1 ? orderedFinalMeta[0] : null;
    const allLowConfidence =
      orderedFinalMeta.length > 0 &&
      orderedFinalMeta.every((meta) => meta.isLowConfidence === true);

    return {
      segmentId: turn.committedSegmentIds[0] ?? orderedFinalSegmentIds[0] ?? turn.turnId,
      transcript,
      ...(language ? { language } : {}),
      ...(singleSegmentMeta?.avgLogprob !== undefined
        ? { avgLogprob: singleSegmentMeta.avgLogprob }
        : {}),
      ...(allLowConfidence ? { isLowConfidence: true } : {}),
      durationMs: Math.max(0, Date.now() - turn.startedAt),
      ...(turn.phraseId ? { phraseId: turn.phraseId } : {}),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      ...(turn.draft ? { draft: true } : {}),
    };
  }

  /**
   * Hizuri: the echo check, the junk check and the user-voice check, each phrase journaled with
   * its outcome. A dropped phrase goes on with an empty transcript.
   */
  function filterFinalTranscript(
    turn: FinalizingVoiceTurn,
    finalTranscript: VoiceFinalTranscript,
    reason: FinalTranscriptReason,
  ): void {
    const filters = params.filters;
    finalTranscript.situation = situationOf(turn);
    if (!filters) {
      return;
    }
    const journal = filters.journal;
    const transcript = finalTranscript.transcript;
    // The phrase id leads the extra field, so a journal line is found by id.
    const tag = (extra?: string) =>
      [turn.phraseId, extra].filter((part): part is string => Boolean(part)).join(", ") ||
      undefined;
    const drop = (why: string) => {
      finalTranscript.dropReason = why;
      finalTranscript.droppedText = transcript;
      finalTranscript.transcript = "";
    };
    if (!transcript) {
      const seconds = Math.round((Date.now() - turn.startedAt) / 1000);
      journal?.write("empty", "", tag(`${reason}, ${seconds} s of speech`));
      finalTranscript.dropReason = reason === "complete" ? "empty" : `empty: ${reason}`;
      return;
    }
    const speaker = filters.speakerGate;
    // Hizuri: while a reply plays (or just ended) the looser check also runs: with the timbre
    // filter off, our own voice heard back is caught by its words alone. With the
    // voice print deciding, a match only marks the phrase: the assistant's long echo
    // fails the print anyway, a short one reaches Zuri marked, and Zuri judges it. Dropping on
    // words alone threw away "wait, hold on" right after the assistant had said "stop" and "wait".
    const echoLike = Boolean(filters.echo?.isPhraseEcho(transcript, turn));
    if (echoLike && !speakerDecides(speaker)) {
      params.logger.info({ transcript }, "speaker_gate.echo_dropped");
      journal?.write("echo", transcript, tag());
      drop("echo");
      return;
    }
    if (isJunkTranscript(transcript, params.sttLanguage)) {
      params.logger.info({ transcript }, "speaker_gate.junk_dropped");
      journal?.write("junk", transcript, tag());
      drop("junk");
      return;
    }
    if (!speaker) {
      journal?.write("accepted", transcript, tag());
      return;
    }
    const verdict = checkSpeaker(speaker.gate, turn, transcript);
    params.logger.info({ ...verdict, echoLike, transcript }, "speaker_gate.verdict");
    finalTranscript.situation = situationOf(
      turn,
      verdict,
      isAssistantLine(echoLike, filters.echo, transcript, turn),
    );
    const score = verdictTag(verdict, echoLike);
    const assistantEcho = judgeEchoDrop({
      transcript,
      score: verdict.score,
      maxScore: envNumber("PASEO_ECHO_DROP_SCORE", -1),
      echoLike,
      heard: echoLike ? (filters.echo?.heardMatch(transcript, turn) ?? null) : null,
    });
    if (assistantEcho.drop) {
      params.logger.info(
        { transcript, score: verdict.score, reason: assistantEcho.reason },
        "speaker_gate.echo_dropped",
      );
      journal?.write("echo", transcript, tag(score));
      drop(assistantEcho.reason);
      return;
    }
    const short = markShortPhrase(turn, finalTranscript, verdict, echoLike);
    const outcome = voiceOutcome(verdict, short !== null, speaker.advisory);
    journal?.write(outcome, transcript, tag(score));
    if (outcome === "other-voice") {
      drop("other-voice");
      recheckOnDenoised(turn, speaker.gate, transcript, verdict);
    }
  }

  /**
   * Hizuri: the voice print rejected a phrase: it looks again at the phrase's denoised audio (wind
   * and traffic pull outdoor phrases below the threshold, and DPDFNet lifts part of them back).
   * A match there brings the phrase to the session late.
   */
  function recheckOnDenoised(
    turn: FinalizingVoiceTurn,
    gate: SpeakerGate,
    transcript: string,
    rawVerdict: SpeakerVerdict,
  ): void {
    const denoiser = params.denoiser;
    if (!denoiser || turn.voiceRecheck) {
      return;
    }
    turn.voiceRecheck = true;
    const pcm = audioBetween(turn.startedAt - PRE_ROLL_MS, turn.endedAt + 300);
    void recheck(turn, gate, transcript, rawVerdict, denoiser, pcm);
  }

  async function recheck(
    turn: FinalizingVoiceTurn,
    gate: SpeakerGate,
    transcript: string,
    rawVerdict: SpeakerVerdict,
    denoiser: SpeechDenoiser,
    pcm: Buffer,
  ): Promise<void> {
    const startedAt = Date.now();
    let clean: Buffer;
    try {
      clean = await denoiser.denoise(pcm);
    } catch (error) {
      params.logger.warn(
        { phraseId: turn.phraseId, err: error instanceof Error ? error.message : String(error) },
        "speaker_gate.denoise_failed",
      );
      return;
    }
    const verdict = gate.check(clean, transcript, params.logger, params.sttLanguage);
    params.logger.info(
      {
        phraseId: turn.phraseId,
        raw: rawVerdict.score,
        denoised: verdict.score,
        accept: verdict.accept,
        ms: Date.now() - startedAt,
      },
      "speaker_gate.denoised_verdict",
    );
    if (verdict.accept) {
      turn.speakerOverride = verdict;
      deliverLate(turn, transcript, "denoised-voice-print");
    }
  }

  /** Hizuri: audio for a retry, second listen or fallback, denoised when the target is "all". */
  async function sttAudio(pcm: Buffer): Promise<Buffer> {
    const denoiser = params.denoiser;
    if (!denoiser || denoiser.target !== "all") {
      return pcm;
    }
    try {
      return await denoiser.denoise(pcm);
    } catch (error) {
      params.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "stt.denoise_failed",
      );
      return pcm;
    }
  }

  /** Hizuri: the room and the voice print around a phrase (situation.ts). */
  function situationOf(
    turn: FinalizingVoiceTurn,
    verdict?: SpeakerVerdict,
    echoLike?: boolean,
  ): PhraseSituation {
    return {
      durationMs: Math.max(0, turn.endedAt - turn.startedAt),
      roomDb: turn.roomDb === null ? null : Math.round(turn.roomDb),
      room: roomKind(turn.roomDb, resolveShortPhraseConfig().quietDb),
      ...(verdict?.score !== undefined ? { score: verdict.score } : {}),
      ...(verdict ? { verdict: verdict.reason } : {}),
      ...(echoLike ? { echoLike: true } : {}),
    };
  }

  /** Hizuri: a short phrase carries its situation to Zuri (short-phrase.ts); null when not short. */
  function markShortPhrase(
    turn: FinalizingVoiceTurn,
    finalTranscript: VoiceFinalTranscript,
    verdict: SpeakerVerdict,
    echoLike: boolean,
  ): ShortPhraseInfo | null {
    const short = describeShortPhrase({
      // Hizuri: short phrases go to Zuri with their situation instead of the voice print's verdict.
      config: resolveShortPhraseConfig(),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      roomDb: turn.roomDb,
      verdict,
      echoLike,
    });
    if (short) {
      finalTranscript.shortPhrase = short;
      params.logger.info(
        { ...short, transcript: finalTranscript.transcript },
        "speaker_gate.short_phrase",
      );
    }
    return short;
  }

  function checkSpeaker(
    gate: SpeakerGate,
    turn: FinalizingVoiceTurn,
    transcript: string,
  ): SpeakerVerdict {
    if (turn.speakerOverride) {
      return turn.speakerOverride;
    }
    const verdict = gate.check(
      // Only this phrase: the start of the next one is someone else's voice as often as the user's.
      audioBetween(turn.startedAt - PRE_ROLL_MS, turn.endedAt + 300),
      transcript,
      params.logger,
      params.sttLanguage,
    );
    // Only a real match opens the window, so tails never chain into a stranger's short replies.
    if (verdict.reason === "match") {
      ownerSpokeUntil = Math.max(ownerSpokeUntil, turn.endedAt);
      return verdict;
    }
    const isOwnerTail =
      verdict.reason === "other-voice" &&
      turn.endedAt - turn.startedAt <= OWNER_TAIL_MAX_MS &&
      turn.startedAt - ownerSpokeUntil <= OWNER_TAIL_GAP_MS;
    return isOwnerTail ? { ...verdict, accept: true, reason: "continues-owner" } : verdict;
  }

  function fireFinalTranscript(turn: FinalizingVoiceTurn, reason: FinalTranscriptReason): void {
    const isPending = pendingFinalizingTurns.includes(turn);
    if (turn.fired || (currentFinalizingTurn?.turnId !== turn.turnId && !isPending)) {
      return;
    }

    turn.fired = true;
    clearTimeout(turn.timeout);
    if (isPending) {
      forgetPendingTurn(turn);
    } else {
      currentFinalizingTurn = null;
    }

    const finalTranscript = assembleFinalTranscript(turn);
    noteEndWithoutText(turn, finalTranscript, reason);
    filterFinalTranscript(turn, finalTranscript, reason);
    maybeSecondPass(turn, finalTranscript, reason);
    if (reason === "timeout") {
      params.logger.warn(
        {
          turnId: turn.turnId,
          committedSegments: turn.committedSegmentIds.length,
          receivedFinals: turn.finalTranscriptSegmentIds.size,
          timeoutMs: VOICE_FINAL_TRANSCRIPT_TIMEOUT_MS,
          transcriptLength: finalTranscript.transcript.length,
        },
        "voice_turn.final_transcript_timeout",
      );
    }

    turn.result = finalTranscript;
    deliverInSpokenOrder();
  }

  /**
   * Hizuri: a turn that ends without text after speech because the STT failed or was late. Its live
   * text is used when there is one; otherwise a text that still arrives is delivered late.
   */
  function noteEndWithoutText(
    turn: FinalizingVoiceTurn,
    finalTranscript: VoiceFinalTranscript,
    reason: FinalTranscriptReason,
  ): void {
    if (reason === "complete" || finalTranscript.transcript) {
      return;
    }
    if (turn.partial) {
      params.logger.warn(
        { turnId: turn.turnId, reason, transcript: turn.partial },
        "voice_turn.partial_used",
      );
      finalTranscript.transcript = turn.partial;
      // The live text is garbled in noise; a final or a retry that still comes corrects it.
      finalTranscript.draft = true;
      markDraft(turn, turn.committedSegmentIds[0] ?? turn.turnId, turn.partial);
      return;
    }
    turn.firedEmpty = true;
    for (const id of [turn.turnId, ...turn.committedSegmentIds]) {
      lateTurns.set(id, turn);
    }
    while (lateTurns.size > 64) {
      const oldest = lateTurns.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      lateTurns.delete(oldest);
    }
  }

  /** Hizuri: text for a turn that already ended empty reaches the session late, never dropped. */
  function deliverLate(turn: FinalizingVoiceTurn, text: string, source: string): void {
    turn.firedEmpty = false;
    for (const [id, late] of lateTurns) {
      if (late === turn) {
        lateTurns.delete(id);
      }
    }
    const result: VoiceFinalTranscript = {
      segmentId: turn.committedSegmentIds[0] ?? turn.turnId,
      transcript: text.trim(),
      durationMs: Math.max(0, Date.now() - turn.startedAt),
      // The phrase graph gets a second line for this id: the late text supersedes "empty".
      ...(turn.phraseId ? { phraseId: turn.phraseId } : {}),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
    };
    params.logger.warn(
      { turnId: turn.turnId, source, transcript: result.transcript },
      "voice_turn.late_transcript",
    );
    filterFinalTranscript(turn, result, "complete");
    const waiting = turnsInSpokenOrder.includes(turn);
    // The turn's state is its latest text (a correction checks whether it was dropped).
    turn.result = result;
    if (waiting) {
      // Its empty result waits behind an earlier phrase: the text takes its place, in order.
      deliverInSpokenOrder();
      return;
    }
    deliveries = deliveries
      .then(() => params.callbacks.onFinalTranscript(result))
      .catch((error) => fail(error));
  }

  /**
   * Hizuri: the STT answered and heard nothing in a phrase the detector called speech. The phrase
   * still ends empty now (later phrases never wait for this); its raw audio from
   * SECOND_PASS_LEAD_MS before the start (never before its pre-roll) through secondPassTailMs past
   * the stop is transcribed once more in the user's next pause, and words that are not junk reach
   * the session late, as that phrase.
   */
  function maybeSecondPass(
    turn: FinalizingVoiceTurn,
    finalTranscript: VoiceFinalTranscript,
    reason: FinalTranscriptReason,
  ): void {
    const retranscribe = params.callbacks.retranscribe;
    if (
      !retranscribe ||
      secondPassTailMs() <= 0 ||
      reason !== "complete" ||
      finalTranscript.transcript ||
      (finalTranscript.dropReason ?? "empty") !== "empty" ||
      turn.retried ||
      turn.secondPass
    ) {
      return;
    }
    turn.secondPass = true;
    void secondPass(turn, retranscribe);
  }

  /** The user is saying a phrase now (a call, so awaits do not narrow it). */
  function speaking(): boolean {
    return state.status === "capturing";
  }

  async function secondPass(
    turn: FinalizingVoiceTurn,
    retranscribe: (pcm16k: Buffer) => Promise<{ text: string }>,
  ): Promise<void> {
    // Its audio is kept until the tail has arrived; then it waits for the user's pause (at most
    // SECOND_PASS_MAX_WAIT_MS: a monologue has none).
    const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
    secondPassTurns.add(turn);
    const tailMs = secondPassTailMs();
    await sleep(Math.max(0, turn.endedAt + tailMs - Date.now()));
    const from = Math.max(turn.sttFrom, turn.startedAt - SECOND_PASS_LEAD_MS);
    const pcm = rawAudioBetween(from, turn.endedAt + tailMs);
    secondPassTurns.delete(turn);
    if (pcm.length < 16000) {
      return; // Its audio is gone.
    }
    for (let waited = 0; speaking() && waited < SECOND_PASS_MAX_WAIT_MS; ) {
      await sleep(SECOND_PASS_WAIT_STEP_MS);
      waited += SECOND_PASS_WAIT_STEP_MS;
    }
    const startedAt = Date.now();
    let text: string;
    try {
      text = (await retranscribe(await sttAudio(pcm))).text.trim();
    } catch (error) {
      params.logger.warn(
        { phraseId: turn.phraseId, err: error instanceof Error ? error.message : String(error) },
        "voice_turn.second_pass_failed",
      );
      maybeFallback(turn, "empty", pcm);
      return;
    }
    const usable = Boolean(text) && !isJunkTranscript(text, params.sttLanguage);
    params.logger.info(
      {
        turnId: turn.turnId,
        phraseId: turn.phraseId,
        text,
        usable,
        audioMs: Math.round(pcm.length / 32),
        ms: Date.now() - startedAt,
      },
      "voice_turn.second_pass",
    );
    if (usable) {
      deliverLate(turn, text, "second-pass");
    } else {
      maybeFallback(turn, "empty", pcm);
    }
  }

  /**
   * Hizuri: the STT failed, timed out or heard nothing twice: the fallback recogniser listens to
   * the phrase once, while the STT's retries go on. Words that are not junk end the turn, or reach
   * the session late, as a draft: a text the STT still brings corrects it.
   */
  function maybeFallback(turn: FinalizingVoiceTurn, why: "failed" | "empty", pcm: Buffer): void {
    const fallback = params.callbacks.transcribeFallback;
    if (
      !fallback ||
      turn.fallback ||
      turn.endedAt - turn.startedAt < FALLBACK_MIN_MS ||
      pcm.length < 16000
    ) {
      return;
    }
    turn.fallback = true;
    fallbacks = fallbacks.then(() => runFallback(turn, why, pcm, fallback));
  }

  async function runFallback(
    turn: FinalizingVoiceTurn,
    why: "failed" | "empty",
    pcm: Buffer,
    fallback: (pcm16k: Buffer) => Promise<{ text: string }>,
  ): Promise<void> {
    // Done: the STT brought its text meanwhile. A turn that ended with its live text still counts
    // as open: that text is garbled in noise (e.g. two invented words in a replay).
    const done = () =>
      turn.fired && !turn.firedEmpty && !turn.draft && !(why === "empty" && turn.secondPass);
    if (done()) {
      return;
    }
    const startedAt = Date.now();
    let text: string;
    try {
      text = (await fallback(await sttAudio(pcm))).text.trim();
    } catch (error) {
      params.logger.warn(
        { phraseId: turn.phraseId, err: error instanceof Error ? error.message : String(error) },
        "voice_turn.fallback_failed",
      );
      return;
    }
    const usable = Boolean(text) && !isJunkTranscript(text, params.sttLanguage);
    params.logger.info(
      {
        turnId: turn.turnId,
        phraseId: turn.phraseId,
        why,
        text,
        usable,
        audioMs: Math.round(pcm.length / 32),
        ms: Date.now() - startedAt,
      },
      "voice_turn.fallback",
    );
    const segmentId = turn.committedSegmentIds[0] ?? turn.turnId;
    if (!usable) {
      return;
    }
    if (!turn.fired) {
      markDraft(turn, segmentId, text);
      applyRetriedTranscript(turn, text);
    } else if (turn.firedEmpty || (why === "empty" && !turn.result?.transcript)) {
      deliverLate(turn, text, "fallback");
      markDraft(turn, segmentId, text);
    } else if (turn.draft) {
      correctDraft(turn, text, "fallback");
    }
  }

  /**
   * Hizuri: a transcript found by a retry: the turn's text, a late phrase if it ended empty, or a
   * correction of the live text it ended with. A retry that heard nothing ends the turn empty but
   * open: the STT's own final may still come (retries can answer empty while the STT,
   * slow under load, was still decoding the phrase).
   */
  function takeRecoveredText(
    turn: FinalizingVoiceTurn,
    text: string,
    source: string,
    reason: FinalTranscriptReason,
  ): void {
    const recovered = text.trim() || turn.partial;
    if (!turn.fired) {
      if (recovered) {
        applyRetriedTranscript(turn, recovered);
      } else {
        fireFinalTranscript(turn, reason);
      }
    } else if (turn.firedEmpty && recovered) {
      deliverLate(turn, recovered, source);
    } else if (turn.draft && text.trim()) {
      correctDraft(turn, text.trim(), source);
    }
  }

  /** Hand finished turns to the session in the order they were spoken, never out of order. */
  function deliverInSpokenOrder(): void {
    while (turnsInSpokenOrder[0]?.result) {
      const next = turnsInSpokenOrder.shift();
      const result = next?.result;
      if (!result) {
        break;
      }
      deliveries = deliveries
        .then(() => params.callbacks.onFinalTranscript(result))
        .catch((error) => fail(error));
    }
  }

  function maybeFireFinalTranscript(turn: FinalizingVoiceTurn): void {
    if (turn.fired || turn.committedSegmentIds.length === 0) {
      return;
    }

    const allCommittedSegmentsFinal = turn.committedSegmentIds.every((segmentId) =>
      turn.finalTranscriptSegmentIds.has(segmentId),
    );
    if (allCommittedSegmentsFinal) {
      fireFinalTranscript(turn, "complete");
    }
  }

  async function reconnectSttSession(): Promise<void> {
    const previousSession = sttSession;
    sttSession = null;
    sttResampler = null;
    sttInputRate = 0;
    previousSession?.close();

    try {
      const nextSession = createSttSession();
      await nextSession.connect();
      sttSession = nextSession;
      params.logger.info("voice_turn.stt_reconnected");
    } catch (error) {
      fail(error);
      params.logger.warn({ err: error }, "voice_turn.stt_reconnect_failed");
    }
  }

  /** Hizuri: give a retried transcript to the turn's segments that have none yet. */
  function applyRetriedTranscript(turn: FinalizingVoiceTurn, text: string): void {
    const ids = turn.committedSegmentIds.length > 0 ? turn.committedSegmentIds : [turn.turnId];
    ids.forEach((id, k) => {
      if (!turn.finalTranscriptSegmentIds.has(id)) {
        turn.transcriptsBySegmentId.set(id, k === 0 ? text : "");
        turn.finalTranscriptSegmentIds.add(id);
      }
    });
    if (turn.committedSegmentIds.length === 0) {
      turn.committedSegmentIds.push(turn.turnId);
    }
    maybeFireFinalTranscript(turn);
  }

  /**
   * Hizuri: transcribe a phrase's kept audio again: up to 3 tries with growing pauses while the STT
   * refuses it, within a deadline. A try still running at the deadline is not given up: its text,
   * when it comes, is delivered late (takeRecoveredText).
   */
  async function retranscribeTurn(
    turn: FinalizingVoiceTurn,
    rawPcm: Buffer,
    retranscribe: (pcm16k: Buffer) => Promise<{ text: string }>,
    reason: FinalTranscriptReason,
  ): Promise<void> {
    const pcm = params.denoiser?.target === "all" ? await sttAudio(rawPcm) : rawPcm;
    const audioMs = pcm.length / 32;
    const deadline = Date.now() + Math.max(20_000, audioMs * 1.5);
    // Every try refused (none answered, none still running): the late tries take over.
    let refused = true;
    for (const [index, delay] of RETRY_DELAYS_MS.entries()) {
      await new Promise((done) => setTimeout(done, delay));
      if (turn.fired && !turn.firedEmpty) {
        return;
      }
      const attempt = index + 1;
      const tried = retranscribe(pcm).then(
        (result) => {
          params.logger.info(
            { turnId: turn.turnId, attempt, chars: result.text.length },
            "voice_turn.stt_retry_ok",
          );
          takeRecoveredText(turn, result.text, "retry", reason);
          return true;
        },
        (error: unknown) => {
          params.logger.warn(
            {
              turnId: turn.turnId,
              attempt,
              err: error instanceof Error ? error.message : String(error),
            },
            "voice_turn.stt_retry_failed",
          );
          return false;
        },
      );
      const left = deadline - Date.now();
      const answered = await Promise.race([
        tried,
        new Promise<null>((done) => setTimeout(() => done(null), Math.max(0, left))),
      ]);
      if (answered === true || answered === null) {
        refused = false;
        break;
      }
      if (Date.now() >= deadline) {
        break;
      }
    }
    if (!turn.fired && (currentFinalizingTurn === turn || pendingFinalizingTurns.includes(turn))) {
      fireFinalTranscript(turn, reason);
    }
    if (refused) {
      void retryLate(turn, pcm, retranscribe);
    }
  }

  /**
   * Hizuri: the STT refused every try in time (it was down or full) and the phrase ended empty:
   * keep trying its audio while it stands empty; a text that comes is delivered late.
   */
  async function retryLate(
    turn: FinalizingVoiceTurn,
    pcm: Buffer,
    retranscribe: (pcm16k: Buffer) => Promise<{ text: string }>,
  ): Promise<void> {
    for (const [index, delay] of LATE_RETRY_DELAYS_MS.entries()) {
      await new Promise((done) => setTimeout(done, delay));
      if (!turn.firedEmpty) {
        return;
      }
      const attempt = RETRY_DELAYS_MS.length + index + 1;
      try {
        const result = await retranscribe(pcm);
        params.logger.info(
          { turnId: turn.turnId, attempt, chars: result.text.length },
          "voice_turn.stt_retry_ok",
        );
        takeRecoveredText(turn, result.text, "late-retry", "stt-failed");
        return;
      } catch (error) {
        params.logger.warn(
          {
            turnId: turn.turnId,
            attempt,
            err: error instanceof Error ? error.message : String(error),
          },
          "voice_turn.stt_retry_failed",
        );
      }
    }
  }

  /** Hizuri: starts transcribing a turn's kept audio again; false when that cannot be done. */
  function startRetry(turn: FinalizingVoiceTurn, reason: FinalTranscriptReason): boolean {
    const retranscribe = params.callbacks.retranscribe;
    if (turn.retried || !retranscribe) {
      return false;
    }
    // The audio the STT got: its pre-roll never reaches back into the previous phrase.
    const pcm = audioBetween(turn.sttFrom, turn.endedAt + 300);
    if (pcm.length < 16000) {
      return false; // Its audio is gone.
    }
    turn.retried = true;
    void retranscribeTurn(turn, pcm, retranscribe, reason);
    maybeFallback(turn, "failed", pcm);
    return true;
  }

  /**
   * Hizuri: a busy STT (one that takes two uploads at a time) refuses a third with 503 or a broken
   * pipe, and the phrase then waited 30 s for a transcript that never came. The failed phrase is
   * transcribed again from its own audio (retranscribeTurn).
   */
  function retryFailedTurn(segmentId?: string): void {
    const late = segmentId ? lateTurns.get(segmentId) : undefined;
    if (late?.firedEmpty) {
      startRetry(late, "stt-failed");
      return;
    }
    const bySegment = segmentId
      ? [currentFinalizingTurn, ...pendingFinalizingTurns].find((turn) =>
          turn?.committedSegmentIds.includes(segmentId),
        )
      : undefined;
    // Without a segment id the failed request is almost always the latest commit.
    const turn =
      bySegment ??
      currentFinalizingTurn ??
      pendingFinalizingTurns[pendingFinalizingTurns.length - 1] ??
      null;
    if (!turn || turn.fired) {
      return;
    }
    const missing = turn.committedSegmentIds.filter(
      (id) => !turn.finalTranscriptSegmentIds.has(id),
    );
    if (turn.committedSegmentIds.length > 0 && missing.length === 0) {
      return;
    }
    startRetry(turn, "stt-failed");
  }

  /** Hizuri: no final in time. The phrase's kept audio is transcribed again before it ends empty. */
  function onTurnTimeout(turn: FinalizingVoiceTurn): void {
    if (turn.fired) {
      return;
    }
    params.logger.warn(
      { turnId: turn.turnId, receivedFinals: turn.finalTranscriptSegmentIds.size },
      "voice_turn.final_late",
    );
    if (!startRetry(turn, "timeout")) {
      fireFinalTranscript(turn, "timeout");
    }
  }

  function handleSttError(error: unknown): void {
    fail(error);
    params.logger.warn({ err: error }, "voice_turn.stt_error");
    if (error instanceof PhraseTranscriptionError) {
      // One phrase failed and the session works: a reset would drop the phrase being spoken now.
      retryFailedTurn(error.segmentId);
      return;
    }
    retryFailedTurn();
    if (reconnectAttemptedForTurn) {
      sttSession?.close();
      sttSession = null;
      return;
    }

    reconnectAttemptedForTurn = true;
    void runSerial(reconnectSttSession);
  }

  /**
   * Hizuri: a draft (a quick text before the final) ends the turn at once, like a final, when it
   * is the only segment of the turn and passes the text checks; otherwise the turn waits for the
   * final as before. The speaker check runs once, on the draft.
   */
  function handleDraftSttTranscript(event: StreamingTranscriptionEvent): void {
    const turn = getFinalizingTurnForSegment(event.segmentId);
    const text = event.transcript.trim();
    if (!turn || turn.fired || !text) {
      return;
    }
    if (turn.committedSegmentIds.length !== 1 || turn.committedSegmentIds[0] !== event.segmentId) {
      return;
    }
    const echo = params.filters?.echo?.isPhraseEcho(text, turn) ?? false;
    if (echo || isJunkTranscript(text, params.sttLanguage)) {
      params.logger.info({ turnId: turn.turnId, text, echo }, "voice_turn.draft_skipped");
      return;
    }
    params.logger.info(
      {
        turnId: turn.turnId,
        phraseId: turn.phraseId,
        text,
        sinceStopMs: Date.now() - turn.endedAt,
      },
      "voice_turn.draft_used",
    );
    markDraft(turn, event.segmentId, text);
    applySegmentFinal(turn, event);
  }

  /** Hizuri: the turn goes out with a quick text; a later text for it becomes a correction. */
  function markDraft(turn: FinalizingVoiceTurn, segmentId: string, text: string): void {
    turn.draft = { segmentId, text };
    for (const id of new Set([segmentId, turn.turnId, ...turn.committedSegmentIds])) {
      draftTurns.set(id, turn);
    }
    while (draftTurns.size > 64) {
      const oldest = draftTurns.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      draftTurns.delete(oldest);
    }
  }

  /**
   * Hizuri: a later text of a turn already delivered as a draft (the STT's quick text, or the live
   * text a late turn ended with). The same words: nothing to do. Other words: the text goes to the
   * session as a correction and becomes the one later texts are compared with. An empty text or a
   * dropped draft: the draft stands.
   */
  function correctDraft(
    turn: FinalizingVoiceTurn,
    finalText: string,
    source: string,
    language?: string,
  ): void {
    const draftText = turn.draft?.text ?? "";
    const text = finalText.trim();
    const same = sameTranscriptWords(draftText, text);
    const dropped = turn.result?.dropReason;
    params.logger.info(
      {
        turnId: turn.turnId,
        phraseId: turn.phraseId,
        source,
        draft: draftText,
        final: text,
        same,
        sinceStopMs: Date.now() - turn.endedAt,
        ...(dropped ? { dropped } : {}),
      },
      same ? "voice_turn.draft_confirmed" : "voice_turn.draft_final",
    );
    if (!text || same || dropped || !turn.draft) {
      return;
    }
    turn.draft = { ...turn.draft, text };
    const result: VoiceFinalTranscript = {
      segmentId: turn.draft.segmentId,
      transcript: text,
      ...(language ? { language } : {}),
      durationMs: Math.max(0, Date.now() - turn.startedAt),
      ...(turn.phraseId ? { phraseId: turn.phraseId } : {}),
      startedAt: turn.startedAt,
      endedAt: turn.endedAt,
      correctionOf: draftText,
    };
    deliveries = deliveries
      .then(() => params.callbacks.onFinalTranscript(result))
      .catch((error) => fail(error));
  }

  function handleFinalSttTranscript(event: StreamingTranscriptionEvent): void {
    if (event.draft) {
      handleDraftSttTranscript(event);
      return;
    }
    const drafted = draftTurns.get(event.segmentId);
    if (drafted?.fired) {
      correctDraft(drafted, event.transcript, "stt", event.language);
      return;
    }
    const late = lateTurns.get(event.segmentId);
    if (late) {
      if (late.firedEmpty && event.transcript.trim()) {
        deliverLate(late, event.transcript, "stt");
      }
      return;
    }
    const turn = getFinalizingTurnForSegment(event.segmentId);
    if (!turn || turn.fired) {
      return;
    }
    applySegmentFinal(turn, event);
  }

  function applySegmentFinal(turn: FinalizingVoiceTurn, event: StreamingTranscriptionEvent): void {
    turn.transcriptsBySegmentId.set(event.segmentId, event.transcript);
    turn.finalTranscriptSegmentIds.add(event.segmentId);
    turn.transcriptMetaBySegmentId.set(event.segmentId, {
      ...(event.language ? { language: event.language } : {}),
      ...(event.avgLogprob !== undefined ? { avgLogprob: event.avgLogprob } : {}),
      ...(event.isLowConfidence !== undefined ? { isLowConfidence: event.isLowConfidence } : {}),
    });
    maybeFireFinalTranscript(turn);
  }

  function handlePartialSttTranscript(event: StreamingTranscriptionEvent): void {
    // Live text that arrives after the phrase ended still updates its last resort.
    const finalizing = [currentFinalizingTurn, ...pendingFinalizingTurns].find((turn) =>
      turn?.committedSegmentIds.includes(event.segmentId),
    );
    if (finalizing && event.transcript.trim()) {
      finalizing.partial = event.transcript.trim();
    }
    if (state.status !== "capturing") {
      return;
    }

    if (sealedTranscriptSegmentIds.has(event.segmentId)) {
      return;
    }

    if (activeTranscriptSegmentId && event.segmentId !== activeTranscriptSegmentId) {
      return;
    }

    const transcript = event.transcript.trim();
    if (!transcript) {
      return;
    }

    activeTranscriptSegmentId = event.segmentId;

    if (isFillerOnlyPartial(transcript)) {
      return;
    }

    firePartialTranscript(event.segmentId, transcript);
  }

  function handleSttTranscript(event: StreamingTranscriptionEvent): void {
    if (event.isFinal) {
      handleFinalSttTranscript(event);
      return;
    }

    handlePartialSttTranscript(event);
  }

  function createSttSession(): StreamingTranscriptionSession {
    const session = params.stt.createSession({
      logger: params.logger.child({ component: "stt" }),
      language: params.sttLanguage ?? "en",
    });
    session.on("transcript", handleSttTranscript);
    session.on("committed", ({ segmentId }) => {
      sealedTranscriptSegmentIds.add(segmentId);
      if (state.status === "capturing" && !activeTranscriptSegmentId) {
        activeTranscriptSegmentId = segmentId;
      }
      // Hizuri: a commit that lands after the next phrase began belongs to the turn that made it.
      const turn =
        currentFinalizingTurn ??
        pendingFinalizingTurns.findLast(
          (pending) => pending.committedSegmentIds.length === 0 && !pending.fired,
        ) ??
        null;
      if (turn && !turn.committedSegmentIds.includes(segmentId)) {
        turn.committedSegmentIds.push(segmentId);
        maybeFireFinalTranscript(turn);
      }
    });
    session.on("error", handleSttError);
    return session;
  }

  function runSerial(task: () => Promise<void>): Promise<void> {
    queued = queued.then(task).catch((error) => {
      fail(error);
    });
    return queued;
  }

  function updateDetectorResampler(parsedInputRate: number): void {
    if (parsedInputRate === inputRate) {
      return;
    }

    inputRate = parsedInputRate;
    resampler =
      inputRate === detector.requiredSampleRate
        ? null
        : new Pcm16MonoResampler({
            inputRate,
            outputRate: detector.requiredSampleRate,
          });
  }

  function updateSttResampler(
    session: StreamingTranscriptionSession,
    parsedInputRate: number,
  ): void {
    if (parsedInputRate === sttInputRate) {
      return;
    }

    sttInputRate = parsedInputRate;
    sttResampler =
      sttInputRate === session.requiredSampleRate
        ? null
        : new Pcm16MonoResampler({
            inputRate: sttInputRate,
            outputRate: session.requiredSampleRate,
          });
  }

  function pcmForDetector(pcm16: Buffer): Buffer {
    return resampler === null ? pcm16 : resampler.processChunk(pcm16);
  }

  function pcmForStt(
    session: StreamingTranscriptionSession,
    pcm16: Buffer,
    detectorPcm16: Buffer,
  ): Buffer {
    if (session.requiredSampleRate === detector.requiredSampleRate) {
      return detectorPcm16;
    }

    if (sttResampler === null) {
      return pcm16;
    }

    return sttResampler.processChunk(pcm16);
  }

  async function handleSpeechStarted(): Promise<void> {
    if (state.status === "capturing") {
      return;
    }

    await params.callbacks.onSpeechStarted();

    const startedAt = Date.now();
    const roomDb = roomMeter.floorDb(startedAt - ROOM_BEFORE_MS, startedAt - ROOM_GAP_MS);
    activeTranscriptSegmentId = null;
    lastPartialTranscript = "";
    reconnectAttemptedForTurn = false;
    // Hizuri: a turn still waiting for its transcript is kept (its timeout keeps running), so
    // both halves of a phrase with a pause reach the agent.
    if (currentFinalizingTurn && !currentFinalizingTurn.fired) {
      pendingFinalizingTurns.push(currentFinalizingTurn);
      params.logger.info(
        { turnId: currentFinalizingTurn.turnId, pending: pendingFinalizingTurns.length },
        "voice_turn.pending_kept",
      );
    }
    currentFinalizingTurn = null;
    state = {
      status: "capturing",
      utteranceId: uuidv4(),
      startedAt,
      phraseId: params.nextPhraseId?.() ?? null,
      sttFrom: startedAt,
      roomDb,
    };
    // A recogniser error that also failed its reconnect leaves no session; without a fresh one
    // here every later phrase came back empty until voice mode was restarted.
    if (!sttSession) {
      await reconnectSttSession();
    }
    // Hizuri: hand the STT the audio from just before the detector fired.
    const preRoll = trimmedPreRoll(sttSession ? (sttSession.requiredSampleRate * 2) / 1000 : 0);
    if (state.status === "capturing" && preRoll[0]) {
      state.sttFrom = preRoll[0].t;
    }
    for (const chunk of preRoll) {
      try {
        sttSession?.appendPcm16(chunk.pcm);
      } catch (error) {
        handleSttError(error);
        break;
      }
    }
    sttPreRoll = [];
    params.logger.info(
      {
        utteranceId: state.utteranceId,
        phraseId: state.phraseId,
      },
      "voice_turn.speech_started",
    );
  }

  async function handleSpeechStopped(): Promise<void> {
    if (state.status !== "capturing") {
      return;
    }

    const turnId = state.utteranceId;
    const phraseId = state.phraseId;
    const startedAt = state.startedAt;
    const sttFrom = state.sttFrom;
    const roomDb = state.roomDb;
    const endedAt = Date.now();

    state = { status: "listening" };

    const finalizingTurn: FinalizingVoiceTurn = {
      turnId,
      phraseId,
      startedAt,
      endedAt,
      sttFrom,
      roomDb,
      retried: false,
      partial: lastPartialTranscript,
      firedEmpty: false,
      committedSegmentIds: [],
      transcriptsBySegmentId: new Map(),
      finalTranscriptSegmentIds: new Set(),
      transcriptMetaBySegmentId: new Map(),
      // Hizuri: long phrases wait 40 % of their length plus 20 s (at least 30 s).
      timeout: setTimeout(
        () => {
          onTurnTimeout(finalizingTurn);
        },
        Math.max(VOICE_FINAL_TRANSCRIPT_TIMEOUT_MS, (endedAt - startedAt) * 0.4 + 20_000),
      ),
      fired: false,
    };
    turnsInSpokenOrder.push(finalizingTurn);
    currentFinalizingTurn = finalizingTurn;

    detector.reset();
    try {
      sttSession?.commit();
    } catch (error) {
      handleSttError(error);
    }

    await params.callbacks.onSpeechStopped();
    params.callbacks.onVadSpeechStopped?.();

    params.logger.info(
      {
        utteranceAgeMs: Math.max(0, endedAt - startedAt),
        // Hizuri: how much audio the STT got for this phrase (0 = a lost phrase).
        sttFedBytes,
        sttConnected: Boolean(sttSession),
      },
      "voice_turn.speech_stopped",
    );
    sttFedBytes = 0;
  }

  /** Hizuri: end a long monologue at its next short pause (or at the hard limit). */
  function maybeEndChunk(now: number): void {
    if (chunkMs() <= 0 || state.status !== "capturing") {
      return;
    }
    const age = now - state.startedAt;
    if ((age >= chunkMs() && now - lastVoicedAt >= chunkPauseMs()) || age >= chunkMaxMs()) {
      params.logger.info({ ageMs: age }, "voice_turn.chunk_end");
      void runSerial(async () => {
        if (state.status === "capturing") {
          await handleSpeechStopped();
        }
      });
    }
  }

  function armMicGapTimer(): void {
    const gapMs = micGapEndMs();
    if (gapMs <= 0) {
      return;
    }
    if (micGapTimer) {
      clearTimeout(micGapTimer);
    }
    micGapTimer = setTimeout(() => {
      void runSerial(async () => {
        if (state.status !== "capturing") {
          return;
        }
        params.logger.info({ gapMs }, "voice_turn.mic_gap_end");
        await handleSpeechStopped();
      });
    }, gapMs);
  }

  function rememberRecentAudio(detectorPcm16: Buffer, now: number, raw?: Buffer): void {
    recentAudio.push({
      t: now,
      pcm: Buffer.from(detectorPcm16),
      ...(raw ? { raw: Buffer.from(raw) } : {}),
    });
    // Keep the audio of every phrase still waiting for its text: when the user spoke again before
    // the recogniser answered, the earlier phrase lost its audio and the speaker check scored
    // silence and the next phrase instead, so the user's own phrase was dropped. A phrase
    // that ended empty and may still get its text late keeps its audio too, for the voice print.
    let anchor = now;
    const waiting = [currentFinalizingTurn, ...pendingFinalizingTurns, ...secondPassTurns];
    for (const turn of [...waiting, ...lateTurns.values()]) {
      if (turn && (!turn.fired || turn.firedEmpty || secondPassTurns.has(turn))) {
        anchor = Math.min(anchor, turn.startedAt);
      }
    }
    if (state.status === "capturing") {
      anchor = Math.min(anchor, state.startedAt);
    }
    const keepFrom = Math.max(
      anchor - Math.max(PRE_ROLL_MS, sttPreRollMs()) - 500,
      now - RECENT_AUDIO_MS,
    );
    while (recentAudio.length > 0 && recentAudio[0].t < keepFrom) {
      recentAudio.shift();
    }
  }

  /**
   * Hizuri: the pre-roll from PRE_ROLL_LEAD_MS before its first sound: the first chunk that stands
   * VOICE_ABOVE_FLOOR_DB over the quietest one (all of it when none does). Judged by level, not by
   * the detector's frames: those come back from the speech worker after the chunk was stored.
   * The lead is measured in chunk sizes, since arrival times jitter.
   */
  function trimmedPreRoll(bytesPerMs: number): TimedPcm[] {
    if (sttPreRoll.length < 2 || bytesPerMs <= 0) {
      return sttPreRoll;
    }
    const levels = sttPreRoll.map((chunk) => rmsDb(chunk.pcm));
    const floor = Math.min(...levels);
    const firstSound = levels.findIndex((db) => db >= floor + VOICE_ABOVE_FLOOR_DB);
    let from = Math.max(0, firstSound);
    let leadMs = 0;
    while (from > 0 && leadMs < PRE_ROLL_LEAD_MS) {
      from -= 1;
      leadMs += sttPreRoll[from].pcm.length / bytesPerMs;
    }
    return sttPreRoll.slice(from);
  }

  /**
   * Hizuri: a batch STT session keeps everything appended since its last commit, so feeding it
   * all the time sent minutes of silence with every phrase. Feed it only while a phrase is being
   * captured, plus a short pre-roll from before the detector fired.
   */
  function feedStt(
    session: StreamingTranscriptionSession | null,
    sttPcm16: Buffer,
    now: number,
  ): void {
    if (state.status !== "capturing") {
      sttPreRoll.push({ t: now, pcm: Buffer.from(sttPcm16) });
      const keepMs = sttPreRollMs();
      while (sttPreRoll.length > 0 && sttPreRoll[0].t < now - keepMs) {
        sttPreRoll.shift();
      }
      return;
    }
    try {
      session?.appendPcm16(sttPcm16);
      sttFedBytes += sttPcm16.length;
    } catch (error) {
      handleSttError(error);
    }
  }

  detector.on("speech_started", () => {
    void runSerial(handleSpeechStarted);
  });
  detector.on("speech_stopped", () => {
    void runSerial(handleSpeechStopped);
  });
  detector.on("error", fail);
  // Hizuri: VAD windows for the barge-in hold, and the chunk end of long monologues.
  detector.on("frame", (detected: boolean, frameMs: number, loud: boolean) => {
    params.callbacks.onVadFrame?.(detected, frameMs, loud);
    const now = Date.now();
    if (detected) {
      lastVoicedAt = now;
      // Hizuri: a streaming STT checks its live text against the end of the user's voice (drafts).
      if (state.status === "capturing") {
        sttSession?.markVoiced?.();
      }
    }
    maybeEndChunk(now);
  });
  // Hizuri: voice that never opened a phrase, logged so a lost word can be found in the raw audio.
  detector.on("speech_dropped", (dropped: DroppedSpeech) => {
    params.logger.info(dropped, "voice_turn.start_dropped");
  });

  return {
    snapshotSpeech(ms: number): SpeechSnapshot {
      const from = Date.now() - ms;
      return {
        pcm: audioBetween(from),
        startedAt: state.status === "capturing" ? state.startedAt : from,
      };
    },

    async start(): Promise<void> {
      sttSession = createSttSession();
      await sttSession.connect();
      await detector.connect();
      state = { status: "listening" };
    },

    async stop(): Promise<void> {
      await runSerial(async () => {
        if (micGapTimer) {
          clearTimeout(micGapTimer);
        }
        // Hizuri: what the user already said still reaches the session. The phrase being said ends
        // here, and phrases waiting for their text keep their timers, retries and second listen;
        // the STT session closes, but phrases it already has still bring their finals. A switch
        // to text mode otherwise drops phrases in flight: their texts arriving
        // 23-55 s later and had no turn left to go to.
        if (state.status === "capturing") {
          await handleSpeechStopped();
        }
        detector.close();
        sttSession?.close();
        resampler?.reset();
        sttResampler?.reset();
        resampler = null;
        sttResampler = null;
        sttSession = null;
        state = { status: "idle" };
      });
    },

    async appendClientChunk(input): Promise<void> {
      await runSerial(async () => {
        if (state.status === "idle") {
          return;
        }

        const raw = Buffer.from(input.audioBase64, "base64");
        if (raw.length === 0) {
          return;
        }
        const parsedInputRate =
          parsePcmRateFromFormat(input.format, detector.requiredSampleRate) ??
          detector.requiredSampleRate;
        // The room level is read before the gain, which follows the user's voice and lifts the
        // noise too.
        roomMeter.push(raw, parsedInputRate, Date.now());
        const pcm16 = micGain.process(raw);
        armMicGapTimer();

        updateDetectorResampler(parsedInputRate);
        const currentSttSession = sttSession;
        if (currentSttSession) {
          updateSttResampler(currentSttSession, parsedInputRate);
        }

        const detectorPcm16 = pcmForDetector(pcm16);
        const sttPcm16 = currentSttSession
          ? pcmForStt(currentSttSession, pcm16, detectorPcm16)
          : null;
        if (detectorPcm16.length === 0 && (!sttPcm16 || sttPcm16.length === 0)) {
          return;
        }

        const now = Date.now();
        if (detectorPcm16.length > 0) {
          // The raw copy is kept only when the gain changed the audio and no resampling was needed.
          const keepRaw = resampler === null && pcm16 !== raw;
          rememberRecentAudio(detectorPcm16, now, keepRaw ? raw : undefined);
          detector.appendPcm16(detectorPcm16);
          params.callbacks.onMicAudio?.(detectorPcm16);
        }

        if (sttPcm16 && sttPcm16.length > 0) {
          feedStt(currentSttSession, sttPcm16, now);
        }
      });
    },
  };
}

/** Hizuri: the voice print, not the words, decides whose a phrase is (it is on and not advisory). */
/** The journal outcome of a phrase the voice print judged; only "other-voice" is dropped. */
function voiceOutcome(
  verdict: SpeakerVerdict,
  short: boolean,
  advisory: boolean,
): "accepted" | "short" | "delivered-despite-gate" | "other-voice" {
  if (verdict.accept) {
    return "accepted";
  }
  // A short phrase is never dropped by the voice print: Zuri judges it by context.
  if (short) {
    return "short";
  }
  return advisory ? "delivered-despite-gate" : "other-voice";
}

function speakerDecides(speaker: VoiceTurnFilters["speakerGate"]): boolean {
  return Boolean(speaker && !speaker.advisory);
}

/** Hizuri: the journal note of a voice-print verdict, e.g. “score 0.14, echo-like”. */
/**
 * Hizuri: the assistant's line heard back is never “another voice” for the room, even when the
 * recogniser garbled it past the word check (a single garbled word scores almost nothing).
 */
function isAssistantLine(
  echoLike: boolean,
  echo: EchoFilter | undefined,
  transcript: string,
  turn: PhraseSpan,
): boolean {
  return echoLike || (echo !== undefined && isAssistantEcho(echo, transcript, turn));
}

function verdictTag(verdict: SpeakerVerdict, echoLike: boolean): string {
  const score = verdict.score !== undefined ? `score ${verdict.score.toFixed(2)}` : verdict.reason;
  return echoLike ? `${score}, echo-like` : score;
}
