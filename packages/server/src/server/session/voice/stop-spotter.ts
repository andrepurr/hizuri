import { readdirSync } from "node:fs";
import path from "node:path";

import { loadSherpaOnnxNode } from "../../speech/providers/local/sherpa/sherpa-onnx-node-loader.js";
import { envFlag, envPath, envPositive, localSpeechModelsDir } from "../../voice-env.js";
import { en } from "../../voice-language/en.js";
import { voiceLanguage } from "../../voice-language/languages.js";
import { DROP_WORDS, STOP_ANYWHERE } from "./barge-hold.js";

// Hizuri: a stop word stops the reply within about a second, however slow the recogniser is. The
// quick check (barge-hold.ts verify) sends the user's words to the STT and waits for the text; with
// the STT behind a slow link every check timed out after 3 s and a stop phrase said three times did
// not stop a 10 s reply. This spotter listens to the mic itself, in the daemon: a small streaming
// recogniser for the stop words' language (a sherpa-onnx streaming zipformer named by the language
// table; measured with a 25 MB int8 one) turns the audio into live text while a reply plays, and the
// session stops the reply when that text holds a stop word. The stop word is seen well under a
// second after it ends, and the assistant's own echo gives no stop word. Its decoding costs about 4 % of one core while a reply
// plays; nothing runs in between.
//
// PASEO_STOP_SPOTTER=0 turns it off. PASEO_STOP_SPOTTER_MODEL: the model folder (default: the
// voice language's `stopSpotterModel` in the local speech models dir, PASEO_VOICE_LANGUAGE);
// missing = off. PASEO_STOP_SPOTTER_THREADS (1).

const SAMPLE_RATE = 16000;

interface OnlineStream {
  acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
}

/** The part of sherpa-onnx's OnlineRecognizer the spotter uses. */
export interface StreamingRecognizer {
  createStream(): OnlineStream;
  isReady(stream: OnlineStream): boolean;
  decode(stream: OnlineStream): void;
  isEndpoint(stream: OnlineStream): boolean;
  reset(stream: OnlineStream): void;
  getResult(stream: OnlineStream): { text: string };
}

interface SherpaStreamingModule {
  OnlineRecognizer: new (config: unknown) => StreamingRecognizer;
}

export interface StopSpotter {
  /**
   * 16 kHz mono PCM16 from the mic. Returns the live text when it now holds a stop word (the text
   * then starts over), else null.
   */
  feed(pcm16k: Buffer): string | null;
  /**
   * The user's voice just started: a fresh stream from `preRoll` (the last moments of mic audio), so
   * a stop word at the start is not clipped by what the old stream heard before (the reply's echo).
   * Returns the text when the pre-roll already holds a stop word.
   */
  restart(preRoll: Buffer): string | null;
  /** Forget what was heard (a reply ended or a new one began). */
  reset(): void;
}

export interface StopSpotterModel {
  createSpotter(): StopSpotter;
}

/** A stop word or the drop word in a piece of live text. */
export function holdsStopWord(text: string): boolean {
  return STOP_ANYWHERE.test(text) || DROP_WORDS.test(text);
}

/**
 * One spotter per session over one recogniser; `create` builds the recogniser on first use. A model
 * that failed to load throws the same error again, so each new session does not reload it.
 */
export function createStopSpotterModel(create: () => StreamingRecognizer): StopSpotterModel {
  let recognizer: StreamingRecognizer | null = null;
  let loadError: unknown = null;
  return {
    createSpotter() {
      if (loadError) {
        throw loadError;
      }
      try {
        recognizer ??= create();
      } catch (error) {
        loadError = error;
        throw error;
      }
      return createStopSpotter(recognizer);
    },
  };
}

export function createStopSpotter(recognizer: StreamingRecognizer): StopSpotter {
  let stream = recognizer.createStream();
  let fed = false;
  const spotter: StopSpotter = {
    restart(preRoll) {
      stream = recognizer.createStream();
      fed = false;
      return preRoll.length > 1 ? spotter.feed(preRoll) : null;
    },
    feed(pcm16k) {
      const samples = new Float32Array(pcm16k.length >> 1);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = pcm16k.readInt16LE(i * 2) / 32768;
      }
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
      fed = true;
      while (recognizer.isReady(stream)) {
        recognizer.decode(stream);
      }
      const text = recognizer.getResult(stream).text.trim();
      if (text && holdsStopWord(text)) {
        recognizer.reset(stream);
        return text;
      }
      if (recognizer.isEndpoint(stream)) {
        recognizer.reset(stream);
      }
      return null;
    },
    reset() {
      if (fed) {
        // A fresh stream: reset() keeps the audio already buffered for the next chunk.
        stream = recognizer.createStream();
        fed = false;
      }
    },
  };
  return spotter;
}

/**
 * A model part in `dir`: `<part>.onnx` or `<part>-<training suffix>.onnx` (`tokens.txt` for the
 * tokens), the int8 build first when `int8` is set and the full one first otherwise.
 */
function modelFile(dir: string, part: string, int8: boolean): string | null {
  if (part === "tokens") {
    return listDir(dir).includes("tokens.txt") ? path.join(dir, "tokens.txt") : null;
  }
  const names = listDir(dir).filter(
    (name) => (name === `${part}.onnx` || name.startsWith(`${part}.`) || name.startsWith(`${part}-`)) &&
      name.endsWith(".onnx"),
  );
  const rank = (name: string): number => (name.endsWith(".int8.onnx") === int8 ? 0 : 1);
  const best = names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
  return best ? path.join(dir, best) : null;
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Null when it is off or its model is not on this machine. */
export function resolveStopSpotterModel(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): StopSpotterModel | null {
  if (!envFlag("PASEO_STOP_SPOTTER", true, env)) {
    return null;
  }
  const folder = voiceLanguage(env.PASEO_VOICE_LANGUAGE).stopSpotterModel ?? en.stopSpotterModel;
  const dir = envPath(
    "PASEO_STOP_SPOTTER_MODEL",
    path.join(localSpeechModelsDir(paseoHome, env), folder ?? ""),
    env,
  );
  const encoder = modelFile(dir, "encoder", true);
  const decoder = modelFile(dir, "decoder", false);
  const joiner = modelFile(dir, "joiner", true);
  const tokens = modelFile(dir, "tokens", false);
  if (!encoder || !decoder || !joiner || !tokens) {
    return null;
  }
  const threads = envPositive("PASEO_STOP_SPOTTER_THREADS", 1, env);
  return createStopSpotterModel(() => {
    const sherpa = loadSherpaOnnxNode() as unknown as SherpaStreamingModule;
    return new sherpa.OnlineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        transducer: { encoder, decoder, joiner },
        tokens,
        numThreads: threads,
        provider: "cpu",
        debug: 0,
      },
      decodingMethod: "greedy_search",
      // An endpoint starts the text over, so a long reply never builds one long line.
      enableEndpoint: 1,
      rule1MinTrailingSilence: 1.2,
      rule2MinTrailingSilence: 0.6,
      rule3MinUtteranceLength: 20,
    });
  });
}
