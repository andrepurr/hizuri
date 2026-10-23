/**
 * hizuri: live numbers about the microphone, read by the uploaded app logs and the recognition
 * diagnostics overlay. Fed from the audio engine callbacks in `contexts/voice-context.tsx`.
 *
 * "Silenced by the system": Android hands an app exact digital zeros when another audio path
 * (a call mode, the echo canceller while the speaker plays) takes the microphone. Real room noise
 * is never exactly zero, so a run of all-zero PCM chunks is the signal.
 */

/** 16 kHz, 16-bit mono capture. */
const PCM_BYTES_PER_MS = 32;
/** A zero run longer than this marks the mic as silenced. */
export const SILENCED_ZERO_RUN_MS = 400;
const PUBLISH_INTERVAL_MS = 150;

export interface MicWindowStats {
  chunks: number;
  zeroChunks: number;
  longestZeroRunMs: number;
  levelMax: number;
  levelMean: number;
}

export interface VoiceDiagnosticsSnapshot {
  /** Last input level from the native engine, 0..1. */
  level: number;
  /** Length of the current run of exact-zero audio. */
  zeroRunMs: number;
  silencedBySystem: boolean;
  lastTranscript: string | null;
  /** From the daemon's end-of-speech signal to the transcript's arrival; null when unknown. */
  transcriptLatencyMs: number | null;
  isLowConfidence: boolean;
  /** Increments with every transcript, so readers can tell a repeat from a new one. */
  transcriptSeq: number;
}

const INITIAL_SNAPSHOT: VoiceDiagnosticsSnapshot = {
  level: 0,
  zeroRunMs: 0,
  silencedBySystem: false,
  lastTranscript: null,
  transcriptLatencyMs: null,
  isLowConfidence: false,
  transcriptSeq: 0,
};

/** A transcript later than this after speech ended is not matched to that speech. */
const LATENCY_MATCH_WINDOW_MS = 60_000;

export function isAllZeroPcm(pcm: Uint8Array): boolean {
  for (let index = 0; index < pcm.length; index += 1) {
    if (pcm[index] !== 0) {
      return false;
    }
  }
  return pcm.length > 0;
}

export class VoiceDiagnostics {
  private snapshot: VoiceDiagnosticsSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private lastPublishMs = 0;
  private level = 0;
  private zeroRunMs = 0;
  private speechEndedAt: number | null = null;
  private transcript: Pick<
    VoiceDiagnosticsSnapshot,
    "lastTranscript" | "transcriptLatencyMs" | "isLowConfidence" | "transcriptSeq"
  > = {
    lastTranscript: null,
    transcriptLatencyMs: null,
    isLowConfidence: false,
    transcriptSeq: 0,
  };
  private window = {
    chunks: 0,
    zeroChunks: 0,
    longestZeroRunMs: 0,
    levelMax: 0,
    levelSum: 0,
    levels: 0,
  };

  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  recordMicChunk(pcm: Uint8Array): void {
    const durationMs = pcm.byteLength / PCM_BYTES_PER_MS;
    const wasSilenced = this.zeroRunMs >= SILENCED_ZERO_RUN_MS;
    this.window.chunks += 1;
    if (isAllZeroPcm(pcm)) {
      this.window.zeroChunks += 1;
      this.zeroRunMs += durationMs;
      this.window.longestZeroRunMs = Math.max(this.window.longestZeroRunMs, this.zeroRunMs);
    } else {
      this.zeroRunMs = 0;
    }
    const isSilenced = this.zeroRunMs >= SILENCED_ZERO_RUN_MS;
    this.publish(isSilenced !== wasSilenced);
  }

  recordLevel(level: number): void {
    this.level = level;
    this.window.levelMax = Math.max(this.window.levelMax, level);
    this.window.levelSum += level;
    this.window.levels += 1;
    this.publish(false);
  }

  /** The daemon's voice activity detector: speech started (true) or ended (false). */
  recordSpeechState(isSpeaking: boolean): void {
    this.speechEndedAt = isSpeaking ? null : this.now();
  }

  recordTranscript(input: { text: string; isLowConfidence?: boolean }): void {
    const nowMs = this.now();
    const latency =
      this.speechEndedAt !== null && nowMs - this.speechEndedAt <= LATENCY_MATCH_WINDOW_MS
        ? nowMs - this.speechEndedAt
        : null;
    this.speechEndedAt = null;
    this.transcript = {
      lastTranscript: input.text,
      transcriptLatencyMs: latency,
      isLowConfidence: input.isLowConfidence === true,
      transcriptSeq: this.transcript.transcriptSeq + 1,
    };
    this.publish(true);
  }

  /** Resets the live mic numbers when capture stops, so a stale level never shows. */
  reset(): void {
    this.level = 0;
    this.zeroRunMs = 0;
    this.publish(true);
  }

  /** Stats since the previous call, or null when no audio arrived. */
  takeWindowStats(): MicWindowStats | null {
    const window = this.window;
    this.window = {
      chunks: 0,
      zeroChunks: 0,
      longestZeroRunMs: 0,
      levelMax: 0,
      levelSum: 0,
      levels: 0,
    };
    if (window.chunks === 0) {
      return null;
    }
    return {
      chunks: window.chunks,
      zeroChunks: window.zeroChunks,
      longestZeroRunMs: Math.round(window.longestZeroRunMs),
      levelMax: Number(window.levelMax.toFixed(3)),
      levelMean: Number((window.levels > 0 ? window.levelSum / window.levels : 0).toFixed(3)),
    };
  }

  getSnapshot = (): VoiceDiagnosticsSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(force: boolean): void {
    const nowMs = this.now();
    if (!force && nowMs - this.lastPublishMs < PUBLISH_INTERVAL_MS) {
      return;
    }
    this.lastPublishMs = nowMs;
    this.snapshot = {
      level: Number(this.level.toFixed(3)),
      zeroRunMs: Math.round(this.zeroRunMs),
      silencedBySystem: this.zeroRunMs >= SILENCED_ZERO_RUN_MS,
      ...this.transcript,
    };
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const voiceDiagnostics = new VoiceDiagnostics();
