import { readFileSync } from "node:fs";
import path from "node:path";

import { envFlag, envPath } from "../../voice-env.js";
import { defaultWakePattern } from "../../voice-language/languages.js";
import {
  resolveSpeechDenoiserConfig,
  type SpeechDenoiserConfig,
} from "../../speech/speech-denoiser.js";
import { resolveFallbackStt, type FallbackStt } from "./fallback-stt.js";
import { getSpeakerGate, resolveSpeakerGateConfig, type SpeakerGate } from "./speaker-gate.js";
import { resolveStopSpotterModel, type StopSpotterModel } from "./stop-spotter.js";
import { resolveVoiceGraph, type VoiceGraph } from "./voice-graph.js";
import { createVoiceJournal, resolveVoiceJournalDir, type VoiceJournal } from "./voice-journal.js";

// Hizuri: the user's own voice data, resolved once per daemon from env and paseoHome. None of it
// lives in the repository: the voice profile, the journal and the phrase archive are files on the
// user's machine, and every one of them can be switched off.

/** Default wake words: a phrase starting with one interrupts a busy agent instead of steering it. */
export const DEFAULT_WAKE_PATTERN = defaultWakePattern();

export interface VoiceOwnerOptions {
  /** Owner-voice check (CAM++); null = off (PASEO_SPEAKER_GATE=0). */
  speakerGate: { gate: SpeakerGate; advisory: boolean } | null;
  /** Every finished phrase with its outcome; null = off (PASEO_VOICE_JOURNAL=0). */
  journal: VoiceJournal | null;
  /** PASEO_OWNER_RECORD_DIR: every phrase saved as a WAV; null = off. */
  recordDir: string | null;
  /** All microphone audio, always (raw-recorder.ts): PASEO_RAW_RECORD_DIR, default
   * `<paseoHome>/raw-audio`; PASEO_RAW_RECORD_DIR=0 turns it off. */
  rawDir: string | null;
  /** Optional regex file with the wake words (`<speaker dir>/wake`). */
  wakeFile: string | null;
  /** The phrase graph (voice-graph.ts); null or absent = off (PASEO_VOICE_GRAPH=0). */
  graph?: VoiceGraph | null;
  /** A second recogniser for phrases the STT gave no text for (fallback-stt.ts); null = off. */
  fallbackStt?: FallbackStt | null;
  /** Stop words heard in the mic while a reply plays (stop-spotter.ts); null or absent = off. */
  stopSpotter?: StopSpotterModel | null;
  /** Speech enhancement of phrase audio (speech-denoiser.ts); null = off (PASEO_STT_DENOISE). */
  denoise?: SpeechDenoiserConfig | null;
  /**
   * The user's hold for the agent's hooks (`<paseoHome>/voice-floor.json`); null or absent = not
   * written.
   */
  floorFile?: string | null;
}

export function resolveVoiceOwnerOptions(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): VoiceOwnerOptions {
  const gateConfig = resolveSpeakerGateConfig(paseoHome, env);
  const journalDir = resolveVoiceJournalDir(paseoHome, env);
  const recordDir = env.PASEO_OWNER_RECORD_DIR?.trim();
  const rawDir = env.PASEO_RAW_RECORD_DIR?.trim() || path.join(paseoHome, "raw-audio");
  return {
    speakerGate: gateConfig
      ? {
          gate: getSpeakerGate(gateConfig.dir, gateConfig.threshold),
          // Read on every phrase, so voice-settings.json switches it mid-session.
          get advisory() {
            return envFlag("PASEO_SPEAKER_GATE_ADVISORY", gateConfig.advisory, env);
          },
        }
      : null,
    journal: journalDir ? createVoiceJournal(journalDir) : null,
    recordDir: recordDir ? path.resolve(recordDir) : null,
    rawDir: rawDir === "0" ? null : path.resolve(rawDir),
    wakeFile: path.join(envPath("PASEO_SPEAKER_DIR", path.join(paseoHome, "speaker"), env), "wake"),
    graph: resolveVoiceGraph(paseoHome, env),
    fallbackStt: resolveFallbackStt(paseoHome, env),
    stopSpotter: resolveStopSpotterModel(paseoHome, env),
    denoise: resolveSpeechDenoiserConfig(paseoHome, env),
    floorFile: path.join(paseoHome, "voice-floor.json"),
  };
}

/** The wake-word regex: the wake file when it exists and is valid, else the default. */
export function readWakePattern(wakeFile: string | null): RegExp {
  let source = DEFAULT_WAKE_PATTERN;
  if (wakeFile) {
    try {
      source = readFileSync(wakeFile, "utf8").trim() || source;
    } catch {
      // No wake file: the default words.
    }
  }
  try {
    return new RegExp(source, "iu");
  } catch {
    return new RegExp(DEFAULT_WAKE_PATTERN, "iu");
  }
}
