import { envFlag, envNumber, envPositive } from "../../voice-env.js";
import type { RoomKind } from "./short-phrase.js";
import type { RoomTurn } from "./floor-manager.js";
import type { SpeakerVerdictReason } from "./speaker-gate.js";

// Hizuri: the situation around the user (voices nearby or not; noise nearby or not). Every message
// to Zuri carries one tag built by code from what the voice pipeline already measures: the room
// level before the user's phrase (short-phrase.ts, raw mic audio, -45 dBFS splits quiet from noisy)
// and the voice print's verdicts. Another voice = a phrase with words, 3 s or longer, that did not
// match the user and was not the assistant's own reply heard back, within the last
// PASEO_SITUATION_WINDOW_MS (60 s).

/**
 * Below this the voice print says little: short phrases of the user can score near zero (-0.05 to
 * 0.01), so counting them would make one speaker look like several; from 3 s on the print tells
 * speakers apart.
 */
const RELIABLE_PRINT_MS = 3_000;
/**
 * Turn-taking switches to “other voices” on this many such phrases in the window: one misjudged
 * phrase is common with one speaker (a short word, or the assistant's echo the filter missed), and
 * a real conversation gives several.
 */
const TURN_VOICES_MIN = 2;

/** What the turn controller measured around one phrase (voice-turn-controller.ts). */
export interface PhraseSituation {
  durationMs: number;
  /** The room floor before the phrase, dBFS of the raw mic audio; null when unknown. */
  roomDb: number | null;
  room: RoomKind;
  /** Cosine score against the user's voice print; absent when it was not measured. */
  score?: number;
  verdict?: SpeakerVerdictReason;
  /** Its words match what Zuri said just now (maybe its own voice heard back). */
  echoLike?: boolean;
}

export interface Situation {
  noise: RoomKind;
  /** The loudest room floor among the message's phrases. */
  roomDb: number | null;
  voices: boolean;
  /** Phrases not the user's in the window. */
  otherVoices: number;
}

interface Heard {
  at: number;
  other: boolean;
}

export class SituationTracker {
  private heard: Heard[] = [];
  private lastRoomDb: number | null = null;

  /** A phrase came back from the recogniser (with or without words). */
  note(at: number, phrase: PhraseSituation, hadWords: boolean): void {
    if (phrase.roomDb !== null && phrase.roomDb >= -85) {
      this.lastRoomDb = phrase.roomDb;
    }
    const other =
      hadWords &&
      phrase.verdict === "other-voice" &&
      !phrase.echoLike &&
      phrase.durationMs >= RELIABLE_PRINT_MS;
    this.heard.push({ at, other });
    const keepFrom = at - windowMs();
    this.heard = this.heard.filter((entry) => entry.at >= keepFrom).slice(-100);
  }

  /** The situation for a message made of these phrases. */
  situation(now: number, phrases: readonly (PhraseSituation | null | undefined)[]): Situation {
    const levels = phrases
      .map((phrase) => phrase?.roomDb)
      .filter((db): db is number => typeof db === "number");
    const roomDb = levels.length > 0 ? Math.max(...levels) : null;
    const quietDb = envNumber("PASEO_SHORT_PHRASE_QUIET_DB", -45);
    let noise: RoomKind = "unknown";
    if (roomDb !== null && roomDb >= -85) {
      noise = roomDb < quietDb ? "quiet" : "noisy";
    }
    const from = now - windowMs();
    const otherVoices = this.heard.filter((entry) => entry.other && entry.at >= from).length;
    return { noise, roomDb, voices: otherVoices > 0, otherVoices };
  }

  /**
   * The room now, for turn-taking (floor-manager.ts): other voices (TURN_VOICES_MIN phrases) in the
   * window win; else the room floor before the user's latest phrase. Unknown reads as quiet: every
   * phrase holds the assistant.
   */
  room(now: number): RoomTurn {
    const from = now - windowMs();
    if (this.heard.filter((entry) => entry.other && entry.at >= from).length >= TURN_VOICES_MIN) {
      return "voices";
    }
    const quietDb = envNumber("PASEO_SHORT_PHRASE_QUIET_DB", -45);
    return this.lastRoomDb !== null && this.lastRoomDb >= quietDb ? "noisy" : "quiet";
  }
}

function windowMs(): number {
  return envPositive("PASEO_SITUATION_WINDOW_MS", 60_000);
}

function roomWords(situation: Situation): string {
  if (situation.noise === "unknown" || situation.roomDb === null) {
    return "noise unknown";
  }
  const level = `room ${Math.round(situation.roomDb)} dBFS`;
  return situation.noise === "noisy"
    ? `noise nearby: yes (${level})`
    : `noise nearby: no (${level})`;
}

function voiceWords(situation: Situation): string {
  if (!situation.voices) {
    return "other voices nearby: no";
  }
  const count = situation.otherVoices;
  return `other voices nearby: yes (${count} phrase${count === 1 ? "" : "s"} not the user's in the last minute)`;
}

/** The turn-taking rule this situation sets (floor-manager.ts), while room turns are on. */
function turnWords(situation: Situation): string {
  if (!envFlag("PASEO_VOICE_ROOM_TURNS", true)) {
    return "";
  }
  if (situation.otherVoices >= TURN_VOICES_MIN) {
    return "; turns: other voices, only stop words or your name cut you";
  }
  return situation.noise === "noisy"
    ? "; turns: noisy, alone: the user's words take the floor, noise does not"
    : "; turns: quiet, alone: any phrase of the user's takes the floor";
}

/** The tag Zuri reads at the end of every message, e.g. “[situation: noise nearby: no (room -58 dBFS); other voices nearby: no; turns: quiet, alone: …]”. */
export function situationNote(situation: Situation): string {
  return `[situation: ${situationLine(situation)}]`;
}

/** The same for the fast front's <situation> (no brackets). */
export function situationLine(situation: Situation): string {
  return `${roomWords(situation)}; ${voiceWords(situation)}${turnWords(situation)}`;
}
