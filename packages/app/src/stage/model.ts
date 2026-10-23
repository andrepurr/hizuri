import type { Stage, StageChange, StageTab } from "@getpaseo/protocol/stage";
import { isPlayerTab } from "./blocks/player-spec";

// The stage as the app draws it: the daemon keeps Zuri's tabs
// (packages/server/src/server/stage/) and the app holds the latest copy — from the subscription
// when connected, from the cached snapshot when not. Blocks arrive loosely typed (a newer daemon
// may add a type), so everything here reads them tolerantly: an unknown block draws its fallback.

export interface StageBlockNode {
  type: string;
  id: string;
  props: Record<string, unknown>;
  children: StageBlockNode[];
  enter: string | null;
  emphasis: string | null;
  delay: number;
  stagger: number;
  fallback: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a JSON pointer (`/usage/0/windows`) out of a tab's data. */
export function readPointer(data: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "/") return data;
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = data;
  for (const part of parts) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isRecord(current)) current = current[part];
    else return undefined;
  }
  return current;
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** One block with its bound props filled from the tab's data. */
export function toBlockNode(raw: unknown, data: unknown, fallbackId: string): StageBlockNode {
  const block = isRecord(raw) ? raw : {};
  const props: Record<string, unknown> = isRecord(block.props) ? { ...block.props } : {};
  if (isRecord(block.bind)) {
    for (const [prop, pointer] of Object.entries(block.bind)) {
      if (typeof pointer !== "string") continue;
      const value = readPointer(data, pointer);
      if (value !== undefined) props[prop] = value;
    }
  }
  const id = typeof block.id === "string" && block.id ? block.id : fallbackId;
  const children = Array.isArray(block.children)
    ? block.children.map((child, index) => toBlockNode(child, data, `${id}.${index}`))
    : [];
  return {
    type: typeof block.type === "string" ? block.type : "unknown",
    id,
    props,
    children,
    enter: typeof block.enter === "string" ? block.enter : null,
    emphasis: typeof block.emphasis === "string" ? block.emphasis : null,
    delay: readNumber(block.delay),
    stagger: readNumber(block.stagger),
    fallback: typeof block.fallback === "string" ? block.fallback : "",
  };
}

export function tabBlocks(tab: StageTab): StageBlockNode[] {
  return tab.blocks.map((block, index) => toBlockNode(block, tab.data ?? {}, `b${index + 1}`));
}

/** Two small blocks share a row on a phone: number tiles and rings. */
export function isHalfBlock(block: StageBlockNode): boolean {
  if (block.type === "stat") return true;
  return block.type === "progress" && block.props.style === "ring";
}

export type CanvasPaneKind = "page" | "picture" | "video" | "audio";

export interface CanvasPane {
  block: StageBlockNode;
  kind: CanvasPaneKind;
  /** Its share of the height; null keeps its own height (an audio track). */
  weight: number | null;
}

/** More than this many live panes on one phone screen are too small to watch. */
export const MAX_CANVAS_PANES = 4;
const CANVAS_WEIGHTS: Record<CanvasPaneKind, number | null> = {
  page: 3,
  picture: 2,
  video: 2,
  audio: null,
};

function canvasPaneKind(block: StageBlockNode): CanvasPaneKind | null {
  const { props } = block;
  if (block.type === "web" && typeof props.html === "string") return "page";
  if (block.type === "image" && Array.isArray(props.images) && props.images.length === 1) {
    return "picture";
  }
  if (block.type !== "media" || props.player === true) return null;
  if (props.kind === "video") return "video";
  if (props.kind === "audio") return "audio";
  return null;
}

/**
 * One canvas: a tab of 2–4 files — pages, pictures, videos, audio, what show_file opens
 * — shares the screen between them instead of scrolling a list. Null for anything else.
 */
export function canvasPanes(blocks: readonly StageBlockNode[]): CanvasPane[] | null {
  if (blocks.length < 2 || blocks.length > MAX_CANVAS_PANES) return null;
  const panes: CanvasPane[] = [];
  for (const block of blocks) {
    const kind = canvasPaneKind(block);
    if (!kind) return null;
    panes.push({ block, kind, weight: CANVAS_WEIGHTS[kind] });
  }
  return panes;
}

export type StageRow =
  | { kind: "full"; key: string; block: StageBlockNode }
  | { kind: "pair"; key: string; blocks: StageBlockNode[] };

/** Groups a tab's top-level blocks into rows: consecutive half blocks pair up. */
export function layoutRows(blocks: readonly StageBlockNode[]): StageRow[] {
  const rows: StageRow[] = [];
  for (const block of blocks) {
    const last = rows.at(-1);
    if (isHalfBlock(block) && last?.kind === "pair" && last.blocks.length < 2) {
      last.blocks.push(block);
    } else if (isHalfBlock(block)) {
      rows.push({ kind: "pair", key: block.id, blocks: [block] });
    } else {
      rows.push({ kind: "full", key: block.id, block });
    }
  }
  return rows;
}

export type StageChangeResult =
  | { kind: "applied"; stage: Stage }
  | { kind: "ignored" }
  /** A change was missed in between: fetch the stage again. */
  | { kind: "gap" };

/** Applies one `stage.update` to the stage the app holds. */
export function applyStageChange(stage: Stage | null, change: StageChange): StageChangeResult {
  if (stage && change.revision <= stage.revision) return { kind: "ignored" };
  if (!stage || change.previousRevision !== stage.revision) return { kind: "gap" };
  const byId = new Map(stage.tabs.map((tab) => [tab.id, tab]));
  for (const tab of change.upserted) byId.set(tab.id, tab);
  for (const id of change.removed) byId.delete(id);
  const tabs = change.order
    .map((id) => byId.get(id))
    .filter((tab): tab is StageTab => tab !== undefined);
  return {
    kind: "applied",
    stage: {
      ...stage,
      revision: change.revision,
      tabs,
      closed: change.closed,
      main: change.main,
      focus: change.focus,
      depth: change.depth,
      chrome: change.chrome,
      updatedAt: change.updatedAt,
    },
  };
}

/**
 * The tab the assistant's change brought to the front, if it did: it opened or changed the tab in
 * focus, or moved the focus. A change that only closes or reorders brings nothing forward.
 */
export function frontTabOfChange(before: Stage | null, change: StageChange): string | null {
  const focus = change.focus;
  if (!focus || !change.order.includes(focus)) return null;
  // The live tab follows the conversation; it never moves the pager.
  const upserted = change.upserted.find((tab) => tab.id === focus);
  if (upserted && isLiveTab(upserted)) return null;
  if (change.upserted.some((tab) => tab.id === focus)) return focus;
  return before?.focus === focus ? null : focus;
}

/** The live tab "Now" the visual front draws (server stage/live-scenes.ts). */
export const LIVE_TAB_AUTHOR = "visual-front";

export function isLiveTab(tab: StageTab): boolean {
  return tab.createdBy === LIVE_TAB_AUTHOR;
}

/** When the user's phrase started the scene on the live tab; 0 when unknown. */
function liveSince(tab: StageTab): number {
  const since = tab.data?.since;
  return typeof since === "number" && Number.isFinite(since) ? since : 0;
}

/**
 * The tab on screen: the user's pick while it is open; else the live tab, while Zuri has not
 * brought a tab of its own forward since the user's phrase started its scene (unless the
 * assistant's tab is the player: the user is watching it); else the assistant's focus, else its
 * newest tab.
 */
export function resolveVisibleTab(input: {
  tabs: readonly StageTab[];
  focus: string | null;
  pick: string | null;
}): StageTab | null {
  const { tabs, focus, pick } = input;
  const find = (id: string | null) => (id ? tabs.find((tab) => tab.id === id) : undefined);
  const picked = find(pick);
  if (picked) return picked;
  const live = tabs.find(isLiveTab);
  const assistantTab = find(focus) ?? tabs.findLast((tab) => !isLiveTab(tab));
  // A film the user watches stays in front while they talk to the assistant.
  const watching = assistantTab ? isPlayerTab(assistantTab) : false;
  if (live && !watching && (!assistantTab || Date.parse(assistantTab.updatedAt) < liveSince(live)))
    return live;
  return assistantTab ?? tabs.at(-1) ?? null;
}

/** The screen window (show_screen) streams the assistant's browser instead of drawing blocks. */
export function isScreenTab(tab: StageTab): boolean {
  return tab.blocks.some(
    (block) => isRecord(block.props) && block.type === "web" && block.props.screen === true,
  );
}

export interface CountFormat {
  prefix: string;
  value: number;
  decimals: number;
  suffix: string;
  /** The thousands separator the value was written with, or "". */
  group: string;
  /** Written with an explicit plus (“+2.1%”). */
  plus: boolean;
}

const COUNT_PATTERN = /^(\D*?)([-+]?\d{1,3}(?:([,   ])\d{3})+|[-+]?\d+)(\.\d+)?(.*)$/u;

/** Splits “€4,210”, “98%”, “212 ms” into what counts up and what stays. */
export function parseCount(text: string): CountFormat | null {
  const match = COUNT_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, prefix = "", whole = "", group = "", fraction = "", suffix = ""] = match;
  const digits = group ? whole.split(group).join("") : whole;
  const value = Number(`${digits}${fraction}`);
  if (!Number.isFinite(value)) return null;
  return {
    prefix,
    value,
    decimals: Math.max(0, fraction.length - 1),
    suffix,
    group,
    plus: whole.startsWith("+"),
  };
}

export function formatCount(format: CountFormat, value: number): string {
  const fixed = Math.abs(value).toFixed(format.decimals);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = format.group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, format.group) : whole;
  const plus = format.plus ? "+" : "";
  const sign = value < 0 ? "-" : plus;
  return `${format.prefix}${sign}${grouped}${fraction ? `.${fraction}` : ""}${format.suffix}`;
}

/** Stable keys for labels that may repeat: “a”, “a#2”, “a#3”. */
export function uniqueKeys(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label}#${count}`;
  });
}

export type LiveStepState = "todo" | "doing" | "done" | "failed";
export type LiveJobState = "running" | "done" | "failed" | "waiting";

/** One scene of the live tab, read from `tab.data.scene` (server stage/live-scenes.ts). */
export type LiveScene =
  | { p: "hero" | "win" | "alert"; k: string; t: string; s: string }
  | { p: "number"; k: string; v: string; t: string; s: string }
  | { p: "compare"; k: string; t: string; items: { l: string; v: string }[] }
  | { p: "list"; k: string; t: string; items: string[] }
  | { p: "steps"; k: string; t: string; steps: { l: string; s: LiveStepState }[] }
  | { p: "timeline"; k: string; t: string; items: { w: string; l: string }[] }
  | { p: "chart"; k: string; t: string }
  | { p: "status"; k: string; t: string; items: { l: string; s: LiveJobState; d: string }[] };

const STEP_STATES: readonly LiveStepState[] = ["todo", "doing", "done", "failed"];
const JOB_STATES: readonly LiveJobState[] = ["running", "done", "failed", "waiting"];

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** The live tab's scene, read tolerantly; null = draw the tab's blocks instead. */
export function liveSceneOf(tab: StageTab): LiveScene | null {
  if (!isLiveTab(tab)) return null;
  const raw = tab.data?.scene;
  if (!isRecord(raw)) return null;
  const k = textOf(raw.k);
  const t = textOf(raw.t);
  if (!t) return null;
  switch (raw.p) {
    case "hero":
    case "win":
    case "alert":
      return { p: raw.p, k, t, s: textOf(raw.s) };
    case "number":
      return textOf(raw.v) ? { p: "number", k, v: textOf(raw.v), t, s: textOf(raw.s) } : null;
    case "chart":
      return { p: "chart", k, t };
    default:
      return itemSceneOf(raw, k, t);
  }
}

/** The scenes made of items: null when the items are missing. */
function itemSceneOf(raw: Record<string, unknown>, k: string, t: string): LiveScene | null {
  switch (raw.p) {
    case "compare": {
      const items = records(raw.items).map((item) => ({ l: textOf(item.l), v: textOf(item.v) }));
      return items.length > 0 ? { p: "compare", k, t, items } : null;
    }
    case "list": {
      const items = (Array.isArray(raw.items) ? raw.items : []).map(textOf).filter(Boolean);
      return items.length > 0 ? { p: "list", k, t, items } : null;
    }
    case "steps": {
      const steps = records(raw.steps).map((step) => ({
        l: textOf(step.l),
        s: oneOf(step.s, STEP_STATES, "todo"),
      }));
      return steps.length > 0 ? { p: "steps", k, t, steps } : null;
    }
    case "timeline": {
      const items = records(raw.items).map((item) => ({ w: textOf(item.w), l: textOf(item.l) }));
      return items.length > 0 ? { p: "timeline", k, t, items } : null;
    }
    case "status": {
      const items = records(raw.items).map((item) => ({
        l: textOf(item.l),
        s: oneOf(item.s, JOB_STATES, "running"),
        d: textOf(item.d),
      }));
      return items.length > 0 ? { p: "status", k, t, items } : null;
    }
    default:
      return null;
  }
}
