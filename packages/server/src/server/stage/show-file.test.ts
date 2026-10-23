import { mkdir, mkdtemp, readdir, rm, symlink, utimes, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { PaseoToolConfig, PaseoToolResult } from "../agent/tools/types.js";
import {
  createStageMediaRouter,
  pruneStageMedia,
  readShowFile,
  registerShowFileTool,
  resolveShowFileConfig,
  type ShowFileConfig,
} from "./show-file.js";
import { STAGE_MEDIA_ROUTE } from "./blocks.js";
import { StageStore } from "./store.js";

const logger = pino({ level: "silent" });
const AGENT = "zuri";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let root: string;
let shared: string;
let home: string;
let config: ShowFileConfig;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "show-file-"));
  shared = path.join(root, "share", "outputs");
  home = path.join(root, "paseo-home");
  await mkdir(shared, { recursive: true });
  await mkdir(home, { recursive: true });
  config = resolveShowFileConfig({ paseoHome: home, env: { PASEO_SHOW_FILE_DIRS: shared } });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function registerTool(store: StageStore) {
  let handler: ((input: unknown) => Promise<PaseoToolResult>) | null = null;
  registerShowFileTool({
    registerTool: (name: string, _config: PaseoToolConfig, run) => {
      expect(name).toBe("show_file");
      handler = (input) => run(input, {} as never);
    },
    store,
    owner: AGENT,
    config,
    logger,
  });
  if (!handler) throw new Error("show_file was not registered");
  return handler as (input: unknown) => Promise<PaseoToolResult>;
}

describe("show_file", () => {
  test("a page opens as a tab with the HTML inline, from its path alone", async () => {
    const html = "<!doctype html><h1>Evening</h1><script>document.title='x'</script>";
    await writeFile(path.join(shared, "evening.html"), html);
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);

    const result = await run({ path: path.join(shared, "evening.html"), window: "Evening" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ ok: true, window: "Evening", kind: "page" });
    const stage = await store.get(AGENT);
    expect(stage.focus).toBe(stage.tabs[0].id);
    expect(stage.tabs[0]).toMatchObject({ title: "Evening" });
    expect(stage.tabs[0].blocks).toEqual([
      expect.objectContaining({ type: "web", id: "file", props: { html } }),
    ]);
  });

  test("the same window again replaces the tab", async () => {
    await writeFile(path.join(shared, "a.html"), "<p>a</p>");
    await writeFile(path.join(shared, "b.html"), "<p>b</p>");
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);
    await run({ path: path.join(shared, "a.html"), window: "Page" });
    await run({ path: path.join(shared, "b.html"), window: "Page" });
    const stage = await store.get(AGENT);
    expect(stage.tabs).toHaveLength(1);
    expect(stage.tabs[0].blocks[0]).toMatchObject({ props: { html: "<p>b</p>" } });
  });

  test("several files share one canvas tab: a video, a page and audio together", async () => {
    await writeFile(path.join(shared, "deck.html"), "<p>deck</p>");
    await writeFile(path.join(shared, "clip.mp4"), Buffer.from("video bytes"));
    await writeFile(path.join(shared, "song.mp3"), Buffer.from("audio bytes"));
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);

    const result = await run({
      path: path.join(shared, "clip.mp4"),
      also: [path.join(shared, "deck.html"), path.join(shared, "song.mp3")],
      window: "Evening",
      caption: "Sunset",
    });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      ok: true,
      window: "Evening",
      kind: "canvas",
      kinds: ["video", "page", "audio"],
    });
    const [tab] = (await store.get(AGENT)).tabs;
    expect(tab.blocks.map((block) => [block.type, block.id])).toEqual([
      ["media", "file"],
      ["web", "file2"],
      ["media", "file3"],
    ]);
    expect(tab.blocks[0]).toMatchObject({ props: { kind: "video", title: "Sunset" } });

    const tooMany = await run({
      path: path.join(shared, "deck.html"),
      also: [1, 2, 3, 4].map(() => path.join(shared, "deck.html")),
    });
    expect(tooMany.isError).toBe(true);
  });

  test("a file outside the allowed folders, or reached through a symlink out, is refused", async () => {
    const outside = path.join(root, "secret.html");
    await writeFile(outside, "<p>secret</p>");
    await symlink(outside, path.join(shared, "link.html"));
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);

    for (const file of [outside, path.join(shared, "link.html"), `${shared}/../../secret.html`]) {
      const result = await run({ path: file });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("outside the folders Show may open");
    }
    expect((await store.get(AGENT)).tabs).toHaveLength(0);
  });

  test("a missing file and an unknown kind say what is wrong", async () => {
    await writeFile(path.join(shared, "notes.txt"), "hi");
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);
    const missing = await run({ path: path.join(shared, "nope.html") });
    expect(JSON.stringify(missing.content)).toContain("No file at");
    const text = await run({ path: path.join(shared, "notes.txt") });
    expect(JSON.stringify(text.content)).toContain("not .txt");
  });

  test("a picture is copied under its hash and served with ranges; a video becomes a media block", async () => {
    await writeFile(path.join(shared, "faces.png"), PNG);
    await writeFile(path.join(shared, "reel.mp4"), Buffer.alloc(4096, 7));

    const picture = await readShowFile(config, {
      path: path.join(shared, "faces.png"),
      caption: "Faces",
    });
    const video = await readShowFile(config, { path: path.join(shared, "reel.mp4") });

    expect(picture.block).toMatchObject({
      type: "image",
      props: { images: [{ caption: "Faces" }], fit: "contain" },
    });
    const pictureUrl = (picture.block.props as { images: { url: string }[] }).images[0].url;
    expect(pictureUrl).toMatch(/^\/stage-media\/[0-9a-f]{64}\.png$/);
    expect(video.block).toMatchObject({ type: "media", props: { kind: "video" } });
    const videoUrl = (video.block.props as { url: string }).url;

    // The source can go: the tab plays the copy.
    await rm(path.join(shared, "faces.png"));
    const app = express();
    app.use(STAGE_MEDIA_ROUTE, createStageMediaRouter({ mediaDir: config.mediaDir }));
    const server = app.listen(0);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const image = await fetch(`${base}${pictureUrl}`);
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(Buffer.from(await image.arrayBuffer())).toEqual(PNG);
      const range = await fetch(`${base}${videoUrl}`, { headers: { Range: "bytes=0-99" } });
      expect(range.status).toBe(206);
      expect((await range.arrayBuffer()).byteLength).toBe(100);
      expect((await fetch(`${base}/stage-media/`)).status).toBe(404);
      expect((await fetch(`${base}/stage-media/..%2Fstage.json`)).status).toBe(404);
    } finally {
      server.close();
    }
  });

  test("a copy no stage names any more is pruned once it is old", async () => {
    await writeFile(path.join(shared, "a.png"), PNG);
    await writeFile(path.join(shared, "b.png"), Buffer.concat([PNG, Buffer.from([0])]));
    const store = new StageStore({ paseoHome: home, logger });
    const run = registerTool(store);
    await run({ path: path.join(shared, "a.png"), window: "Kept" });
    const orphan = await readShowFile(config, { path: path.join(shared, "b.png") });
    const orphanName = path.basename(
      (orphan.block.props as { images: { url: string }[] }).images[0].url,
    );
    expect(await pruneStageMedia(config)).toBe(0);

    const old = new Date(Date.now() - 60 * 60 * 1000);
    for (const name of await readdir(config.mediaDir)) {
      await utimes(path.join(config.mediaDir, name), old, old);
    }
    expect(await pruneStageMedia(config)).toBe(1);
    const left = await readdir(config.mediaDir);
    expect(left).toHaveLength(1);
    expect(left).not.toContain(orphanName);
  });
});

describe("allowed folders", () => {
  test("default to ~/share/outputs and are named in the tool's description as configured", () => {
    const neutral = resolveShowFileConfig({ paseoHome: home, env: {} });
    expect(neutral.shownDirs).toEqual(["~/share/outputs"]);
    const own = resolveShowFileConfig({
      paseoHome: home,
      env: { PASEO_SHOW_FILE_DIRS: "~/share/outputs:~/reports" },
    });
    expect(own.allowedDirs).toHaveLength(2);
    let description = "";
    registerShowFileTool({
      registerTool: (_name, toolConfig) => {
        const schema = toolConfig.inputSchema as Record<string, { description?: string }>;
        description = schema.path?.description ?? "";
      },
      store: new StageStore({ paseoHome: home, logger }),
      owner: AGENT,
      config: own,
      logger,
    });
    expect(description).toContain("under ~/share/outputs or ~/reports.");
  });
});
