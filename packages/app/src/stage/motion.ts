import { isWeb } from "@/constants/platform";
import {
  Easing,
  type EntryOrExitLayoutType,
  Keyframe,
  LinearTransition,
} from "react-native-reanimated";

// The stage's named transition presets (packages/server/src/server/stage/blocks.ts): blocks `rise`,
// `fly-left`, `fly-right`, `scale`, `flip`, `drop`, `bloom`; tabs `slide`, `fly-in`,
// `zoom-from-face` (played by value, TabEntrance); exits `fly-out`, `fold-into-face`. Every one
// moves — flying in and out, never a blink — and lands softly: the brand is calm and premium
// (docs/brand.md), so blocks travel a short way on a long ease-out instead of bouncing. `bloom` is
// the brand's own motion: a block opens from its centre the way the mark's field breathes out from
// the warm core. Reanimated layout animations follow the system's reduce-motion setting by default,
// which is each preset's reduced form.
//
// Keyframe rules (Reanimated docs): keyframe 0 carries every animated prop, transforms keep the
// same order in every keyframe, easing goes on the later keyframe. Presets are factories: a
// Keyframe's modifiers (delay) change the instance they are called on.

const OUT = Easing.out(Easing.cubic);
/** The long, soft landing every block entrance shares. */
export const SETTLE = Easing.bezier(0.16, 1, 0.3, 1);
const BACK = Easing.bezier(0.3, 1.35, 0.5, 1);

const BLOCK_PRESETS = {
  rise: () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ translateY: 26 }, { scale: 0.98 }] },
      100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: SETTLE },
    }).duration(620),
  "fly-left": () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ translateX: -64 }, { rotateZ: "-2deg" }] },
      100: { opacity: 1, transform: [{ translateX: 0 }, { rotateZ: "0deg" }], easing: SETTLE },
    }).duration(640),
  "fly-right": () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ translateX: 64 }, { rotateZ: "2deg" }] },
      100: { opacity: 1, transform: [{ translateX: 0 }, { rotateZ: "0deg" }], easing: SETTLE },
    }).duration(640),
  scale: () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ scale: 0.8 }] },
      100: { opacity: 1, transform: [{ scale: 1 }], easing: BACK },
    }).duration(560),
  bloom: () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ scale: 0.92 }] },
      35: { opacity: 1, transform: [{ scale: 0.97 }], easing: OUT },
      100: { opacity: 1, transform: [{ scale: 1 }], easing: SETTLE },
    }).duration(820),
  flip: () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ perspective: 800 }, { rotateX: "75deg" }] },
      100: { opacity: 1, transform: [{ perspective: 800 }, { rotateX: "0deg" }], easing: OUT },
    }).duration(520),
  drop: () =>
    new Keyframe({
      0: { opacity: 0, transform: [{ translateY: -60 }] },
      70: { opacity: 1, transform: [{ translateY: 8 }], easing: OUT },
      100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.inOut(Easing.quad) },
    }).duration(520),
} as const;

/**
 * Where a tab starts its entrance onto the track; it plays to rest on a value (tabs/track.tsx),
 * not as a layout animation: a Keyframe entrance mounted while the app was in the background
 * froze at its start and left the tab 70 dp to the right.
 */
export interface TabEntrance {
  x: number;
  y: number;
  scale: number;
  duration: number;
}

export const TAB_ENTRANCE_EASING = OUT;

const TAB_ENTRANCES = {
  slide: { x: 70, y: 0, scale: 0.98, duration: 380 },
  "fly-in": { x: 0, y: 120, scale: 0.9, duration: 460 },
  "zoom-from-face": { x: -140, y: -220, scale: 0.2, duration: 520 },
} as const satisfies Record<string, TabEntrance>;

const EXIT_PRESETS = {
  "fly-out": () =>
    new Keyframe({
      0: { opacity: 1, transform: [{ translateX: 0 }, { rotateZ: "0deg" }] },
      100: {
        opacity: 0,
        transform: [{ translateX: -110 }, { rotateZ: "-4deg" }],
        easing: Easing.in(Easing.cubic),
      },
    }).duration(260),
  "fold-into-face": () =>
    new Keyframe({
      0: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }, { scale: 1 }] },
      100: {
        opacity: 0,
        transform: [{ translateX: -140 }, { translateY: -220 }, { scale: 0.2 }],
        easing: Easing.in(Easing.cubic),
      },
    }).duration(320),
} as const;

/** A block's entrance, delayed for its place in a stagger. */
/**
 * A block's entrance. None on web: Reanimated there pins a block with a finished Keyframe entrance
 * to where it stood when the entrance began, so blocks whose neighbours grew meanwhile land on top
 * of them; BlockView rises them by value instead (blocks/content.tsx, useReveal).
 */
export function blockEntering(
  name: string | null,
  delayMs: number,
): EntryOrExitLayoutType | undefined {
  if (isWeb) return undefined;
  const preset =
    name && name in BLOCK_PRESETS
      ? BLOCK_PRESETS[name as keyof typeof BLOCK_PRESETS]
      : BLOCK_PRESETS.rise;
  return delayMs > 0 ? preset().delay(delayMs) : preset();
}

export function tabEntrance(name: string | null | undefined): TabEntrance {
  return name && name in TAB_ENTRANCES
    ? TAB_ENTRANCES[name as keyof typeof TAB_ENTRANCES]
    : TAB_ENTRANCES.slide;
}

export function tabExiting(name: string | null | undefined): EntryOrExitLayoutType {
  const preset =
    name && name in EXIT_PRESETS
      ? EXIT_PRESETS[name as keyof typeof EXIT_PRESETS]
      : EXIT_PRESETS["fly-out"];
  return preset();
}

/**
 * Blocks around an arriving or leaving one glide to their new place. Not on web: there Reanimated
 * takes its layout snapshot while a neighbour's entrance is still running and parks blocks at the
 * top of the list, sometimes for good (seen in the headless render of six tabs, also before
 * the brand pass).
 */
export const blockLayout = isWeb
  ? undefined
  : LinearTransition.springify().damping(18).stiffness(160);

export const CASCADE_STAGGER_MS = 110;

/** Delay of the n-th block of a tab that arrives whole: a quick cascade, capped. */
export function cascadeDelay(index: number, stagger = CASCADE_STAGGER_MS): number {
  return Math.min(index, 8) * stagger;
}

/** When a row inside a block appears: after its block, one row after another. */
export function rowDelay(index: number, blockDelayMs: number): number {
  return blockDelayMs + 180 + Math.min(index, 10) * 70;
}
