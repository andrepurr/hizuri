// Hizuri (Show window, media): which of the three lanes plays what Zuri asked for. The lane is
// picked here, never by the user and never by the model directly:
//   video   — the app's own native player (expo-video): files the daemon's machine serves and stream links.
//   youtube — YouTube's IFrame player in a WebView, steered by messages.
//   app     — the user's own phone app (YouTube, YouTube Music, Spotify, Netflix),
//             opened by link. DRM services play only there.
// The app reads the plan back from the tool result (packages/app/src/show-media/model.ts), so
// the plan shape is additive-only: never rename or narrow a field the app already reads.

export const MEDIA_APPS = [
  "youtube",
  "youtube_music",
  "spotify",
  "netflix",
] as const;
export type MediaApp = (typeof MEDIA_APPS)[number];

export type VideoContentType = "auto" | "hls" | "dash" | "progressive";

export interface VideoPlan {
  lane: "video";
  /** An absolute http(s) URL, or a daemon path ("/hizuri-media/file/…") the app resolves. */
  uri: string;
  contentType: VideoContentType;
  title: string | null;
  startAt: number | null;
  /** Further items for next/previous, same form as `uri`. */
  queue: string[];
}

export interface YoutubePlan {
  lane: "youtube";
  videoId: string | null;
  playlistId: string | null;
  title: string | null;
  startAt: number | null;
  /** Further video ids for next/previous. */
  queue: string[];
}

export interface AppPlan {
  lane: "app";
  app: MediaApp;
  /** The https link that opens the app (or its web page when the app is missing). */
  url: string;
  /** The Android package the link is aimed at. */
  androidPackage: string;
  /** What to search for, when Zuri asked for a search rather than a link. */
  query: string | null;
  /** Music apps accept Android's "play from search" intent, which starts playback directly. */
  playFromSearch: boolean;
}

export type ShowMediaPlan = VideoPlan | YoutubePlan | AppPlan;

/** An input Zuri can fix: the message goes back to it as the tool error. */
export class ShowMediaInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShowMediaInputError";
  }
}

export interface ShowMediaRequest {
  url?: string;
  /** Already turned into a daemon file path by the tool (see files.ts). */
  fileUri?: string;
  youtubeId?: string;
  app?: MediaApp;
  query?: string;
  title?: string;
  startAt?: number;
  playlist?: string[];
}

interface AppSpec {
  androidPackage: string;
  search: (query: string) => string;
  home: string;
  playFromSearch: boolean;
}

const APP_SPECS: Record<MediaApp, AppSpec> = {
  youtube: {
    androidPackage: "com.google.android.youtube",
    search: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    home: "https://www.youtube.com/",
    playFromSearch: false,
  },
  youtube_music: {
    androidPackage: "com.google.android.apps.youtube.music",
    search: (q) => `https://music.youtube.com/search?q=${encodeURIComponent(q)}`,
    home: "https://music.youtube.com/",
    playFromSearch: true,
  },
  spotify: {
    androidPackage: "com.spotify.music",
    search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    home: "https://open.spotify.com/",
    playFromSearch: true,
  },
  netflix: {
    androidPackage: "com.netflix.mediaclient",
    search: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`,
    home: "https://www.netflix.com/",
    playFromSearch: false,
  },
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);
const YOUTUBE_PATH_ID = /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/;

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/** Which of the user's apps a link belongs to, for links the embedded players cannot play. */
function appForHost(host: string): MediaApp | null {
  if (host === "music.youtube.com") return "youtube_music";
  if (host === "open.spotify.com" || host === "spotify.link") return "spotify";
  if (host === "netflix.com" || host.endsWith(".netflix.com")) return "netflix";
  return null;
}

/** YouTube's `t`/`start` values: "90", "90s", "1m30s", "1h2m3s". */
export function parseYoutubeTime(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(trimmed);
  if (!match || trimmed === "") return null;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

interface YoutubeLink {
  videoId: string | null;
  playlistId: string | null;
  startAt: number | null;
}

/** A YouTube link the IFrame player can play, or null (channel pages, search pages…). */
export function parseYoutubeLink(url: URL): YoutubeLink | null {
  const host = normalizeHost(url.hostname);
  if (!YOUTUBE_HOSTS.has(host)) return null;
  let videoId: string | null = null;
  if (host === "youtu.be") {
    const candidate = url.pathname.slice(1).split("/")[0] ?? "";
    videoId = YOUTUBE_ID.test(candidate) ? candidate : null;
  } else {
    const fromQuery = url.searchParams.get("v");
    videoId = fromQuery && YOUTUBE_ID.test(fromQuery) ? fromQuery : null;
    videoId ??= YOUTUBE_PATH_ID.exec(url.pathname)?.[1] ?? null;
  }
  const list = url.searchParams.get("list");
  const playlistId = list && YOUTUBE_PLAYLIST_ID.test(list) ? list : null;
  if (!videoId && !playlistId) return null;
  const startAt = parseYoutubeTime(url.searchParams.get("t") ?? url.searchParams.get("start"));
  return { videoId, playlistId, startAt };
}

/** A stream format the native player must be told about when the URL has no telling extension. */
export function videoContentType(uri: string): VideoContentType {
  const path = uri.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".mpd")) return "dash";
  return "auto";
}

function parseHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ShowMediaInputError(`Not a link: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ShowMediaInputError(`Only http(s) links can be shown, got ${url.protocol}`);
  }
  return url;
}

function appPlan(app: MediaApp, input: { url?: string; query?: string }): AppPlan {
  const spec = APP_SPECS[app];
  const query = input.query?.trim() || null;
  const url = input.url ?? (query ? spec.search(query) : spec.home);
  return {
    lane: "app",
    app,
    url,
    androidPackage: spec.androidPackage,
    query,
    playFromSearch: spec.playFromSearch && query !== null && input.url === undefined,
  };
}

function youtubeQueue(playlist: string[] | undefined): string[] {
  return (playlist ?? []).flatMap((entry) => {
    const trimmed = entry.trim();
    if (YOUTUBE_ID.test(trimmed)) return [trimmed];
    try {
      const id = parseYoutubeLink(new URL(trimmed))?.videoId;
      return id ? [id] : [];
    } catch {
      return [];
    }
  });
}

function videoQueue(playlist: string[] | undefined): string[] {
  return (playlist ?? []).flatMap((entry) => {
    try {
      return [parseHttpUrl(entry).toString()];
    } catch {
      return entry.startsWith("/hizuri-media/") ? [entry] : [];
    }
  });
}

/** Picks the lane for one show_media call. Throws a message Zuri can act on when the input is off. */
export function planShowMedia(request: ShowMediaRequest): ShowMediaPlan {
  const title = request.title?.trim() || null;
  const startAt =
    typeof request.startAt === "number" && request.startAt > 0 ? request.startAt : null;

  if (request.app) {
    if (request.url) {
      parseHttpUrl(request.url);
    }
    return appPlan(request.app, { url: request.url?.trim(), query: request.query });
  }

  if (request.youtubeId) {
    const videoId = request.youtubeId.trim();
    if (!YOUTUBE_ID.test(videoId)) {
      throw new ShowMediaInputError(
        `Not a YouTube video id: ${videoId} (11 letters, digits, - or _)`,
      );
    }
    return {
      lane: "youtube",
      videoId,
      playlistId: null,
      title,
      startAt,
      queue: youtubeQueue(request.playlist),
    };
  }

  if (request.fileUri) {
    return {
      lane: "video",
      uri: request.fileUri,
      contentType: videoContentType(request.fileUri),
      title,
      startAt,
      queue: videoQueue(request.playlist),
    };
  }

  if (request.url) {
    const url = parseHttpUrl(request.url);
    const youtube = parseYoutubeLink(url);
    if (youtube) {
      return {
        lane: "youtube",
        videoId: youtube.videoId,
        playlistId: youtube.playlistId,
        title,
        startAt: startAt ?? youtube.startAt,
        queue: youtubeQueue(request.playlist),
      };
    }
    const host = normalizeHost(url.hostname);
    if (YOUTUBE_HOSTS.has(host)) {
      return appPlan("youtube", { url: url.toString() });
    }
    const app = appForHost(host);
    if (app) {
      return appPlan(app, { url: url.toString() });
    }
    return {
      lane: "video",
      uri: url.toString(),
      contentType: videoContentType(url.toString()),
      title,
      startAt,
      queue: videoQueue(request.playlist),
    };
  }

  if (request.query) {
    return appPlan("youtube", { query: request.query });
  }

  throw new ShowMediaInputError("Nothing to show: pass url, path, youtubeId, or app (with query)");
}

export const MEDIA_CONTROL_ACTIONS = [
  "play",
  "pause",
  "next",
  "previous",
  "seek",
  "volume",
  "stop",
] as const;
export type MediaControlAction = (typeof MEDIA_CONTROL_ACTIONS)[number];

export type MediaCommand =
  | { action: "play" | "pause" | "next" | "previous" | "stop" }
  | { action: "seek"; position: number | null; offset: number | null }
  | { action: "volume"; volume: number };

export function planMediaControl(input: {
  action: MediaControlAction;
  position?: number;
  offset?: number;
  volume?: number;
}): MediaCommand {
  switch (input.action) {
    case "seek": {
      const position = typeof input.position === "number" ? Math.max(0, input.position) : null;
      const offset = typeof input.offset === "number" ? input.offset : null;
      if (position === null && offset === null) {
        throw new ShowMediaInputError(
          "seek needs position (seconds from the start) or offset (± seconds)",
        );
      }
      return { action: "seek", position, offset: position === null ? offset : null };
    }
    case "volume": {
      if (typeof input.volume !== "number") {
        throw new ShowMediaInputError("volume needs volume (0–100)");
      }
      return { action: "volume", volume: Math.min(100, Math.max(0, Math.round(input.volume))) };
    }
    default:
      return { action: input.action };
  }
}
