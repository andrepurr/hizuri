// The Show tab switchers. Four ways to move between Zuri's tabs, picked in Settings → Appearance;
// the Capsule is the default. Positions are in tabs: 0 is the first tab, 1.5 is halfway between the
// second and the third. Everything here runs on the UI thread inside gesture callbacks.

import type { StageTab } from "@getpaseo/protocol/stage";
import type { ShowTabSwitcher } from "@/hooks/use-settings";
import { isPlayerTab } from "../blocks/player-spec";
import { canvasPanes, isLiveTab, isScreenTab, tabBlocks } from "../model";

/** The capsule: its height and its gap above the bottom of the page (the page dots sit in it). */
export const CAPSULE_HEIGHT = 56;
export const CAPSULE_BOTTOM = 26;
/** The deck's chip at the bottom. */
export const CHIP_HEIGHT = 48;
export const CHIP_BOTTOM = 24;
/** The dot rail's touch zone along the right edge. */
export const RAIL_WIDTH = 52;
/** Swipe inside: a drag that starts this close to an edge belongs to the pages or the files. */
export const INSIDE_EDGE = 40;
/** Sliding this far left off the rail cancels the pick. */
const RAIL_CANCEL = 96;

/** Past the first or last tab the track follows the finger at this fraction. */
const RUBBER_BAND = 0.3;
/** How far a release velocity (tabs per second) carries the track before it settles. */
const FLING_PROJECTION_S = 0.22;

function clamp(value: number, min: number, max: number): number {
  "worklet";
  return Math.max(min, Math.min(max, value));
}

/**
 * How many tabs a finger has dragged, from where it first touched. The pan's own translation
 * starts only when the pan activates, and on a slow frame that is far into a flick (all moves of
 * a frame arrive together): a quick flick then counted a third of its length and never switched.
 */
export function fingerDragTabs(input: {
  downX: number;
  x: number;
  width: number;
  gain: number;
}): number {
  "worklet";
  return ((input.downX - input.x) / Math.max(1, input.width)) * input.gain;
}

/** The track under a finger: free between the tabs, a rubber band past either end. */
export function dragTabPosition(input: {
  startIndex: number;
  dragTabs: number;
  count: number;
}): number {
  "worklet";
  const raw = input.startIndex + input.dragTabs;
  const last = Math.max(0, input.count - 1);
  if (raw < 0) return raw * RUBBER_BAND;
  if (raw > last) return last + (raw - last) * RUBBER_BAND;
  return raw;
}

/**
 * The tab a released drag settles on: the nearest one to where the fling would carry the track,
 * never more than one tab from where the drag started.
 */
export function settleTab(input: {
  startIndex: number;
  position: number;
  /** Tabs per second, positive toward the later tabs. */
  velocity: number;
  count: number;
}): number {
  "worklet";
  const projected = Math.round(input.position + input.velocity * FLING_PROJECTION_S);
  const step = clamp(projected, input.startIndex - 1, input.startIndex + 1);
  return clamp(step, 0, Math.max(0, input.count - 1));
}

/** Where the dot of tab `index` sits: the dots are centred on `centerY`. */
export function railDotY(input: {
  index: number;
  centerY: number;
  spacing: number;
  count: number;
}): number {
  "worklet";
  return input.centerY + (input.index - (input.count - 1) / 2) * input.spacing;
}

/** The dot nearest the thumb; past either end of the rail it stays on the end dot. */
export function railIndexAt(input: {
  y: number;
  centerY: number;
  spacing: number;
  count: number;
}): number {
  "worklet";
  const offset = (input.y - input.centerY) / Math.max(1, input.spacing);
  return clamp(Math.round(offset + (input.count - 1) / 2), 0, Math.max(0, input.count - 1));
}

/**
 * Where the held dots centre: spread around the dot the thumb landed on, so that dot stays under
 * the thumb, and never past either end of the rail.
 */
export function railHeldCenter(input: {
  y: number;
  index: number;
  spacing: number;
  count: number;
  height: number;
}): number {
  "worklet";
  const half = ((input.count - 1) / 2) * input.spacing;
  if (half * 2 >= input.height) return input.height / 2;
  const center = input.y - (input.index - (input.count - 1) / 2) * input.spacing;
  return clamp(center, half, input.height - half);
}

/** The thumb slid off the rail to the left: releasing there changes nothing. */
export function railCancelled(input: { dx: number }): boolean {
  "worklet";
  return input.dx < -RAIL_CANCEL;
}

/** A card in the deck dragged a third of the way off or flung sideways closes its tab. */
export function cardDismissed(input: { dx: number; vx: number; width: number }): boolean {
  "worklet";
  return Math.abs(input.dx) > input.width / 3 || Math.abs(input.vx) > 700;
}

export type InsideTouchZone = "pages" | "files" | "tabs";

/**
 * Swipe inside: whose a drag is by where it starts. The left edge turns the page to the chat, the
 * right edge opens the files, anything else moves between the tabs.
 */
export function insideTouchZone(input: { x: number; width: number }): InsideTouchZone {
  "worklet";
  if (input.x < INSIDE_EDGE) return "pages";
  if (input.x > input.width - INSIDE_EDGE) return "files";
  return "tabs";
}

export interface SwitcherInsets {
  bottom: number;
  right: number;
}

/** Room a tab's content leaves for the switcher, so the switcher never covers it at rest. */
export function switcherInsets(switcher: ShowTabSwitcher): SwitcherInsets {
  switch (switcher) {
    case "capsule":
      return { bottom: CAPSULE_BOTTOM + CAPSULE_HEIGHT + 12, right: 0 };
    case "deck":
      return { bottom: CHIP_BOTTOM + CHIP_HEIGHT + 12, right: 0 };
    case "rail":
      return { bottom: 0, right: RAIL_WIDTH - 16 };
    case "inside":
      return { bottom: 28, right: 0 };
  }
}

export type TabKind =
  | "blocks"
  | "page"
  | "picture"
  | "video"
  | "player"
  | "screen"
  | "live"
  | "canvas";

/** What a tab holds, read as the stage page draws it (blocks/fill.ts). */
export function tabKind(tab: StageTab): TabKind {
  if (isLiveTab(tab)) return "live";
  if (isScreenTab(tab)) return "screen";
  if (isPlayerTab(tab)) return "player";
  if (tab.blocks.length > 1 && canvasPanes(tabBlocks(tab))) return "canvas";
  const [only] = tab.blocks;
  if (tab.blocks.length !== 1 || !only) return "blocks";
  const props = (only.props ?? {}) as Record<string, unknown>;
  if (only.type === "web" && typeof props.html === "string") return "page";
  if (only.type === "image" && Array.isArray(props.images) && props.images.length === 1) {
    return "picture";
  }
  if (only.type === "media" && props.kind === "video") return "video";
  return "blocks";
}
