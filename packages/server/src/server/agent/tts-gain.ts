import { envNumber } from "../voice-env.js";

// Hizuri: assistant voice volume (PASEO_TTS_GAIN_DB, live through voice-settings.json). The app
// plays the PCM it is sent, so the daemon scales the samples and every client, the phone app
// included, gets louder or quieter without an app update. Synthesized speech already peaks near
// full scale, so above KNEE a boost is bent toward full scale (tanh) instead of clipped: the peaks
// soften, the words get louder.

const KNEE = 0.7;

function softLimit(x: number): number {
  const magnitude = Math.abs(x);
  if (magnitude <= KNEE) {
    return x;
  }
  const bent = KNEE + (1 - KNEE) * Math.tanh((magnitude - KNEE) / (1 - KNEE));
  return Math.sign(x) * bent;
}

/** 16-bit mono PCM with the gain applied; the same buffer when the gain is 0 dB. */
export function applyPcmGain(pcm: Buffer, gainDb: number): Buffer {
  if (gainDb === 0 || !Number.isFinite(gainDb) || pcm.length < 2) {
    return pcm;
  }
  const factor = 10 ** (gainDb / 20);
  const samples = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(pcm.length);
  for (let i = 0; i < samples; i += 1) {
    const x = (pcm.readInt16LE(i * 2) / 32768) * factor;
    out.writeInt16LE(Math.round((factor > 1 ? softLimit(x) : x) * 32767), i * 2);
  }
  return out;
}

/** Audio as it goes to the client: PCM gets the current PASEO_TTS_GAIN_DB, other formats pass. */
export function withOutputGain(audio: Buffer, format: string): Buffer {
  const pcm = format === "pcm" || format.startsWith("pcm;");
  return pcm ? applyPcmGain(audio, envNumber("PASEO_TTS_GAIN_DB", 0)) : audio;
}
