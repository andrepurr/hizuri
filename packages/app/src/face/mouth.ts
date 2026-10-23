// Mouth shapes from the PCM the app plays, for the avatar page's lip-sync (face/face-host.tsx).
//
// The page's own lip-sync (wLipSync) runs in an AudioWorklet, which needs a secure context the
// phone does not have over plain http. This is a cheaper analysis that needs no audio API at all:
// per 20 ms frame, loudness opens the mouth and a spectral-centroid estimate picks the vowel.
// The centroid comes from a pre-emphasised signal (the raw one sits on the voice's pitch,
// 250-400 Hz for every vowel): for a sine at f, rms(diff) / rms = 2 sin(pi f / rate). On a
// synthesized female voice the voiced frames then spread over 0.5-4.4 kHz, median 1.35 kHz; the
// vowel centres below split that range in the order of the vowels' second formant
// (O < U < A < E < I). A page with an analysis of its own asks for the PCM instead (bridge.ts,
// face.ready's `audio`) and draws from that; these frames still go along for every page.

export const MOUTH_FRAME_MS = 20;
/** Numbers per frame: volume, then the weights of A, I, U, E, O (the page's vowel keys). */
export const MOUTH_FRAME_STRIDE = 6;
export const MOUTH_VOWELS = ["A", "I", "U", "E", "O"] as const;

const PRE_EMPHASIS = 0.95;
const SILENCE_RMS = 0.004;
const VOWEL_CENTRES_HZ: Record<(typeof MOUTH_VOWELS)[number], number> = {
  A: 1350,
  I: 2800,
  U: 950,
  E: 1950,
  O: 700,
};
const VOWEL_WIDTH_OCTAVES = 0.35;

function readSample(pcm: Uint8Array, index: number): number {
  const lo = pcm[index * 2] ?? 0;
  const hi = pcm[index * 2 + 1] ?? 0;
  let value = (hi << 8) | lo;
  if (value & 0x8000) value -= 0x10000;
  return value / 0x8000;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Vowel weights for a centroid estimate, summing to 1. */
export function vowelWeights(centroidHz: number): number[] {
  const position = Math.log2(Math.max(centroidHz, 1));
  const raw = MOUTH_VOWELS.map((vowel) => {
    const distance = (position - Math.log2(VOWEL_CENTRES_HZ[vowel])) / VOWEL_WIDTH_OCTAVES;
    return Math.exp(-0.5 * distance * distance);
  });
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total < 1e-6) {
    // Far outside every centre: hiss (s, sh) reads as I, a hum as O.
    return MOUTH_VOWELS.map((vowel) =>
      vowel === (centroidHz > VOWEL_CENTRES_HZ.I ? "I" : "O") ? 1 : 0,
    );
  }
  return raw.map((value) => value / total);
}

/**
 * Frames of `MOUTH_FRAME_STRIDE` numbers for 16-bit little-endian mono PCM: one frame per
 * `MOUTH_FRAME_MS` of audio, volume as the frame's RMS (0..1), and zero weights in silence.
 */
export function mouthFrames(pcm: Uint8Array, sampleRate: number): number[] {
  const samples = Math.floor(pcm.length / 2);
  const frameSize = Math.max(1, Math.round((sampleRate * MOUTH_FRAME_MS) / 1000));
  const frames: number[] = [];
  let previousRaw = 0;
  let previousEmphasised = 0;
  for (let start = 0; start < samples; start += frameSize) {
    const end = Math.min(samples, start + frameSize);
    let energy = 0;
    let emphasisedEnergy = 0;
    let slopeEnergy = 0;
    for (let index = start; index < end; index += 1) {
      const raw = readSample(pcm, index);
      const emphasised = raw - PRE_EMPHASIS * previousRaw;
      const slope = emphasised - previousEmphasised;
      energy += raw * raw;
      emphasisedEnergy += emphasised * emphasised;
      slopeEnergy += slope * slope;
      previousRaw = raw;
      previousEmphasised = emphasised;
    }
    const count = end - start;
    const volume = Math.sqrt(energy / count);
    if (volume < SILENCE_RMS || emphasisedEnergy <= 0) {
      frames.push(round3(volume), 0, 0, 0, 0, 0);
      continue;
    }
    const ratio = Math.sqrt(slopeEnergy / emphasisedEnergy) / 2;
    const centroid = (sampleRate / Math.PI) * Math.asin(Math.min(1, ratio));
    frames.push(round3(volume), ...vowelWeights(centroid).map(round3));
  }
  return frames;
}
