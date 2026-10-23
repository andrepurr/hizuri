import { promises as fs } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import {
  STAGE_VERSION,
  StageSchema,
  StageTabSchema,
  type Stage,
  type StageChange,
  type StageChrome,
  type StageTab,
} from "@getpaseo/protocol/stage";
import { z } from "zod";
import { writeJsonFileAtomic } from "../atomic-file.js";
import { collectBlockIds, type NormalizedBlock, type StageDepth } from "./blocks.js";

// Hizuri: the stage — one per agent, the tabs Zuri keeps on the user's screen. The
// daemon owns it so tabs survive a dropped connection, an app restart and a daemon restart.
//   $PASEO_HOME/stage/<agentId>.json          the stage (Zod-checked, atomic writes)
//   $PASEO_HOME/stage/history/<agentId>.json  the last versions of each tab, for stage_restore
//   $PASEO_HOME/stage/templates/<name>.json   compositions Zuri saved
// Every change runs in one queue per agent and is written before it is announced, so a client never
// sees a state the file does not hold. The main tab (the assistant's face and the chat) is not a
// stage tab: nothing here can close it.

export const MAX_OPEN_TABS = 12;
export const MAX_CLOSED_TABS = 20;
export const HISTORY_PER_TAB = 10;
export const MAX_TAB_BYTES = 800 * 1024;
export const MAX_TAB_CONTENT_BYTES = 256 * 1024;

const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const TAB_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;

const HistoryFileSchema = z.object({
  v: z.number().int(),
  tabs: z.record(z.string(), z.array(StageTabSchema)),
});
type HistoryFile = z.infer<typeof HistoryFileSchema>;

const TemplateSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  blocks: z.array(z.unknown()),
  data: z.record(z.string(), z.unknown()).optional(),
  savedAt: z.string().optional(),
});
export type StageTemplate = z.infer<typeof TemplateSchema>;

export type StageCloser = "agent" | "user";
export type StageListener = (change: StageChange) => void;

export class StageError extends Error {
  constructor(
    public readonly code: "invalid_agent" | "invalid_tab" | "not_found" | "too_large" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "StageError";
  }
}

export interface OpenTabInput {
  tabId?: string;
  title: string;
  icon?: string;
  blocks: NormalizedBlock[];
  data?: Record<string, unknown>;
  pin?: boolean;
  focus?: boolean;
  enter?: string;
  createdBy?: string;
}

export interface OpenTabResult {
  tab: StageTab;
  replaced: boolean;
  autoClosed: string[];
  revision: number;
}

export interface UpdateTabInput {
  tabId: string;
  title?: string;
  icon?: string;
  pin?: boolean;
  focus?: boolean;
  /** JSON pointer → value, written into the tab's data. */
  set?: Record<string, unknown>;
  unset?: string[];
  /** Blocks that take the place of the blocks with the same id. */
  replace?: NormalizedBlock[];
  append?: NormalizedBlock[];
  /** A layout block's id to append into; top level when absent. */
  appendTo?: string;
  remove?: string[];
}

export interface CloseTabResult {
  closed: boolean;
  deleted: boolean;
  revision: number;
}

export interface FocusInput {
  /** A tab id, or null for the main tab. Absent keeps the focus unless `view` is given. */
  tabId?: string | null;
  view?: "face" | "chat";
  bubble?: boolean;
}

export const PERCH_POSES = ["sit", "point", "lean"] as const;
export type PerchPose = (typeof PERCH_POSES)[number];

export interface PerchInput {
  tabId: string;
  blockId: string;
  pose: PerchPose;
  side?: "left" | "right";
  /** Bring the tab to the front (default true). */
  focus?: boolean;
}

export interface SlideInput {
  tabId: string;
  /** 1-based. */
  slide: number;
  /** Bring the tab to the front (default true). */
  focus?: boolean;
}

export interface SettingsInput {
  depth?: StageDepth;
  chrome?: StageChrome;
}

/** Turns a title into a tab id; a title that is not ASCII (Greek, Chinese) falls back to a hash. */
export function tabIdFromTitle(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (slug) return slug;
  let hash = 0;
  for (const char of title) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return `tab-${hash.toString(36)}`;
}

export function assertTabId(tabId: string): string {
  if (!TAB_ID.test(tabId)) {
    throw new StageError(
      "invalid_tab",
      `tab id “${tabId}” must be lowercase letters, digits and dashes, at most 48`,
    );
  }
  return tabId;
}

function assertAgentId(agentId: string): string {
  if (!AGENT_ID.test(agentId) || agentId.includes("..")) {
    throw new StageError("invalid_agent", `invalid agent id “${agentId}”`);
  }
  return agentId;
}

function emptyStage(agentId: string, now: string): Stage {
  return {
    v: STAGE_VERSION,
    agentId,
    revision: 0,
    tabs: [],
    closed: [],
    main: { view: "chat" },
    focus: null,
    depth: "simple",
    chrome: {},
    updatedAt: now,
  };
}

function decodePointer(pointer: string): string[] {
  if (!pointer.startsWith("/"))
    throw new StageError("invalid", `data path “${pointer}” must start with /`);
  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function setPointer(root: Record<string, unknown>, pointer: string, value: unknown): void {
  const parts = decodePointer(pointer);
  if (parts.length === 1 && parts[0] === "")
    throw new StageError("invalid", "data path / names no value");
  let node: Record<string, unknown> | unknown[] = root;
  for (const [index, part] of parts.entries()) {
    const last = index === parts.length - 1;
    if (Array.isArray(node)) {
      const at = part === "-" ? node.length : Number(part);
      if (!Number.isInteger(at) || at < 0 || at > node.length) {
        throw new StageError("invalid", `data path ${pointer}: no array index ${part}`);
      }
      if (last) {
        node[at] = value;
        return;
      }
      node[at] ??= {};
      node = node[at] as Record<string, unknown>;
      continue;
    }
    if (last) {
      node[part] = value;
      return;
    }
    const next = node[part];
    if (next === null || typeof next !== "object") node[part] = {};
    node = node[part] as Record<string, unknown>;
  }
}

function unsetPointer(root: Record<string, unknown>, pointer: string): void {
  const parts = decodePointer(pointer);
  let node: unknown = root;
  for (const part of parts.slice(0, -1)) {
    if (node === null || typeof node !== "object") return;
    node = (node as Record<string, unknown>)[part];
  }
  const last = parts[parts.length - 1]!;
  if (Array.isArray(node)) node.splice(Number(last), 1);
  else if (node !== null && typeof node === "object")
    delete (node as Record<string, unknown>)[last];
}

type BlockTree = Array<{ id?: string; children?: unknown }>;

function mapBlocks(
  blocks: BlockTree,
  visit: (block: { id?: string; children?: unknown }) => { id?: string; children?: unknown } | null,
): BlockTree {
  const out: BlockTree = [];
  for (const block of blocks) {
    const next = visit(block);
    if (!next) continue;
    if (Array.isArray(next.children)) {
      out.push({ ...next, children: mapBlocks(next.children as BlockTree, visit) });
    } else out.push(next);
  }
  return out;
}

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

function contentBytes(tab: StageTab): number {
  let html = 0;
  for (const block of tab.blocks as BlockTree) {
    const walk = (node: { props?: { html?: unknown }; children?: unknown }) => {
      if (typeof node.props?.html === "string") html += Buffer.byteLength(node.props.html);
      if (Array.isArray(node.children)) for (const child of node.children) walk(child);
    };
    walk(block as { props?: { html?: unknown } });
  }
  return byteLength(tab) - html;
}

/** The object without its undefined values, for optional fields. */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

function openedTab(args: {
  input: OpenTabInput;
  tabId: string;
  existing: StageTab | undefined;
  version: number;
  now: string;
}): StageTab {
  const { input, existing, now } = args;
  return {
    id: args.tabId,
    title: input.title,
    blocks: input.blocks,
    ...compact({
      icon: input.icon,
      data: input.data,
      pinned: (input.pin ?? existing?.pinned) ? true : undefined,
      enter: input.enter,
      createdBy: input.createdBy,
      seenAt: existing?.seenAt,
    }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: args.version,
  };
}

/** The tab's data after the update's set and unset; undefined when it has none. */
function editedData(current: StageTab, input: UpdateTabInput): Record<string, unknown> | undefined {
  if (!input.set && !input.unset) return current.data;
  const data = structuredClone(current.data ?? {});
  for (const [pointer, value] of Object.entries(input.set ?? {})) setPointer(data, pointer, value);
  for (const pointer of input.unset ?? []) unsetPointer(data, pointer);
  return data;
}

/** The tab's blocks after the update's replace, remove and append. */
function editedBlocks(current: StageTab, input: UpdateTabInput): BlockTree {
  const known = new Set(collectBlockIds(current.blocks));
  const replacements = new Map((input.replace ?? []).map((block) => [block.id, block]));
  const target = input.append?.length ? input.appendTo : undefined;
  for (const id of [...replacements.keys(), ...(input.remove ?? []), ...(target ? [target] : [])]) {
    if (!known.has(id)) {
      throw new StageError(
        "not_found",
        `tab “${current.id}” has no block “${id}”; its blocks: ${[...known].join(", ")}`,
      );
    }
  }
  const removals = new Set(input.remove ?? []);
  const blocks = mapBlocks(current.blocks as BlockTree, (block) => {
    if (block.id && removals.has(block.id)) return null;
    return (block.id && replacements.get(block.id)) || block;
  });
  const append = input.append ?? [];
  if (append.length === 0) return blocks;
  if (!target) return [...blocks, ...append];
  return mapBlocks(blocks, (block) =>
    block.id === target
      ? { ...block, children: [...((block.children as BlockTree | undefined) ?? []), ...append] }
      : block,
  );
}

function restoreSource(args: {
  tabId: string;
  version: number | undefined;
  versions: StageTab[];
  open: boolean;
}): StageTab {
  const { tabId, version, versions, open } = args;
  if (version !== undefined) {
    const found = versions.find((entry) => entry.version === version);
    if (found) return found;
  } else if (!open) {
    const last = versions.at(-1);
    if (last) return last;
  }
  const kept = versions.map((entry) => entry.version).join(", ") || "none";
  if (version !== undefined) {
    throw new StageError(
      "not_found",
      `tab “${tabId}” has no kept version ${version} (kept: ${kept})`,
    );
  }
  if (open) {
    throw new StageError(
      "not_found",
      `tab “${tabId}” is open; pass the version to go back to (kept: ${kept})`,
    );
  }
  throw new StageError("not_found", `nothing kept for tab “${tabId}”`);
}

function withoutPerch(main: Stage["main"]): Stage["main"] {
  const { perch: _perch, ...rest } = main;
  return rest;
}

/** The assistant leaves a block that is gone: its tab closed or the block removed. */
function dropStalePerch(stage: Stage): void {
  const perch = stage.main.perch;
  if (!perch) return;
  const tab = stage.tabs.find((candidate) => candidate.id === perch.tab);
  if (tab && collectBlockIds(tab.blocks).includes(perch.block)) return;
  stage.main = withoutPerch(stage.main);
}

function withoutSlide(main: Stage["main"], tabId: string): Stage["main"] {
  const { [tabId]: _gone, ...slides } = main.slides ?? {};
  if (Object.keys(slides).length > 0) return { ...main, slides };
  const { slides: _slides, ...rest } = main;
  return rest;
}

/** A slide belongs to the page it was set on: a closed tab or new content starts over. */
function dropStaleSlides(stage: Stage): void {
  for (const [tabId, slide] of Object.entries(stage.main.slides ?? {})) {
    const tab = stage.tabs.find((candidate) => candidate.id === tabId);
    if (!tab || tab.version !== slide.version) stage.main = withoutSlide(stage.main, tabId);
  }
}

interface Draft {
  stage: Stage;
  history: HistoryFile;
  historyChanged: boolean;
  /** False for changes only Zuri reads (what the user looks at): no new revision, no broadcast. */
  announce: boolean;
}

export interface StageStoreOptions {
  paseoHome: string;
  logger: Logger;
  now?: () => Date;
}

export class StageStore {
  private readonly dir: string;
  private readonly logger: Logger;
  private readonly now: () => Date;
  private readonly stages = new Map<string, Stage>();
  private readonly histories = new Map<string, HistoryFile>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly listeners = new Map<string, Set<StageListener>>();

  constructor(options: StageStoreOptions) {
    this.dir = path.join(options.paseoHome, "stage");
    this.logger = options.logger;
    this.now = options.now ?? (() => new Date());
  }

  async get(agentId: string): Promise<Stage> {
    assertAgentId(agentId);
    return this.enqueue(agentId, async () => structuredClone(await this.loadStage(agentId)));
  }

  subscribe(agentId: string, listener: StageListener): () => void {
    assertAgentId(agentId);
    let set = this.listeners.get(agentId);
    if (!set) {
      set = new Set();
      this.listeners.set(agentId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(agentId);
    };
  }

  async open(agentId: string, input: OpenTabInput): Promise<OpenTabResult> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      const tabId = assertTabId(input.tabId ?? tabIdFromTitle(input.title));
      const existingIndex = stage.tabs.findIndex((tab) => tab.id === tabId);
      const existing = stage.tabs[existingIndex];
      const tab = openedTab({
        input,
        tabId,
        existing,
        version: (existing?.version ?? draft.history.tabs[tabId]?.at(-1)?.version ?? 0) + 1,
        now,
      });
      this.checkSize(tab);
      if (existing) {
        this.pushHistory(draft, existing);
        stage.tabs[existingIndex] = tab;
      } else {
        stage.tabs.push(tab);
        stage.closed = stage.closed.filter((entry) => entry.id !== tabId);
      }
      const autoClosed = this.closeOverflow(draft, tabId, now);
      if (input.focus !== false) stage.focus = tabId;
      return { tab, replaced: Boolean(existing), autoClosed };
    }).then(({ result, revision }) => ({ ...result, revision }));
  }

  async update(
    agentId: string,
    input: UpdateTabInput,
  ): Promise<{ tab: StageTab; revision: number }> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      const index = this.requireOpenTab(stage, input.tabId);
      const current = stage.tabs[index]!;
      const data = editedData(current, input);
      const tab: StageTab = {
        ...current,
        ...compact({ title: input.title, icon: input.icon }),
        blocks: editedBlocks(current, input) as StageTab["blocks"],
        ...(data ? { data } : {}),
        updatedAt: now,
        version: current.version + 1,
      };
      if (input.pin === true) tab.pinned = true;
      if (input.pin === false) delete tab.pinned;
      this.checkSize(tab);
      this.pushHistory(draft, current);
      stage.tabs[index] = tab;
      if (input.focus) stage.focus = tab.id;
      return { tab };
    }).then(({ result, revision }) => ({ ...result, revision }));
  }

  async close(
    agentId: string,
    input: { tabId: string; by: StageCloser; delete?: boolean; exit?: string },
  ): Promise<CloseTabResult> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      const open = stage.tabs.some((tab) => tab.id === input.tabId);
      const wasClosed = stage.closed.some((entry) => entry.id === input.tabId);
      if (open) this.closeOpenTab(draft, input.tabId, input.by, now, input.exit);
      else if (!wasClosed && !(input.delete && draft.history.tabs[input.tabId])) {
        // Closing twice is harmless: a tab the user closed offline may already be gone.
        if (input.by === "user") return { closed: false, deleted: false };
        throw new StageError(
          "not_found",
          `no tab “${input.tabId}”; open: ${stage.tabs.map((tab) => tab.id).join(", ") || "none"}`,
        );
      }
      if (input.delete) {
        stage.closed = stage.closed.filter((entry) => entry.id !== input.tabId);
        if (draft.history.tabs[input.tabId]) {
          delete draft.history.tabs[input.tabId];
          draft.historyChanged = true;
        }
      }
      return { closed: open, deleted: input.delete === true };
    }).then(({ result, revision }) => ({ ...result, revision }));
  }

  async focus(agentId: string, input: FocusInput): Promise<{ revision: number }> {
    return this.mutate(agentId, (draft) => {
      const { stage } = draft;
      if (typeof input.tabId === "string") {
        this.requireOpenTab(stage, input.tabId);
        stage.focus = input.tabId;
      } else if (input.tabId === null || input.view) stage.focus = null;
      if (input.view) stage.main = { ...stage.main, view: input.view };
      if (input.bubble !== undefined) stage.main = { ...stage.main, bubble: input.bubble };
      return {};
    }).then(({ revision }) => ({ revision }));
  }

  /**
   * Zuri perches on a block of an open tab (stage_perch), or leaves it (null). A new perch has a
   * new `at`, so the app plays the assistant's hop even onto the same block.
   */
  async perch(agentId: string, input: PerchInput | null): Promise<{ revision: number }> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      if (!input) {
        stage.main = withoutPerch(stage.main);
        return {};
      }
      const tab = stage.tabs[this.requireOpenTab(stage, input.tabId)]!;
      const blocks = collectBlockIds(tab.blocks);
      if (!blocks.includes(input.blockId)) {
        throw new StageError(
          "not_found",
          `tab “${tab.id}” has no block “${input.blockId}”; its blocks: ${blocks.join(", ")}`,
        );
      }
      stage.main = {
        ...stage.main,
        perch: {
          tab: tab.id,
          block: input.blockId,
          pose: input.pose,
          ...(input.side ? { side: input.side } : {}),
          at: now,
        },
      };
      if (input.focus !== false) stage.focus = tab.id;
      return {};
    }).then(({ revision }) => ({ revision }));
  }

  /**
   * Zuri flips the live page of an open tab to a slide. Only the small frame changes, so the page
   * is not sent again and the app moves the open page instead of reloading it.
   */
  async slide(agentId: string, input: SlideInput): Promise<{ revision: number }> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      const tab = stage.tabs[this.requireOpenTab(stage, input.tabId)]!;
      if (!tab.blocks.some((block) => block.type === "web")) {
        throw new StageError(
          "invalid",
          `tab “${tab.id}” holds no page; slides flip a live page opened with show_file`,
        );
      }
      stage.main = {
        ...stage.main,
        slides: {
          ...stage.main.slides,
          [tab.id]: { slide: input.slide, version: tab.version, at: now },
        },
      };
      if (input.focus !== false) stage.focus = tab.id;
      return {};
    }).then(({ revision }) => ({ revision }));
  }

  /** Reopens a closed tab, or brings back an older version of a tab ("put it back as it was"). */
  async restore(
    agentId: string,
    input: { tabId: string; version?: number; focus?: boolean },
  ): Promise<{ tab: StageTab; revision: number }> {
    return this.mutate(agentId, (draft, now) => {
      const { stage } = draft;
      const versions = draft.history.tabs[input.tabId] ?? [];
      const openIndex = stage.tabs.findIndex((tab) => tab.id === input.tabId);
      const current = stage.tabs[openIndex];
      const source = restoreSource({
        tabId: input.tabId,
        version: input.version,
        versions,
        open: Boolean(current),
      });
      const latest = Math.max(current?.version ?? 0, ...versions.map((entry) => entry.version));
      const tab: StageTab = { ...structuredClone(source), updatedAt: now, version: latest + 1 };
      if (current) {
        this.pushHistory(draft, current);
        stage.tabs[openIndex] = tab;
      } else {
        stage.tabs.push(tab);
        stage.closed = stage.closed.filter((entry) => entry.id !== input.tabId);
      }
      if (input.focus !== false) stage.focus = tab.id;
      return { tab };
    }).then(({ result, revision }) => ({ ...result, revision }));
  }

  async settings(agentId: string, input: SettingsInput): Promise<{ revision: number }> {
    return this.mutate(agentId, (draft) => {
      if (input.depth) draft.stage.depth = input.depth;
      if (input.chrome) draft.stage.chrome = { ...draft.stage.chrome, ...input.chrome };
      return {};
    }).then(({ revision }) => ({ revision }));
  }

  /** What the user has on screen. Only Zuri reads it (stage_list): no new revision, no broadcast. */
  async reportFocus(
    agentId: string,
    input: { focus: string | null; view?: string },
  ): Promise<void> {
    await this.mutate(agentId, (draft, now) => {
      draft.announce = false;
      const { stage } = draft;
      stage.viewing = { focus: input.focus, ...(input.view ? { view: input.view } : {}), at: now };
      const tab = input.focus ? stage.tabs.find((candidate) => candidate.id === input.focus) : null;
      if (tab) tab.seenAt = now;
      return {};
    });
  }

  async listTemplates(): Promise<StageTemplate[]> {
    const dir = path.join(this.dir, "templates");
    const names = await fs.readdir(dir).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [] as string[];
      throw error;
    });
    const templates: StageTemplate[] = [];
    for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
      const parsed = TemplateSchema.safeParse(
        JSON.parse(await fs.readFile(path.join(dir, name), "utf8")),
      );
      if (parsed.success) templates.push(parsed.data);
      else this.logger.warn({ file: name }, "Skipping an unreadable stage template");
    }
    return templates;
  }

  async saveTemplate(template: StageTemplate): Promise<void> {
    const name = assertTabId(template.name);
    await writeJsonFileAtomic(path.join(this.dir, "templates", `${name}.json`), {
      ...template,
      savedAt: this.now().toISOString(),
    });
  }

  async deleteTemplate(name: string): Promise<boolean> {
    const file = path.join(this.dir, "templates", `${assertTabId(name)}.json`);
    try {
      await fs.rm(file);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  private requireOpenTab(stage: Stage, tabId: string): number {
    const index = stage.tabs.findIndex((tab) => tab.id === tabId);
    if (index < 0) {
      const closed = stage.closed.some((entry) => entry.id === tabId);
      throw new StageError(
        "not_found",
        closed
          ? `tab “${tabId}” is closed; stage_restore reopens it`
          : `no open tab “${tabId}”; open: ${stage.tabs.map((tab) => tab.id).join(", ") || "none"}`,
      );
    }
    return index;
  }

  /** Keeps at most MAX_OPEN_TABS open: the oldest unpinned tab other than `keep` closes. */
  private closeOverflow(draft: Draft, keep: string, now: string): string[] {
    const autoClosed: string[] = [];
    while (draft.stage.tabs.length > MAX_OPEN_TABS) {
      const oldest = draft.stage.tabs
        .filter((candidate) => !candidate.pinned && candidate.id !== keep)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
      if (!oldest) {
        throw new StageError(
          "too_large",
          `${MAX_OPEN_TABS} tabs are open and all are pinned; close or unpin one first`,
        );
      }
      this.closeOpenTab(draft, oldest.id, "agent", now);
      autoClosed.push(oldest.id);
    }
    return autoClosed;
  }

  private closeOpenTab(
    draft: Draft,
    tabId: string,
    by: StageCloser,
    now: string,
    exit?: string,
  ): void {
    const { stage } = draft;
    const tab = stage.tabs.find((candidate) => candidate.id === tabId)!;
    stage.tabs = stage.tabs.filter((candidate) => candidate.id !== tabId);
    this.pushHistory(draft, tab);
    stage.closed = [
      ...stage.closed.filter((entry) => entry.id !== tabId),
      { id: tab.id, title: tab.title, closedAt: now, closedBy: by, ...(exit ? { exit } : {}) },
    ].slice(-MAX_CLOSED_TABS);
    if (stage.focus === tabId) stage.focus = null;
  }

  private pushHistory(draft: Draft, tab: StageTab): void {
    const kept = draft.history.tabs[tab.id] ?? [];
    draft.history.tabs[tab.id] = [
      ...kept.filter((entry) => entry.version !== tab.version),
      tab,
    ].slice(-HISTORY_PER_TAB);
    draft.historyChanged = true;
  }

  private checkSize(tab: StageTab): void {
    const total = byteLength(tab);
    if (total > MAX_TAB_BYTES) {
      throw new StageError(
        "too_large",
        `tab “${tab.id}” is ${Math.round(total / 1024)} KB; the limit is ${MAX_TAB_BYTES / 1024} KB`,
      );
    }
    const content = contentBytes(tab);
    if (content > MAX_TAB_CONTENT_BYTES) {
      throw new StageError(
        "too_large",
        `tab “${tab.id}” holds ${Math.round(content / 1024)} KB besides web HTML; the limit is ${MAX_TAB_CONTENT_BYTES / 1024} KB — split it or use links for pictures`,
      );
    }
  }

  private async mutate<T>(
    agentId: string,
    change: (draft: Draft, now: string) => T,
  ): Promise<{ result: T; revision: number }> {
    assertAgentId(agentId);
    return this.enqueue(agentId, async () => {
      const before = await this.loadStage(agentId);
      const history = await this.loadHistory(agentId);
      const now = this.now().toISOString();
      const draft: Draft = {
        stage: structuredClone(before),
        history: structuredClone(history),
        historyChanged: false,
        announce: true,
      };
      const result = change(draft, now);
      const next = draft.stage;
      dropStalePerch(next);
      dropStaleSlides(next);
      const changed =
        JSON.stringify({ ...before, revision: 0, updatedAt: "", viewing: null }) !==
        JSON.stringify({ ...next, revision: 0, updatedAt: "", viewing: null });
      if (draft.announce && changed) {
        next.revision = before.revision + 1;
        next.updatedAt = now;
      }
      if (changed || JSON.stringify(before.viewing) !== JSON.stringify(next.viewing)) {
        await writeJsonFileAtomic(this.stageFile(agentId), next);
        this.stages.set(agentId, next);
      }
      if (draft.historyChanged) {
        await writeJsonFileAtomic(this.historyFile(agentId), draft.history);
        this.histories.set(agentId, draft.history);
      }
      if (draft.announce && changed) this.announce(before, next);
      return { result, revision: next.revision };
    });
  }

  private announce(before: Stage, next: Stage): void {
    const listeners = this.listeners.get(next.agentId);
    if (!listeners?.size) return;
    const previous = new Map(before.tabs.map((tab) => [tab.id, tab]));
    const change: StageChange = {
      agentId: next.agentId,
      revision: next.revision,
      previousRevision: before.revision,
      upserted: next.tabs.filter((tab) => {
        const old = previous.get(tab.id);
        return !old || old.version !== tab.version || JSON.stringify(old) !== JSON.stringify(tab);
      }),
      removed: before.tabs
        .map((tab) => tab.id)
        .filter((id) => !next.tabs.some((tab) => tab.id === id)),
      order: next.tabs.map((tab) => tab.id),
      closed: next.closed,
      main: next.main,
      focus: next.focus,
      depth: next.depth,
      chrome: next.chrome,
      updatedAt: next.updatedAt,
    };
    for (const listener of listeners) {
      try {
        listener(structuredClone(change));
      } catch (error) {
        this.logger.warn({ err: error, agentId: next.agentId }, "A stage listener failed");
      }
    }
  }

  private enqueue<T>(agentId: string, run: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(agentId) ?? Promise.resolve();
    const next = previous.then(run, run);
    const settled = next.catch(() => undefined);
    this.queues.set(agentId, settled);
    void settled.then(() => {
      if (this.queues.get(agentId) === settled) this.queues.delete(agentId);
      return undefined;
    });
    return next;
  }

  private stageFile(agentId: string): string {
    return path.join(this.dir, `${agentId}.json`);
  }

  private historyFile(agentId: string): string {
    return path.join(this.dir, "history", `${agentId}.json`);
  }

  private async loadStage(agentId: string): Promise<Stage> {
    const cached = this.stages.get(agentId);
    if (cached) return cached;
    const stage =
      (await this.readJson(this.stageFile(agentId), StageSchema)) ??
      emptyStage(agentId, this.now().toISOString());
    this.stages.set(agentId, stage);
    return stage;
  }

  private async loadHistory(agentId: string): Promise<HistoryFile> {
    const cached = this.histories.get(agentId);
    if (cached) return cached;
    const history = (await this.readJson(this.historyFile(agentId), HistoryFileSchema)) ?? {
      v: STAGE_VERSION,
      tabs: {},
    };
    this.histories.set(agentId, history);
    return history;
  }

  /** Missing → null. Unreadable → set aside as .corrupt-<time> and logged, then null. */
  private async readJson<T>(file: string, schema: z.ZodType<T>): Promise<T | null> {
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let parsed: z.ZodSafeParseResult<T> | null = null;
    try {
      parsed = schema.safeParse(JSON.parse(raw));
    } catch {
      parsed = null;
    }
    if (parsed?.success) return parsed.data;
    const aside = `${file}.corrupt-${Date.now()}`;
    await fs.rename(file, aside);
    this.logger.warn({ file, aside }, "Stage file unreadable; set aside and started empty");
    return null;
  }
}
