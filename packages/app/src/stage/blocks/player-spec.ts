import type { StageTab } from "@getpaseo/protocol/stage";
import type { VideoContentType, VideoPlan, YoutubePlan } from "@/show-media/model";

// The player tab (show_media, packages/server/src/server/show-media/tools.ts): one `media` block
// with `player: true`. It plays with sound and controls, keeps playing while the user looks at
// another tab, the chat or another app, and comes back after the app restarts. Read tolerantly: a
// newer daemon may add props.

export type PlayerKind = "video" | "audio" | "youtube";

export interface PlayerSpec {
  kind: PlayerKind;
  /** New on every show_media call: a new id starts a new player. */
  playId: string;
  url: string;
  title: string | null;
  startAt: number | null;
  queue: string[];
  contentType: VideoContentType;
  videoId: string | null;
  playlistId: string | null;
}

/** A call younger than this plays at once; older (a restored tab) waits paused for the user. */
export const FRESH_PLAY_MS = 2 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

const CONTENT_TYPES: readonly VideoContentType[] = ["auto", "hls", "dash", "progressive"];

export function readPlayerSpec(block: unknown, fallbackId: string): PlayerSpec | null {
  if (!isRecord(block) || block.type !== "media" || !isRecord(block.props)) return null;
  const props = block.props;
  if (props.player !== true) return null;
  const kind = (["video", "audio", "youtube"] as const).find((value) => value === props.kind);
  const url = text(props.url, 2000);
  if (!kind || !url) return null;
  const videoId = text(props.videoId, 20);
  const playlistId = text(props.playlistId, 64);
  if (kind === "youtube" && !videoId && !playlistId) return null;
  const startAt = typeof props.startAt === "number" && props.startAt > 0 ? props.startAt : null;
  return {
    kind,
    playId: text(props.playId, 64) ?? fallbackId,
    url,
    title: text(props.title, 160),
    startAt,
    queue: Array.isArray(props.queue)
      ? props.queue.filter((entry): entry is string => typeof entry === "string")
      : [],
    contentType: CONTENT_TYPES.find((value) => value === props.contentType) ?? "auto",
    videoId,
    playlistId,
  };
}

export function isPlayerTab(tab: StageTab): boolean {
  return tab.blocks.length === 1 && readPlayerSpec(tab.blocks[0], tab.id) !== null;
}

/** The tab that plays, if any (there is one: show_media replaces it). */
export function playerTabOf(tabs: readonly StageTab[]): { tab: StageTab; spec: PlayerSpec } | null {
  for (const tab of tabs) {
    if (tab.blocks.length !== 1) continue;
    const spec = readPlayerSpec(tab.blocks[0], `${tab.id}:${tab.createdAt}`);
    if (spec) return { tab, spec };
  }
  return null;
}

/**
 * Where a player starts and whether it plays: Zuri's fresh call plays from its start; a tab that
 * comes back later (a restart, another agent's chat and back) waits paused where the user left it.
 */
export function playerStart(input: {
  spec: PlayerSpec;
  tabUpdatedAt: string;
  saved: number | null;
  now: number;
}): { position: number; autoplay: boolean } {
  const { spec, saved, now } = input;
  const age = now - Date.parse(input.tabUpdatedAt);
  const fresh = Number.isFinite(age) && age <= FRESH_PLAY_MS;
  if (saved !== null) return { position: saved, autoplay: false };
  return { position: spec.startAt ?? 0, autoplay: fresh };
}

/** An absolute link as it is; the daemon's own paths on its origin; nothing without one. */
export function resolvePlayerUrl(url: string, origin: string | null): string | null {
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/")) return origin ? `${origin}${url}` : null;
  return null;
}

export function toVideoPlan(spec: PlayerSpec): VideoPlan {
  return {
    lane: "video",
    uri: spec.url,
    contentType: spec.contentType,
    title: spec.title,
    startAt: spec.startAt,
    queue: spec.queue,
  };
}

export function toYoutubePlan(spec: PlayerSpec): YoutubePlan {
  return {
    lane: "youtube",
    videoId: spec.videoId,
    playlistId: spec.playlistId,
    title: spec.title,
    startAt: spec.startAt,
    queue: spec.queue,
  };
}
