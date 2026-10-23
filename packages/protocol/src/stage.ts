import { z } from "zod";

// Hizuri: the stage — the tabs Zuri opens, rewrites and closes on the user's screen. The daemon
// owns one stage per agent and saves it (packages/server/src/server/stage/); the app draws it. The
// main tab (the assistant's face and the chat) is not a stage tab: nothing here can close it.
//
// Blocks travel loosely: `type` stays an open string and props pass through, so a block a newer
// daemon adds still parses in an older app, which draws its `fallback` text instead. The daemon
// validates every block against its catalogue before it stores it.

export const STAGE_VERSION = 1;

export const StageBlockSchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
  })
  .passthrough();

export const StageTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  blocks: z.array(StageBlockSchema),
  /** Values the blocks bind to by JSON pointer (`bind: { value: "/usage/claude" }`). */
  data: z.record(z.string(), z.unknown()).optional(),
  pinned: z.boolean().optional(),
  /** How the tab arrives (a named transition preset); the app ignores names it does not know. */
  enter: z.string().optional(),
  createdBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Goes up by one on every change of this tab. */
  version: z.number().int(),
  /** When the user last had it on screen. */
  seenAt: z.string().optional(),
});

export const StageClosedTabSchema = z.object({
  id: z.string(),
  title: z.string(),
  closedAt: z.string(),
  /** `agent` or `user`. */
  closedBy: z.string(),
  /** How it left (a named transition preset). */
  exit: z.string().optional(),
});

/**
 * Zuri perched on a block (stage_perch): its small see-through avatar sits on the block's top
 * edge, points at it or leans on it. Optional: an older app ignores it (features.stagePerch).
 */
export const StagePerchSchema = z.object({
  tab: z.string(),
  block: z.string(),
  /** `sit`, `point` or `lean`; the app draws an unknown pose as `sit`. */
  pose: z.string(),
  /** `left` or `right`: which end of the block's top edge; absent = the app picks. */
  side: z.string().optional(),
  /** When the assistant perched: a new value is a new perch, even on the same block. */
  at: z.string(),
});

/**
 * Zuri flipped the live page of a tab to a slide (stage_focus with `slide`): the open page moves
 * there with its own animation, without reloading, and a page loaded later opens there. Optional:
 * an older app ignores it (features.stageSlide).
 */
export const StageSlideSchema = z.object({
  /** 1-based. */
  slide: z.number().int(),
  /** The tab version it was set on; the daemon drops it once the tab's content changes. */
  version: z.number().int(),
  /** When the assistant flipped: a new value is a new flip, even to the same slide. */
  at: z.string(),
});

export const StageMainSchema = z.object({
  /** `face` or `chat`: which view of the main tab shows. */
  view: z.string(),
  /** The assistant's face floats small over the tab in front while it works. */
  bubble: z.boolean().optional(),
  perch: StagePerchSchema.optional(),
  /** The slide of each tab's live page, by tab id. */
  slides: z.record(z.string(), StageSlideSchema).optional(),
});

export const StageChromeSchema = z.object({
  /** `none`, `dots` or `strip`. */
  tabStrip: z.string().optional(),
  /** The agent list and the file explorer behind the screen edges. */
  edges: z.boolean().optional(),
  theme: z.string().optional(),
});

export const StageViewingSchema = z.object({
  /** The tab id the user has in front, or null for the main tab. */
  focus: z.string().nullable(),
  view: z.string().optional(),
  at: z.string(),
});

export const StageSchema = z.object({
  v: z.number().int(),
  agentId: z.string(),
  revision: z.number().int(),
  tabs: z.array(StageTabSchema),
  closed: z.array(StageClosedTabSchema),
  main: StageMainSchema,
  /** The tab in front, or null for the main tab. */
  focus: z.string().nullable(),
  /** `simple`, `standard` or `deep`: how much interface this user wants. */
  depth: z.string(),
  chrome: StageChromeSchema,
  /** What the user's device last reported having on screen. */
  viewing: StageViewingSchema.optional(),
  updatedAt: z.string(),
});

export type StageBlock = z.infer<typeof StageBlockSchema>;
export type StageTab = z.infer<typeof StageTabSchema>;
export type StageClosedTab = z.infer<typeof StageClosedTabSchema>;
export type StagePerch = z.infer<typeof StagePerchSchema>;
export type StageSlide = z.infer<typeof StageSlideSchema>;
export type StageMain = z.infer<typeof StageMainSchema>;
export type StageChrome = z.infer<typeof StageChromeSchema>;
export type StageViewing = z.infer<typeof StageViewingSchema>;
export type Stage = z.infer<typeof StageSchema>;

/**
 * One change of a stage. It carries the changed tabs whole and the small frame (order, main,
 * focus, depth, chrome, closed) every time, so the app applies it without merge logic. An
 * update whose `previousRevision` is not the revision the app holds makes it fetch the stage.
 */
export const StageChangeSchema = z.object({
  agentId: z.string(),
  revision: z.number().int(),
  previousRevision: z.number().int(),
  upserted: z.array(StageTabSchema),
  removed: z.array(z.string()),
  order: z.array(z.string()),
  closed: z.array(StageClosedTabSchema),
  main: StageMainSchema,
  focus: z.string().nullable(),
  depth: z.string(),
  chrome: StageChromeSchema,
  updatedAt: z.string(),
});

export type StageChange = z.infer<typeof StageChangeSchema>;
