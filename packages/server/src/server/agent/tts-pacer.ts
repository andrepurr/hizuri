import type pino from "pino";

import { envPositive } from "../voice-env.js";

// Hizuri: paced playback of a spoken reply, so the reply can pause while the user talks and go
// on from where it stopped.
//
// Why on the server: the Paseo clients (Android app and web) play the chunks of one audio group
// in order, acknowledge each one after playing it, and wait when the next chunk has not arrived
// yet. Holding chunks back here is therefore a pause that needs no client change. Chunks are cut
// in the natural pauses of the speech, so the gap between two chunks is never heard and a hold
// always stops the assistant between words.
//
// Env (read once per reply):
//   PASEO_TTS_PACE_LEAD_MS  how early the next chunk is sent before the current one ends (400)
//   PASEO_TTS_PACE_MIN_MS / _TARGET_MS / _MAX_MS  chunk length bounds (300 / 700 / 1200)
//   PASEO_TTS_REPLAY_AFTER_MS  a pause at least this long restarts the interrupted sentence (1200)
//   PASEO_TTS_SENTENCE_GAP_MS  a quiet stretch at least this long counts as a sentence border (400)

const RATE = 24_000; // TTS answers 24 kHz s16le mono ("pcm").
export const PCM_BYTES_PER_MS = (RATE * 2) / 1000; // 48
const FRAME_MS = 10;
const FRAME_BYTES = FRAME_MS * PCM_BYTES_PER_MS; // 480
const MAX_REPLAY_MS = 8000;
const SILENT_TAIL = Buffer.alloc(20 * PCM_BYTES_PER_MS); // 20 ms of silence that closes a group
const NO_AUDIO = Buffer.alloc(0);

export interface PcmChunkRange {
  start: number;
  end: number;
  /** Length of the quiet stretch the chunk starts in (Infinity for the first chunk). */
  gapMs: number;
}

export interface SplitPcmOptions {
  minMs?: number;
  targetMs?: number;
  maxMs?: number;
  minGapMs?: number;
}

interface QuietCut {
  frame: number;
  lengthMs: number;
}

function frameLoudness(pcm: Buffer, frames: number): Float64Array {
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * FRAME_BYTES;
    for (let b = base; b < base + FRAME_BYTES; b += 2) {
      const sample = pcm.readInt16LE(b);
      sum += sample * sample;
    }
    rms[f] = Math.sqrt(sum / (FRAME_BYTES / 2));
  }
  return rms;
}

/** Quiet runs long enough to hide a gap; the cut goes into the middle of the run. */
function quietCuts(rms: Float64Array, minGapFrames: number): QuietCut[] {
  // Quiet = 30 dB under the loud speech level (90th percentile), never below a noise floor.
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] || 0;
  const quietLimit = Math.max(60, loud * 0.0316);
  const cuts: QuietCut[] = [];
  let runStart = -1;
  for (let f = 0; f <= rms.length; f++) {
    const quiet = f < rms.length && rms[f] < quietLimit;
    if (quiet && runStart < 0) {
      runStart = f;
    } else if (!quiet && runStart >= 0) {
      if (f - runStart >= minGapFrames) {
        cuts.push({ frame: Math.floor((runStart + f) / 2), lengthMs: (f - runStart) * FRAME_MS });
      }
      runStart = -1;
    }
  }
  return cuts;
}

/** Best cut in reach: long pauses (sentence ends) near the target length; null when none. */
function bestCut(cuts: QuietCut[], pos: number, minF: number, maxF: number, targetF: number) {
  let best: QuietCut | null = null;
  let bestScore = -Infinity;
  for (const cut of cuts) {
    if (cut.frame < pos + minF || cut.frame > pos + maxF) {
      continue;
    }
    const score =
      Math.min(cut.lengthMs, 400) - Math.abs(cut.frame - pos - targetF) * FRAME_MS * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = cut;
    }
  }
  return best;
}

/** No pause in reach: the quietest frame (usually between two syllables). */
function quietestFrame(rms: Float64Array, from: number, to: number): number {
  let quietest = from;
  for (let f = from; f <= to; f++) {
    if (rms[f] < rms[quietest]) {
      quietest = f;
    }
  }
  return quietest;
}

/**
 * Split 24 kHz s16le PCM into chunks whose borders sit in quiet stretches. Returns byte ranges
 * covering the whole buffer, in order.
 */
export function splitPcmAtPauses(pcm: Buffer, opts: SplitPcmOptions = {}): PcmChunkRange[] {
  const minMs = opts.minMs ?? envPositive("PASEO_TTS_PACE_MIN_MS", 300);
  const targetMs = opts.targetMs ?? envPositive("PASEO_TTS_PACE_TARGET_MS", 700);
  const maxMs = Math.max(opts.maxMs ?? envPositive("PASEO_TTS_PACE_MAX_MS", 1200), minMs + 100);
  const total = pcm.length - (pcm.length % 2);
  const frames = Math.floor(total / FRAME_BYTES);
  if (total <= maxMs * PCM_BYTES_PER_MS || frames < 2) {
    return [{ start: 0, end: total, gapMs: Infinity }];
  }
  const rms = frameLoudness(pcm, frames);
  const cuts = quietCuts(rms, Math.ceil((opts.minGapMs ?? 60) / FRAME_MS));
  const chunks: PcmChunkRange[] = [];
  const minF = minMs / FRAME_MS;
  const maxF = maxMs / FRAME_MS;
  const targetF = targetMs / FRAME_MS;
  let pos = 0;
  let posGap = Infinity;
  while (frames - pos > maxF) {
    const cut = bestCut(cuts, pos, minF, maxF, targetF);
    const next = cut?.frame ?? quietestFrame(rms, pos + minF, Math.min(pos + maxF, frames - 1));
    chunks.push({ start: pos * FRAME_BYTES, end: next * FRAME_BYTES, gapMs: posGap });
    pos = next;
    posGap = cut?.lengthMs ?? 0;
  }
  chunks.push({ start: pos * FRAME_BYTES, end: total, gapMs: posGap });
  // A tiny tail is merged into the chunk before it.
  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last.end - last.start < (minMs / 2) * PCM_BYTES_PER_MS) {
    chunks.pop();
    chunks[chunks.length - 1].end = total;
  }
  return chunks;
}

export type PlaybackHoldListener = (hold: PlaybackHold) => void;

/**
 * Session-wide "the user holds the floor" flag; a held reply waits on it between chunks. `sticky`:
 * a stop word holds the assistant until a continue word. `lastReleaseReason` tells the speech queue
 * why the hold ended ("sticky-max" = nobody said continue: drop the paused rest).
 */
export class PlaybackHold {
  held = false;
  sticky = false;
  lastReleaseReason: string | null = null;
  private readonly waiters = new Set<() => void>();
  private readonly listeners = new Set<PlaybackHoldListener>();

  set(held: boolean, reason?: string): void {
    if (this.held === held) {
      return;
    }
    this.held = held;
    if (!held) {
      this.sticky = false;
      this.lastReleaseReason = reason ?? null;
      for (const done of this.waiters) {
        done();
      }
    }
    this.notify();
  }

  setSticky(on: boolean): void {
    if ((on && !this.held) || this.sticky === on) {
      return;
    }
    this.sticky = on;
    this.notify();
  }

  onChange(listener: PlaybackHoldListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch {
        // A listener must never break the hold.
      }
    }
  }

  /** Resolves when the hold is off, or within 100 ms of cancelled() turning true. */
  wait(cancelled: () => boolean): Promise<void> {
    if (!this.held || cancelled()) {
      return Promise.resolve();
    }
    let wake: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      wake = resolve;
    });
    const poll = setInterval(() => {
      if (!this.held || cancelled()) {
        wake();
      }
    }, 100);
    this.waiters.add(wake);
    return released.finally(() => {
      clearInterval(poll);
      this.waiters.delete(wake);
    });
  }
}

/** A Buffer, or { pcm, continued }: continued = it goes on mid-sentence (streamed-in audio). */
export type PacedSegment = Buffer | { pcm: Buffer; continued: boolean };

export interface PacedSource {
  segments: PacedSegment[];
  done: boolean;
  /** Resolves on the next append or on done. */
  waitForMore(): Promise<void>;
}

/** Client playback confirmations per chunk index (filled by TTSManager.confirmAudioPlayed). */
export interface PlaybackTracker {
  acked: Map<number, number>;
  onAck: (() => void) | null;
}

export interface PacedStats {
  /** Audio ms the client confirmed so far. */
  playedMs?: () => number;
  /**
   * Hizuri (phrase graph): how far into the reply's audio (ms from its start) the client had
   * played by wall-clock time `at`. A chunk counts from when it arrived and the one before it
   * was confirmed; one never confirmed counts for its own length at most.
   */
  heardMsBy?: (at: number) => number;
  /** Drop the audio once the reply is over; heardMsBy keeps working on the timings. */
  release?: () => void;
}

export type PacedOutcome = "played" | "cancelled" | "timeout" | "empty";

export interface PacedResult {
  outcome: PacedOutcome;
  chunks: number;
  emitted: number;
  pausedMs: number;
  pauses: number;
}

export interface PlayPacedStreamParams {
  source: PacedSource;
  emitChunk(index: number, audio: Buffer, isLast: boolean): void;
  tracker: PlaybackTracker;
  hold: PlaybackHold;
  cancelled(): boolean;
  logger: pino.Logger;
  stats?: PacedStats;
  /** Once synthesis is complete: called after every chunk sent with the audio still to be heard. */
  onRemaining?(remainingMs: number): void;
}

function stopWaking(
  tracker: PlaybackTracker,
  timer: ReturnType<typeof setTimeout>,
  poll: ReturnType<typeof setInterval>,
): void {
  clearTimeout(timer);
  clearInterval(poll);
  tracker.onAck = null;
}

interface PacedPart {
  pcm: Buffer;
  durMs: number;
  gapMs: number;
  /** Where the chunk starts in the reply's audio; a replayed chunk keeps its place. */
  offsetMs: number;
}

class PacedPlayback {
  private readonly parts: PacedPart[] = [];
  private readonly emittedAt: number[] = [];
  private consumed = 0;
  private sourceMs = 0;
  private pausedMs = 0;
  private pauses = 0;
  private lastFlagged = false;
  private readonly leadMs = envPositive("PASEO_TTS_PACE_LEAD_MS", 400);
  private readonly replayAfterMs = envPositive("PASEO_TTS_REPLAY_AFTER_MS", 1200);
  private readonly sentenceGapMs = envPositive("PASEO_TTS_SENTENCE_GAP_MS", 400);

  constructor(private readonly p: PlayPacedStreamParams) {
    if (p.stats) {
      p.stats.playedMs = () => this.playedMs();
      p.stats.heardMsBy = (at) => this.heardMsBy(at);
      p.stats.release = () => {
        for (const part of this.parts) {
          part.pcm = NO_AUDIO;
        }
      };
    }
  }

  private cancelled(): boolean {
    return this.p.cancelled();
  }

  private playedMs(): number {
    let ms = 0;
    for (const k of this.p.tracker.acked.keys()) {
      ms += this.parts[k]?.durMs ?? 0;
    }
    return ms;
  }

  private heardMsBy(at: number): number {
    let heard = 0;
    for (let i = 0; i < this.emittedAt.length; i++) {
      const start = this.startOf(i);
      if (!Number.isFinite(start) || start > at) {
        continue;
      }
      const part = this.parts[i];
      const ackedAt = this.p.tracker.acked.get(i);
      const played = ackedAt !== undefined && ackedAt <= at ? part.durMs : at - start;
      heard = Math.max(heard, part.offsetMs + Math.min(part.durMs, Math.max(0, played)));
    }
    return heard;
  }

  private absorb(): void {
    const { source, logger } = this.p;
    while (this.consumed < source.segments.length) {
      const entry = source.segments[this.consumed++];
      const segment = Buffer.isBuffer(entry) ? entry : entry.pcm;
      const continued = !Buffer.isBuffer(entry) && entry.continued;
      const pieces = splitPcmAtPauses(segment);
      pieces.forEach((piece, j) => {
        let gapMs = piece.gapMs;
        if (j === 0) {
          gapMs = continued ? 0 : Infinity;
        }
        this.parts.push({
          pcm: segment.subarray(piece.start, piece.end),
          durMs: (piece.end - piece.start) / PCM_BYTES_PER_MS,
          gapMs,
          offsetMs: this.sourceMs + piece.start / PCM_BYTES_PER_MS,
        });
      });
      this.sourceMs += (segment.length - (segment.length % 2)) / PCM_BYTES_PER_MS;
      logger.info(
        {
          segment: this.consumed - 1,
          chunks: pieces.length,
          chunkMs: pieces.map((piece) => Math.round((piece.end - piece.start) / PCM_BYTES_PER_MS)),
        },
        "tts.paced_split",
      );
    }
  }

  private result(outcome: PacedOutcome): PacedResult {
    return {
      outcome,
      chunks: this.parts.length,
      emitted: this.emittedAt.length,
      pausedMs: this.pausedMs,
      pauses: this.pauses,
    };
  }

  /** Wakes on any ack that satisfies stopEarly, on cancel (polled) or at `until` (wall clock). */
  private sleepUntil(until: number, stopEarly: () => boolean): Promise<void> {
    const tracker = this.p.tracker;
    let wake: () => void = () => undefined;
    const woken = new Promise<void>((resolve) => {
      wake = resolve;
    });
    const timer = setTimeout(() => wake(), Math.max(0, until - Date.now()));
    const poll = setInterval(() => {
      if (this.cancelled() || stopEarly()) {
        wake();
      }
    }, 50);
    tracker.onAck = () => {
      if (stopEarly()) {
        wake();
      }
    };
    return woken.finally(() => stopWaking(tracker, timer, poll));
  }

  /** Waits for the next synthesized segment (or done), polling for cancel. */
  private waitMore(): Promise<void> {
    let wake: () => void = () => undefined;
    const woken = new Promise<void>((resolve) => {
      wake = resolve;
    });
    const poll = setInterval(() => {
      if (this.cancelled()) {
        wake();
      }
    }, 100);
    void Promise.resolve(this.p.source.waitForMore()).then(wake, wake);
    return woken.finally(() => clearInterval(poll));
  }

  /** When chunk i started (or will start) on the client: after it arrived and chunk i-1 ended. */
  private startOf(i: number): number {
    const previousEnd = i > 0 ? (this.p.tracker.acked.get(i - 1) ?? Infinity) : 0;
    return Math.max(this.emittedAt[i], previousEnd);
  }

  /** Waits for the client to confirm chunk k; false when it never does (client gone or asleep). */
  private async waitAck(k: number): Promise<boolean> {
    const acked = this.p.tracker.acked;
    while (!acked.has(k) && !this.cancelled()) {
      const started = this.startOf(k);
      const base = Number.isFinite(started) ? started : this.emittedAt[k];
      const deadline = base + this.parts[k].durMs * 1.15 + 4000;
      if (Date.now() >= deadline && Number.isFinite(started)) {
        return false;
      }
      await this.sleepUntil(Math.min(deadline, Date.now() + 1000), () => acked.has(k));
    }
    return true;
  }

  /** Audio still to be heard of what was sent: unconfirmed chunks minus what already played. */
  private remainingMs(): number {
    const acked = this.p.tracker.acked;
    let k = 0;
    while (k < this.emittedAt.length && acked.has(k)) {
      k += 1;
    }
    let ms = 0;
    for (let j = k; j < this.emittedAt.length; j++) {
      ms += this.parts[j].durMs;
    }
    const started = k < this.emittedAt.length ? this.startOf(k) : Infinity;
    const playing = Number.isFinite(started) ? Math.max(0, Date.now() - started) : 0;
    return Math.max(0, ms - playing);
  }

  /** First chunk of the sentence chunk i-1 belongs to (at most ~8 s are replayed). */
  private sentenceStart(i: number): number {
    if (this.parts[i].gapMs >= this.sentenceGapMs) {
      return i;
    }
    let j = i - 1;
    while (j > 0 && this.parts[j].gapMs < this.sentenceGapMs) {
      j -= 1;
    }
    let replayMs = this.parts.slice(j, i).reduce((a, part) => a + part.durMs, 0);
    while (j < i - 1 && replayMs > MAX_REPLAY_MS) {
      replayMs -= this.parts[j].durMs;
      j += 1;
    }
    return j;
  }

  /** True when part i exists; waits while the next sentence is still being synthesized. */
  private async waitForPart(i: number): Promise<boolean> {
    this.absorb();
    while (i >= this.parts.length && !this.p.source.done && !this.cancelled()) {
      await this.waitMore();
      this.absorb();
    }
    return i < this.parts.length;
  }

  /** Chunk i-1 is queued on the client: send chunk i shortly before it ends. False on timeout. */
  private async paceBefore(i: number): Promise<boolean> {
    if (i >= 2 && !(await this.waitAck(i - 2))) {
      this.p.logger.warn({ chunkIndex: i - 2 }, "tts.playback_confirmation_timeout");
      return false;
    }
    if (this.cancelled()) {
      return true;
    }
    const prevStart = this.startOf(i - 1);
    const base = Number.isFinite(prevStart) ? prevStart : this.emittedAt[i - 1];
    const sendAt = base + this.parts[i - 1].durMs - this.leadMs;
    await this.sleepUntil(sendAt, () => this.p.tracker.acked.has(i - 1));
    return true;
  }

  /**
   * While the user holds the floor, wait. After a real interruption (>= replayAfterMs) the
   * assistant starts the sentence again, so the user does not lose the thread; replayed chunks get
   * new indices.
   */
  private async holdIfPaused(i: number): Promise<void> {
    const { hold, logger } = this.p;
    if (!hold.held || this.cancelled()) {
      return;
    }
    const pausedAt = Date.now();
    this.pauses += 1;
    logger.info({ chunkIndex: i, of: this.parts.length, sticky: hold.sticky }, "tts.paused");
    await hold.wait(() => this.cancelled());
    const thisPauseMs = Date.now() - pausedAt;
    this.pausedMs += thisPauseMs;
    if (this.cancelled()) {
      return;
    }
    const from = thisPauseMs >= this.replayAfterMs ? this.sentenceStart(i) : i;
    if (from < i) {
      const replay = this.parts.slice(from, i).map((part) => ({
        pcm: part.pcm,
        durMs: part.durMs,
        gapMs: part.gapMs,
        offsetMs: part.offsetMs,
      }));
      this.parts.splice(i, 0, ...replay);
    }
    logger.info({ chunkIndex: i, pausedMs: thisPauseMs, replayedChunks: i - from }, "tts.resumed");
  }

  private emit(i: number): void {
    this.absorb();
    const { source } = this.p;
    const isLast = source.done && i === this.parts.length - 1;
    this.emittedAt[i] = Date.now();
    this.p.emitChunk(i, this.parts[i].pcm, isLast);
    if (isLast) {
      this.lastFlagged = true;
    }
    if (source.done) {
      const unsent = this.parts.slice(i + 1).reduce((a, part) => a + part.durMs, 0);
      this.p.onRemaining?.(this.remainingMs() + unsent);
    }
  }

  private async finish(): Promise<PacedResult> {
    if (this.parts.length === 0) {
      return this.result("empty");
    }
    if (!this.lastFlagged) {
      // The last chunk went out before synthesis finished: close the group with 20 ms of silence.
      const i = this.parts.length;
      this.parts.push({ pcm: SILENT_TAIL, durMs: 20, gapMs: 0, offsetMs: this.sourceMs });
      this.emittedAt[i] = Date.now();
      this.p.emitChunk(i, SILENT_TAIL, true);
      this.p.onRemaining?.(this.remainingMs());
    }
    for (let k = Math.max(0, this.parts.length - 2); k < this.parts.length; k++) {
      if (!(await this.waitAck(k))) {
        this.p.logger.warn({ chunkIndex: k }, "tts.playback_confirmation_timeout");
        return this.result("timeout");
      }
    }
    return this.result(this.cancelled() ? "cancelled" : "played");
  }

  async run(): Promise<PacedResult> {
    for (let i = 0; ; i++) {
      const ready = await this.waitForPart(i);
      if (this.cancelled()) {
        return this.result("cancelled");
      }
      if (!ready) {
        break;
      }
      if (i > 0 && !(await this.paceBefore(i))) {
        return this.result("timeout");
      }
      await this.holdIfPaused(i);
      if (this.cancelled()) {
        return this.result("cancelled");
      }
      this.emit(i);
    }
    return this.finish();
  }
}

/**
 * Play one reply as paced chunks of a single audio group while it is still being synthesized.
 * emitted > 0 with outcome != "played" means the client holds an unfinished audio group.
 */
export function playPacedStream(params: PlayPacedStreamParams): Promise<PacedResult> {
  return new PacedPlayback(params).run();
}
