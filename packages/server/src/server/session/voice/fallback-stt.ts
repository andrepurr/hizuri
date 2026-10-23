import path from "node:path";

import { createEnglishPass } from "../../speech/providers/openai/english-pass.js";
import { envPath, envPositive, localSpeechModelsDir } from "../../voice-env.js";

// Hizuri: a second recogniser for a phrase the main STT gave no text for: it failed or timed out
// (CPU overload: REST "Request timed out", no streaming final 15000 ms after stop) or heard
// nothing. Parakeet TDT 0.6b v3
// (in process, 2 threads) hears nothing in noise-only audio, so it does not invent words in wind
// and traffic, and recognises most of the words outdoors; a whisper server was far too slow under
// load and spread over all cores. Its text goes out as a draft, so a main STT text that still comes
// corrects it.
//
// PASEO_STT_FALLBACK: unset or `parakeet` = Parakeet (`PASEO_STT_FALLBACK_MODEL`, default the
// Parakeet v3 model in the local speech models dir; off when it is missing); an http(s) URL = an
// OpenAI-compatible transcription endpoint; `0` = off. PASEO_STT_FALLBACK_THREADS (2).

export interface FallbackStt {
  readonly name: string;
  /** Text for 16 kHz mono PCM16; empty when it heard nothing. */
  transcribe(pcm16k: Buffer, language: string | undefined): Promise<string>;
}

const PARAKEET_DIR = "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8";
const HTTP_TIMEOUT_MS = 30_000;

const byKey = new Map<string, FallbackStt | null>();

/** One fallback recogniser per setting and process (the model loads once, on first use). */
export function resolveFallbackStt(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): FallbackStt | null {
  const setting = (env.PASEO_STT_FALLBACK ?? "parakeet").trim();
  if (!setting || setting === "0" || setting.toLowerCase() === "false") {
    return null;
  }
  if (/^https?:\/\//i.test(setting)) {
    return cached(`url:${setting}`, () => httpFallback(setting));
  }
  const modelDir = envPath(
    "PASEO_STT_FALLBACK_MODEL",
    path.join(localSpeechModelsDir(paseoHome, env), PARAKEET_DIR),
    env,
  );
  const threads = envPositive("PASEO_STT_FALLBACK_THREADS", 2, env);
  return cached(`parakeet:${modelDir}:${threads}`, () => {
    const parakeet = createEnglishPass({ modelDir, threads });
    if (!parakeet) {
      return null;
    }
    return {
      name: "parakeet",
      transcribe: (pcm16k) => parakeet.transcribe(pcm16k, 16000),
    };
  });
}

function cached(key: string, create: () => FallbackStt | null): FallbackStt | null {
  if (!byKey.has(key)) {
    byKey.set(key, create());
  }
  return byKey.get(key) ?? null;
}

function wavOf(pcm16k: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm16k.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm16k.length, 40);
  return Buffer.concat([header, pcm16k]);
}

/** An OpenAI-compatible endpoint: a base URL ending in /v1, or the full transcriptions URL. */
function httpFallback(setting: string): FallbackStt {
  const url = /\/v1\/?$/.test(setting)
    ? `${setting.replace(/\/+$/, "")}/audio/transcriptions`
    : setting;
  return {
    name: "http",
    async transcribe(pcm16k, language) {
      const form = new FormData();
      form.append(
        "file",
        new Blob([new Uint8Array(wavOf(pcm16k))], { type: "audio/wav" }),
        "a.wav",
      );
      form.append("model", "whisper-1");
      form.append("response_format", "json");
      if (language) {
        form.append("language", language);
      }
      const response = await fetch(url, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`fallback STT answered ${response.status}`);
      }
      const body = (await response.json()) as { text?: string };
      return String(body.text ?? "").trim();
    },
  };
}
