import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { normalizeBlocks } from "../stage/blocks.js";
import type { StageStore } from "../stage/store.js";
import type { ShowMediaFileStore } from "./files.js";
import {
  MEDIA_APPS,
  MEDIA_CONTROL_ACTIONS,
  ShowMediaInputError,
  planMediaControl,
  planShowMedia,
  type MediaApp,
  type MediaCommand,
  type MediaControlAction,
  type ShowMediaPlan,
  type VideoPlan,
  type YoutubePlan,
} from "./plan.js";

// Hizuri (Show window, media): show_media and media_control. A film or YouTube opens the player
// tab on Zuri's stage, one `media` block with `player: true` (the app draws it with the stage's
// player, packages/app/src/stage/blocks/player.tsx), so it is a Show tab like its others and
// comes back after the app restarts. Its app links and every media_control are commands, not
// state: the app runs them from the call it sees in the agent timeline (packages/app/src/
// show-media/model.ts). The answer is JSON text because the provider hands the app the text, not
// structuredContent: { ok, plan } or { ok, command }. The .describe() strings are model-visible
// prompt surface.

/** The one player tab: a new show_media replaces what plays. */
export const MEDIA_TAB_ID = "media";
/** The tab's title when Zuri gives none; the app shows it in its own language. */
export const MEDIA_WINDOW_TITLE = "Player";

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

export interface RegisterShowMediaToolsOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  files?: ShowMediaFileStore | null;
  /** The stage the player tab goes on (the calling agent's root agent); none in tests. */
  stage?: { store: StageStore; owner: string } | null;
}

export const showMediaShape = {
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .optional()
    .describe(
      "A link to play: YouTube (watch, youtu.be, shorts, playlist), YouTube Music, " +
        "Spotify or Netflix, or a direct media or stream link (mp4, mkv, webm, mp3, m4a, " +
        "HLS .m3u8, DASH .mpd).",
    ),
  path: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional()
    .describe(
      "Absolute path of a video or audio file on this machine. The daemon serves it to the " +
        "phone's player; use it for films and recordings stored here.",
    ),
  youtubeId: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .optional()
    .describe("A YouTube video id (11 characters), when you have the id rather than a link."),
  app: z
    .enum(MEDIA_APPS)
    .optional()
    .describe(
      "Open the user's own phone app, signed in to their account, instead of a player inside " +
        "hizuri. Netflix and other paid services play only there; it is also how music from their " +
        "accounts plays in the background.",
    ),
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "What to find in the app: a song, an artist, a film or a video title. With a music app " +
        "(youtube_music, spotify) playback starts on the best match when the phone " +
        "allows it; otherwise the app opens its search. Without app, the YouTube app searches.",
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe("Title shown on the player and on the lock screen."),
  startAt: z.number().min(0).optional().describe("Start position in seconds."),
  playlist: z
    .array(z.string().trim().min(1).max(2000))
    .max(50)
    .optional()
    .describe(
      "More items to play after the first, for next/previous: YouTube ids or links for YouTube, " +
        "media links for the hizuri player.",
    ),
};

export const mediaControlShape = {
  action: z
    .enum(MEDIA_CONTROL_ACTIONS)
    .describe(
      "play, pause, next, previous, seek (with position or offset), volume (with volume), or " +
        "stop (closes the player tab).",
    ),
  position: z.number().min(0).optional().describe("seek: seconds from the start."),
  offset: z
    .number()
    .optional()
    .describe("seek: seconds to jump, forward (positive) or back (negative)."),
  volume: z.number().min(0).max(100).optional().describe("volume: 0–100."),
};

const LANE_NOTES: Record<ShowMediaPlan["lane"], string> = {
  video: "Playing in hizuri's own player, in the Show tab “{title}” on the phone.",
  youtube: "Playing in the YouTube player, in the Show tab “{title}” on the phone.",
  app: "Opening the user's own app on the phone.",
};

function isAudioUri(uri: string): boolean {
  let pathname = uri;
  if (!uri.startsWith("/") && URL.canParse(uri)) pathname = new URL(uri).pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // A stray "%" in the name: read it as written.
  }
  return AUDIO_EXTENSIONS.test(pathname);
}

/** https://www.youtube.com/watch?v=… — what an app without the player draws as a plain link. */
function youtubeWatchUrl(plan: YoutubePlan): string {
  if (!plan.videoId) {
    return `https://www.youtube.com/playlist?list=${encodeURIComponent(plan.playlistId ?? "")}`;
  }
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", plan.videoId);
  if (plan.playlistId) url.searchParams.set("list", plan.playlistId);
  return url.toString();
}

/** The player tab's one block; `playId` is new on every call, so the same film starts afresh. */
export function playerBlock(plan: VideoPlan | YoutubePlan): Record<string, unknown> {
  const common = {
    player: true,
    playId: randomUUID(),
    ...(plan.title ? { title: plan.title } : {}),
    ...(plan.startAt ? { startAt: plan.startAt } : {}),
    ...(plan.queue.length > 0 ? { queue: plan.queue } : {}),
  };
  if (plan.lane === "video") {
    return {
      type: "media",
      id: "player",
      props: {
        kind: isAudioUri(plan.uri) ? "audio" : "video",
        url: plan.uri,
        contentType: plan.contentType,
        ...common,
      },
    };
  }
  return {
    type: "media",
    id: "player",
    props: {
      kind: "youtube",
      url: youtubeWatchUrl(plan),
      ...(plan.videoId ? { videoId: plan.videoId } : {}),
      ...(plan.playlistId ? { playlistId: plan.playlistId } : {}),
      ...common,
    },
  };
}

async function closePlayerTab(stage: { store: StageStore; owner: string }): Promise<void> {
  const current = await stage.store.get(stage.owner);
  if (!current.tabs.some((tab) => tab.id === MEDIA_TAB_ID)) return;
  await stage.store.close(stage.owner, { tabId: MEDIA_TAB_ID, by: "agent" });
}

function answer(payload: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}

interface ShowMediaInput {
  url?: string;
  path?: string;
  youtubeId?: string;
  app?: MediaApp;
  query?: string;
  title?: string;
  startAt?: number;
  playlist?: string[];
}

async function resolveShowMedia(
  input: ShowMediaInput,
  files: ShowMediaFileStore | null | undefined,
): Promise<ShowMediaPlan> {
  const sources = [input.url, input.path, input.youtubeId].filter(Boolean).length;
  if (sources > 1) {
    throw new ShowMediaInputError("Pass only one of url, path and youtubeId");
  }
  if (input.path && input.app) {
    throw new ShowMediaInputError("A file on this machine cannot open in a phone app; drop app");
  }
  let fileUri: string | undefined;
  if (input.path) {
    if (!files) throw new ShowMediaInputError("This daemon does not serve media files");
    fileUri = await files.grant(input.path);
  }
  return planShowMedia({
    url: input.url,
    fileUri,
    youtubeId: input.youtubeId,
    app: input.app,
    query: input.query,
    title: input.title,
    startAt: input.startAt,
    playlist: input.playlist,
  });
}

export function registerShowMediaTools(options: RegisterShowMediaToolsOptions): void {
  options.registerTool(
    "show_media",
    {
      title: "Show media",
      description:
        "Play a film, a video, YouTube or music on the user's phone. You say what; the tool " +
        "picks how, and the user never has to choose: YouTube links and ids play in a YouTube " +
        "player and a file on this machine (path) or a direct media link plays in hizuri's own " +
        "player (full screen, picture-in-picture, keeps playing in the background, lock-screen " +
        "controls), both in the player tab of their Show page, which a new call replaces; " +
        "Netflix, YouTube Music and Spotify links, or app + query, open the user's " +
        "own app with their account. Steer playback afterwards with media_control.",
      inputSchema: showMediaShape,
    },
    async (input: ShowMediaInput) => {
      const plan = await resolveShowMedia(input, options.files);
      const stage = options.stage ?? null;
      let window: string | null = null;
      if (stage && plan.lane !== "app") {
        window = plan.title ?? MEDIA_WINDOW_TITLE;
        await stage.store.open(stage.owner, {
          tabId: MEDIA_TAB_ID,
          title: window.slice(0, 40).trimEnd(),
          blocks: normalizeBlocks([playerBlock(plan)]),
          enter: "slide",
          createdBy: stage.owner,
        });
      } else if (stage) {
        // The user's app takes over the sound; hizuri's player closes so the two never play at
        // once.
        await closePlayerTab(stage);
      }
      const note = LANE_NOTES[plan.lane].replace("{title}", window ?? "");
      return answer({ ok: true, plan, note, ...(window ? { window } : {}) });
    },
  );

  options.registerTool(
    "media_control",
    {
      title: "Media control",
      description:
        "Control what show_media started on the user's phone: play, pause, next, previous, " +
        "seek, volume, stop. It acts on hizuri's player when one is open; music or films in the " +
        "user's own app (YouTube Music, Netflix…) follow once the user has allowed " +
        "hizuri to control media on the phone.",
      inputSchema: mediaControlShape,
    },
    async (input: {
      action: MediaControlAction;
      position?: number;
      offset?: number;
      volume?: number;
    }) => {
      const command: MediaCommand = planMediaControl(input);
      if (command.action === "stop" && options.stage) await closePlayerTab(options.stage);
      return answer({ ok: true, command, note: "Sent to the phone." });
    },
  );
}
