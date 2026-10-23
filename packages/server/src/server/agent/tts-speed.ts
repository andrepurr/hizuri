import { envNumber } from "../voice-env.js";

// Hizuri: the assistant's speaking rate (PASEO_TTS_SPEED, live through voice-settings.json). The
// TTS shims take no speed, so the daemon time-stretches the 24 kHz PCM before it is paced: WSOLA
// puts 20 ms Hann windows 10 ms apart in the output and takes each from where it best continues the
// one before (within ±5 ms of its nominal place), which keeps its pitch. Each synthesized segment
// is stretched alone; segments end in quiet spots, so their borders are not heard.

const WINDOW = 480;
const HOP_OUT = WINDOW / 2;
const OVERLAP = WINDOW - HOP_OUT;
const TOLERANCE = 120;

const HANN = Float32Array.from(
  { length: WINDOW },
  (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / WINDOW),
);

function toFloat(pcm: Buffer): Float32Array {
  const samples = Math.floor(pcm.length / 2);
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = pcm.readInt16LE(i * 2);
  }
  return out;
}

/** The offset within ±TOLERANCE of `nominal` whose audio best continues `target`. */
function bestOffset(input: Float32Array, target: number, nominal: number): number {
  let best = 0;
  let bestScore = -Infinity;
  const from = Math.max(-TOLERANCE, -nominal);
  const to = Math.min(TOLERANCE, input.length - WINDOW - nominal);
  for (let delta = from; delta <= to; delta += 1) {
    let score = 0;
    const start = nominal + delta;
    for (let i = 0; i < OVERLAP; i += 1) {
      score += input[target + i] * input[start + i];
    }
    if (score > bestScore) {
      bestScore = score;
      best = delta;
    }
  }
  return best;
}

/** 16-bit mono PCM played `speed` times as fast at the same pitch; the same buffer at 1. */
export function timeStretchPcm(pcm: Buffer, speed: number): Buffer {
  const input = toFloat(pcm);
  if (speed === 1 || !Number.isFinite(speed) || speed <= 0 || input.length < WINDOW * 4) {
    return pcm;
  }
  const hopIn = HOP_OUT * speed;
  const outLength = Math.round(input.length / speed);
  const out = new Float32Array(outLength + WINDOW);
  const weight = new Float32Array(outLength + WINDOW);
  let previous = -1;
  for (let k = 0; ; k += 1) {
    const outPos = k * HOP_OUT;
    const nominal = Math.round(k * hopIn);
    if (outPos >= outLength || nominal + WINDOW > input.length) {
      break;
    }
    const target = previous + HOP_OUT;
    const pos =
      previous < 0 || target + OVERLAP > input.length
        ? nominal
        : nominal + bestOffset(input, target, nominal);
    for (let i = 0; i < WINDOW; i += 1) {
      out[outPos + i] += input[pos + i] * HANN[i];
      weight[outPos + i] += HANN[i];
    }
    previous = pos;
  }
  const result = Buffer.alloc(outLength * 2);
  for (let i = 0; i < outLength; i += 1) {
    const value = weight[i] > 1e-3 ? out[i] / weight[i] : 0;
    result.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), i * 2);
  }
  return result;
}

/** Synthesized PCM at the current PASEO_TTS_SPEED; a prepared clip (`@@play:NAME`) plays as is. */
export function withSpeechSpeed(pcm: Buffer, text: string): Buffer {
  if (text.includes("@@play:")) {
    return pcm;
  }
  return timeStretchPcm(pcm, envNumber("PASEO_TTS_SPEED", 1));
}
