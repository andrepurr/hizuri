import type { StreamItem } from "@/types/stream";

// Show window, media lanes: the app runs what Zuri's show_media / media_control calls ask of it,
// reading each call straight from the agent timeline (its apps and its commands; the player tab
// itself comes on the stage). The daemon picks
// the lane and answers with JSON text (packages/server/src/server/show-media/plan.ts); this file
// reads it back tolerantly, because the daemon may be newer than the app: an unknown lane or
// action is skipped, never guessed.

export type MediaApp = "youtube" | "youtube_music" | "spotify" | "netflix";
const MEDIA_APPS: readonly MediaApp[] = [
  "youtube",
  "youtube_music",
  "spotify",
  "netflix",
];

export type VideoContentType = "auto" | "hls" | "dash" | "progressive";

export interface VideoPlan {
  lane: "video";
  uri: string;
  contentType: VideoContentType;
  title: string | null;
  startAt: number | null;
  queue: string[];
}

export interface YoutubePlan {
  lane: "youtube";
  videoId: string | null;
  playlistId: string | null;
  title: string | null;
  startAt: number | null;
  queue: string[];
}

export interface AppPlan {
  lane: "app";
  app: MediaApp;
  url: string;
  androidPackage: string;
  query: string | null;
  playFromSearch: boolean;
}

export type ShowMediaPlan = VideoPlan | YoutubePlan | AppPlan;
export type PlayerPlan = VideoPlan | YoutubePlan;

export type MediaCommand =
  | { action: "play" | "pause" | "next" | "previous" | "stop" }
  | { action: "seek"; position: number | null; offset: number | null }
  | { action: "volume"; volume: number };

export type MediaCall =
  | { kind: "show"; id: string; at: number; plan: ShowMediaPlan }
  | { kind: "control"; id: string; at: number; command: MediaCommand };

const MCP_NAME_PATTERN = /^mcp__.+?__(.+)$/;
const MEDIA_TOOLS = new Set(["show_media", "media_control"]);

/** `show_media`, `mcp__paseo__media_control` → the bare name; anything else → null. */
export function mediaToolName(name: string): "show_media" | "media_control" | null {
  const bare = MCP_NAME_PATTERN.exec(name)?.[1] ?? name;
  return MEDIA_TOOLS.has(bare) ? (bare as "show_media" | "media_control") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
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
 * The tool answer `{ ok, plan | command }`. The Claude provider hands it over parsed under
 * `output` (agent/providers/claude/agent.ts buildToolOutput); others may pass the object, the
 * text or content blocks.
 */
export function readToolAnswer(output: unknown, depth = 0): Record<string, unknown> | null {
  if (isRecord(output) && output.ok === true) return output;
  if (depth < 3 && isRecord(output)) {
    const nested = output.output ?? output.structuredContent;
    if (nested !== undefined) return readToolAnswer(nested, depth + 1);
  }
  const text = collectText(output);
  if (!text) return null;
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(start));
    return isRecord(parsed) && parsed.ok === true ? parsed : null;
  } catch {
    return null;
  }
}

export function readMediaPlan(value: unknown): ShowMediaPlan | null {
  if (!isRecord(value)) return null;
  switch (value.lane) {
    case "video": {
      const uri = stringOrNull(value.uri);
      if (!uri) return null;
      const contentType = (["hls", "dash", "progressive"] as const).find(
        (type) => type === value.contentType,
      );
      return {
        lane: "video",
        uri,
        contentType: contentType ?? "auto",
        title: stringOrNull(value.title),
        startAt: numberOrNull(value.startAt),
        queue: strings(value.queue),
      };
    }
    case "youtube": {
      const videoId = stringOrNull(value.videoId);
      const playlistId = stringOrNull(value.playlistId);
      if (!videoId && !playlistId) return null;
      return {
        lane: "youtube",
        videoId,
        playlistId,
        title: stringOrNull(value.title),
        startAt: numberOrNull(value.startAt),
        queue: strings(value.queue),
      };
    }
    case "app": {
      const app = MEDIA_APPS.find((candidate) => candidate === value.app);
      const url = stringOrNull(value.url);
      const androidPackage = stringOrNull(value.androidPackage);
      if (!app || !url || !androidPackage) return null;
      return {
        lane: "app",
        app,
        url,
        androidPackage,
        query: stringOrNull(value.query),
        playFromSearch: value.playFromSearch === true,
      };
    }
    default:
      return null;
  }
}

export function readMediaCommand(value: unknown): MediaCommand | null {
  if (!isRecord(value)) return null;
  switch (value.action) {
    case "play":
    case "pause":
    case "next":
    case "previous":
    case "stop":
      return { action: value.action };
    case "seek": {
      const position = numberOrNull(value.position);
      const offset = numberOrNull(value.offset);
      return position === null && offset === null
        ? null
        : { action: "seek", position, offset: position === null ? offset : null };
    }
    case "volume": {
      const volume = numberOrNull(value.volume);
      return volume === null
        ? null
        : { action: "volume", volume: Math.min(100, Math.max(0, volume)) };
    }
    default:
      return null;
  }
}

/** A finished show_media / media_control call, or null for anything else. */
export function readMediaCall(item: StreamItem): MediaCall | null {
  if (item.kind !== "tool_call" || item.payload.source !== "agent") return null;
  const data = item.payload.data;
  const name = mediaToolName(data.name);
  // The daemon resolves the plan, so only a completed call carries something to act on.
  if (!name || data.status !== "completed" || data.detail.type !== "unknown") return null;
  const answer = readToolAnswer(data.detail.output);
  if (!answer) return null;
  const at = item.timestamp.getTime();
  if (name === "show_media") {
    const plan = readMediaPlan(answer.plan);
    return plan ? { kind: "show", id: data.callId, at, plan } : null;
  }
  const command = readMediaCommand(answer.command);
  return command ? { kind: "control", id: data.callId, at, command } : null;
}

const EMPTY_ITEMS: StreamItem[] = [];

function isMediaCallItem(item: StreamItem): boolean {
  return (
    item.kind === "tool_call" &&
    item.payload.source === "agent" &&
    mediaToolName(item.payload.data.name) !== null
  );
}

/** The agent's media calls from the committed tail and the live head, in timeline order. */
export function selectMediaItems(
  session:
    | { agentStreamTail: Map<string, StreamItem[]>; agentStreamHead: Map<string, StreamItem[]> }
    | undefined,
  agentId: string,
): StreamItem[] {
  if (!session) return EMPTY_ITEMS;
  const byId = new Map<string, StreamItem>();
  for (const list of [session.agentStreamTail.get(agentId), session.agentStreamHead.get(agentId)]) {
    for (const item of list ?? EMPTY_ITEMS) {
      if (!isMediaCallItem(item)) continue;
      byId.delete(item.id);
      byId.set(item.id, item);
    }
  }
  return byId.size > 0 ? [...byId.values()] : EMPTY_ITEMS;
}

/** Calls are commands, not state: each runs once, and only while it is recent. */
export const MEDIA_CALL_MAX_AGE_MS = 2 * 60_000;

/**
 * The calls to run now. Every call it sees is remembered in `seen`, so history loaded after the
 * mount (old calls) and a call that re-renders (same id) never play twice.
 */
export function takeFreshMediaCalls(input: {
  items: readonly StreamItem[];
  seen: Set<string>;
  now: number;
  maxAgeMs?: number;
}): MediaCall[] {
  const { items, seen, now, maxAgeMs = MEDIA_CALL_MAX_AGE_MS } = input;
  const fresh: MediaCall[] = [];
  for (const item of items) {
    const call = readMediaCall(item);
    if (!call || seen.has(call.id)) continue;
    seen.add(call.id);
    if (now - call.at <= maxAgeMs) fresh.push(call);
  }
  return fresh;
}

export interface MediaHostState {
  /** The phone app Zuri opened last, which media_control steers when no player tab plays. */
  external: AppPlan | null;
}

export const EMPTY_MEDIA_HOST_STATE: MediaHostState = { external: null };

export type MediaEffect =
  | { type: "open-app"; plan: AppPlan }
  | { type: "player-command"; command: MediaCommand }
  | { type: "external-command"; app: AppPlan | null; command: MediaCommand };

/**
 * One call's effect. A film or YouTube needs nothing here: the daemon opens the player tab on the
 * stage, and the stage draws it (stage/blocks/player.tsx). A command goes to that player while
 * the tab is open, else to the user's app.
 */
export function applyMediaCall(
  state: MediaHostState,
  call: MediaCall,
  hasPlayer: boolean,
): { state: MediaHostState; effects: MediaEffect[] } {
  if (call.kind === "show") {
    if (call.plan.lane !== "app") return { state: { external: null }, effects: [] };
    return { state: { external: call.plan }, effects: [{ type: "open-app", plan: call.plan }] };
  }
  if (hasPlayer) return { state, effects: [{ type: "player-command", command: call.command }] };
  return {
    state,
    effects: [{ type: "external-command", app: state.external, command: call.command }],
  };
}
