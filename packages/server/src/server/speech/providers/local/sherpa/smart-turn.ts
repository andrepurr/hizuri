import { createRequire } from "node:module";

import { envNumber, envPositive } from "../../../../voice-env.js";

// Hizuri: careful Smart Turn. When a pause in a phrase reaches AFTER_MS, the
// Smart Turn v3.2 end-of-turn model checks the phrase once; the phrase closes at once only if it
// says "finished" with p >= THRESHOLD, otherwise the usual silence rule decides. On whispered
// phrases this closes them about a second sooner with no extra cuts; at normal loudness sooner
// too, though it splits a few phrases in two.
//
// Off by default: it needs the model file (smart-turn-v3.2-cpu.onnx, 8.7 MB, pipecat-ai/smart-turn)
// and the optional `onnxruntime-node` package, neither of which ships with the daemon.
// Env: PASEO_SMART_TURN_MODEL=<path to the .onnx> turns it on; PASEO_SMART_TURN_THRESHOLD (0.95),
// PASEO_SMART_TURN_AFTER_MS (800), PASEO_SMART_TURN_PRE_MS (500, audio kept before the phrase).

const SAMPLE_RATE = 16_000;
const N_FFT = 400;
const HOP = 160;
const N_MELS = 80;
const CHUNK_SECONDS = 8;
const N_SAMPLES = CHUNK_SECONDS * SAMPLE_RATE; // 128000
const N_FRAMES = N_SAMPLES / HOP; // 800
const N_BINS = N_FFT / 2 + 1; // 201

export interface SmartTurnConfig {
  modelPath: string;
  /** Close the phrase only at or above this end-of-turn probability. */
  threshold: number;
  /** Check once when a pause reaches this length. */
  afterMs: number;
  /** Audio kept before the phrase start. */
  preMs: number;
}

export function resolveSmartTurnConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmartTurnConfig | null {
  const modelPath = env.PASEO_SMART_TURN_MODEL?.trim();
  if (!modelPath) {
    return null;
  }
  return {
    modelPath,
    threshold: envNumber("PASEO_SMART_TURN_THRESHOLD", 0.95, env),
    afterMs: envPositive("PASEO_SMART_TURN_AFTER_MS", 800, env),
    preMs: envNumber("PASEO_SMART_TURN_PRE_MS", 500, env),
  };
}

// ---------------------------------------------------------------- Whisper log-mel features

function hertzToMel(freq: number): number {
  // Slaney scale, as transformers' mel_filter_bank(mel_scale="slaney").
  const minLogHertz = 1000;
  const minLogMel = 15;
  const logstep = 27 / Math.log(6.4);
  return freq >= minLogHertz
    ? minLogMel + Math.log(freq / minLogHertz) * logstep
    : (3 * freq) / 200;
}

function melToHertz(mel: number): number {
  const minLogHertz = 1000;
  const minLogMel = 15;
  const logstep = Math.log(6.4) / 27;
  return mel >= minLogMel ? minLogHertz * Math.exp(logstep * (mel - minLogMel)) : (200 * mel) / 3;
}

/** 80 x 201 Slaney-normalised triangular filters, 0-8000 Hz (Whisper's feature extractor). */
function melFilters(): Float64Array[] {
  const melMin = hertzToMel(0);
  const melMax = hertzToMel(SAMPLE_RATE / 2);
  const filterFreqs: number[] = [];
  for (let i = 0; i < N_MELS + 2; i++) {
    filterFreqs.push(melToHertz(melMin + ((melMax - melMin) * i) / (N_MELS + 1)));
  }
  const filters: Float64Array[] = [];
  for (let m = 0; m < N_MELS; m++) {
    const row = new Float64Array(N_BINS);
    const enorm = 2 / (filterFreqs[m + 2] - filterFreqs[m]);
    for (let k = 0; k < N_BINS; k++) {
      const fftFreq = (k * (SAMPLE_RATE / 2)) / (N_BINS - 1);
      const down = (fftFreq - filterFreqs[m]) / (filterFreqs[m + 1] - filterFreqs[m]);
      const up = (filterFreqs[m + 2] - fftFreq) / (filterFreqs[m + 2] - filterFreqs[m + 1]);
      row[k] = Math.max(0, Math.min(down, up)) * enorm;
    }
    filters.push(row);
  }
  return filters;
}

/** Periodic Hann window of N_FFT samples. */
function hannWindow(): Float64Array {
  const window = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT);
  }
  return window;
}

const TWIDDLE_RE = new Float64Array(N_FFT);
const TWIDDLE_IM = new Float64Array(N_FFT);
for (let j = 0; j < N_FFT; j++) {
  TWIDDLE_RE[j] = Math.cos((-2 * Math.PI * j) / N_FFT);
  TWIDDLE_IM[j] = Math.sin((-2 * Math.PI * j) / N_FFT);
}

function smallestFactor(n: number): number {
  for (let p = 2; p * p <= n; p++) {
    if (n % p === 0) {
      return p;
    }
  }
  return n;
}

/** Mixed-radix DFT of a length dividing N_FFT (400 = 2^4 * 5^2), input at offset + k * stride. */
function fft(
  re: Float64Array,
  im: Float64Array,
  offset: number,
  stride: number,
  n: number,
): { re: Float64Array; im: Float64Array } {
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  if (n === 1) {
    outRe[0] = re[offset];
    outIm[0] = im[offset];
    return { re: outRe, im: outIm };
  }
  const p = smallestFactor(n);
  const m = n / p;
  const subs = [];
  for (let r = 0; r < p; r++) {
    subs.push(fft(re, im, offset + r * stride, stride * p, m));
  }
  const twiddleStep = N_FFT / n;
  for (let q = 0; q < p; q++) {
    for (let k = 0; k < m; k++) {
      const out = k + m * q;
      let sumRe = 0;
      let sumIm = 0;
      for (let r = 0; r < p; r++) {
        const w = ((r * out) % n) * twiddleStep;
        const sr = subs[r].re[k];
        const si = subs[r].im[k];
        sumRe += sr * TWIDDLE_RE[w] - si * TWIDDLE_IM[w];
        sumIm += sr * TWIDDLE_IM[w] + si * TWIDDLE_RE[w];
      }
      outRe[out] = sumRe;
      outIm[out] = sumIm;
    }
  }
  return { re: outRe, im: outIm };
}

let cachedFilters: Float64Array[] | null = null;
let cachedWindow: Float64Array | null = null;

/**
 * Whisper input features for the last 8 s of 16 kHz audio, as WhisperFeatureExtractor
 * (chunk_length=8, do_normalize=True) computes them: zero-padded at the start to 8 s, normalised
 * to zero mean and unit variance, power STFT (400 / 160, centred, reflect padding), 80 Slaney mel
 * bins, log10, floor at max - 8, (x + 4) / 4. Returns 80 x 800 values, row-major.
 */
export function whisperFeatures(audio: Float32Array): Float32Array {
  const filters = (cachedFilters ??= melFilters());
  const window = (cachedWindow ??= hannWindow());
  const tail = audio.subarray(Math.max(0, audio.length - N_SAMPLES));
  const x = new Float64Array(N_SAMPLES);
  x.set(tail, N_SAMPLES - tail.length);
  let mean = 0;
  for (let i = 0; i < N_SAMPLES; i++) {
    mean += x[i];
  }
  mean /= N_SAMPLES;
  let variance = 0;
  for (let i = 0; i < N_SAMPLES; i++) {
    variance += (x[i] - mean) ** 2;
  }
  const scale = 1 / Math.sqrt(variance / N_SAMPLES + 1e-7);
  for (let i = 0; i < N_SAMPLES; i++) {
    x[i] = (x[i] - mean) * scale;
  }
  // Centred frames with reflect padding (no edge repeat).
  const pad = N_FFT / 2;
  const at = (i: number) => {
    const j = i - pad;
    if (j < 0) {
      return x[-j];
    }
    if (j >= N_SAMPLES) {
      return x[2 * (N_SAMPLES - 1) - j];
    }
    return x[j];
  };
  const logMel = new Float64Array(N_MELS * N_FRAMES);
  const frameRe = new Float64Array(N_FFT);
  const frameIm = new Float64Array(N_FFT);
  const power = new Float64Array(N_BINS);
  let maxValue = -Infinity;
  // 801 frames; the last one is dropped, as Whisper does.
  for (let t = 0; t < N_FRAMES; t++) {
    for (let i = 0; i < N_FFT; i++) {
      frameRe[i] = at(t * HOP + i) * window[i];
      frameIm[i] = 0;
    }
    const spectrum = fft(frameRe, frameIm, 0, 1, N_FFT);
    for (let k = 0; k < N_BINS; k++) {
      power[k] = spectrum.re[k] ** 2 + spectrum.im[k] ** 2;
    }
    for (let m = 0; m < N_MELS; m++) {
      const row = filters[m];
      let energy = 0;
      for (let k = 0; k < N_BINS; k++) {
        energy += row[k] * power[k];
      }
      const value = Math.log10(Math.max(1e-10, energy));
      logMel[m * N_FRAMES + t] = value;
      if (value > maxValue) {
        maxValue = value;
      }
    }
  }
  const features = new Float32Array(N_MELS * N_FRAMES);
  for (let i = 0; i < features.length; i++) {
    features[i] = (Math.max(logMel[i], maxValue - 8) + 4) / 4;
  }
  return features;
}

// ---------------------------------------------------------------- model

/** The part of onnxruntime-node used here (an optional package, not a daemon dependency). */
export interface OrtRuntime {
  InferenceSession: {
    create(
      path: string,
      options?: Record<string, unknown>,
    ): Promise<{
      inputNames: readonly string[];
      outputNames: readonly string[];
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>>;
    }>;
  };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => unknown;
}

export interface SmartTurnModel {
  /** End-of-turn probability for 16 kHz audio (the last 8 s count). */
  predict(audio16k: Float32Array): Promise<number>;
}

function loadOrtRuntime(): OrtRuntime {
  const require = createRequire(import.meta.url);
  return require("onnxruntime-node") as OrtRuntime;
}

const modelsByPath = new Map<string, Promise<SmartTurnModel>>();

/** One loaded model per path and process. Rejects when onnxruntime-node or the file is missing. */
export function loadSmartTurnModel(
  modelPath: string,
  runtime?: OrtRuntime,
): Promise<SmartTurnModel> {
  let model = modelsByPath.get(modelPath);
  if (!model) {
    model = createSmartTurnModel(modelPath, runtime ?? loadOrtRuntime());
    modelsByPath.set(modelPath, model);
    model.catch(() => modelsByPath.delete(modelPath));
  }
  return model;
}

async function createSmartTurnModel(modelPath: string, ort: OrtRuntime): Promise<SmartTurnModel> {
  const session = await ort.InferenceSession.create(modelPath, {
    executionMode: "sequential",
    interOpNumThreads: 1,
    intraOpNumThreads: 2,
    graphOptimizationLevel: "all",
  });
  const input = session.inputNames[0] ?? "input_features";
  const output = session.outputNames[0];
  return {
    async predict(audio16k) {
      const features = whisperFeatures(audio16k);
      const result = await session.run({
        [input]: new ort.Tensor("float32", features, [1, N_MELS, N_FRAMES]),
      });
      const data = (output ? result[output] : Object.values(result)[0])?.data;
      const value = ArrayBuffer.isView(data) ? Number((data as Float32Array)[0]) : Number.NaN;
      if (!Number.isFinite(value)) {
        throw new Error("Smart Turn returned no probability");
      }
      return value;
    },
  };
}
