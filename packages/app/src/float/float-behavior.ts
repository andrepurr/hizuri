import type { FaceActivity } from "@/face/activity";

// How floating Zuri behaves on its own: its window size, when it wanders and where to.

/**
 * The assistant's window, in dp: the whole body and no more, so the app below keeps every other
 * touch.
 */
export const FLOAT_WINDOW = { widthDp: 150, heightDp: 300 } as const;

/** In-place walks of the face page (motions/dances/, CMU motion capture). */
export const WALK_MOTIONS = ["femwalk", "catwalk", "strut", "prance"] as const;

/** How fast the window slides while the assistant walks, in dp per second. */
export const WALK_SPEED_DP = 70;

/** A walk shorter than this is not worth the turn. */
const MIN_WALK_DP = 40;

/** How long the long-press menu stays open untouched. */
export const MENU_OPEN_MS = 5_000;

export interface FloatPosition {
  x: number;
  screenWidth: number;
  onFloor: boolean;
}

export interface FloatWalk {
  direction: -1 | 1;
  distanceDp: number;
  motion: (typeof WALK_MOTIONS)[number];
}

/** The quiet before the next stroll: 9–23 s. */
export function idleDelayMs(random: () => number): number {
  return 9_000 + Math.floor(random() * 14_000);
}

/**
 * The assistant wanders only standing idle on the floor, with the screen on and its menu closed.
 */
export function canWander(input: {
  activity: FaceActivity;
  menuOpen: boolean;
  screenOn: boolean;
  position: FloatPosition | null;
}): boolean {
  return (
    input.activity === "idle" &&
    !input.menuOpen &&
    input.screenOn &&
    input.position !== null &&
    input.position.onFloor
  );
}

/**
 * A stroll along the floor: a random side, or away from the edge the assistant stands at, for a
 * random part of the room there is; null on a screen too narrow to walk.
 */
export function chooseWalk(position: FloatPosition, random: () => number): FloatWalk | null {
  const room = Math.max(0, position.screenWidth - FLOAT_WINDOW.widthDp);
  const x = Math.min(room, Math.max(0, position.x));
  const spaceRight = room - x;
  const spaceLeft = x;
  let direction: -1 | 1 = random() < 0.5 ? -1 : 1;
  if ((direction === 1 ? spaceRight : spaceLeft) < MIN_WALK_DP) {
    direction = direction === 1 ? -1 : 1;
  }
  const space = direction === 1 ? spaceRight : spaceLeft;
  if (space < MIN_WALK_DP) return null;
  const distanceDp = Math.round(MIN_WALK_DP + random() * (space - MIN_WALK_DP));
  const motion =
    WALK_MOTIONS[Math.min(WALK_MOTIONS.length - 1, Math.floor(random() * WALK_MOTIONS.length))];
  return { direction, distanceDp, motion };
}
