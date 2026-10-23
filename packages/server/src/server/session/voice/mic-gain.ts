// Hizuri: automatic microphone gain before the speech detector and the recogniser
// (self-tuning). Outdoors the user's voice can reach the server at -35…-52 dBFS through a
// phone in a pocket, and quiet phrases are lost in wind. The gain follows the level
// of the user's loud frames (speech), not the noise floor, so silence is not pumped up.
//
// Tuned live without a restart: PASEO_MIC_AGC (on), PASEO_MIC_AGC_TARGET_DB (-20) and
// PASEO_MIC_AGC_MAX_GAIN_DB (20) are read on every chunk, so voice-settings.json changes them at once.

import { envFlag, envNumber } from "../../voice-env.js";

interface MicGainSettings {
  enabled: boolean;
  targetDb: number;
  maxGainDb: number;
}

// A frame counts as voice when it is this far above the running noise floor.
export const VOICE_ABOVE_FLOOR_DB = 9;

/** Level of PCM16 mono audio, dBFS. */
export function rmsDb(pcm: Buffer): number {
  let sum = 0;
  const samples = Math.floor(pcm.length / 2);
  for (let i = 0; i < samples; i += 1) {
    const v = pcm.readInt16LE(i * 2) / 32768;
    sum += v * v;
  }
  return samples > 0 ? 10 * Math.log10(sum / samples + 1e-12) : -120;
}

export class MicGain {
  private noiseFloorDb = -60;
  private voiceDb: number | null = null;
  private gainDb = 0;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  private settings(): MicGainSettings {
    return {
      enabled: envFlag("PASEO_MIC_AGC", true, this.env),
      targetDb: envNumber("PASEO_MIC_AGC_TARGET_DB", -20, this.env),
      maxGainDb: envNumber("PASEO_MIC_AGC_MAX_GAIN_DB", 20, this.env),
    };
  }

  /** Current gain in dB, for logs. */
  get currentGainDb(): number {
    return this.gainDb;
  }

  /** 16-bit mono PCM in, the same length out, amplified and clipped. */
  process(pcm: Buffer): Buffer {
    const settings = this.settings();
    if (!settings.enabled || pcm.length < 2) {
      return pcm;
    }
    const db = rmsDb(pcm);
    // The floor follows quiet frames fast and loud frames slowly.
    this.noiseFloorDb += (db < this.noiseFloorDb ? 0.2 : 0.002) * (db - this.noiseFloorDb);
    if (db > this.noiseFloorDb + VOICE_ABOVE_FLOOR_DB) {
      this.voiceDb = this.voiceDb === null ? db : this.voiceDb + 0.05 * (db - this.voiceDb);
    }
    if (this.voiceDb !== null) {
      const wanted = Math.max(0, Math.min(settings.maxGainDb, settings.targetDb - this.voiceDb));
      this.gainDb += 0.1 * (wanted - this.gainDb);
    }
    if (this.gainDb < 0.5) {
      return pcm;
    }
    const factor = 10 ** (this.gainDb / 20);
    const out = Buffer.alloc(pcm.length);
    const samples = Math.floor(pcm.length / 2);
    for (let i = 0; i < samples; i += 1) {
      const v = Math.round(pcm.readInt16LE(i * 2) * factor);
      out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
    }
    return out;
  }
}
