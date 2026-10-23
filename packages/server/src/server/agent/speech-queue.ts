import type pino from "pino";
import type { Readable } from "node:stream";
import { v4 as uuidv4 } from "uuid";

import type { SessionOutboundMessage } from "../messages.js";
import type { TextToSpeechProvider } from "../speech/speech-provider.js";
import { envFlag, envNonNegative } from "../voice-env.js";
import { withOutputGain } from "./tts-gain.js";
import { withSpeechSpeed } from "./tts-speed.js";
import {
  type PacedResult,
  type PacedSource,
  type PacedStats,
  PCM_BYTES_PER_MS,
  type PlaybackHold,
  type PlaybackTracker,
  playPacedStream,
  splitPcmAtPauses,
} from "./tts-pacer.js";

// Hizuri: the speech queue. One `speak` call = one job = one audio group on the client. Jobs are
// synthesized one after another, part by part (first part = the first sentence, later parts sized
// so their synthesis fits into the audio already waiting), and played through the pacer as the
// parts arrive, so the first words come after ~2 s instead of after the whole reply.
//
// The returned promise (the agent's speak call) resolves:
//   - when the reply has played, PASEO_TTS_RETURN_EARLY_MS (1500) before its end, so the next
//     reply is already synthesizing;
//   - at once when a sticky pause (stop word) is or becomes active: the rest stays paused and goes
//     on after a continue word; a pause nobody continued (PASEO_BARGE_HOLD_STICKY_MAX_MS) drops it;
//   - after PASEO_TTS_DETACH_HOLD_MS (8000, 0 = never) of any other hold.
// A stop word pauses only the voice: the agent's work goes on.

const EMOTION_TAG = /^\s*\[\s*(\w+)\s*\]\s*/;
const EMOTIONS = new Set(["happy", "sad", "angry", "relaxed", "surprised", "neutral", "intimate"]);
const SIDE_TAG = /^\s*\[\s*(?:motion|gesture|outfit)\s*:\s*[a-z0-9_-]+\s*\]\s*/i;

export interface SpeechPlan {
  /** Leading tags as written (first part only). */
  head: string;
  /** The emotion tag repeated on later parts (it also picks the voice). */
  carry: string;
  /** Sentences; long ones cut at commas into <= 150 chars. */
  units: string[];
}

export type FragmentSplitter = (fragment: string, maxChars: number) => string[];

/** The reply split into its leading tags and the words it speaks. */
function splitTags(text: string): { normalized: string; body: string; carry: string } {
  const normalized = text.trim().replace(/\s+/g, " ");
  let body = normalized;
  let carry = "";
  const emotion = EMOTION_TAG.exec(body);
  if (emotion && EMOTIONS.has(emotion[1].toLowerCase())) {
    carry = `[${emotion[1]}] `;
    body = body.slice(emotion[0].length);
  }
  for (let k = 0; k < 2; k++) {
    const side = SIDE_TAG.exec(body);
    if (side) {
      body = body.slice(side[0].length);
    }
  }
  return { normalized, body, carry };
}

/** Hizuri (phrase graph): the words a reply speaks, without its leading tags. */
export function spokenBody(text: string): string {
  const { normalized, body } = splitTags(text);
  return body.trim() || normalized;
}

/** Prepared audio (@@play:NAME) and PASEO_TTS_STREAM=0 keep one unit. */
export function planSpeech(text: string, splitFragment: FragmentSplitter): SpeechPlan {
  const { normalized, body: rest, carry } = splitTags(text);
  const head = normalized.slice(0, normalized.length - rest.length);
  const body = rest.trim();
  if (!body) {
    return { head: "", carry: "", units: [normalized] };
  }
  if (body.startsWith("@@play:") || !envFlag("PASEO_TTS_STREAM", true)) {
    return { head, carry, units: [body] };
  }
  const units: string[] = [];
  for (const sentence of body.split(/(?<=[.!?…])\s+/u)) {
    units.push(...splitFragment(sentence, 150));
  }
  return { head, carry, units: units.length > 0 ? units : [body] };
}

export interface SpeechJobEnd {
  jobId: string;
  outcome: string;
  incomplete: boolean;
  started: boolean;
  emitted: number;
  chunks: number;
  firstAudioMs: number | null;
  /** Wall-clock time the first chunk went to the client; null = never. */
  firstAudioAt: number | null;
  cancelReason?: string;
}

export interface SpeechJobHooks {
  onQueued?(info: { jobId: string }): void;
  /**
   * Hizuri (floor gate, voice-session.ts): resolves when the reply may start (true) or must not
   * start at all (false: a newer reply superseded it); synthesis goes on meanwhile.
   * `waiting(reason)` lets the speak call return while the reply still waits; a job cancelled
   * meanwhile (`cancelled`) never starts.
   */
  beforePlay?(gate: { waiting(reason: string): void; cancelled: Promise<void> }): Promise<boolean>;
  onStart?(): void;
  /**
   * The first chunk goes to the phone: the assistant becomes audible (synthesis can take seconds).
   */
  onFirstAudio?(): void;
  onEnd?(info: SpeechJobEnd): void;
}

/**
 * Hizuri (phrase graph): what of a reply the user heard, in whole sentences, and what they did not.
 */
export interface HeardSplit {
  heard: string;
  unheard: string;
}

/** One sentence of a reply and where it lies in the reply's audio. */
interface SpokenSpan {
  startMs: number;
  endMs: number;
  /** Offset in the job's body just after this sentence. */
  endChar: number;
}

const SENTENCE_END = /(?<=[.!?…])\s+/u;
const RECENT_JOBS = 30;

export interface SpeechJobMeta {
  /** Spoken from inside an agent turn. */
  fromTurn?: boolean;
}

export interface SpeechResult {
  outcome: string;
  /** Hizuri: the job id (tts.job_queued / tts.job_done in the daemon log). */
  jobId?: string;
  detached: boolean;
  early?: boolean;
  reason?: string;
  error?: string;
}

export interface EnqueueSpeechParams {
  text: string;
  emitMessage: (msg: SessionOutboundMessage) => void;
  mcpSignal?: AbortSignal;
  sessionSignal?: AbortSignal;
  isVoiceMode: boolean;
  hooks?: SpeechJobHooks;
  meta?: SpeechJobMeta;
}

/** What the queue needs from TTSManager. */
export interface SpeechQueueHost {
  logger: pino.Logger;
  hold: PlaybackHold;
  resolveTts(): TextToSpeechProvider | null;
  splitFragment: FragmentSplitter;
  /** Register a paced playback so confirmations and cancels reach it. */
  openPlayback(
    audioId: string,
    entry: { tracker: PlaybackTracker; stop(): void; close(): void },
  ): void;
  closePlayback(audioId: string): void;
  setCurrentReplyPcm(pcm: Buffer | null): void;
  destroyStream(stream: Readable): void;
}

class SpeechJob {
  readonly id = uuidv4().slice(0, 8);
  readonly enqueuedAt = Date.now();
  cancel = false;
  cancelReason: string | undefined;
  drop = false;
  detached = false;
  early = false;
  waiterDone = false;
  started = false;
  synthesizedMs = 0;
  firstAudioMs: number | null = null;
  firstAudioAt: number | null = null;
  /** The spoken text (the reply without its leading tags), and its sentences in the audio. */
  readonly body: string;
  readonly spans: SpokenSpan[] = [];
  spanCursor = 0;
  error: unknown;
  earlyTimer: ReturnType<typeof setTimeout> | undefined;
  readonly stats: PacedStats = {};
  private wakers: Array<() => void> = [];
  private readonly cancelWaiters: Array<() => void> = [];
  readonly cancelled: Promise<void>;
  readonly source: PacedSource;

  constructor(
    readonly text: string,
    readonly plan: SpeechPlan,
    readonly hooks: SpeechJobHooks,
    readonly meta: SpeechJobMeta,
    private readonly resolve: (result: SpeechResult) => void,
  ) {
    this.cancelled = new Promise((done) => this.cancelWaiters.push(done));
    this.body = plan.units.join(" ");
    this.source = {
      segments: [],
      done: false,
      waitForMore: () => new Promise((wake) => this.wakers.push(wake)),
    };
  }

  notify(): void {
    const wakers = this.wakers;
    this.wakers = [];
    for (const wake of wakers) {
      wake();
    }
  }

  isCancelled(): boolean {
    return this.cancel || this.drop;
  }

  /** Stop the job: wake the producer, free the synthesis lane. */
  stop(reason: string, how: "cancel" | "drop"): void {
    if (how === "cancel") {
      this.cancel = true;
    } else {
      this.drop = true;
    }
    this.cancelReason = reason;
    for (const done of this.cancelWaiters) {
      done();
    }
    this.notify();
  }

  resolveWaiter(result: SpeechResult): void {
    if (!this.waiterDone) {
      this.waiterDone = true;
      this.resolve({ ...result, jobId: this.id });
    }
  }

  /** A synthesized part covers [startMs, endMs) of the audio; its sentences share it by length. */
  addSpans(spoken: string, startMs: number, endMs: number): void {
    const sentences = spoken
      .trim()
      .split(SENTENCE_END)
      .filter((sentence) => sentence.length > 0);
    const totalChars = sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
    let at = startMs;
    for (const sentence of sentences) {
      const found = this.body.indexOf(sentence, this.spanCursor);
      this.spanCursor = (found >= 0 ? found : this.spanCursor) + sentence.length;
      const next = at + ((endMs - startMs) * sentence.length) / totalChars;
      this.spans.push({ startMs: at, endMs: next, endChar: this.spanCursor });
      at = next;
    }
  }

  /** The sentences that finished playing by `at` (wall clock), and the rest. */
  heardBy(at: number): HeardSplit {
    const heardMs = this.stats.heardMsBy?.(at) ?? 0;
    let endChar = 0;
    for (const span of this.spans) {
      if (span.endMs > heardMs + 1) {
        break;
      }
      endChar = span.endChar;
    }
    return { heard: this.body.slice(0, endChar).trim(), unheard: this.body.slice(endChar).trim() };
  }
}

function jobEnd(job: SpeechJob, outcome: string, result: PacedResult | null): SpeechJobEnd {
  const emitted = result?.emitted ?? 0;
  const cancelReason = job.cancelReason === "done" ? undefined : job.cancelReason;
  return {
    jobId: job.id,
    outcome,
    incomplete: emitted > 0 && outcome !== "played",
    started: job.started,
    emitted,
    chunks: result?.chunks ?? 0,
    firstAudioMs: job.firstAudioMs,
    firstAudioAt: job.firstAudioAt,
    ...(cancelReason ? { cancelReason } : {}),
  };
}

export class SpeechQueue {
  private jobs: SpeechJob[] = [];
  /** Finished jobs, newest last, for the phrase graph's heard/unheard split. */
  private recent: SpeechJob[] = [];
  private synthLane: Promise<void> = Promise.resolve();
  private playLane: Promise<void> = Promise.resolve();
  private detachTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly signalCleanups = new WeakMap<SpeechJob, () => void>();
  private readonly synthStats = {
    overheadMs: envNonNegative("PASEO_TTS_STREAM_OVERHEAD_MS", 1200),
    perCharMs: 25,
  };

  constructor(private readonly host: SpeechQueueHost) {
    host.hold.onChange(() => this.onHoldChange());
  }

  get size(): number {
    return this.jobs.length;
  }

  /**
   * A reply has started (it plays, or is paused mid-reply); one waiting for the user's pause has
   * not.
   */
  hasStarted(): boolean {
    return this.jobs.some((job) => job.started && !job.isCancelled());
  }

  /** Some queued reply was spoken from inside an agent turn. */
  hasTurnSpeech(): boolean {
    return this.jobs.some((job) => job.meta.fromTurn === true);
  }

  enqueue(params: EnqueueSpeechParams): Promise<SpeechResult> {
    return new Promise((resolve) => {
      const job = new SpeechJob(
        params.text,
        planSpeech(params.text, this.host.splitFragment),
        params.hooks ?? {},
        params.meta ?? {},
        resolve,
      );
      this.watchSignals(job, params.mcpSignal, params.sessionSignal);
      this.jobs.push(job);
      job.hooks.onQueued?.({ jobId: job.id });
      this.host.logger.info(
        {
          jobId: job.id,
          chars: params.text.length,
          units: job.plan.units.length,
          ahead: this.jobs.length - 1,
          text: params.text,
        },
        "tts.job_queued",
      );
      if (this.host.hold.held && this.host.hold.sticky) {
        this.detachJob(job, "sticky");
      }
      const produced = this.synthLane.then(() => this.produceJob(job));
      // The next job may synthesize once this one is done or cancelled.
      this.synthLane = Promise.race([produced, job.cancelled]).then(
        () => undefined,
        () => undefined,
      );
      const played = this.playLane.then(() =>
        this.playJob(job, params.emitMessage, params.isVoiceMode),
      );
      this.playLane = played.then(
        () => undefined,
        () => undefined,
      );
    });
  }

  /**
   * The MCP call's signal cancels the job only while the speak call still waits for it; the
   * session's signal (a new phrase while the assistant is idle, the stop button) always does.
   */
  private watchSignals(job: SpeechJob, mcpSignal?: AbortSignal, sessionSignal?: AbortSignal): void {
    const onMcpAbort = () => {
      if (!job.detached && !job.early) {
        this.cancelJob(job, "speak-aborted");
      }
    };
    const onSessionAbort = () => this.cancelJob(job, "session-abort");
    if (mcpSignal?.aborted || sessionSignal?.aborted) {
      job.cancel = true;
    }
    mcpSignal?.addEventListener("abort", onMcpAbort, { once: true });
    sessionSignal?.addEventListener("abort", onSessionAbort, { once: true });
    this.signalCleanups.set(job, () => {
      mcpSignal?.removeEventListener("abort", onMcpAbort);
      sessionSignal?.removeEventListener("abort", onSessionAbort);
    });
  }

  cancelJob(job: SpeechJob, reason: string): void {
    if (job.cancel) {
      return;
    }
    job.stop(reason, "cancel");
    this.host.logger.info({ jobId: job.id, reason }, "tts.job_cancel");
  }

  cancelAll(reason: string): void {
    for (const job of this.jobs) {
      this.cancelJob(job, reason);
    }
  }

  /**
   * Hizuri (phrase graph): what of a live or recent job the user heard by `at`; null = unknown job.
   */
  heardSplit(jobId: string, at: number): HeardSplit | null {
    const job = [...this.jobs, ...this.recent].find((j) => j.id === jobId);
    return job ? job.heardBy(at) : null;
  }

  /** Hizuri: when a live or recent job's first audio went out; null = not yet or unknown. */
  firstAudioAt(jobId: string): number | null {
    return [...this.jobs, ...this.recent].find((j) => j.id === jobId)?.firstAudioAt ?? null;
  }

  private detachJob(job: SpeechJob, reason: string, outcome = "paused"): void {
    if (job.waiterDone) {
      return;
    }
    job.detached = true;
    job.resolveWaiter({ detached: true, reason, outcome });
    this.host.logger.info({ jobId: job.id, reason }, "tts.speak_detached");
  }

  private onHoldChange(): void {
    const hold = this.host.hold;
    if (hold.held) {
      if (hold.sticky) {
        this.clearDetachTimer();
        for (const job of this.jobs) {
          this.detachJob(job, "sticky");
        }
        return;
      }
      const detachMs = envNonNegative("PASEO_TTS_DETACH_HOLD_MS", 8000);
      if (!this.detachTimer && detachMs > 0) {
        this.detachTimer = setTimeout(() => {
          this.detachTimer = null;
          if (this.host.hold.held) {
            for (const job of this.jobs) {
              this.detachJob(job, "long-hold");
            }
          }
        }, detachMs);
      }
      return;
    }
    this.clearDetachTimer();
    // Nobody said "continue" in time: drop the paused rest; replies queued behind it go on.
    if (hold.lastReleaseReason === "sticky-max") {
      this.dropHead("sticky-max");
    }
  }

  private clearDetachTimer(): void {
    if (this.detachTimer) {
      clearTimeout(this.detachTimer);
      this.detachTimer = null;
    }
  }

  /** Drop the reply now playing or paused (the oldest job); later ones go on. */
  dropHead(reason: string): void {
    const head = this.jobs[0];
    if (!head || head.drop) {
      return;
    }
    head.stop(reason, "drop");
    this.host.logger.info({ jobId: head.id, reason }, "tts.paused_dropped");
  }

  /** The drop word: drop every reply, the one playing or paused and all queued ones. */
  dropAll(reason: string): void {
    this.dropHead(reason);
    for (const job of this.jobs.slice(1)) {
      this.cancelJob(job, reason);
    }
  }

  private nextPartChars(job: SpeechJob): number {
    const playedMs = job.stats.playedMs?.() ?? 0;
    const aheadMs = Math.max(0, job.synthesizedMs - playedMs);
    const { overheadMs, perCharMs } = this.synthStats;
    const chars = Math.floor((aheadMs * 0.8 - overheadMs) / perCharMs);
    return Math.max(
      envNonNegative("PASEO_TTS_STREAM_MIN_CHARS", 60),
      Math.min(envNonNegative("PASEO_TTS_STREAM_MAX_CHARS", 300), chars),
    );
  }

  private async waitWhileSticky(job: SpeechJob): Promise<void> {
    while (this.host.hold.held && this.host.hold.sticky && !job.isCancelled()) {
      await new Promise((done) => setTimeout(done, 100));
    }
  }

  /**
   * The text of the next part. First part: 30-70 chars (2-5 s of speech): whole sentences, or cut
   * at a comma; a shorter one leaves a hole while the next part synthesizes. Later parts: as much
   * as can be synthesized while the waiting audio plays.
   */
  private nextPartText(job: SpeechJob, cursor: { idx: number }, part: number): string {
    const units = job.plan.units;
    const first = part === 0;
    const maxChars = first
      ? envNonNegative("PASEO_TTS_STREAM_FIRST_CHARS", 70)
      : this.nextPartChars(job);
    const minChars = first ? 30 : envNonNegative("PASEO_TTS_STREAM_MIN_CHARS", 60);
    let body = units[cursor.idx++];
    while (
      cursor.idx < units.length &&
      (body.length < minChars || body.length + 1 + units[cursor.idx].length <= maxChars)
    ) {
      if (first && body.length + 1 + units[cursor.idx].length > maxChars) {
        // Take only the first clause of the next sentence when it ends at a comma.
        const pieces = this.host.splitFragment(
          units[cursor.idx],
          Math.max(20, maxChars - body.length - 1),
        );
        if (pieces.length > 1 && /[,;:—]$/.test(pieces[0])) {
          body += ` ${pieces[0]}`;
          const rest = units[cursor.idx];
          units[cursor.idx] = rest.slice(rest.indexOf(pieces[0]) + pieces[0].length).trim();
          break;
        }
      }
      body += ` ${units[cursor.idx++]}`;
    }
    return (first ? job.plan.head : job.plan.carry) + body;
  }

  /**
   * Audio is handed to the pacer while it streams in: every 1.5 s gathered, all of it up to the
   * last quiet spot goes out; the rest waits for more, so no cut falls mid-word.
   */
  private async streamPart(job: SpeechJob, stream: Readable): Promise<number> {
    let pending = Buffer.alloc(0);
    let partMs = 0;
    let continued = false; // false: the next segment starts a sentence (a part border)
    const pushSegment = (synthesized: Buffer) => {
      if (synthesized.length === 0) {
        return;
      }
      const pcm = withSpeechSpeed(synthesized, job.plan.units[0] ?? "");
      job.source.segments.push({ pcm, continued });
      continued = true;
      job.synthesizedMs += pcm.length / PCM_BYTES_PER_MS;
      partMs += pcm.length / PCM_BYTES_PER_MS;
      this.host.setCurrentReplyPcm(pcm);
      job.notify();
    };
    try {
      for await (const chunk of stream) {
        if (job.isCancelled()) {
          break;
        }
        pending = Buffer.concat([pending, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
        if (pending.length >= 1500 * PCM_BYTES_PER_MS) {
          const pieces = splitPcmAtPauses(pending);
          if (pieces.length > 1) {
            const keepFrom = pieces[pieces.length - 1].start;
            pushSegment(pending.subarray(0, keepFrom));
            pending = pending.subarray(keepFrom);
          }
        }
      }
    } finally {
      this.host.destroyStream(stream);
    }
    if (!job.isCancelled()) {
      pushSegment(pending.subarray(0, pending.length - (pending.length % 2)));
    }
    return partMs;
  }

  /** Synthesize a job part by part into job.source. */
  private async produceJob(job: SpeechJob): Promise<void> {
    const cursor = { idx: 0 };
    let part = 0;
    try {
      const tts = this.host.resolveTts();
      if (!tts) {
        throw new Error("TTS not configured");
      }
      while (cursor.idx < job.plan.units.length && !job.isCancelled()) {
        // No new synthesis while a stop word holds the assistant.
        await this.waitWhileSticky(job);
        if (job.isCancelled()) {
          break;
        }
        const input = this.nextPartText(job, cursor, part);
        const startedAt = Date.now();
        const { stream, format } = await tts.synthesizeSpeech(input);
        // The local voice (Kokoro) names its rate: 24 kHz 16-bit PCM is the same stream the queue plays.
        if (format !== "pcm" && format !== "pcm;rate=24000") {
          this.host.destroyStream(stream);
          throw new Error(`speech queue needs pcm, TTS answered ${format}`);
        }
        const audioStartMs = job.synthesizedMs;
        const partMs = await this.streamPart(job, stream);
        if (job.isCancelled()) {
          break;
        }
        job.addSpans(
          input.slice((part === 0 ? job.plan.head : job.plan.carry).length),
          audioStartMs,
          job.synthesizedMs,
        );
        this.learnSynthSpeed(job, { part, input, startedAt, partMs });
        part += 1;
      }
    } catch (error) {
      if (!job.isCancelled()) {
        job.error = error;
        this.host.logger.error({ err: error, jobId: job.id, part }, "tts.part_failed");
      }
    } finally {
      job.source.done = true;
      job.notify();
    }
  }

  /** Learn the synthesis speed (fixed cost per call + cost per character). */
  private learnSynthSpeed(
    job: SpeechJob,
    info: { part: number; input: string; startedAt: number; partMs: number },
  ): void {
    const synthMs = Date.now() - info.startedAt;
    const sample = (synthMs - this.synthStats.overheadMs) / Math.max(1, info.input.length);
    this.synthStats.perCharMs = Math.min(
      200,
      Math.max(5, this.synthStats.perCharMs * 0.5 + sample * 0.5),
    );
    this.host.logger.info(
      {
        jobId: job.id,
        part: info.part,
        chars: info.input.length,
        synthMs,
        audioMs: Math.round(info.partMs),
        sinceQueuedMs: Date.now() - job.enqueuedAt,
        perCharMs: Math.round(this.synthStats.perCharMs),
      },
      "tts.part_ready",
    );
  }

  /** The speak call returns PASEO_TTS_RETURN_EARLY_MS (1500, 0 = off) before the reply ends. */
  private scheduleEarlyReturn(job: SpeechJob, remainingMs: number): void {
    const earlyMs = envNonNegative("PASEO_TTS_RETURN_EARLY_MS", 1500);
    if (job.waiterDone || earlyMs <= 0) {
      return;
    }
    const fire = () => {
      if (!job.waiterDone && !job.isCancelled() && !this.host.hold.held) {
        job.early = true;
        job.resolveWaiter({ detached: false, early: true, outcome: "playing" });
      }
    };
    clearTimeout(job.earlyTimer);
    if (remainingMs <= earlyMs) {
      fire();
    } else {
      job.earlyTimer = setTimeout(fire, remainingMs - earlyMs);
    }
  }

  private emitChunk(
    job: SpeechJob,
    emitMessage: (msg: SessionOutboundMessage) => void,
    chunk: { audioId: string; index: number; audio: Buffer; isLast: boolean; isVoiceMode: boolean },
  ): void {
    if (job.firstAudioMs === null) {
      job.firstAudioAt = Date.now();
      job.firstAudioMs = job.firstAudioAt - job.enqueuedAt;
      this.host.logger.info({ jobId: job.id, firstAudioMs: job.firstAudioMs }, "tts.first_audio");
      job.hooks.onFirstAudio?.();
    }
    emitMessage({
      type: "audio_output",
      payload: {
        id: `${chunk.audioId}:${chunk.index}`,
        groupId: chunk.audioId,
        chunkIndex: chunk.index,
        isLastChunk: chunk.isLast,
        audio: withOutputGain(chunk.audio, "pcm").toString("base64"),
        format: "pcm",
        isVoiceMode: chunk.isVoiceMode,
      },
    });
  }

  /** Play a job as one audio group while produceJob fills it. */
  private async playJob(
    job: SpeechJob,
    emitMessage: (msg: SessionOutboundMessage) => void,
    isVoiceMode: boolean,
  ): Promise<void> {
    const audioId = uuidv4();
    const tracker: PlaybackTracker = { acked: new Map(), onAck: null };
    this.host.openPlayback(audioId, {
      tracker,
      stop: () => this.cancelJob(job, "cancel-pending"),
      close: () => this.cancelJob(job, "session-closed"),
    });
    let result: PacedResult | null = null;
    let outcome = "cancelled";
    try {
      if (!job.isCancelled() && job.hooks.beforePlay) {
        const play = await Promise.race([
          job.hooks.beforePlay({
            waiting: (reason) => this.detachJob(job, reason, "waiting"),
            cancelled: job.cancelled,
          }),
          job.cancelled.then(() => false),
        ]);
        if (!play && !job.isCancelled()) {
          this.cancelJob(job, "superseded");
        }
      }
      if (!job.isCancelled()) {
        job.started = true;
        job.hooks.onStart?.();
        result = await playPacedStream({
          source: job.source,
          emitChunk: (index, audio, isLast) =>
            this.emitChunk(job, emitMessage, { audioId, index, audio, isLast, isVoiceMode }),
          tracker,
          hold: this.host.hold,
          cancelled: () => job.isCancelled(),
          logger: this.host.logger,
          stats: job.stats,
          onRemaining: (remainingMs) => this.scheduleEarlyReturn(job, remainingMs),
        });
        outcome = result.outcome;
        if (outcome === "empty" && job.error) {
          outcome = "error";
        }
      }
      if (job.drop) {
        outcome = "dropped";
      }
    } catch (error) {
      outcome = "error";
      this.host.logger.error({ err: error, jobId: job.id }, "tts.job_failed");
    } finally {
      this.finishJob(job, { audioId, result, outcome });
    }
  }

  private finishJob(
    job: SpeechJob,
    end: { audioId: string; result: PacedResult | null; outcome: string },
  ): void {
    clearTimeout(job.earlyTimer);
    // Stop a producer still running and free the synthesis lane (quietly: the normal end).
    if (!job.cancel) {
      job.stop(job.cancelReason ?? "done", "cancel");
    }
    this.host.closePlayback(end.audioId);
    this.jobs = this.jobs.filter((j) => j !== job);
    // Kept for the phrase graph's heard split: timings only, not the audio.
    job.stats.release?.();
    job.source.segments.length = 0;
    this.recent = [...this.recent.slice(1 - RECENT_JOBS), job];
    if (this.jobs.length === 0) {
      this.host.setCurrentReplyPcm(null);
    }
    this.signalCleanups.get(job)?.();
    const emitted = end.result?.emitted ?? 0;
    const incomplete = emitted > 0 && end.outcome !== "played";
    this.host.logger.info(
      {
        jobId: job.id,
        outcome: end.outcome,
        incomplete,
        detached: job.detached,
        early: job.early,
        firstAudioMs: job.firstAudioMs,
        totalMs: Date.now() - job.enqueuedAt,
        chunks: end.result?.chunks ?? 0,
        emitted,
        pausedMs: end.result?.pausedMs ?? 0,
        pauses: end.result?.pauses ?? 0,
        cancelReason: job.cancelReason === "done" ? undefined : job.cancelReason,
      },
      "tts.job_done",
    );
    const error = job.error instanceof Error ? job.error.message : job.error;
    job.resolveWaiter({
      detached: job.detached,
      early: job.early,
      outcome: end.outcome,
      ...(error !== undefined ? { error: String(error) } : {}),
    });
    job.hooks.onEnd?.(jobEnd(job, end.outcome, end.result));
  }
}
