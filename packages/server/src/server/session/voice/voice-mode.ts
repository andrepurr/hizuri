// Hizuri: one table of voice modes, picked from what is measured, never switched by hand.
//
// The parameters:
//   route where the phone plays the assistant: loudspeaker or headphones (echo-route.ts; a phone
//   that sends
//          no route counts as headphones, which was the rule before routes existed);
//   room   quiet, noisy, or other voices nearby (situation.ts room()).
// Each mode says what cuts the assistant while it talks and when its waiting reply may start. Every
// value is a live knob, PASEO_MODE_<ROUTE>_<ROOM>_CUTS / _START, “auto” = the table below.

import { envFlag, envString } from "../../voice-env.js";
import type { OutputRoute } from "./echo-route.js";
import type { RoomTurn } from "./floor-manager.js";

/**
 * What cuts the assistant while it talks: any real phrase of the user's, or only a stop word, the
 * drop word or the assistant's name.
 */
export type ModeCuts = "any-phrase" | "stop-words";

/**
 * When the assistant's waiting reply may start: after the user's thought ends (any phrase of the
 * user's holds the assistant), after the user's worded phrases end (noise and wordless sounds do
 * not hold the assistant), or at once (others talk on).
 */
export type ModeStart = "after-user-thought" | "after-user-words" | "at-once";

export type ModeRoute = "speaker" | "headphones";

interface ModeRow {
  route: ModeRoute;
  room: RoomTurn;
  /** "echo-free": any phrase once the assistant's echo is out of the mic, else only stop words. */
  cuts: ModeCuts | "echo-free";
  start: ModeStart;
}

/**
 * The table. On the loudspeaker the assistant's echo comes back louder than the user's voice, so a
 * real phrase may cut the assistant there only once the echo canceller runs (or
 * PASEO_BARGE_SPEAKER_ANY_PHRASE says so). In a noisy room only stop words cut the assistant on any
 * route while PASEO_ROOM_NOISY_STOP_WORDS is on, as without modes: the voice print cannot tell
 * noise from other voices. */
export const VOICE_MODES: readonly ModeRow[] = [
  { route: "headphones", room: "quiet", cuts: "any-phrase", start: "after-user-thought" },
  { route: "headphones", room: "noisy", cuts: "any-phrase", start: "after-user-words" },
  { route: "headphones", room: "voices", cuts: "stop-words", start: "at-once" },
  { route: "speaker", room: "quiet", cuts: "echo-free", start: "after-user-thought" },
  { route: "speaker", room: "noisy", cuts: "echo-free", start: "after-user-words" },
  { route: "speaker", room: "voices", cuts: "stop-words", start: "at-once" },
];

export const MODE_CUTS: readonly ModeCuts[] = ["any-phrase", "stop-words"];
export const MODE_STARTS: readonly ModeStart[] = [
  "after-user-thought",
  "after-user-words",
  "at-once",
];

export interface VoiceMode {
  /** e.g. "speaker/quiet". */
  id: string;
  cuts: ModeCuts;
  start: ModeStart;
}

export function modeRouteOf(route: OutputRoute): ModeRoute {
  return route === "speaker" ? "speaker" : "headphones";
}

/** The knob that overrides one value of one row. */
export function modeKnob(route: ModeRoute, room: RoomTurn, field: "cuts" | "start"): string {
  return `PASEO_MODE_${route.toUpperCase()}_${room.toUpperCase()}_${field.toUpperCase()}`;
}

function override<T extends string>(key: string, allowed: readonly T[]): T | null {
  const value = envString(key, "auto").trim();
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** The mode for this route and room. `echoCancelled`: the echo canceller runs on this stream. */
export function voiceMode(route: OutputRoute, room: RoomTurn, echoCancelled: boolean): VoiceMode {
  const modeRoute = modeRouteOf(route);
  const row = VOICE_MODES.find((m) => m.route === modeRoute && m.room === room);
  if (!row) {
    throw new Error(`no voice mode for ${modeRoute}/${room}`);
  }
  const echoFree = echoCancelled || envFlag("PASEO_BARGE_SPEAKER_ANY_PHRASE", false);
  let tableCuts: ModeCuts;
  if (room === "noisy" && envFlag("PASEO_ROOM_NOISY_STOP_WORDS", true)) {
    tableCuts = "stop-words";
  } else if (row.cuts !== "echo-free") {
    tableCuts = row.cuts;
  } else {
    tableCuts = echoFree ? "any-phrase" : "stop-words";
  }
  return {
    id: `${modeRoute}/${room}`,
    cuts: override(modeKnob(modeRoute, room, "cuts"), MODE_CUTS) ?? tableCuts,
    start: override(modeKnob(modeRoute, room, "start"), MODE_STARTS) ?? row.start,
  };
}
