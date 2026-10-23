import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type pino from "pino";

import { loadSherpaOnnxNode } from "../../speech/providers/local/sherpa/sherpa-onnx-node-loader.js";
import {
  containsMarkedEnglishTranscript,
  looksEnglish,
} from "../../speech/providers/openai/english-pass.js";
import { envFlag, envNumber, envPath, liveVoiceOverride } from "../../voice-env.js";
import { allWords, voiceLanguage } from "../../voice-language/languages.js";

// Hizuri: drops voice turns that are not the user's voice, or are noise hallucinations.
// The profile is a mean CAM++ speaker embedding, auto-enrolled from the first clear phrases.
// Files in the speaker dir: campplus.onnx (model; without it the gate accepts everything),
// profile.json (the user's voice print, re-read when the file changes), threshold (optional,
// re-read on every check),
// lock (optional; freezes the profile — adaptation once drifted toward other voices in the room),
// wake (optional regex; see voice-session.ts).

const ADAPT_MIN_SCORE = 0.5;
const ADAPT_WEIGHT = 0.1;
const ENROLL_COUNT = 3;
const MIN_ENROLL_SECONDS = 4; // Short bursts (other people, noise) must not seed the profile.
const MIN_CHECK_SECONDS = 0.6;

const JUNK = new Set(allWords((language) => language.junkPhrases));

/** One- and two-letter words that are a whole answer on their own. */
const SHORT_WORDS = new Set(allWords((language) => language.shortWords));

export type SpeakerVerdictReason =
  | "no-model"
  | "too-short"
  | "not-ready"
  | "enrolling"
  | "match"
  | "continues-owner"
  | "other-voice"
  | "error";

export interface SpeakerVerdict {
  accept: boolean;
  reason: SpeakerVerdictReason;
  score?: number;
  limit?: number;
}

/** Cosine scores of a mic clip against the user's profile and the reply being played. */
export interface VoiceComparison {
  owner: number | null;
  assistant: number | null;
}

interface SpeakerStream {
  acceptWaveform(input: { sampleRate: number; samples: Float32Array }): void;
  inputFinished(): void;
}

interface SpeakerExtractor {
  createStream(): SpeakerStream;
  isReady(stream: SpeakerStream): boolean;
  compute(stream: SpeakerStream): Float32Array;
}

interface SpeakerModule {
  SpeakerEmbeddingExtractor: new (config: {
    model: string;
    numThreads: number;
  }) => SpeakerExtractor;
}

/**
 * A noise hallucination: empty, a stock phrase, or (when the recogniser writes a non-Latin
 * script) an all-Latin phrase that is short or made of one- and two-letter
 * syllables. Phrases the English pass recognised as English are kept, and so are clearly English
 * ones from a bilingual recogniser (such as short English questions).
 */
export function isJunkTranscript(transcript: string, language: string | undefined): boolean {
  if (containsMarkedEnglishTranscript(transcript)) {
    return false;
  }
  const text = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || JUNK.has(text)) {
    return true;
  }
  const words = text.split(" ");
  // Wind and breath come back as lone syllables: a phrase with no word of three
  // letters is noise, unless it is a short real answer.
  if (words.every((word) => word.length <= 2 && !SHORT_WORDS.has(word))) {
    return true;
  }
  const script = voiceLanguage(language).script;
  if (script === "Latin" || new RegExp(`\\p{Script=${script}}`, "u").test(text)) {
    return false;
  }
  // All-Latin from a recogniser of another script: short, or a run of one- and two-letter syllables
  // (“Ha a a a e a a e.” from noise).
  const averageLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
  return averageLength < 2.5 || (words.length <= 6 && !looksEnglish(transcript));
}

/**
 * A phrase long enough to build the user's voice profile from: real words in any language. Noise
 * comes back as syllables or stock phrases, and a recogniser of another script hears it as short
 * Latin phrases.
 */
export function enrollsOn(
  transcript: string,
  seconds: number,
  language: string | undefined,
): boolean {
  const letters = (transcript.match(/\p{L}/gu) ?? []).length;
  return seconds >= MIN_ENROLL_SECONDS && letters >= 8 && !isJunkTranscript(transcript, language);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
}

function meanOf(vectors: Float32Array[]): Float32Array {
  const mean = new Float32Array(vectors[0].length);
  for (const v of vectors) {
    for (let i = 0; i < v.length; i++) {
      mean[i] += v[i] / vectors.length;
    }
  }
  return mean;
}

/** Linear resample of a slice of 24 kHz PCM16 to 16 kHz PCM16. */
function pcm24kTo16k(pcm24: Buffer, fromSeconds: number, seconds: number): Buffer {
  const total = Math.floor(pcm24.length / 2);
  const first = Math.min(total, Math.floor(fromSeconds * 24000));
  const inSamples = Math.min(total - first, Math.floor(seconds * 24000));
  const outSamples = Math.floor((inSamples * 2) / 3);
  const out = Buffer.alloc(outSamples * 2);
  for (let i = 0; i < outSamples; i++) {
    const pos = first + i * 1.5;
    const i0 = Math.floor(pos);
    const i1 = Math.min(total - 1, i0 + 1);
    const frac = pos - i0;
    const v = pcm24.readInt16LE(i0 * 2) * (1 - frac) + pcm24.readInt16LE(i1 * 2) * frac;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v))), i * 2);
  }
  return out;
}

export class SpeakerGate {
  private readonly modelPath: string;
  private readonly profilePath: string;
  private readonly thresholdPath: string;
  private readonly lockPath: string;
  private extractor: SpeakerExtractor | null = null;
  private profile: Float32Array | null = null;
  private profileMtime = 0;
  private enrollment: Float32Array[] = [];
  private readonly replyEmbeddings = new WeakMap<Buffer, Map<number, Float32Array | null>>();

  constructor(
    readonly dir: string,
    private readonly defaultThreshold: number,
  ) {
    this.modelPath = path.join(dir, "campplus.onnx");
    this.profilePath = path.join(dir, "profile.json");
    this.thresholdPath = path.join(dir, "threshold");
    this.lockPath = path.join(dir, "lock");
  }

  /**
   * voice-settings.json wins, then the threshold file, then the env default; re-read on every
   * check.
   */
  private threshold(): number {
    const live = liveVoiceOverride("PASEO_SPEAKER_THRESHOLD");
    if (live !== undefined && Number.isFinite(Number(live))) {
      return Number(live);
    }
    try {
      const value = Number(readFileSync(this.thresholdPath, "utf8").trim());
      if (Number.isFinite(value)) {
        return value;
      }
    } catch {
      // No threshold file: use the default.
    }
    return this.defaultThreshold;
  }

  private load(): SpeakerExtractor | null {
    if (this.extractor || !existsSync(this.modelPath)) {
      return this.extractor;
    }
    const sherpa = loadSherpaOnnxNode() as unknown as SpeakerModule;
    this.extractor = new sherpa.SpeakerEmbeddingExtractor({ model: this.modelPath, numThreads: 2 });
    return this.extractor;
  }

  /** A new profile.json (a rebuilt voice print) takes effect on the next phrase, no restart. */
  private reloadProfile(): void {
    let mtime: number;
    try {
      mtime = statSync(this.profilePath).mtimeMs;
    } catch {
      return; // No profile yet: enrolment builds one.
    }
    if (mtime === this.profileMtime) {
      return;
    }
    const saved = JSON.parse(readFileSync(this.profilePath, "utf8")) as { embedding: number[] };
    this.profile = Float32Array.from(saved.embedding);
    this.profileMtime = mtime;
  }

  private embed(extractor: SpeakerExtractor, pcm16: Buffer): Float32Array | null {
    const samples = new Float32Array(Math.floor(pcm16.length / 2));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = pcm16.readInt16LE(i * 2) / 32768;
    }
    const stream = extractor.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples });
    stream.inputFinished();
    if (!extractor.isReady(stream)) {
      return null;
    }
    return Float32Array.from(extractor.compute(stream));
  }

  private saveProfile(profile: Float32Array, stamp: "createdAt" | "updatedAt"): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(
      this.profilePath,
      JSON.stringify({ [stamp]: new Date().toISOString(), embedding: Array.from(profile) }),
    );
  }

  private enroll(
    embedding: Float32Array,
    seconds: number,
    transcript: string,
    logger: pino.Logger,
    language: string | undefined,
  ): SpeakerVerdict {
    if (enrollsOn(transcript, seconds, language)) {
      this.enrollment.push(embedding);
      logger.info({ enrolled: this.enrollment.length, seconds }, "speaker_gate.enroll");
      if (this.enrollment.length >= ENROLL_COUNT) {
        const mean = meanOf(this.enrollment);
        this.saveProfile(mean, "createdAt");
        this.profile = mean;
        this.enrollment = [];
        logger.info("speaker_gate.profile_saved");
      }
    }
    return { accept: true, reason: "enrolling" };
  }

  /** Is this 16 kHz phrase the user's voice? Errors and missing models accept. */
  check(
    pcm16k: Buffer,
    transcript: string,
    logger: pino.Logger,
    language?: string,
  ): SpeakerVerdict {
    try {
      const extractor = this.load();
      if (!extractor) {
        return { accept: true, reason: "no-model" };
      }
      this.reloadProfile();
      const seconds = pcm16k.length / 2 / 16000;
      if (seconds < MIN_CHECK_SECONDS) {
        return { accept: true, reason: "too-short" };
      }
      const embedding = this.embed(extractor, pcm16k);
      if (!embedding) {
        return { accept: true, reason: "not-ready" };
      }
      if (!this.profile) {
        return this.enroll(embedding, seconds, transcript, logger, language);
      }
      const score = cosine(embedding, this.profile);
      const limit = this.threshold();
      // A confident match nudges the profile toward the user's current voice and mic, unless
      // locked.
      if (score >= ADAPT_MIN_SCORE && seconds >= MIN_ENROLL_SECONDS && !existsSync(this.lockPath)) {
        for (let i = 0; i < this.profile.length; i++) {
          this.profile[i] = this.profile[i] * (1 - ADAPT_WEIGHT) + embedding[i] * ADAPT_WEIGHT;
        }
        this.saveProfile(this.profile, "updatedAt");
      }
      return {
        accept: score >= limit,
        reason: score >= limit ? "match" : "other-voice",
        score,
        limit,
      };
    } catch (error) {
      logger.warn({ err: error }, "speaker_gate.error");
      return { accept: true, reason: "error" };
    }
  }

  /**
   * CAM++ embeddings depend strongly on clip length (2.5 s clips of any voice score 0.5-0.7
   * against each other), so the reply is embedded in slices as long as the mic clip: the mean
   * of up to three slices from the start of the reply.
   */
  private replyEmbedding(
    extractor: SpeakerExtractor,
    reply24k: Buffer,
    seconds: number,
  ): Float32Array | null {
    const key = Math.round(seconds * 2) / 2;
    let byLength = this.replyEmbeddings.get(reply24k);
    if (!byLength) {
      byLength = new Map();
      this.replyEmbeddings.set(reply24k, byLength);
    }
    const cached = byLength.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const replySeconds = reply24k.length / 2 / 24000;
    const vectors: Float32Array[] = [];
    for (let from = 0.3; from + key <= replySeconds && vectors.length < 3; from += key) {
      const v = this.embed(extractor, pcm24kTo16k(reply24k, from, key));
      if (v) {
        vectors.push(v);
      }
    }
    const mean = vectors.length > 0 ? meanOf(vectors) : null;
    byLength.set(key, mean);
    return mean;
  }

  /** Owner and assistant-reply scores for a 16 kHz mic clip; null when the model is missing. */
  compareVoices(mic16k: Buffer, reply24k: Buffer | null): VoiceComparison | null {
    const extractor = this.load();
    if (!extractor || mic16k.length < 16000 * 2 * MIN_CHECK_SECONDS) {
      return null;
    }
    const mic = this.embed(extractor, mic16k);
    if (!mic) {
      return null;
    }
    this.reloadProfile();
    const reply = reply24k
      ? this.replyEmbedding(extractor, reply24k, mic16k.length / 2 / 16000)
      : null;
    return {
      owner: this.profile ? cosine(mic, this.profile) : null,
      assistant: reply ? cosine(mic, reply) : null,
    };
  }
}

const gatesByDir = new Map<string, SpeakerGate>();

/** One gate (one loaded model and profile) per speaker dir and process. */
export function getSpeakerGate(dir: string, defaultThreshold: number): SpeakerGate {
  let gate = gatesByDir.get(dir);
  if (!gate) {
    gate = new SpeakerGate(dir, defaultThreshold);
    gatesByDir.set(dir, gate);
  }
  return gate;
}

export interface SpeakerGateConfig {
  dir: string;
  /** Used when the speaker dir has no `threshold` file (PASEO_SPEAKER_THRESHOLD, 0.35). */
  threshold: number;
  /** PASEO_SPEAKER_GATE_ADVISORY=1: the gate only reports; phrases are delivered anyway. */
  advisory: boolean;
}

/**
 * PASEO_SPEAKER_DIR, else `<paseoHome>/speaker`. PASEO_SPEAKER_GATE=0 turns the gate off; without
 * `campplus.onnx` in the dir it accepts everything.
 */
export function resolveSpeakerGateConfig(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): SpeakerGateConfig | null {
  if (!envFlag("PASEO_SPEAKER_GATE", true, env)) {
    return null;
  }
  return {
    dir: envPath("PASEO_SPEAKER_DIR", path.join(paseoHome, "speaker"), env),
    threshold: envNumber("PASEO_SPEAKER_THRESHOLD", 0.35, env),
    advisory: envFlag("PASEO_SPEAKER_GATE_ADVISORY", false, env),
  };
}
