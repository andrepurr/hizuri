import type pino from "pino";
import type { Readable } from "node:stream";
import { v4 as uuidv4 } from "uuid";
import type { TextToSpeechProvider } from "../speech/speech-provider.js";
import { toResolver, type Resolvable } from "../speech/provider-resolver.js";
import type { SessionOutboundMessage } from "../messages.js";
import { envFlag } from "../voice-env.js";
import { withOutputGain } from "./tts-gain.js";
import { withSpeechSpeed } from "./tts-speed.js";
import {
  type EnqueueSpeechParams,
  type HeardSplit,
  SpeechQueue,
  type SpeechResult,
} from "./speech-queue.js";
import { PlaybackHold, type PlaybackTracker, playPacedStream } from "./tts-pacer.js";

interface PendingPlayback {
  resolve: () => void;
  reject: (error: Error) => void;
  pendingChunks: number;
  streamEnded: boolean;
  // Hizuri: a paced reply counts confirmations per chunk.
  paced?: PlaybackTracker;
}

interface TtsWithConfig {
  getConfig(): { responseFormat?: string };
}

function hasTtsConfig(tts: TextToSpeechProvider): tts is TextToSpeechProvider & TtsWithConfig {
  return typeof (tts as Partial<TtsWithConfig>).getConfig === "function";
}

interface TtsSegment {
  index: number;
  text: string;
}

type PreparedTtsSegment = TtsSegment & {
  format: string;
  stream: Readable;
};

type PreparedSegmentResult =
  | { kind: "prepared"; prepared: PreparedTtsSegment }
  | { kind: "aborted" }
  | { kind: "error"; error: unknown };

const MAX_TTS_SEGMENT_CHARS = 260;
const TTS_PREFETCH_SEGMENTS = 2;
const CLOSED_AUDIO_ID_TTL_MS = 10_000;

function splitOversizedFragment(fragment: string, maxChars: number): string[] {
  const trimmed = fragment.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.length <= maxChars) {
    return [trimmed];
  }

  const clauseChunks = trimmed.split(/(?<=[,;:])\s+/);
  if (clauseChunks.length > 1) {
    const parts: string[] = [];
    let current = "";

    const pushCurrent = () => {
      const value = current.trim();
      if (value) {
        parts.push(value);
      }
      current = "";
    };

    for (const clause of clauseChunks) {
      const clauseText = clause.trim();
      if (!clauseText) {
        continue;
      }

      if (clauseText.length > maxChars) {
        pushCurrent();
        parts.push(...splitOversizedFragment(clauseText, maxChars));
        continue;
      }

      if (!current) {
        current = clauseText;
        continue;
      }

      const candidate = `${current} ${clauseText}`;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }

      pushCurrent();
      current = clauseText;
    }

    pushCurrent();
    if (parts.length > 1 || parts[0] !== trimmed) {
      return parts;
    }
  }

  const parts: string[] = [];
  let remaining = trimmed;
  while (remaining.length > maxChars) {
    let idx = remaining.lastIndexOf(" ", maxChars);
    if (idx < Math.floor(maxChars * 0.5)) {
      idx = maxChars;
    }
    parts.push(remaining.slice(0, idx).trim());
    remaining = remaining.slice(idx).trim();
  }
  if (remaining.length > 0) {
    parts.push(remaining);
  }
  return parts;
}

function splitTextForTts(text: string): TtsSegment[] {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Cannot synthesize empty text");
  }

  // Hizuri: the web client acknowledges every segment after the first without playing it, so a
  // reply was heard only up to its first sentence. PASEO_TTS_SINGLE_SEGMENT=1: one segment per reply.
  if (envFlag("PASEO_TTS_SINGLE_SEGMENT", false)) {
    return [{ index: 0, text: normalized }];
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const parts: TtsSegment[] = [];
  let segmentIndex = 0;

  for (const sentence of sentences) {
    const fragments = splitOversizedFragment(sentence, MAX_TTS_SEGMENT_CHARS);
    for (const fragment of fragments) {
      parts.push({ index: segmentIndex, text: fragment });
      segmentIndex += 1;
    }
  }

  return parts;
}

/**
 * Per-session TTS manager
 * Handles TTS audio generation and playback confirmation tracking
 */
export class TTSManager {
  private pendingPlaybacks: Map<string, PendingPlayback> = new Map();
  private readonly recentlyClosedAudioIds: Map<string, number> = new Map();
  private readonly logger: pino.Logger;
  private readonly resolveTts: () => TextToSpeechProvider | null;
  // Hizuri: the user holding the floor pauses paced replies (barge-in hold).
  public readonly hold = new PlaybackHold();
  // Hizuri: 24 kHz PCM of the reply being played, for the barge-in voice check; null when idle.
  public currentReplyPcm: Buffer | null = null;
  // Hizuri: the last paced reply stopped part-way; the caller must reset the client's playback.
  public lastPlaybackIncomplete = false;
  // Hizuri: replies queued, playing or paused (enqueueSpeech).
  private readonly speechQueue: SpeechQueue;
  // Hizuri (phrase graph): bumped by every cancel, so a caller knows its playback was cut.
  public cancelCount = 0;

  constructor(
    sessionId: string,
    logger: pino.Logger,
    tts: Resolvable<TextToSpeechProvider | null>,
  ) {
    this.logger = logger.child({ module: "agent", component: "tts-manager", sessionId });
    this.resolveTts = toResolver(tts);
    this.speechQueue = new SpeechQueue({
      logger: this.logger,
      hold: this.hold,
      resolveTts: () => this.resolveTts(),
      splitFragment: splitOversizedFragment,
      openPlayback: (audioId, entry) => {
        this.pendingPlaybacks.set(audioId, {
          paced: entry.tracker,
          resolve: entry.stop,
          reject: entry.close,
          pendingChunks: 0,
          streamEnded: false,
        });
      },
      closePlayback: (audioId) => {
        this.pendingPlaybacks.delete(audioId);
        this.rememberClosedAudioId(audioId);
      },
      setCurrentReplyPcm: (pcm) => {
        this.currentReplyPcm = pcm;
      },
      destroyStream: (stream) => this.destroySpeechStream(stream),
    });
  }

  /** Hizuri: a spoken reply is queued, synthesizing, playing or paused. */
  public isSpeaking(): boolean {
    return this.speechQueue.size > 0 || this.pendingPlaybacks.size > 0;
  }

  /** Hizuri: a reply plays or is paused mid-reply (isSpeaking also counts one still waiting). */
  public replyStarted(): boolean {
    return this.speechQueue.hasStarted() || this.pendingPlaybacks.size > 0;
  }

  /** Hizuri: some queued reply was spoken from inside an agent turn. */
  public hasTurnSpeech(): boolean {
    return this.speechQueue.hasTurnSpeech();
  }

  /** Hizuri: the speech queue works when the TTS answers raw PCM (PASEO_TTS_QUEUE=0 turns it off). */
  public canQueue(): boolean {
    if (!envFlag("PASEO_TTS_QUEUE", true)) {
      return false;
    }
    const tts = this.resolveTts();
    if (!tts) {
      return false;
    }
    const format = hasTtsConfig(tts) ? tts.getConfig().responseFormat : undefined;
    return !format || format === "pcm";
  }

  /** Hizuri: queue a reply for part-by-part synthesis and paced playback (see speech-queue.ts). */
  public enqueueSpeech(params: EnqueueSpeechParams): Promise<SpeechResult> {
    return this.speechQueue.enqueue(params);
  }

  /** Hizuri: drop the reply now playing or paused; later ones go on. */
  public dropHeadSpeech(reason: string): void {
    this.speechQueue.dropHead(reason);
  }

  /** Hizuri: drop every reply, the one playing or paused and all queued ones. */
  public dropAllSpeech(reason: string): void {
    this.speechQueue.dropAll(reason);
  }

  /**
   * Hizuri (phrase graph): the whole sentences of a queued reply the user heard by `at`, and the
   * rest.
   */
  public heardSplit(jobId: string, at: number): HeardSplit | null {
    return this.speechQueue.heardSplit(jobId, at);
  }

  /** Hizuri (phrase graph): when a queued reply's first audio went out; null = not yet. */
  public firstAudioAt(jobId: string): number | null {
    return this.speechQueue.firstAudioAt(jobId);
  }

  /**
   * Generate TTS audio, emit to client, and wait for playback confirmation
   * Returns a Promise that resolves when the client confirms playback completed
   */
  public async generateAndWaitForPlayback(
    text: string,
    emitMessage: (msg: SessionOutboundMessage) => void,
    abortSignal: AbortSignal,
    isVoiceMode: boolean,
  ): Promise<void> {
    const ttsStartMs = Date.now();
    this.logger.info(
      {
        isVoiceMode,
        textLength: text.length,
        text,
      },
      "TTS input text",
    );

    const segments = splitTextForTts(text);
    this.logger.info(
      {
        segmentCount: segments.length,
        segments: segments.map((s) => ({
          index: s.index,
          chars: s.text.length,
          text: s.text.slice(0, 80),
        })),
      },
      `TTS split into ${segments.length} segment(s)`,
    );

    const inflight = new Map<number, Promise<PreparedSegmentResult>>();
    let nextSegmentToSchedule = 0;

    const scheduleNextSegments = () => {
      while (nextSegmentToSchedule < segments.length && inflight.size < TTS_PREFETCH_SEGMENTS) {
        const segment = segments[nextSegmentToSchedule];
        inflight.set(segment.index, this.scheduleSegmentSynthesis(segment, abortSignal));
        nextSegmentToSchedule += 1;
      }
    };

    scheduleNextSegments();

    try {
      for (const segment of segments) {
        if (abortSignal.aborted) {
          this.logger.debug("Aborted before emitting segmented audio");
          return;
        }

        const synthWaitStart = Date.now();
        const result = await inflight.get(segment.index)!;
        const synthWaitMs = Date.now() - synthWaitStart;
        inflight.delete(segment.index);
        scheduleNextSegments();

        if (result.kind === "aborted") {
          return;
        }

        if (result.kind === "error") {
          throw result.error;
        }

        this.logger.info(
          {
            segmentIndex: segment.index,
            synthWaitMs,
            totalElapsedMs: Date.now() - ttsStartMs,
            chars: segment.text.length,
          },
          `TTS segment ${segment.index} synthesis ready (waited ${synthWaitMs}ms, total ${Date.now() - ttsStartMs}ms)`,
        );

        const emitStart = Date.now();
        // Hizuri: with PASEO_BARGE_HOLD=1 a PCM reply goes out as paced chunks, so the user
        // talking can pause it between chunks (see tts-pacer.ts).
        const paced =
          envFlag("PASEO_BARGE_HOLD", false) && isVoiceMode && result.prepared.format === "pcm";
        const emitSegment = paced
          ? this.emitPacedSegment.bind(this)
          : this.emitPreparedSegment.bind(this);
        await emitSegment({
          prepared: result.prepared,
          emitMessage,
          abortSignal,
          isVoiceMode,
        });
        this.logger.info(
          {
            segmentIndex: segment.index,
            emitAndPlayMs: Date.now() - emitStart,
            totalElapsedMs: Date.now() - ttsStartMs,
          },
          `TTS segment ${segment.index} playback confirmed (emit+play ${Date.now() - emitStart}ms, total ${Date.now() - ttsStartMs}ms)`,
        );

        scheduleNextSegments();
      }
    } finally {
      this.cleanupPrefetchedSegments(inflight);
      this.logger.info(
        { totalMs: Date.now() - ttsStartMs },
        `TTS generateAndWaitForPlayback done (${Date.now() - ttsStartMs}ms)`,
      );
    }
  }

  private async synthesizeSegment(
    segment: TtsSegment,
    abortSignal: AbortSignal,
  ): Promise<PreparedTtsSegment> {
    const resolveStart = Date.now();
    const tts = this.resolveTts();
    if (!tts) {
      throw new Error("TTS not configured");
    }
    const resolveMs = Date.now() - resolveStart;

    if (abortSignal.aborted) {
      throw new Error("TTS synthesis aborted");
    }

    const synthStart = Date.now();
    const { stream, format } = await tts.synthesizeSpeech(segment.text);
    this.logger.info(
      {
        segmentIndex: segment.index,
        resolveMs,
        synthMs: Date.now() - synthStart,
        chars: segment.text.length,
      },
      `TTS segment ${segment.index} synthesized (resolve=${resolveMs}ms, synth=${Date.now() - synthStart}ms, ${segment.text.length} chars)`,
    );

    if (abortSignal.aborted) {
      this.destroySpeechStream(stream);
      throw new Error("TTS synthesis aborted");
    }

    return {
      ...segment,
      stream,
      format,
    };
  }

  private scheduleSegmentSynthesis(
    segment: TtsSegment,
    abortSignal: AbortSignal,
  ): Promise<PreparedSegmentResult> {
    return this.synthesizeSegment(segment, abortSignal).then(
      (prepared) => {
        if (abortSignal.aborted) {
          this.destroySpeechStream(prepared.stream);
          return { kind: "aborted" };
        }
        return { kind: "prepared", prepared };
      },
      (error) => {
        if (abortSignal.aborted) {
          return { kind: "aborted" };
        }
        return { kind: "error", error };
      },
    );
  }

  private cleanupPrefetchedSegments(inflight: Map<number, Promise<PreparedSegmentResult>>): void {
    if (inflight.size === 0) {
      return;
    }

    for (const pending of inflight.values()) {
      void pending.then((result) => {
        if (result.kind === "prepared") {
          this.destroySpeechStream(result.prepared.stream);
        }
        return;
      });
    }
  }

  private destroySpeechStream(stream: Readable): void {
    if (typeof stream.destroy === "function" && !stream.destroyed) {
      stream.destroy();
    }
  }

  private pruneRecentlyClosedAudioIds(now: number): void {
    for (const [audioId, expiresAt] of this.recentlyClosedAudioIds.entries()) {
      if (expiresAt <= now) {
        this.recentlyClosedAudioIds.delete(audioId);
      }
    }
  }

  private rememberClosedAudioId(audioId: string): void {
    const now = Date.now();
    this.pruneRecentlyClosedAudioIds(now);
    this.recentlyClosedAudioIds.set(audioId, now + CLOSED_AUDIO_ID_TTL_MS);
  }

  private async emitPreparedSegment(params: {
    prepared: PreparedTtsSegment;
    emitMessage: (msg: SessionOutboundMessage) => void;
    abortSignal: AbortSignal;
    isVoiceMode: boolean;
  }): Promise<void> {
    const { prepared, emitMessage, abortSignal, isVoiceMode } = params;
    const { stream, format, text } = prepared;

    const audioId = uuidv4();
    let playbackResolve!: () => void;
    let playbackReject!: (error: Error) => void;

    const playbackPromise = new Promise<void>((resolve, reject) => {
      playbackResolve = resolve;
      playbackReject = reject;
    });

    const pendingPlayback: PendingPlayback = {
      resolve: playbackResolve,
      reject: playbackReject,
      pendingChunks: 0,
      streamEnded: false,
    };

    this.pendingPlaybacks.set(audioId, pendingPlayback);
    let playbackGuard: ReturnType<typeof setTimeout> | null = null;

    let onAbort: (() => void) | undefined;

    onAbort = () => {
      this.logger.debug("Aborted while waiting for playback");
      pendingPlayback.streamEnded = true;
      pendingPlayback.pendingChunks = 0;
      this.pendingPlaybacks.delete(audioId);
      this.rememberClosedAudioId(audioId);
      playbackResolve();
      this.destroySpeechStream(stream);
    };

    abortSignal.addEventListener("abort", onAbort, { once: true });

    try {
      const buffers: Buffer[] = [];
      for await (const chunk of stream) {
        if (abortSignal.aborted) {
          this.logger.debug("Aborted during stream collection");
          break;
        }
        buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      if (!abortSignal.aborted && buffers.length > 0) {
        const joined = Buffer.concat(buffers);
        const fullBuffer = format === "pcm" ? withSpeechSpeed(joined, text) : joined;
        const chunkId = `${audioId}:0`;
        pendingPlayback.pendingChunks = 1;
        // Hizuri: the client never confirms playback when voice mode is off or the device sleeps,
        // and the speak call then blocked for minutes. Wait at most the audio's own length
        // (24 kHz 16-bit mono PCM = 48 bytes/ms) plus a margin.
        const expectedMs = format === "pcm" ? Math.ceil(fullBuffer.length / 48) : 60_000;
        playbackGuard = setTimeout(
          () => {
            if (!this.pendingPlaybacks.has(audioId)) {
              return;
            }
            this.logger.warn({ audioId, expectedMs }, "tts.playback_confirmation_timeout");
            pendingPlayback.streamEnded = true;
            pendingPlayback.pendingChunks = 0;
            this.pendingPlaybacks.delete(audioId);
            this.rememberClosedAudioId(audioId);
            playbackResolve();
          },
          Math.round(expectedMs * 1.15) + 4000,
        );

        emitMessage({
          type: "audio_output",
          payload: {
            id: chunkId,
            groupId: audioId,
            chunkIndex: 0,
            isLastChunk: true,
            audio: withOutputGain(fullBuffer, format).toString("base64"),
            format,
            isVoiceMode,
          },
        });
      }

      pendingPlayback.streamEnded = true;

      if (pendingPlayback.pendingChunks === 0) {
        this.pendingPlaybacks.delete(audioId);
        this.rememberClosedAudioId(audioId);
        playbackResolve();
      }

      await playbackPromise;
    } catch (error) {
      if (abortSignal.aborted) {
        this.logger.debug("Audio stream closed after abort");
      } else {
        this.logger.error({ err: error }, "Error streaming audio");
        this.pendingPlaybacks.delete(audioId);
        throw error;
      }
    } finally {
      if (playbackGuard) {
        clearTimeout(playbackGuard);
      }
      if (onAbort) {
        abortSignal.removeEventListener("abort", onAbort);
      }
      this.destroySpeechStream(stream);
    }

    if (abortSignal.aborted) {
      return;
    }

    this.logger.debug({ audioId, textLength: text.length }, "Audio playback confirmed");
  }

  /** Hizuri: play one whole PCM reply as paced chunks of one audio group (barge-in hold). */
  private async emitPacedSegment(params: {
    prepared: PreparedTtsSegment;
    emitMessage: (msg: SessionOutboundMessage) => void;
    abortSignal: AbortSignal;
    isVoiceMode: boolean;
  }): Promise<void> {
    const { prepared, emitMessage, abortSignal, isVoiceMode } = params;
    const { stream, format, text } = prepared;
    const audioId = uuidv4();
    const tracker: PlaybackTracker = { acked: new Map(), onAck: null };
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    // cancelPendingPlaybacks() calls resolve, cleanup() calls reject: both stop the pacing.
    this.pendingPlaybacks.set(audioId, {
      paced: tracker,
      resolve: stop,
      reject: stop,
      pendingChunks: 0,
      streamEnded: false,
    });
    this.lastPlaybackIncomplete = false;
    try {
      const buffers: Buffer[] = [];
      for await (const chunk of stream) {
        if (abortSignal.aborted) {
          return;
        }
        buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const fullBuffer = withSpeechSpeed(Buffer.concat(buffers), text);
      if (abortSignal.aborted || fullBuffer.length === 0) {
        return;
      }
      this.currentReplyPcm = fullBuffer;
      const result = await playPacedStream({
        source: { segments: [fullBuffer], done: true, waitForMore: () => Promise.resolve() },
        emitChunk: (index, audio, isLast) =>
          emitMessage({
            type: "audio_output",
            payload: {
              id: `${audioId}:${index}`,
              groupId: audioId,
              chunkIndex: index,
              isLastChunk: isLast,
              audio: withOutputGain(audio, format).toString("base64"),
              format,
              isVoiceMode,
            },
          }),
        tracker,
        hold: this.hold,
        cancelled: () => stopped || abortSignal.aborted,
        logger: this.logger,
      });
      // The client must be reset when it holds an unfinished group, or when the reply was cut
      // while chunks it already has are still unplayed.
      this.lastPlaybackIncomplete =
        result.emitted > 0 &&
        (result.emitted < result.chunks ||
          (result.outcome !== "played" && tracker.acked.size < result.emitted));
      this.logger.info({ audioId, ...result, textLength: text.length }, "tts.paced_done");
    } finally {
      this.currentReplyPcm = null;
      this.pendingPlaybacks.delete(audioId);
      this.rememberClosedAudioId(audioId);
      this.destroySpeechStream(stream);
    }
  }

  /**
   * Called when client confirms audio playback completed
   * Resolves the corresponding promise
   */
  public confirmAudioPlayed(chunkId: string): void {
    const [audioId] = chunkId.includes(":") ? chunkId.split(":") : [chunkId];
    const pending = this.pendingPlaybacks.get(audioId);
    if (pending?.paced) {
      // Hizuri: a paced reply counts confirmations per chunk.
      pending.paced.acked.set(Number(chunkId.split(":")[1] ?? 0), Date.now());
      pending.paced.onAck?.();
      return;
    }

    if (!pending) {
      const now = Date.now();
      this.pruneRecentlyClosedAudioIds(now);
      const expiresAt = this.recentlyClosedAudioIds.get(audioId);
      if (expiresAt && expiresAt > now) {
        this.logger.debug({ chunkId }, "Ignoring late confirmation for recently closed audio ID");
        return;
      }
      this.logger.warn({ chunkId }, "Received confirmation for unknown audio ID");
      return;
    }

    pending.pendingChunks = Math.max(0, pending.pendingChunks - 1);

    if (pending.pendingChunks === 0 && pending.streamEnded) {
      pending.resolve();
      this.pendingPlaybacks.delete(audioId);
      this.rememberClosedAudioId(audioId);
    }
  }

  /**
   * Cancel all pending playbacks (e.g., user interrupted audio)
   */
  public cancelPendingPlaybacks(reason: string): void {
    this.cancelCount += 1;
    // Hizuri: queued and paused replies of the speech queue go too.
    this.speechQueue.cancelAll(reason);
    if (this.pendingPlaybacks.size === 0) {
      return;
    }

    this.logger.debug(
      { count: this.pendingPlaybacks.size, reason },
      "Cancelling pending playbacks",
    );

    for (const [audioId, pending] of this.pendingPlaybacks.entries()) {
      pending.resolve();
      this.pendingPlaybacks.delete(audioId);
      this.rememberClosedAudioId(audioId);
      this.logger.debug({ audioId }, "Cleared pending playback");
    }
  }

  /**
   * Cleanup all pending playbacks
   */
  public cleanup(): void {
    // Hizuri: the speech queue's jobs end with the session.
    this.speechQueue.cancelAll("session-closed");
    // Reject all pending playbacks
    for (const [audioId, pending] of this.pendingPlaybacks.entries()) {
      pending.reject(new Error("Session closed"));
      this.pendingPlaybacks.delete(audioId);
      this.rememberClosedAudioId(audioId);
    }
  }
}
