import type { Stage, StagePerch } from "@getpaseo/protocol/stage";
import type { StageBlockNode } from "./model";

// Zuri perched on a block (stage_perch, main.perch): where the assistant's small see-through
// window goes over the block, and when it is there at all. The avatar page (`perch=1`) draws
// the avatar so the block's top edge lies on the window's `anchor` line, `scale` dp to a metre.
// Everything here is in the coordinates of the tab's block list inside its scroll view, so the
// avatar scrolls with the block.

export type PerchPose = "sit" | "point" | "lean";

export interface PerchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PerchWindow {
  /** The middle of the assistant's window, sideways. */
  x: number;
  /** The block's edge line the assistant sits on. */
  line: number;
  width: number;
  height: number;
  /** How much of the window is above the line. */
  above: number;
  /** The line as a fraction of the window's height from its top (the page's `anchor`). */
  anchor: number;
  /** dp per metre of the avatar's body (the page's `scale`). */
  scale: number;
  /** What the assistant points at, in the window's own dp (point only). */
  target: { x: number; y: number } | null;
}

/**
 * dp to a metre: sitting, the avatar rises about 90 dp over the edge and its legs hang 50 dp below.
 */
export const PERCH_SCALE = 100;
/** How far the avatar's middle sits in from the block's end. */
export const PERCH_INSET = 36;
/** How high the avatar arcs on a hop to another block. */
export const PERCH_HOP_ARC = 48;
export const PERCH_HOP_MS = 600;
/** How much of the block must show below the header for the assistant to stay. */
export const PERCH_MIN_VISIBLE = 24;
/** The avatar sinks this far into the block's border, so it sits on it and not above it. */
const PERCH_SINK = 2;

const POSE_WINDOWS: Record<PerchPose, { width: number; above: number; below: number }> = {
  sit: { width: 120, above: 96, below: 56 },
  // The pointing arm reaches out about 0.7 m to the side.
  point: { width: 170, above: 96, below: 56 },
  // Behind the block: head, shoulders and arms over the edge, the rest hidden under it.
  lean: { width: 120, above: 58, below: 12 },
};

export function perchPose(pose: string): PerchPose {
  return pose === "point" || pose === "lean" ? pose : "sit";
}

/** The perch on the tab in front, or null when the assistant sits on another tab or nowhere. */
export function visiblePerch(stage: Stage | null, tabId: string | null): StagePerch | null {
  const perch = stage?.main.perch;
  return perch && perch.tab === tabId ? perch : null;
}

/** The type of a block anywhere in a tab's tree (inside rows, sections and carousels too). */
export function blockTypeOf(blocks: readonly StageBlockNode[], id: string): string | null {
  for (const block of blocks) {
    if (block.id === id) return block.type;
    const inner = blockTypeOf(block.children, id);
    if (inner) return inner;
  }
  return null;
}

/**
 * Where on the block the assistant points: a stat's number sits on its left, a chart fills its
 * block.
 */
function pointAt(type: string | null, block: PerchRect): { x: number; y: number } {
  const share = type === "stat" ? 0.28 : 0.5;
  return { x: block.x + block.width * share, y: block.y + block.height * 0.55 };
}

/** The assistant's window over a block, kept inside `bounds` sideways. */
export function perchWindow(input: {
  pose: PerchPose;
  side: string | undefined;
  block: PerchRect;
  blockType: string | null;
  bounds: { left: number; right: number };
}): PerchWindow {
  const { pose, block, bounds } = input;
  const size = POSE_WINDOWS[pose];
  const height = size.above + size.below;
  const inset = Math.min(PERCH_INSET, block.width / 2);
  const middle = input.side === "left" ? block.x + inset : block.x + block.width - inset;
  const half = size.width / 2;
  const x = Math.round(Math.max(bounds.left + half, Math.min(bounds.right - half, middle)));
  const line = Math.round(block.y + PERCH_SINK);
  const target = pose === "point" ? pointAt(input.blockType, block) : null;
  return {
    x,
    line,
    width: size.width,
    height,
    above: size.above,
    anchor: size.above / height,
    scale: PERCH_SCALE,
    target: target
      ? { x: Math.round(target.x - (x - half)), y: Math.round(target.y - (line - size.above)) }
      : null,
  };
}

/**
 * Room to make above the list, so the avatar's head clears the header while the user is at the top:
 * block's edge is only a little below the header.
 */
export function perchRoom(input: { window: PerchWindow; listTop: number; headerHeight: number }) {
  const headTop = input.listTop + input.window.line - input.window.above;
  return Math.max(0, Math.ceil(input.headerHeight - headTop));
}

/**
 * The assistant stays while enough of the block shows between the header and the bottom of the
 * view.
 */
export function perchOnScreen(input: {
  block: PerchRect;
  listTop: number;
  scrollY: number;
  viewportHeight: number;
  headerHeight: number;
}): boolean {
  const top = input.listTop + input.block.y - input.scrollY;
  const bottom = top + input.block.height;
  const visible = Math.min(bottom, input.viewportHeight) - Math.max(top, input.headerHeight);
  return visible >= Math.min(PERCH_MIN_VISIBLE, input.block.height);
}

/**
 * Where to scroll so a block the assistant just perched on shows with the avatar over it, or null
 * when it shows already: perching shows the user something, so a block scrolled away from comes
 * back.
 */
export function perchScrollTarget(input: {
  block: PerchRect;
  above: number;
  listTop: number;
  scrollY: number;
  viewportHeight: number;
  headerHeight: number;
}): number | null {
  if (perchOnScreen(input)) return null;
  const top = input.listTop + input.block.y - input.above - input.headerHeight;
  return Math.max(0, Math.round(top));
}

/** The edge point partway through a hop: a straight line across, an arc up and down. */
export function hopPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  progress: number,
): { x: number; y: number } {
  "worklet";
  const p = Math.max(0, Math.min(1, progress));
  return {
    x: from.x + (to.x - from.x) * p,
    y: from.y + (to.y - from.y) * p - PERCH_HOP_ARC * Math.sin(Math.PI * p),
  };
}
