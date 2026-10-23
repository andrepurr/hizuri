import type { AppPlan, MediaCommand, YoutubePlan } from "./model";

// The app's half of the YouTube page bridge. The page is served by the daemon
// (packages/server/src/server/show-media/youtube-page.ts, which documents the messages) — keep
// the two in step.

export const YOUTUBE_PAGE_PATH = "/hizuri-media/youtube";

/** YouTube refuses these in an embed: the uploader disabled embedding (101/150). */
const EMBED_REFUSED = new Set([101, 150]);

export type YoutubePageEvent =
  | { type: "media.ready" }
  | { type: "media.state"; state: string }
  | { type: "media.error"; code: number }
  | { type: "media.time"; seconds: number };

/** The page for one plan; `autoplay: false` loads it paused (a tab restored after a restart). */
export function buildYoutubePageUrl(
  baseUrl: string,
  plan: YoutubePlan,
  options: { autoplay?: boolean } = {},
): string {
  const url = new URL(YOUTUBE_PAGE_PATH, baseUrl);
  if (plan.videoId) url.searchParams.set("v", plan.videoId);
  if (plan.playlistId) url.searchParams.set("list", plan.playlistId);
  if (plan.startAt) url.searchParams.set("start", String(Math.floor(plan.startAt)));
  if (plan.queue.length > 0) url.searchParams.set("queue", plan.queue.join(","));
  if (options.autoplay === false) url.searchParams.set("autoplay", "0");
  return url.toString();
}

export function commandMessage(command: MediaCommand): string {
  return JSON.stringify({ type: "media.command", command });
}

/** The script the native WebView runs to hand the page one command. */
export function commandScript(command: MediaCommand): string {
  return `window.hizuriMedia && window.hizuriMedia.receive(${commandMessage(command)}); true;`;
}

export function parseYoutubePageEvent(data: unknown): YoutubePageEvent | null {
  if (typeof data !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const message = parsed as Record<string, unknown>;
  if (message.type === "media.ready") return { type: "media.ready" };
  if (message.type === "media.state" && typeof message.state === "string") {
    return { type: "media.state", state: message.state };
  }
  if (message.type === "media.error" && typeof message.code === "number") {
    return { type: "media.error", code: message.code };
  }
  if (message.type === "media.time" && typeof message.seconds === "number") {
    return { type: "media.time", seconds: message.seconds };
  }
  return null;
}

export function isEmbedRefused(code: number): boolean {
  return EMBED_REFUSED.has(code);
}

/** The link that opens the same video in the YouTube app, for videos that refuse embedding. */
export function youtubeAppUrl(plan: YoutubePlan): string {
  if (plan.videoId) {
    const url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", plan.videoId);
    if (plan.playlistId) url.searchParams.set("list", plan.playlistId);
    if (plan.startAt) url.searchParams.set("t", `${Math.floor(plan.startAt)}s`);
    return url.toString();
  }
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(plan.playlistId ?? "")}`;
}

/**
 * The same video as a lane-3 plan: the user's YouTube app, for refused embeds or no direct
 * connection.
 */
export function youtubeAppPlan(plan: YoutubePlan): AppPlan {
  return {
    lane: "app",
    app: "youtube",
    url: youtubeAppUrl(plan),
    androidPackage: "com.google.android.youtube",
    query: null,
    playFromSearch: false,
  };
}
