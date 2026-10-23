import { existsSync } from "node:fs";
import path from "node:path";

import { loadSherpaOnnxNode } from "../local/sherpa/sherpa-onnx-node-loader.js";
import { LATIN_SPELLING, allWords } from "../../../voice-language/languages.js";
import { assistantNameForms } from "../../../voice-language/assistant-name.js";
import { levenshtein } from "./mixed-english.js";

// Hizuri: a second pass for whole English phrases. An STT trained on a language with another script
// picks Latin or its own letters letter by letter, so "I like to speak English" comes out half in
// Latin and half in the other script. Every phrase also goes to Parakeet TDT 0.6b v3 (sherpa-onnx,
// 25 European languages, decoded off the event loop); its text replaces the STT's only when it is
// clearly English and sounds like what the STT heard. Phrases in the other language keep the STT
// text.

interface SherpaOfflineStream {
  acceptWaveform(input: { samples: Float32Array; sampleRate: number }): void;
}

interface SherpaAsyncRecognizer {
  createStream(): SherpaOfflineStream;
  decodeAsync(stream: SherpaOfflineStream): Promise<{ text?: string }>;
}

interface SherpaAsyncRecognizerModule {
  OfflineRecognizer: { createAsync(config: unknown): Promise<SherpaAsyncRecognizer> };
}

export interface EnglishPass {
  /** Parakeet's text for 16-bit mono PCM at `sampleRate`. */
  transcribe(pcm16: Buffer, sampleRate: number): Promise<string>;
}

export interface EnglishPassConfig {
  modelDir: string;
  threads: number;
}

/** Null when the Parakeet model is not in `modelDir`. */
export function createEnglishPass(config: EnglishPassConfig): EnglishPass | null {
  const { modelDir, threads } = config;
  if (!existsSync(path.join(modelDir, "tokens.txt"))) {
    return null;
  }
  let recognizerPromise: Promise<SherpaAsyncRecognizer> | null = null;

  function recognizer(): Promise<SherpaAsyncRecognizer> {
    if (!recognizerPromise) {
      const sherpa = loadSherpaOnnxNode() as unknown as SherpaAsyncRecognizerModule;
      const created = sherpa.OfflineRecognizer.createAsync({
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: {
            encoder: path.join(modelDir, "encoder.int8.onnx"),
            decoder: path.join(modelDir, "decoder.int8.onnx"),
            joiner: path.join(modelDir, "joiner.int8.onnx"),
          },
          tokens: path.join(modelDir, "tokens.txt"),
          modelType: "nemo_transducer",
          numThreads: threads,
          provider: "cpu",
          debug: 0,
        },
        decodingMethod: "greedy_search",
      });
      created.catch(() => {
        recognizerPromise = null;
      });
      recognizerPromise = created;
    }
    return recognizerPromise;
  }

  return {
    async transcribe(pcm16, sampleRate) {
      if (pcm16.length < 2) {
        return "";
      }
      const rec = await recognizer();
      const samples = new Float32Array(Math.floor(pcm16.length / 2));
      for (let i = 0; i < samples.length; i++) {
        samples[i] = pcm16.readInt16LE(i * 2) / 32768;
      }
      const stream = rec.createStream();
      stream.acceptWaveform({ samples, sampleRate });
      const result = await rec.decodeAsync(stream);
      return String(result?.text ?? "").trim();
    },
  };
}

const COMMON_ENGLISH = new Set(
  (
    "i you it we they me my your our this that what which who how why when where " +
    "is are was were be been am do does did have has had can could will would should shall may might must " +
    "a an the and or but if so not no yes yeah ok okay of to in on at for with from by about as up out " +
    "very good bad like want need know think say tell speak talk go get make see look let just now here there " +
    "all some more one two three time thing way well really please thanks thank hello hi english"
  ).split(" "),
);

/**
 * The recogniser's own control words, which the English pass must never rewrite (a non-English
 * control word can sound like an English phrase). English ones need no guard; the
 * assistant's name counts in its non-Latin forms (assistant-name.ts).
 */
const controlPatterns = new Map<string, RegExp>();

export function controlWords(): RegExp {
  const names = assistantNameForms().filter((form) => !/[a-z]/i.test(form));
  const key = names.join("|");
  let pattern = controlPatterns.get(key);
  if (!pattern) {
    const words = [...names, ...allWords((language) => language.controlWords)].join("|");
    pattern = new RegExp(`(?<!\\p{L})(?:${words})(?!\\p{L})`, "iu");
    controlPatterns.set(key, pattern);
  }
  return pattern;
}

/**
 * Clearly English: ≥ 85 % Latin letters, ≥ 3 words, and a third of them common English words
 * (Parakeet also writes Polish or Portuguese for short noise in another language).
 */
export function looksEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 8) {
    return false;
  }
  const latin = text.match(/[A-Za-z]/g) ?? [];
  const words = text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length > 0);
  const common = words.filter((w) => COMMON_ENGLISH.has(w)).length;
  return (
    latin.length / letters.length >= 0.85 && words.length >= 3 && common / words.length >= 0.34
  );
}

// Consonant skeleton for a sound-alike check across scripts: voiced/voiceless pairs merged, vowels
// dropped. Latin here; the other script's consonants come from its language table.
const DIGRAPHS: Array<[string, string]> = [
  ["sh", "x"],
  ["ch", "x"],
  ["th", "t"],
  ["ph", "f"],
  ["ck", "k"],
  ["ng", "nk"],
  ["wh", "f"],
];
const SOUND_CLASS: Record<string, string> = {
  p: "p",
  b: "p",
  t: "t",
  d: "t",
  k: "k",
  g: "k",
  c: "k",
  q: "k",
  f: "f",
  v: "f",
  w: "f",
  s: "s",
  z: "s",
  x: "x",
  j: "x",
  l: "l",
  r: "r",
  m: "m",
  n: "n",
  h: "h",
  ...LATIN_SPELLING?.consonants,
};

function soundSkeleton(text: string): string {
  let t = text.toLowerCase();
  for (const [from, to] of DIGRAPHS) {
    t = t.split(from).join(to);
  }
  let out = "";
  for (const ch of t) {
    const c = SOUND_CLASS[ch];
    if (c && out[out.length - 1] !== c) {
      out += c;
    }
  }
  return out;
}

/** 0..1: the share of Latin letters among all letters of a text. */
export function latinShare(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) {
    return 0;
  }
  return (text.match(/[A-Za-z]/g) ?? []).length / letters.length;
}

/** 0..1: how alike the consonants of Parakeet's English and the STT's text sound. */
export function soundsAlike(english: string, stt: string): number {
  const a = soundSkeleton(english);
  const b = soundSkeleton(stt);
  if (!a || !b) {
    return 0;
  }
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Phrases the English pass recognised as English are speech, not the short all-Latin noise the
// speaker gate drops in a session in a non-Latin language. Remembered for two minutes.
const ENGLISH_TRANSCRIPT_TTL_MS = 120_000;
const englishTranscripts = new Map<string, number>();

export function markEnglishTranscript(text: string, now = Date.now()): void {
  englishTranscripts.set(text, now);
  for (const [t, at] of englishTranscripts) {
    if (now - at > ENGLISH_TRANSCRIPT_TTL_MS) {
      englishTranscripts.delete(t);
    }
  }
}

export function containsMarkedEnglishTranscript(transcript: string): boolean {
  for (const text of englishTranscripts.keys()) {
    if (transcript.includes(text)) {
      return true;
    }
  }
  return false;
}
