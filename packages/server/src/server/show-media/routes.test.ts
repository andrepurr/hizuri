import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { SHOW_MEDIA_ROUTE, ShowMediaFileStore } from "./files.js";
import { createShowMediaRouter } from "./routes.js";

let dir: string;
let server: Server;
let baseUrl: string;
let now: number;
let files: ShowMediaFileStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "show-media-"));
  now = 1_000_000;
  files = new ShowMediaFileStore({ now: () => now });
  const app = express();
  app.use(SHOW_MEDIA_ROUTE, createShowMediaRouter({ files, logger: pino({ level: "silent" }) }));
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe("show media routes", () => {
  test("the YouTube page loads the IFrame API and allows a cross-origin Referer", async () => {
    const response = await fetch(`${baseUrl}${SHOW_MEDIA_ROUTE}/youtube?v=dQw4w9WgXcQ`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const html = await response.text();
    expect(html).toContain("https://www.youtube.com/iframe_api");
    expect(html).toContain("window.hizuriMedia");
  });

  test("a granted file streams with range support, for seeking", async () => {
    const film = path.join(dir, "film.mp4");
    writeFileSync(film, "0123456789");
    const link = await files.grant(film);
    expect(link).toMatch(/^\/hizuri-media\/file\/[A-Za-z0-9_-]{43}\/film\.mp4$/);

    const whole = await fetch(`${baseUrl}${link}`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect(await whole.text()).toBe("0123456789");

    const part = await fetch(`${baseUrl}${link}`, { headers: { Range: "bytes=2-4" } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("234");
  });

  test("unknown and expired links answer 404", async () => {
    const film = path.join(dir, "song.mp3");
    writeFileSync(film, "abc");
    const link = await files.grant(film);

    expect((await fetch(`${baseUrl}${SHOW_MEDIA_ROUTE}/file/nope/song.mp3`)).status).toBe(404);
    now += 8 * 24 * 60 * 60 * 1000;
    expect((await fetch(`${baseUrl}${link}`)).status).toBe(404);
  });

  test("grant refuses missing files, folders and relative paths", async () => {
    await expect(files.grant(path.join(dir, "missing.mkv"))).rejects.toThrow(/No such file/);
    await expect(files.grant(dir)).rejects.toThrow(/Not a file/);
    await expect(files.grant("films/a.mkv")).rejects.toThrow(/absolute/);
  });
});
