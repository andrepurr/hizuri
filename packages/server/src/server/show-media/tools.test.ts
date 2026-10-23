import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { StageStore } from "../stage/store.js";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { ShowMediaFileStore } from "./files.js";
import { MEDIA_TAB_ID, registerShowMediaTools } from "./tools.js";

interface RegisteredTool {
  config: PaseoToolConfig;
  handler: (args: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function registerAll(
  files: ShowMediaFileStore | null = null,
  stage: StageStore | null = null,
): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  registerShowMediaTools({
    registerTool: (name, config, handler) => tools.set(name, { config, handler }),
    files,
    stage: stage ? { store: stage, owner: "zuri" } : null,
  });
  return tools;
}

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "show-media-tool-"));
  tempDirs.push(dir);
  return dir;
}

function newStage(): StageStore {
  return new StageStore({ paseoHome: tempDir(), logger: pino({ level: "silent" }) });
}

/** Runs a tool the way the catalog does: validate against its schema, then call it. */
async function call(
  tools: Map<string, RegisteredTool>,
  name: string,
  args: unknown,
): Promise<Record<string, unknown>> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  const schema = z.object(tool.config.inputSchema as z.ZodRawShape).passthrough();
  const result = await tool.handler(await schema.parseAsync(args), {});
  const text = result.content[0]?.text;
  if (typeof text !== "string") throw new Error("no text answer");
  return JSON.parse(text) as Record<string, unknown>;
}

describe("show_media", () => {
  test("answers with the plan as JSON text, which is what the app reads", async () => {
    const tools = registerAll();
    const answer = await call(tools, "show_media", { url: "https://youtu.be/dQw4w9WgXcQ" });
    expect(answer).toMatchObject({
      ok: true,
      plan: { lane: "youtube", videoId: "dQw4w9WgXcQ" },
    });
    expect(typeof answer.note).toBe("string");
  });

  test("a file on this machine becomes a daemon link for the native player", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "show-media-tool-"));
    tempDirs.push(dir);
    const film = path.join(dir, "Film Night.mkv");
    writeFileSync(film, "x");
    const answer = await call(registerAll(new ShowMediaFileStore()), "show_media", {
      path: film,
      title: "Film night",
    });
    expect(answer.plan).toMatchObject({
      lane: "video",
      uri: expect.stringMatching(/^\/hizuri-media\/file\/[^/]+\/Film%20Night\.mkv$/),
      title: "Film night",
    });
  });

  test("conflicting sources and a missing file store are errors Zuri can read", async () => {
    const tools = registerAll();
    await expect(
      call(tools, "show_media", { url: "https://youtu.be/dQw4w9WgXcQ", youtubeId: "dQw4w9WgXcQ" }),
    ).rejects.toThrow(/only one/);
    await expect(call(tools, "show_media", { path: "/tmp/a.mp4" })).rejects.toThrow(
      /does not serve/,
    );
    await expect(call(tools, "show_media", { app: "spotify", path: "/tmp/a.mp3" })).rejects.toThrow(
      /drop app/,
    );
    await expect(call(tools, "show_media", { app: "vlc" })).rejects.toThrow();
  });
});

describe("show_media on the stage", () => {
  test("a film opens the player tab, in front, with the full player block", async () => {
    const dir = tempDir();
    const film = path.join(dir, "Film Night.mkv");
    writeFileSync(film, "x");
    const stage = newStage();
    const answer = await call(registerAll(new ShowMediaFileStore(), stage), "show_media", {
      path: film,
      title: "Film night",
      startAt: 30,
    });
    expect(answer).toMatchObject({ ok: true, window: "Film night" });
    const state = await stage.get("zuri");
    expect(state.focus).toBe(MEDIA_TAB_ID);
    const tab = state.tabs.find((candidate) => candidate.id === MEDIA_TAB_ID);
    expect(tab?.title).toBe("Film night");
    expect(tab?.blocks).toEqual([
      expect.objectContaining({
        type: "media",
        props: expect.objectContaining({
          kind: "video",
          player: true,
          url: expect.stringMatching(/^\/hizuri-media\/file\//),
          startAt: 30,
          playId: expect.any(String),
        }),
      }),
    ]);
  });

  test("YouTube gets the youtube kind with its id; a song file is audio", async () => {
    const stage = newStage();
    const tools = registerAll(new ShowMediaFileStore(), stage);
    await call(tools, "show_media", { url: "https://youtu.be/dQw4w9WgXcQ?t=42" });
    let tab = (await stage.get("zuri")).tabs.find((candidate) => candidate.id === MEDIA_TAB_ID);
    expect(tab?.title).toBe("Player");
    expect(tab?.blocks[0]).toMatchObject({
      props: {
        kind: "youtube",
        videoId: "dQw4w9WgXcQ",
        startAt: 42,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    });
    const song = path.join(tempDir(), "song.mp3");
    writeFileSync(song, "x");
    await call(tools, "show_media", { path: song });
    tab = (await stage.get("zuri")).tabs.find((candidate) => candidate.id === MEDIA_TAB_ID);
    expect(tab?.blocks[0]).toMatchObject({ props: { kind: "audio", player: true } });
  });

  test("the user's own app and media_control stop close the player tab", async () => {
    const stage = newStage();
    const tools = registerAll(null, stage);
    await call(tools, "show_media", { youtubeId: "dQw4w9WgXcQ" });
    await call(tools, "show_media", { app: "spotify", query: "Queen" });
    expect((await stage.get("zuri")).tabs).toHaveLength(0);
    await call(tools, "show_media", { youtubeId: "dQw4w9WgXcQ" });
    await call(tools, "media_control", { action: "stop" });
    expect((await stage.get("zuri")).tabs).toHaveLength(0);
    // Nothing open: stop is still a plain command for the user's app.
    await expect(call(tools, "media_control", { action: "stop" })).resolves.toMatchObject({
      ok: true,
    });
  });
});

describe("media file links", () => {
  test("survive a daemon restart and stay the same for the same file", async () => {
    const dir = tempDir();
    const film = path.join(dir, "film.mp4");
    writeFileSync(film, "x");
    const persistPath = path.join(dir, "home", "show-media", "grants.json");
    const first = new ShowMediaFileStore({ persistPath });
    const link = await first.grant(film);
    expect(await first.grant(film)).toBe(link);
    const token = link.split("/")[3];
    const restarted = new ShowMediaFileStore({ persistPath });
    expect(restarted.resolve(token)).toBe(film);
  });
});

describe("media_control", () => {
  test("answers with the normalized command", async () => {
    const answer = await call(registerAll(), "media_control", { action: "seek", offset: 30 });
    expect(answer).toMatchObject({
      ok: true,
      command: { action: "seek", position: null, offset: 30 },
    });
  });

  test("validates the action and its values", async () => {
    const tools = registerAll();
    await expect(call(tools, "media_control", { action: "rewind" })).rejects.toThrow();
    await expect(call(tools, "media_control", { action: "volume", volume: 101 })).rejects.toThrow();
    await expect(call(tools, "media_control", { action: "volume" })).rejects.toThrow(/0–100/);
  });
});
