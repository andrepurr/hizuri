import type { StreamItem } from "@/types/stream";

// The Show window is drawn straight from the agent timeline: every `show_*` tool call already
// reaches the app with its name and input, so the daemon keeps no Show state. The tool
// vocabulary lives in packages/server/src/server/show-tools/vocabulary.ts; this file reads it
// back tolerantly (an unknown prop is ignored, a newer widget kind is skipped) because the
// daemon may be newer than the app.

export const SHOW_WIDGET_KINDS = ["stat", "progress", "card", "table", "chart", "limits"] as const;
export type ShowWidgetKind = (typeof SHOW_WIDGET_KINDS)[number];

export type ShowWidgetStatus = "running" | "completed";

export interface ShowWidget {
  id: string;
  kind: ShowWidgetKind;
  props: Record<string, unknown>;
  status: ShowWidgetStatus;
}

/** A window that streams the agent's browser instead of drawing widgets (show_screen). */
export interface ShowScreen {
  /** The stream page from the daemon config; null until the call completes. */
  url: string | null;
}

export interface ShowWindow {
  id: string;
  title: string;
  widgets: ShowWidget[];
  screen: ShowScreen | null;
}

export interface ShowState {
  windows: ShowWindow[];
  activeWindowId: string | null;
  /** The newest show_* call, so the host can tell a new call from a re-render. */
  lastCall: { id: string; at: number } | null;
}

export const EMPTY_SHOW_STATE: ShowState = { windows: [], activeWindowId: null, lastCall: null };

export const DEFAULT_WINDOW_TITLE = "Show";
export const LIMITS_WINDOW_TITLE = "Limits";
/** Mirrors SHOW_SCREEN_WINDOW in the server's show tools. */
export const SCREEN_WINDOW_TITLE = "Screen";
/** Mirrors LIVE_TAB_TITLE in the server's live scenes: the tab the visual front draws. */
export const LIVE_WINDOW_TITLE = "Now";
/** Mirrors MEDIA_WINDOW_TITLE in the server's media tools: the player tab with no title. */
export const PLAYER_WINDOW_TITLE = "Player";
const LIMITS_WIDGET_ID = "limits";

const MCP_NAME_PATTERN = /^mcp__.+?__(.+)$/;

/** show_media plays on the media player (show-media/), not on the Show stage. */
const NOT_SHOW_TOOLS = new Set(["show_media"]);

/** `show_stat`, `mcp__paseo__show_stat` → `show_stat`; anything else → null. */
export function showToolName(name: string): string | null {
  const bare = MCP_NAME_PATTERN.exec(name)?.[1] ?? name;
  return bare.startsWith("show_") && !NOT_SHOW_TOOLS.has(bare) ? bare : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 40) : null;
}

export function windowIdForTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Mirrors defaultShowWidgetId in the server vocabulary: kind plus label or title. */
export function defaultWidgetId(kind: ShowWidgetKind, props: Record<string, unknown>): string {
  const label = props.label ?? props.title;
  const name = typeof label === "string" ? label.trim().toLowerCase() : "";
  return name ? `${kind}:${name}` : kind;
}

function collectText(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const parts = output
      .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : null))
      .filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join("\n") : null;
  }
  if (isRecord(output) && typeof output.text === "string") return output.text;
  return null;
}

/**
 * Finds the JSON record a show tool answered with. The Claude provider hands it over parsed under
 * `output` (agent/providers/claude/agent.ts buildToolOutput); others may pass text or blocks.
 */
function findOutputRecord(
  output: unknown,
  matches: (record: Record<string, unknown>) => boolean,
  depth = 0,
): Record<string, unknown> | null {
  if (isRecord(output) && matches(output)) return output;
  if (depth < 3 && isRecord(output)) {
    const nested = output.output ?? output.structuredContent;
    if (nested !== undefined) return findOutputRecord(nested, matches, depth + 1);
  }
  const text = collectText(output);
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start));
    return isRecord(parsed) && matches(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** show_limits answers with `{ ok, sources }` JSON. */
export function parseLimitsOutput(output: unknown): Record<string, unknown> | null {
  const record = findOutputRecord(output, (value) => Array.isArray(value.sources));
  return record ? { sources: record.sources } : null;
}

/**
 * show_screen answers with `{ ok, window, screen: { url } }`. Only an http(s) URL is loaded: the
 * frame runs it as a web page.
 */
export function parseScreenOutput(output: unknown): string | null {
  const record = findOutputRecord(output, (value) => isRecord(value.screen));
  const url = isRecord(record?.screen) ? record.screen.url : null;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * The stream page as the user opens it. Selkies treats a `#shared` viewer as watch-only (taps
 * and keys do nothing); the plain page takes over the mouse and keyboard. Selkies reads the hash
 * once at load, so a switch needs a fresh page, not a hash change.
 */
export function screenStreamUrl(url: string, control: boolean): string {
  const base = url.split("#")[0] ?? url;
  return control ? base : `${base}#shared`;
}

interface ShowCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  status: ShowWidgetStatus;
  at: number;
}

function readShowCall(item: StreamItem): ShowCall | null {
  if (item.kind !== "tool_call" || item.payload.source !== "agent") return null;
  const data = item.payload.data;
  const name = showToolName(data.name);
  if (!name) return null;
  // A call the daemon rejected (bad props) or the user stopped draws nothing.
  if (data.status === "failed" || data.status === "canceled") return null;
  const detail = data.detail;
  const input = detail.type === "unknown" && isRecord(detail.input) ? detail.input : {};
  const output = detail.type === "unknown" ? detail.output : null;
  return {
    id: data.callId,
    name,
    input,
    output,
    status: data.status === "completed" ? "completed" : "running",
    at: item.timestamp.getTime(),
  };
}

function widgetKindForTool(name: string): ShowWidgetKind | null {
  const kind = name.slice("show_".length);
  return (SHOW_WIDGET_KINDS as readonly string[]).includes(kind) && kind !== "limits"
    ? (kind as ShowWidgetKind)
    : null;
}

/** The props the page draws: the call input without its placement keys. */
function widgetProps(input: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key !== "id" && key !== "window") props[key] = value;
  }
  return props;
}

/**
 * Widget calls and show_window draw once they complete. While a call runs, its input is still
 * streaming in one top-level key at a time (the Claude provider pushes a running update per key),
 * so a running update of a table carries its title and columns but no rows for as long as Zuri
 * writes them (~30 s for a 24-row table). show_limits and show_screen keep their running states:
 * their inputs are tiny, and while they run they mean "still fetching".
 */
function drawsWhileRunning(name: string): boolean {
  return name === "show_limits" || name === "show_screen";
}

/** The window a drawing call names; undefined while its input has no `window` key yet. */
function namedWindowId(call: ShowCall): string | undefined {
  const title = readTitle(call.input.window);
  if (title) return windowIdForTitle(title);
  if (call.name === "show_limits") return windowIdForTitle(LIMITS_WINDOW_TITLE);
  if (call.name === "show_screen") return windowIdForTitle(SCREEN_WINDOW_TITLE);
  return undefined;
}

/**
 * Whether a later call may fill the window `closeIndex` closes: Zuri clears a window by closing it
 * and showing new widgets in it, often in one message. Until the refill lands the window keeps its
 * old content, so the stage never drops to another window or to nothing in between. A running call
 * that names no window yet counts only while it began before the close returned (its `at` is still
 * its start then): that is the refill streaming in the same message. A call that starts after the
 * close returned is the assistant's next message; holding the close for it would bring the closed
 * window back on stage until the call's first key lands.
 */
function isRefilledLater(
  calls: readonly ShowCall[],
  closeIndex: number,
  windowId: string,
): boolean {
  const closedAt = calls[closeIndex]?.at ?? 0;
  for (const later of calls.slice(closeIndex + 1)) {
    if (later.name === "show_window" || later.name === "show_page") continue;
    const target = namedWindowId(later);
    if (target === windowId) return true;
    if (target === undefined && later.status === "running" && later.at <= closedAt) return true;
  }
  return false;
}

class ShowStateBuilder {
  private readonly windows = new Map<string, ShowWindow>();
  /** Closed windows kept on stage until the call that refills them completes. */
  private readonly refilling = new Set<string>();
  private activeWindowId: string | null = null;
  private lastCall: ShowState["lastCall"] = null;
  private lastLimits: Record<string, unknown> | null = null;

  apply(call: ShowCall, refilledLater: (windowId: string) => boolean): void {
    // show_page moves the phone between its pages (agent-pages/model.ts); it shows nothing.
    if (call.name === "show_page") return;
    if (call.status === "running" && !drawsWhileRunning(call.name)) return;
    this.lastCall = { id: call.id, at: call.at };
    if (call.name === "show_window") {
      this.applyWindowCall(call, refilledLater);
      return;
    }
    if (call.name === "show_screen") {
      const window = this.openWindow(SCREEN_WINDOW_TITLE);
      window.screen = {
        url: call.status === "completed" ? parseScreenOutput(call.output) : null,
      };
      return;
    }
    if (call.name === "show_limits") {
      const parsed = call.status === "completed" ? parseLimitsOutput(call.output) : null;
      if (parsed) this.lastLimits = parsed;
      // A refresh still running (or waiting on a permission) keeps the rings the assistant showed
      // last, so they never drop back to "loading"; a result that does not parse shows "no data".
      const props = parsed ?? this.lastLimits;
      const window = this.openWindow(readTitle(call.input.window) ?? LIMITS_WINDOW_TITLE);
      this.upsert(window, {
        id: LIMITS_WIDGET_ID,
        kind: "limits",
        props: props ?? {},
        status: props || call.status === "completed" ? "completed" : "running",
      });
      return;
    }
    const kind = widgetKindForTool(call.name);
    if (!kind) return;
    const title = readTitle(call.input.window) ?? this.activeTitle() ?? DEFAULT_WINDOW_TITLE;
    const props = widgetProps(call.input);
    const explicitId = call.input.id;
    const id =
      typeof explicitId === "string" && explicitId.trim()
        ? explicitId.trim()
        : defaultWidgetId(kind, props);
    this.upsert(this.openWindow(title), { id, kind, props, status: call.status });
  }

  build(): ShowState {
    return {
      windows: [...this.windows.values()],
      activeWindowId: this.activeWindowId,
      lastCall: this.lastCall,
    };
  }

  private applyWindowCall(call: ShowCall, refilledLater: (windowId: string) => boolean): void {
    const title = readTitle(call.input.window);
    if (!title) return;
    const id = windowIdForTitle(title);
    if (call.input.action === "close") {
      if (this.windows.has(id) && refilledLater(id)) {
        this.refilling.add(id);
        return;
      }
      this.refilling.delete(id);
      this.windows.delete(id);
      if (this.activeWindowId === id) {
        this.activeWindowId = [...this.windows.keys()].at(-1) ?? null;
      }
      return;
    }
    if (this.windows.has(id) && !this.refilling.has(id)) this.activeWindowId = id;
  }

  private activeTitle(): string | null {
    return this.activeWindowId ? (this.windows.get(this.activeWindowId)?.title ?? null) : null;
  }

  private openWindow(title: string): ShowWindow {
    const id = windowIdForTitle(title);
    // The first write after a close starts the window afresh, as if it had been closed then.
    if (this.refilling.delete(id)) this.windows.delete(id);
    let window = this.windows.get(id);
    if (!window) {
      window = { id, title, widgets: [], screen: null };
      this.windows.set(id, window);
    }
    this.activeWindowId = id;
    return window;
  }

  private upsert(window: ShowWindow, widget: ShowWidget): void {
    const index = window.widgets.findIndex((existing) => existing.id === widget.id);
    if (index >= 0) {
      window.widgets[index] = widget;
    } else {
      window.widgets.push(widget);
    }
  }
}

/** Replays every show_* call in the timeline into windows and their widgets. */
export function deriveShowState(items: readonly StreamItem[]): ShowState {
  const calls = items.map(readShowCall).filter((call): call is ShowCall => call !== null);
  if (calls.length === 0) return EMPTY_SHOW_STATE;
  const builder = new ShowStateBuilder();
  calls.forEach((call, index) => {
    builder.apply(call, (windowId) => isRefilledLater(calls, index, windowId));
  });
  return builder.build();
}

/** The window the user sees: their own pick until Zuri shows something newer. */
export function resolveVisibleWindowId(input: {
  state: ShowState;
  userPick: { windowId: string; afterCallId: string | null } | null;
}): string | null {
  const { state, userPick } = input;
  if (
    userPick &&
    userPick.afterCallId === (state.lastCall?.id ?? null) &&
    state.windows.some((window) => window.id === userPick.windowId)
  ) {
    return userPick.windowId;
  }
  return state.activeWindowId;
}

/** A show call the host should open the window for: new to this mount and recent. */
export function isFreshShowCall(input: {
  lastCall: ShowState["lastCall"];
  seenCallId: string | null;
  now: number;
  maxAgeMs?: number;
}): boolean {
  const { lastCall, seenCallId, now, maxAgeMs = 2 * 60_000 } = input;
  if (!lastCall || lastCall.id === seenCallId) return false;
  return now - lastCall.at <= maxAgeMs;
}

const EMPTY_ITEMS: StreamItem[] = [];

function isShowCallItem(item: StreamItem): boolean {
  return (
    item.kind === "tool_call" &&
    item.payload.source === "agent" &&
    showToolName(item.payload.data.name) !== null
  );
}

/**
 * The agent's show_* calls from the committed tail and the live head, in timeline order. Callers
 * compare the result shallowly, so a streamed token elsewhere in the timeline re-renders nothing.
 */
export function selectShowItems(
  session:
    | { agentStreamTail: Map<string, StreamItem[]>; agentStreamHead: Map<string, StreamItem[]> }
    | undefined,
  agentId: string,
): StreamItem[] {
  if (!session) return EMPTY_ITEMS;
  const byId = new Map<string, StreamItem>();
  for (const list of [session.agentStreamTail.get(agentId), session.agentStreamHead.get(agentId)]) {
    for (const item of list ?? EMPTY_ITEMS) {
      if (!isShowCallItem(item)) continue;
      byId.delete(item.id);
      byId.set(item.id, item);
    }
  }
  return byId.size > 0 ? [...byId.values()] : EMPTY_ITEMS;
}
