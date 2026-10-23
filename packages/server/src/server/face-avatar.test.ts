import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import { afterEach, describe, expect, test } from "vitest";
import { createFaceAvatarRouter, FACE_AVATAR_ROUTE, faceAvatarDirs } from "./face-avatar.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function listen(avatarDir: string, cleanup: () => void): Promise<string> {
  const app = express();
  app.use(FACE_AVATAR_ROUTE, createFaceAvatarRouter({ avatarDir }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  cleanups.push(() => {
    server.close();
    cleanup();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function serve(): Promise<string> {
  const dir = mkdtempSync(path.join(tmpdir(), "face-avatar-"));
  writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>face</title>");
  writeFileSync(path.join(dir, "avatar-1.vrm"), "model-bytes");
  symlinkSync(path.join(dir, "avatar-1.vrm"), path.join(dir, "model.vrm"));
  writeFileSync(path.join(dir, ".secret"), "hidden");
  return listen(dir, () => rmSync(dir, { recursive: true, force: true }));
}

/** A data folder (the face's own files) listed before the shared page code, as on a real host. */
async function serveTwo(): Promise<string> {
  const data = mkdtempSync(path.join(tmpdir(), "face-avatar-data-"));
  const code = mkdtempSync(path.join(tmpdir(), "face-avatar-code-"));
  mkdirSync(path.join(data, "live"));
  mkdirSync(path.join(code, "live"));
  writeFileSync(path.join(data, "live", "atlas.png"), "atlas-bytes");
  writeFileSync(path.join(data, "live", "mouth.js"), "data-page");
  writeFileSync(path.join(code, "live", "mouth.js"), "old-copy");
  writeFileSync(path.join(code, "live", "delaunator.min.js"), "library");
  return listen([data, code].join(path.delimiter), () => {
    rmSync(data, { recursive: true, force: true });
    rmSync(code, { recursive: true, force: true });
  });
}

describe("face avatar route", () => {
  test("redirects the bare route to the folder, keeping the query", async () => {
    const base = await serve();
    const response = await fetch(`${base}/avatar?host=app`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/avatar/?host=app");
  });

  test("serves the page and the model through its symlink, with a stable ETag", async () => {
    const base = await serve();
    const page = await fetch(`${base}/avatar/?host=app`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<title>face</title>");
    const model = await fetch(`${base}/avatar/model.vrm`);
    expect(await model.text()).toBe("model-bytes");
    expect(model.headers.get("cache-control")).toBe("no-cache");
    const etag = model.headers.get("etag");
    expect(etag).toBeTruthy();
    // The page compares this HEAD answer with the ETag of the copy it keeps in IndexedDB.
    const head = await fetch(`${base}/avatar/model.vrm`, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("etag")).toBe(etag);
  });

  test("hides dotfiles and answers missing files with 404", async () => {
    const base = await serve();
    expect((await fetch(`${base}/avatar/.secret`)).status).toBe(404);
    expect((await fetch(`${base}/avatar/missing.js`)).status).toBe(404);
  });

  test("looks a file up in each listed folder in turn, the first one winning", async () => {
    const base = await serveTwo();
    expect(await (await fetch(`${base}/avatar/live/atlas.png`)).text()).toBe("atlas-bytes");
    expect(await (await fetch(`${base}/avatar/live/mouth.js`)).text()).toBe("data-page");
    expect(await (await fetch(`${base}/avatar/live/delaunator.min.js`)).text()).toBe("library");
    expect((await fetch(`${base}/avatar/live/missing.bin`)).status).toBe(404);
  });

  test("splits the setting like PATH and skips empty parts", () => {
    expect(faceAvatarDirs("/data/avatar")).toEqual(["/data/avatar"]);
    expect(faceAvatarDirs(["/data/avatar", "", " /code/avatar "].join(path.delimiter))).toEqual([
      "/data/avatar",
      "/code/avatar",
    ]);
  });
});
