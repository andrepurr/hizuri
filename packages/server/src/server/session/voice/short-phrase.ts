import { envNonNegative, envNumber } from "../../voice-env.js";
import type { SpeakerVerdict, SpeakerVerdictReason } from "./speaker-gate.js";

// Hizuri: short phrases. The voice print is unreliable below ~3 s (the user's own short phrases
// score 0.1-0.2, long ones 0.4+), so it never drops a short phrase: the phrase goes to Zuri with a
// note on the situation around it (voice score, room level before it), and Zuri decides by context
// whether it was the user's. Echo and junk are still dropped first.
//
// PASEO_SHORT_PHRASE_MS (3000; 0 = off): phrases shorter than this are short.
// PASEO_SHORT_PHRASE_QUIET_DB (-45): a room floor below this is quiet. On the raw mic audio a quiet
// room sits at -55…-65 dBFS before a phrase, street noise outdoors at -28…-37 dBFS.

/** The room is measured in this window before the phrase starts. */
export const ROOM_BEFORE_MS = 3_000;
/** The detector fires a little after the user's voice begins: the last 200 ms are left out. */
export const ROOM_GAP_MS = 200;
const FRAME_MS = 100;
const KEEP_MS = 10_000;
// Below this the mic sent digital silence (muted), which says nothing about the room.
const MUTED_DB = -85;
// What the user's long phrases typically score against the voice print.
const OWNER_LONG_SCORE = "0.4+";

export type RoomKind = "quiet" | "noisy" | "unknown";

export interface ShortPhraseConfig {
  maxMs: number;
  quietDb: number;
}

/** What Zuri gets to judge a short phrase by; also written to the phrase graph. */
export interface ShortPhraseInfo {
  durationMs: number;
  /** Cosine score against the user's voice print; absent when the print could not measure it. */
  score?: number;
  /** The voice print accepted it on its own (a match, the user's tail, or too short to judge). */
  verified: boolean;
  verdict: SpeakerVerdictReason;
  /** The room floor before the phrase, dBFS of the raw mic audio; null when unknown. */
  roomDb: number | null;
  room: RoomKind;
  /** Its words match what Zuri said in the last two minutes: maybe its own voice heard back. */
  echoLike?: boolean;
}

export function resolveShortPhraseConfig(env: NodeJS.ProcessEnv = process.env): ShortPhraseConfig {
  return {
    maxMs: envNonNegative("PASEO_SHORT_PHRASE_MS", 3_000, env),
    quietDb: envNumber("PASEO_SHORT_PHRASE_QUIET_DB", -45, env),
  };
}

function levelDb(pcm: Buffer, from: number, to: number): number {
  let sum = 0;
  const samples = Math.floor((to - from) / 2);
  for (let i = 0; i < samples; i += 1) {
    const v = pcm.readInt16LE(from + i * 2) / 32768;
    sum += v * v;
  }
  return samples > 0 ? 10 * Math.log10(sum / samples + 1e-12) : -120;
}

/**
 * Levels of the raw microphone audio (before the mic gain) in 100 ms frames, for the last 10 s. The
 * room level is a low percentile of the frames, not their mean: the window before a phrase often
 * holds the end of the user's previous phrase or the start of this one, and a plain RMS of it read
 * -20 dBFS where the room was at -55.
 */
export class RoomLevelMeter {
  private frames: { t: number; db: number }[] = [];

  /** A raw 16-bit mono chunk that arrived at `now`; its frames are dated back from `now`. */
  push(pcm: Buffer, sampleRate: number, now: number): void {
    const frameBytes = Math.max(2, Math.round((sampleRate * FRAME_MS) / 1000) * 2);
    const chunkMs = (pcm.length / 2 / sampleRate) * 1000;
    for (let from = 0; from + 2 <= pcm.length; from += frameBytes) {
      const to = Math.min(pcm.length, from + frameBytes);
      const endMs = Math.round((to / 2 / sampleRate) * 1000);
      this.frames.push({ t: now - chunkMs + endMs, db: levelDb(pcm, from, to) });
    }
    while (this.frames.length > 0 && this.frames[0].t < now - KEEP_MS) {
      this.frames.shift();
    }
  }

  /** The 20th percentile of the frame levels between two times; null without audio. */
  floorDb(from: number, to: number): number | null {
    const levels = this.frames
      .filter((frame) => frame.t >= from && frame.t <= to)
      .map((frame) => frame.db)
      .sort((a, b) => a - b);
    if (levels.length === 0) {
      return null;
    }
    return levels[Math.floor(levels.length * 0.2)];
  }
}

export function roomKind(roomDb: number | null, quietDb: number): RoomKind {
  if (roomDb === null || roomDb < MUTED_DB) {
    return "unknown";
  }
  return roomDb < quietDb ? "quiet" : "noisy";
}

/** The short-phrase note for a phrase, or null when it is not short (or the channel is off). */
export function describeShortPhrase(input: {
  config: ShortPhraseConfig;
  startedAt: number;
  endedAt: number;
  roomDb: number | null;
  verdict: SpeakerVerdict;
  echoLike?: boolean;
}): ShortPhraseInfo | null {
  const durationMs = Math.max(0, input.endedAt - input.startedAt);
  if (input.config.maxMs <= 0 || durationMs >= input.config.maxMs) {
    return null;
  }
  return {
    durationMs,
    ...(input.verdict.score !== undefined ? { score: input.verdict.score } : {}),
    verified: input.verdict.accept,
    verdict: input.verdict.reason,
    roomDb: input.roomDb === null ? null : Math.round(input.roomDb),
    room: roomKind(input.roomDb, input.config.quietDb),
    ...(input.echoLike ? { echoLike: true } : {}),
  };
}

/**
 * The one line Zuri reads after a short phrase, e.g. “[short phrase 1.4 s — voice match 0.14 (the
 * user's long ones 0.4+), room before it quiet -52 dBFS — judge by context]”.
 */
export function shortPhraseNote(info: ShortPhraseInfo): string {
  const seconds = (info.durationMs / 1000).toFixed(1);
  let voice = "voice match not measured";
  if (info.score !== undefined) {
    voice = `voice match ${info.score.toFixed(2)} (the user's long ones ${OWNER_LONG_SCORE})`;
  } else if (info.verdict === "too-short") {
    voice = "voice match not measured (too short)";
  }
  if (info.verdict === "continues-owner") {
    voice += ", right after the user's own phrase";
  }
  const room =
    info.room === "unknown" || info.roomDb === null
      ? "room before it unknown"
      : `room before it ${info.room} ${info.roomDb} dBFS`;
  const echo = info.echoLike ? ", its words match what you said just now (maybe your echo)" : "";
  return `[short phrase ${seconds} s — ${voice}, ${room}${echo} — judge by context]`;
}
