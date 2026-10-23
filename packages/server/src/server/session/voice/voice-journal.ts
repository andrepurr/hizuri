import fs from "node:fs";
import path from "node:path";

import { envFlag, envPath } from "../../voice-env.js";

// Hizuri: every finished phrase is appended to `<dir>/YYYY-MM-DD.log` with its outcome, so nothing
// the user said is lost even when a filter or an interrupted agent turn dropped it.
// Line format: `HH:MM:SS | outcome (extra) | transcript`.

export type VoiceJournalOutcome =
  | "accepted"
  | "other-voice"
  /** Short, below the voice-print threshold, delivered for Zuri to judge (short-phrase.ts). */
  | "short"
  | "echo"
  | "junk"
  | "empty"
  | "delivered-despite-gate"
  | "secretary";

export interface VoiceJournal {
  write(outcome: VoiceJournalOutcome, transcript: string, extra?: string): void;
}

export function createVoiceJournal(dir: string): VoiceJournal {
  return {
    write(outcome, transcript, extra) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        const now = new Date();
        const iso = now.toISOString();
        const file = path.join(dir, `${iso.slice(0, 10)}.log`);
        const text = transcript.replace(/\s+/g, " ").trim();
        fs.appendFileSync(
          file,
          `${iso.slice(11, 19)} | ${outcome}${extra ? ` (${extra})` : ""} | ${text}\n`,
        );
      } catch {
        // Journaling must never break the voice path.
      }
    },
  };
}

/**
 * The journal the daemon uses: PASEO_VOICE_JOURNAL_DIR, else `<paseoHome>/voice-journal`.
 * PASEO_VOICE_JOURNAL=0 turns it off.
 */
export function resolveVoiceJournalDir(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!envFlag("PASEO_VOICE_JOURNAL", true, env)) {
    return null;
  }
  return envPath("PASEO_VOICE_JOURNAL_DIR", path.join(paseoHome, "voice-journal"), env);
}
