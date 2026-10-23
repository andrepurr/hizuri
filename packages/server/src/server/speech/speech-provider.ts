import type pino from "pino";
import type { Readable } from "node:stream";
import { foldLetters } from "../voice-language/languages.js";

export interface LogprobToken {
  token: string;
  logprob: number;
  bytes?: number[];
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  logprobs?: LogprobToken[];
  avgLogprob?: number;
  isLowConfidence?: boolean;
}

export interface StreamingTranscriptionCommittedEvent {
  segmentId: string;
  previousSegmentId: string | null;
}

export interface StreamingTranscriptionEvent {
  segmentId: string;
  transcript: string;
  isFinal: boolean;
  language?: string;
  logprobs?: LogprobToken[];
  avgLogprob?: number;
  isLowConfidence?: boolean;
  /**
   * Hizuri: a quick text of a committed phrase sent before its final (isFinal is true too). The
   * phrase's later final, without this flag, supersedes it.
   */
  draft?: boolean;
}

/**
 * Hizuri: one committed phrase could not be transcribed; the session itself still works. The turn
 * controller retries that phrase from its own audio and does not reset the session, which would
 * drop the phrase being spoken right now.
 */
export class PhraseTranscriptionError extends Error {
  constructor(
    readonly segmentId: string,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "PhraseTranscriptionError";
  }
}

function transcriptWords(text: string): string {
  return foldLetters(text)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Hizuri: two texts of one phrase say the same words; punctuation, case, folded letters
 * (foldLetters) and hyphens do not
 * count. A draft that matches its final needs no correction.
 */
export function sameTranscriptWords(a: string, b: string): boolean {
  return transcriptWords(a) === transcriptWords(b);
}

export interface StreamingTranscriptionSession {
  /**
   * Required PCM16LE sample rate for `appendPcm16()`.
   * Callers are responsible for resampling before appending.
   */
  requiredSampleRate: number;

  connect(): Promise<void>;
  appendPcm16(pcm16le: Buffer): void;
  commit(): void;
  clear(): void;
  close(): void;
  /**
   * Hizuri: the voice detector heard the user in the audio appended so far. A streaming provider
   * uses it to tell whether its live text already covers the end of the user's words.
   */
  markVoiced?(): void;

  on(event: "committed", handler: (payload: StreamingTranscriptionCommittedEvent) => void): unknown;
  on(event: "transcript", handler: (payload: StreamingTranscriptionEvent) => void): unknown;
  on(event: "error", handler: (err: unknown) => void): unknown;
}

export interface SpeechToTextProvider {
  id: "openai" | "local" | (string & {});
  /**
   * Hizuri: the provider for whole recordings when this one streams; STTManager.transcribe uses
   * it, so a recording is not replayed through a live stream.
   */
  batch?: SpeechToTextProvider;
  createSession(params: {
    logger: pino.Logger;
    language?: string;
    prompt?: string;
  }): StreamingTranscriptionSession;
}

export interface SpeechStreamResult {
  stream: Readable;
  format: string;
}

export interface TextToSpeechProvider {
  synthesizeSpeech(text: string): Promise<SpeechStreamResult>;
}
