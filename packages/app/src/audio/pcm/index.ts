import { hasVoiceOutputListeners, publishVoiceOutput } from "../voice-output";

// The native two-way engine starts a chunk this long after playPCMData (Android AAudio/OpenSL
// buffer at 16 kHz). Only an estimate, for binaries and moments without a playback timestamp: the
// face otherwise gets the measured moment (`getOutputTiming`, AudioTrack.getTimestamp).
const NATIVE_OUTPUT_LATENCY_MS = 60;

// Hizuri: the next chunk reaches the native queue this long before the current one runs out. The JS
// thread hands chunks over one at a time, and anything that stalls it (the face's WebView draws in
// the app's own process) would otherwise turn into silence between chunks; now a stall shorter than
// this only delays the hand-over, not the sound.
export const NATIVE_PREFEED_MS = 400;

/** `Date.now()` when the native queue runs dry: the end of the last chunk handed to it. */
let nativeQueuedUntil = 0;

/** Resolves once every chunk handed to the native player has had time to play. */
export function waitForNativeOutputDrain(): Promise<void> {
  const remainingMs = nativeQueuedUntil - Date.now();
  if (remainingMs <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remainingMs));
}

export function nativeOutputDrainMs(): number {
  return Math.max(0, nativeQueuedUntil - Date.now());
}

const floatToInt16 = (sample: number): number => {
  const clamped = Math.max(-1, Math.min(1, sample));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
};

export const resampleToPcm16 = (
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Int16Array => {
  if (input.length === 0) {
    return new Int16Array(0);
  }
  if (inputRate === outputRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      out[i] = floatToInt16(input[i]);
    }
    return out;
  }

  const ratio = inputRate / outputRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio;
    const i0 = Math.floor(sourceIndex);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = sourceIndex - i0;
    const sample = input[i0] * (1 - frac) + input[i1] * frac;
    out[i] = floatToInt16(sample);
  }
  return out;
};

export function parsePcmSampleRate(mimeType: string): number | null {
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) {
    return null;
  }
  const rate = Number(match[1]);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function resamplePcm16(pcm: Uint8Array, fromRate: number, toRate: number): Uint8Array {
  if (fromRate === toRate) {
    return pcm;
  }

  const inputSamples = Math.floor(pcm.length / 2);
  const outputSamples = Math.floor((inputSamples * toRate) / fromRate);
  const out = new Uint8Array(outputSamples * 2);
  const ratio = fromRate / toRate;

  const readInt16 = (sampleIndex: number): number => {
    const i = sampleIndex * 2;
    if (i + 1 >= pcm.length) {
      return 0;
    }
    const lo = pcm[i];
    const hi = pcm[i + 1];
    let value = (hi << 8) | lo;
    if (value & 0x8000) {
      value = value - 0x10000;
    }
    return value;
  };

  const writeInt16 = (sampleIndex: number, value: number): void => {
    const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
    const i = sampleIndex * 2;
    out[i] = clamped & 0xff;
    out[i + 1] = (clamped >> 8) & 0xff;
  };

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const s0 = readInt16(i0);
    const s1 = readInt16(Math.min(inputSamples - 1, i0 + 1));
    writeInt16(i, s0 + (s1 - s0) * frac);
  }

  return out;
}

interface PcmOutput {
  resumePlayback(): void;
  playPCMData(bytes: Uint8Array): void;
  stopPlayback(): void;
  getOutputTiming?(): { audibleInMs: number } | null;
}

/**
 * Stops voice still queued in the native player after its chunk's promise settled (the last
 * NATIVE_PREFEED_MS of a reply), for a stop that finds no active chunk to abort.
 */
export function stopQueuedPcm16(output: PcmOutput): void {
  if (nativeQueuedUntil <= Date.now()) return;
  nativeQueuedUntil = 0;
  output.stopPlayback();
  publishVoiceOutput({ type: "stop" });
}

/** Keep voice output on the native communication engine and its echo reference. */
export function playPcm16(
  bytes: Uint8Array,
  mimeType: string,
  signal: AbortSignal,
  output: PcmOutput,
): Promise<number> {
  if (signal.aborted) return Promise.reject(new Error("Playback stopped"));
  const pcm = resamplePcm16(bytes, parsePcmSampleRate(mimeType) ?? 24000, 16000);
  const duration = pcm.length / 2 / 16000;
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      clearTimeout(timeout);
      nativeQueuedUntil = 0; // stopPlayback drops every queued chunk
      output.stopPlayback();
      publishVoiceOutput({ type: "stop" });
      reject(new Error("Playback stopped"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      output.resumePlayback();
      // Before the hand-over, so the chunk itself is not counted as ahead of it.
      const timing = hasVoiceOutputListeners() ? (output.getOutputTiming?.() ?? null) : null;
      output.playPCMData(pcm);
      const now = Date.now();
      // Behind the chunks still queued, or at once if the queue ran dry.
      const startsAt = Math.max(now, nativeQueuedUntil);
      nativeQueuedUntil = startsAt + duration * 1000;
      if (hasVoiceOutputListeners()) {
        publishVoiceOutput({
          type: "chunk",
          chunk: {
            pcm,
            sampleRate: 16000,
            startedAt: startsAt,
            latencyMs: NATIVE_OUTPUT_LATENCY_MS,
            ...(timing ? { audibleAt: now + timing.audibleInMs } : {}),
          },
        });
      }
      timeout = setTimeout(
        () => {
          signal.removeEventListener("abort", abort);
          resolve(duration);
        },
        Math.max(0, nativeQueuedUntil - NATIVE_PREFEED_MS - now),
      );
    } catch (error) {
      signal.removeEventListener("abort", abort);
      reject(error);
    }
  });
}
