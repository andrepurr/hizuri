import { describe, expect, it } from "vitest";
import { MOUTH_FRAME_STRIDE, MOUTH_VOWELS, mouthFrames, vowelWeights } from "./mouth";

function sinePcm(frequency: number, seconds: number, rate: number, amplitude: number): Uint8Array {
  const samples = Math.round(seconds * rate);
  const pcm = new Uint8Array(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * amplitude * 0x7fff);
    pcm[i * 2] = value & 0xff;
    pcm[i * 2 + 1] = (value >> 8) & 0xff;
  }
  return pcm;
}

function topVowel(frames: number[], frame: number): string {
  const weights = frames.slice(frame * MOUTH_FRAME_STRIDE + 1, (frame + 1) * MOUTH_FRAME_STRIDE);
  return MOUTH_VOWELS[weights.indexOf(Math.max(...weights))];
}

describe("mouthFrames", () => {
  it("makes one frame per 20 ms and keeps silence closed", () => {
    const frames = mouthFrames(new Uint8Array(16000 * 2), 16000);
    expect(frames).toHaveLength(50 * MOUTH_FRAME_STRIDE);
    expect(frames.every((value) => value === 0)).toBe(true);
  });

  it("opens with loudness at any sample rate", () => {
    const quiet = mouthFrames(sinePcm(1000, 0.1, 24000, 0.05), 24000);
    const loud = mouthFrames(sinePcm(1000, 0.1, 24000, 0.5), 24000);
    expect(quiet).toHaveLength(5 * MOUTH_FRAME_STRIDE);
    expect(loud[0]).toBeGreaterThan(quiet[0] * 5);
    expect(loud[0]).toBeCloseTo(0.5 / Math.SQRT2, 2);
  });

  it("orders the vowels by brightness: O low, A in the middle, I high", () => {
    expect(topVowel(mouthFrames(sinePcm(600, 0.04, 16000, 0.3), 16000), 1)).toBe("O");
    expect(topVowel(mouthFrames(sinePcm(1350, 0.04, 16000, 0.3), 16000), 1)).toBe("A");
    expect(topVowel(mouthFrames(sinePcm(3000, 0.04, 16000, 0.3), 16000), 1)).toBe("I");
  });
});

describe("vowelWeights", () => {
  it("sums to one, also far outside every vowel", () => {
    for (const hz of [80, 700, 1350, 2800, 7000]) {
      const sum = vowelWeights(hz).reduce((total, value) => total + value, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});
