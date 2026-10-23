import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import express from "express";
import type { Logger } from "pino";
import { z } from "zod";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { MAX_WEB_HTML_BYTES, STAGE_MEDIA_ROUTE, normalizeBlocks } from "./blocks.js";
import { showTabId } from "./show-mirror.js";
import type { StageStore } from "./store.js";

// Hizuri: show_file — Zuri opens a page, a picture or a video from a file as a Show tab with one
// short call. The daemon reads the file, so the assistant's call carries a path, never the
// 120 KB of HTML.
//   .html  → a web block with the page inline: the app draws it in a sandbox (no network, no
//            storage) and keeps it with the cached stage, so it opens offline.
//   picture, video, audio → a copy under $PASEO_HOME/stage/media/<sha256>.<ext>, served at
//            /stage-media/ like the avatar page (public: the name is the content hash, so only a
//            stage that holds it can name it). The tab keeps working after the source file is
//            moved or deleted; a copy no stage file names any more is pruned.
// Only files under the allowed folders are read (default ~/share/outputs; PASEO_SHOW_FILE_DIRS,
// colon-separated, replaces it), after resolving symlinks.

const HTML_EXTENSIONS = new Set(["html", "htm"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "webm", "mov"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "ogg", "opus", "wav"]);
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
const MEDIA_NAME = /^([0-9a-f]{64})\.[a-z0-9]{2,5}$/;
/** A copy younger than this is kept even if no stage names it yet (its tab is being written). */
const PRUNE_GRACE_MS = 10 * 60 * 1000;

/** One canvas holds this many files; the app splits the screen between them. */
export const MAX_CANVAS_FILES = 4;

export interface ShowFileConfig {
  /** Folders show_file may read from, resolved. */
  allowedDirs: string[];
  /** The same folders as configured (~/…), for the tool's description. */
  shownDirs: string[];
  /** $PASEO_HOME/stage: the stage files that name media copies. */
  stageDir: string;
  /** $PASEO_HOME/stage/media: the served copies. */
  mediaDir: string;
}

export function stageMediaDir(paseoHome: string): string {
  return path.join(paseoHome, "stage", "media");
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

export function resolveShowFileConfig(input: {
  paseoHome: string;
  env?: NodeJS.ProcessEnv;
}): ShowFileConfig {
  const configured = input.env?.PASEO_SHOW_FILE_DIRS?.split(":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const dirs = configured?.length ? configured : ["~/share/outputs"];
  return {
    allowedDirs: dirs.map((dir) => path.resolve(expandHome(dir))),
    shownDirs: dirs,
    stageDir: path.join(input.paseoHome, "stage"),
    mediaDir: stageMediaDir(input.paseoHome),
  };
}

export class ShowFileError extends Error {}

export interface ShowFileBlock {
  kind: "page" | "picture" | "video" | "audio";
  bytes: number;
  block: Record<string, unknown>;
}

function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function resolveAllowedFile(config: ShowFileConfig, rawPath: string) {
  const requested = path.resolve(expandHome(rawPath.trim()));
  let real: string;
  try {
    real = await fs.realpath(requested);
  } catch {
    throw new ShowFileError(`No file at ${rawPath}`);
  }
  const roots = await Promise.all(
    config.allowedDirs.map((dir) => fs.realpath(dir).catch(() => null)),
  );
  if (!roots.some((root) => root && isInside(root, real))) {
    throw new ShowFileError(
      `${rawPath} is outside the folders Show may open (${config.allowedDirs.join(", ")}); ` +
        "copy it into one of them first",
    );
  }
  const stats = await fs.stat(real);
  if (!stats.isFile()) throw new ShowFileError(`${rawPath} is not a file`);
  return { real, size: stats.size };
}

function extensionOf(file: string): string {
  return path.extname(file).slice(1).toLowerCase();
}

function megabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Copies the file under its content hash, once; touching an existing copy keeps it fresh. */
async function importMedia(config: ShowFileConfig, file: string, ext: string): Promise<string> {
  await fs.mkdir(config.mediaDir, { recursive: true });
  const temp = path.join(config.mediaDir, `.import-${randomBytes(6).toString("hex")}`);
  const hash = createHash("sha256");
  try {
    const source = createReadStream(file);
    source.on("data", (chunk) => hash.update(chunk));
    await pipeline(source, createWriteStream(temp));
    const name = `${hash.digest("hex")}.${ext}`;
    const target = path.join(config.mediaDir, name);
    const existing = await fs.stat(target).catch(() => null);
    if (existing) {
      const now = new Date();
      await fs.utimes(target, now, now);
      await fs.rm(temp, { force: true });
    } else {
      await fs.rename(temp, target);
    }
    return name;
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/** Reads a file Zuri names and turns it into the one block its tab holds. */
export async function readShowFile(
  config: ShowFileConfig,
  input: { path: string; caption?: string },
): Promise<ShowFileBlock> {
  const { real, size } = await resolveAllowedFile(config, input.path);
  const ext = extensionOf(real);
  const caption = input.caption?.trim() || undefined;
  if (HTML_EXTENSIONS.has(ext)) {
    if (size > MAX_WEB_HTML_BYTES) {
      throw new ShowFileError(
        `the page is ${Math.round(size / 1024)} KB; Show holds pages up to ` +
          `${MAX_WEB_HTML_BYTES / 1024} KB — inline less, or link big pictures as separate tabs`,
      );
    }
    const html = await fs.readFile(real, "utf8");
    return { kind: "page", bytes: size, block: { type: "web", id: "file", props: { html } } };
  }
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  if (!isImage && !isVideo && !AUDIO_EXTENSIONS.has(ext)) {
    throw new ShowFileError(
      `Show opens .html pages, pictures (${[...IMAGE_EXTENSIONS].join(", ")}), video ` +
        `(${[...VIDEO_EXTENSIONS].join(", ")}) and audio (${[...AUDIO_EXTENSIONS].join(", ")}); ` +
        `not .${ext || "(no extension)"}`,
    );
  }
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_MEDIA_BYTES;
  if (size > limit) {
    throw new ShowFileError(`the file is ${megabytes(size)}; the limit is ${megabytes(limit)}`);
  }
  const url = `${STAGE_MEDIA_ROUTE}/${await importMedia(config, real, ext)}`;
  if (isImage) {
    return {
      kind: "picture",
      bytes: size,
      block: {
        type: "image",
        id: "file",
        props: { images: [{ url, ...(caption ? { caption } : {}) }], fit: "contain" },
      },
    };
  }
  const kind = isVideo ? "video" : "audio";
  return {
    kind,
    bytes: size,
    block: {
      type: "media",
      id: "file",
      props: { kind, url, ...(caption ? { title: caption } : {}) },
    },
  };
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dir, entry.name));
}

/**
 * Deletes media copies that no stage file (open tabs, closed tabs, tab history) names any more.
 * Text search over the stage files: a copy is named only by its hash.
 */
export async function pruneStageMedia(config: ShowFileConfig): Promise<number> {
  const names = (await fs.readdir(config.mediaDir).catch(() => [])).filter((name) =>
    MEDIA_NAME.test(name),
  );
  if (names.length === 0) return 0;
  const stageFiles = [
    ...(await listFiles(config.stageDir)),
    ...(await listFiles(path.join(config.stageDir, "history"))),
  ].filter((file) => file.endsWith(".json"));
  const referenced = new Set<string>();
  for (const file of stageFiles) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    for (const match of text.matchAll(/\/stage-media\/([0-9a-f]{64})\./g)) referenced.add(match[1]);
  }
  let removed = 0;
  const now = Date.now();
  for (const name of names) {
    if (referenced.has(name.slice(0, 64))) continue;
    const file = path.join(config.mediaDir, name);
    const stats = await fs.stat(file).catch(() => null);
    if (!stats || now - stats.mtimeMs < PRUNE_GRACE_MS) continue;
    await fs.rm(file, { force: true });
    removed += 1;
  }
  return removed;
}

/** Serves the media copies by hash name; ranges for video seeking, cached for good. */
export function createStageMediaRouter(input: { mediaDir: string }): express.Router {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!MEDIA_NAME.test(req.path.slice(1))) {
      res.status(404).end();
      return;
    }
    next();
  });
  router.use(
    express.static(input.mediaDir, {
      index: false,
      dotfiles: "ignore",
      fallthrough: false,
      etag: true,
      immutable: true,
      maxAge: "365d",
    }),
  );
  return router;
}

export function showFileShape(shownDirs: string[]) {
  return {
    path: z
      .string()
      .trim()
      .min(1)
      .max(1024)
      .describe(
        "The file: an .html page, a picture (png, jpg, gif, webp), a video (mp4, webm, mov) or " +
          `audio (mp3, m4a, ogg, wav), under ${shownDirs.join(" or ")}. Absolute or ~/…`,
      ),
    also: z
      .array(z.string().trim().min(1).max(1024))
      .max(MAX_CANVAS_FILES - 1)
      .optional()
      .describe(
        "Up to 3 more files on the same tab: they share one canvas with the first, top to bottom " +
          "(a video above a live page, a song under it). Every page plays live at once.",
      ),
    window: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe("The tab's title, 1–4 words, the user's language. Default: the file's name."),
    caption: z.string().max(200).optional().describe("A line under a picture or a video."),
  };
}

export const SHOW_FILE_DESCRIPTION =
  "Open a file as a tab on the user's Show page, sized for the user's phone: an HTML page (an " +
  "answer-me-with-html explainer, a report), a picture or a video. The user scrolls and pinch-zooms " +
  "it with their finger, and it stays there offline. Pass only the path — the daemon reads the " +
  "file — so never paste the HTML into a call. The same window again replaces the tab. Prefer " +
  "this over sending the user a link or showing it on your screen. With also, several files share " +
  "the tab as one canvas (a video and a live page together).";

function sizeOf(file: ShowFileBlock): string {
  return file.bytes < 1024 * 1024 ? `${Math.round(file.bytes / 1024)} KB` : megabytes(file.bytes);
}

function windowFromFile(file: string): string {
  const base = path.basename(file, path.extname(file)).trim() || "File";
  return base.length > 40 ? base.slice(0, 40).trimEnd() : base;
}

export function registerShowFileTool(options: {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  store: StageStore;
  owner: string;
  config: ShowFileConfig;
  logger: Logger;
}): void {
  const { store, owner, config, logger } = options;
  options.registerTool(
    "show_file",
    {
      title: "Show file",
      description: SHOW_FILE_DESCRIPTION,
      inputSchema: showFileShape(config.shownDirs),
    },
    async (input: { path: string; also?: string[]; window?: string; caption?: string }) => {
      try {
        if ((input.also?.length ?? 0) >= MAX_CANVAS_FILES) {
          throw new ShowFileError(`one canvas holds up to ${MAX_CANVAS_FILES} files`);
        }
        const file = await readShowFile(config, input);
        const more = await Promise.all(
          (input.also ?? []).map((also) => readShowFile(config, { path: also })),
        );
        // The first file keeps the id a file alone has; the others follow it.
        more.forEach((entry, index) => {
          entry.block.id = `file${index + 2}`;
        });
        const blocks = [file, ...more].map((entry) => entry.block);
        const window = input.window?.trim() || windowFromFile(input.path);
        const opened = await store.open(owner, {
          tabId: showTabId(window),
          title: window,
          blocks: normalizeBlocks(blocks),
          enter: "slide",
          createdBy: owner,
        });
        void pruneStageMedia(config).catch((error: unknown) => {
          logger.warn({ err: error }, "Pruning stage media failed");
        });
        const paths = [input.path, ...(input.also ?? [])];
        const files = [file, ...more]
          .map((entry, index) => `${entry.kind} ${path.basename(paths[index]!)} (${sizeOf(entry)})`)
          .join(", ");
        const canvas = more.length > 0;
        return {
          content: [
            {
              type: "text",
              text:
                `Opened ${files} as the Show tab “${window}”${canvas ? ", on one canvas" : ""}. ` +
                "It is on the user's screen now.",
            },
          ],
          structuredContent: {
            ok: true,
            window,
            tab: opened.tab.id,
            kind: canvas ? "canvas" : file.kind,
            ...(canvas ? { kinds: [file, ...more].map((entry) => entry.kind) } : {}),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );
}
