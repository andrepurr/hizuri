import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "./test-utils/paseo-daemon.js";

// Hizuri: the update, avatar and media routes are public and must be mounted before the web UI
// (its middleware answers every other GET) and before the daemon password. If mounted after
// the web UI, the phone gets the web page instead of its update.

const PASSWORD_HASH = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";
const WEB_UI_HTML = "<!DOCTYPE html><html><head></head><body>web-ui</body></html>";
const AVATAR_HTML = "<!DOCTYPE html><html><body>avatar-page</body></html>";
const MEDIA_NAME = `${"a".repeat(64)}.png`;

describe("hizuri public routes", () => {
  let tempRoot: string | null = null;
  let daemon: TestPaseoDaemon | null = null;

  afterEach(async () => {
    await daemon?.close();
    daemon = null;
    if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  async function startDaemon(): Promise<string> {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "hizuri-routes-"));
    const distDir = path.join(tempRoot, "dist");
    const avatarDir = path.join(tempRoot, "avatar");
    const paseoHomeRoot = path.join(tempRoot, "home");
    const mediaDir = path.join(paseoHomeRoot, ".paseo", "stage", "media");
    await Promise.all([distDir, avatarDir, mediaDir].map((dir) => mkdir(dir, { recursive: true })));
    await writeFile(path.join(distDir, "index.html"), WEB_UI_HTML);
    await writeFile(path.join(avatarDir, "index.html"), AVATAR_HTML);
    await writeFile(path.join(mediaDir, MEDIA_NAME), "media-bytes");
    daemon = await createTestPaseoDaemon({
      mcpEnabled: false,
      paseoHomeRoot,
      auth: { password: PASSWORD_HASH },
      webUi: { enabled: true, distDir },
      faceAvatarDir: avatarDir,
    });
    return `http://127.0.0.1:${daemon.port}`;
  }

  test("are answered by their own routers, without the password, ahead of the web UI", async () => {
    const base = await startDaemon();

    // Only the updates router writes this answer; it reads the (empty) updates folder for it.
    const manifest = await fetch(`${base}/zuri-updates/manifest`, {
      headers: { "expo-platform": "android", "expo-runtime-version": "1" },
    });
    expect(manifest.status).toBe(404);
    expect(await manifest.json()).toEqual({ error: "No update for runtime version 1" });

    const avatar = await fetch(`${base}/avatar/`);
    expect(avatar.status).toBe(200);
    expect(await avatar.text()).toContain("avatar-page");

    const stageMedia = await fetch(`${base}/stage-media/${MEDIA_NAME}`);
    expect(stageMedia.status).toBe(200);
    expect(await stageMedia.text()).toBe("media-bytes");

    const showMedia = await fetch(`${base}/hizuri-media/file/unknown-token/clip.mp4`);
    expect(showMedia.status).toBe(404);
    expect(await showMedia.json()).toEqual({ error: "Unknown or expired media link" });
  });

  test("leave every other GET to the web UI and the API to the password", async () => {
    const base = await startDaemon();

    const page = await fetch(`${base}/some/app/route`, { headers: { accept: "text/html" } });
    expect(await page.text()).toContain("web-ui");

    const status = await fetch(`${base}/api/status`);
    expect(status.status).toBe(401);
  });
});
