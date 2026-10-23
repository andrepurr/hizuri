import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  handleAssetRequest,
  handleManifestRequest,
  isFromThisMachine,
  type UpdatesHttpResponse,
} from "./zuri-updates.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ASSET = "assets/4f1cb2cac2370cd5050681232e8575a8";

// The phone reaches the daemon over a VPN; the emulator runs on the daemon's own machine.
const PHONE = { fromThisMachine: false };
const EMULATOR = { fromThisMachine: true };

function publishUpdate(
  updatesDir: string,
  runtimeVersion: string,
  timestamp: string,
  options: { staged?: boolean } = {},
): void {
  const dir = options.staged
    ? path.join(updatesDir, runtimeVersion, "staging", timestamp)
    : path.join(updatesDir, runtimeVersion, timestamp);
  // Like a real export, the bundle name differs per build, so each update has its own id.
  const bundle = `_expo/static/js/android/index-${timestamp}.hbc`;
  mkdirSync(path.join(dir, "_expo/static/js/android"), { recursive: true });
  mkdirSync(path.join(dir, "assets"), { recursive: true });
  writeFileSync(path.join(dir, bundle), `bundle ${timestamp}`);
  writeFileSync(path.join(dir, ASSET), "png-bytes");
  writeFileSync(
    path.join(dir, "metadata.json"),
    JSON.stringify({
      version: 0,
      bundler: "metro",
      fileMetadata: { android: { bundle, assets: [{ path: ASSET, ext: "png" }] } },
    }),
  );
  writeFileSync(path.join(dir, "expoConfig.json"), JSON.stringify({ name: "Zuri" }));
}

function makeUpdatesDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "zuri-updates-test-"));
  tempDirs.push(dir);
  return dir;
}

function readPart(response: UpdatesHttpResponse): { name: string; json: Record<string, unknown> } {
  const body = response.body.toString();
  const name = /name="([^"]+)"/.exec(body)?.[1] ?? "";
  const json = body.slice(body.indexOf("\r\n\r\n") + 4, body.lastIndexOf("\r\n--"));
  return { name, json: JSON.parse(json) as Record<string, unknown> };
}

function manifestRequest(
  updatesDir: string,
  client: { fromThisMachine: boolean },
  headers: Record<string, string> = {},
) {
  return handleManifestRequest({
    updatesDir,
    headers: {
      "expo-platform": "android",
      "expo-runtime-version": "rt1",
      "expo-protocol-version": "1",
      ...headers,
    },
    query: {},
    baseUrl: "http://192.0.2.1:6768",
    ...client,
  });
}

async function readManifest(
  updatesDir: string,
  client: { fromThisMachine: boolean },
): Promise<{ id: string; launchAsset: { hash: string; url: string } }> {
  const { name, json } = readPart(await manifestRequest(updatesDir, client));
  expect(name).toBe("manifest");
  return json as unknown as { id: string; launchAsset: { hash: string; url: string } };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("base64url");
}

function assetQuery(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe("Zuri update server", () => {
  test("serves the newest update for the runtime version as a multipart manifest", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    publishUpdate(updatesDir, "rt1", "200");

    const response = await manifestRequest(updatesDir, PHONE);

    expect(response.status).toBe(200);
    expect(response.headers["expo-protocol-version"]).toBe("1");
    expect(response.headers["content-type"]).toMatch(/^multipart\/mixed; boundary=/);
    const { name, json } = readPart(response);
    expect(name).toBe("manifest");
    expect(json).toMatchObject({
      runtimeVersion: "rt1",
      extra: { expoClient: { name: "Zuri" } },
      launchAsset: {
        fileExtension: ".bundle",
        contentType: "application/javascript",
        hash: sha256("bundle 200"),
      },
      assets: [{ fileExtension: ".png", contentType: "image/png" }],
    });
    expect(String((json.launchAsset as { url: string }).url)).toContain(
      "http://192.0.2.1:6768/zuri-updates/assets?runtimeVersion=rt1&update=200",
    );
  });

  test("answers noUpdateAvailable when the app already runs the newest update", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    const first = readPart(await manifestRequest(updatesDir, PHONE));

    const again = await manifestRequest(updatesDir, PHONE, {
      "expo-current-update-id": String(first.json.id),
    });

    expect(readPart(again)).toEqual({ name: "directive", json: { type: "noUpdateAvailable" } });
  });

  test("the same export under a new runtime version gets a new id, so a new APK loads it", async () => {
    const updatesDir = makeUpdatesDir();
    // One `expo export`, published for the old APK and again for a new APK whose native code
    // changed: metadata.json is byte for byte the same.
    publishUpdate(updatesDir, "rt1", "100");
    publishUpdate(updatesDir, "rt2", "100");
    const oldApk = readPart(await manifestRequest(updatesDir, PHONE));

    // The new APK still holds the copy it fetched under rt1 and reports that id.
    const newApk = readPart(
      await manifestRequest(updatesDir, PHONE, {
        "expo-runtime-version": "rt2",
        "expo-current-update-id": String(oldApk.json.id),
      }),
    );

    expect(newApk.name).toBe("manifest");
    expect(newApk.json).toMatchObject({ runtimeVersion: "rt2" });
    expect(newApk.json.id).not.toBe(oldApk.json.id);
    expect(String(newApk.json.id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  test("returns 404 for a native build that has no published update", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    const response = await handleManifestRequest({
      updatesDir,
      headers: { "expo-platform": "android", "expo-runtime-version": "other" },
      query: {},
      baseUrl: "http://x",
      ...PHONE,
    });
    expect(response.status).toBe(404);
  });

  test("serves only files the export metadata lists", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    const query = { runtimeVersion: "rt1", update: "100", platform: "android" };

    const asset = await handleAssetRequest({
      updatesDir,
      query: { ...query, path: ASSET },
      ...PHONE,
    });
    expect(asset.status).toBe(200);
    expect(asset.headers["content-type"]).toBe("image/png");
    expect(asset.body.toString()).toBe("png-bytes");

    const traversal = await handleAssetRequest({
      updatesDir,
      query: { ...query, path: "../../../etc/passwd" },
      ...PHONE,
    });
    expect(traversal.status).toBe(404);

    const badRuntime = await handleAssetRequest({
      updatesDir,
      query: { ...query, runtimeVersion: "../x", path: ASSET },
      ...PHONE,
    });
    expect(badRuntime.status).toBe(400);
  });
});

describe("Zuri staged updates", () => {
  test("the phone gets only the newest live update, never a staged one", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    publishUpdate(updatesDir, "rt1", "300", { staged: true });

    const manifest = await readManifest(updatesDir, PHONE);

    expect(manifest.launchAsset.hash).toBe(sha256("bundle 100"));
    expect(assetQuery(manifest.launchAsset.url)).not.toHaveProperty("staged");
  });

  test("the phone gets 404 while the only update is staged", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "300", { staged: true });

    expect((await manifestRequest(updatesDir, PHONE)).status).toBe(404);
  });

  test("this machine gets a newer staged update, and its asset URLs resolve", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    publishUpdate(updatesDir, "rt1", "300", { staged: true });

    const manifest = await readManifest(updatesDir, EMULATOR);

    expect(manifest.launchAsset.hash).toBe(sha256("bundle 300"));
    const query = assetQuery(manifest.launchAsset.url);
    expect(query).toMatchObject({ update: "300", staged: "1" });
    const bundle = await handleAssetRequest({ updatesDir, query, ...EMULATOR });
    expect(bundle.status).toBe(200);
    expect(bundle.body.toString()).toBe("bundle 300");
    // A staged file stays hidden from the phone even when it knows the URL.
    expect((await handleAssetRequest({ updatesDir, query, ...PHONE })).status).toBe(404);
  });

  test("this machine gets a live update that is newer than the staged one", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100", { staged: true });
    publishUpdate(updatesDir, "rt1", "200");

    const manifest = await readManifest(updatesDir, EMULATOR);

    expect(manifest.launchAsset.hash).toBe(sha256("bundle 200"));
  });

  test("promoting moves the folder out of staging: the phone gets what the emulator ran", async () => {
    const updatesDir = makeUpdatesDir();
    publishUpdate(updatesDir, "rt1", "100");
    publishUpdate(updatesDir, "rt1", "300", { staged: true });
    const tested = await readManifest(updatesDir, EMULATOR);
    expect((await readManifest(updatesDir, PHONE)).id).not.toBe(tested.id);

    // What scripts/zuri-promote-update.sh does: one rename on the same filesystem.
    renameSync(path.join(updatesDir, "rt1", "staging", "300"), path.join(updatesDir, "rt1", "300"));

    const promoted = await readManifest(updatesDir, PHONE);
    expect(promoted.id).toBe(tested.id);
    expect(promoted.launchAsset.hash).toBe(tested.launchAsset.hash);
    const query = assetQuery(promoted.launchAsset.url);
    expect(query).not.toHaveProperty("staged");
    const bundle = await handleAssetRequest({ updatesDir, query, ...PHONE });
    expect(bundle.body.toString()).toBe("bundle 300");
    // The emulator already runs this update, so it is told there is nothing new.
    const again = await manifestRequest(updatesDir, EMULATOR, {
      "expo-current-update-id": tested.id,
    });
    expect(readPart(again)).toEqual({ name: "directive", json: { type: "noUpdateAvailable" } });
  });

  test("this machine means loopback or one of its own addresses, never a forwarded request", () => {
    const interfaces = {
      lo: [{ address: "127.0.0.1" }, { address: "::1" }],
      "wg-out": [{ address: "198.51.100.20" }],
      "wg-in": [{ address: "192.0.2.1" }],
    } as unknown as NonNullable<Parameters<typeof isFromThisMachine>[0]["interfaces"]>;
    const check = (remoteAddress: string | undefined, headers: Record<string, string> = {}) =>
      isFromThisMachine({ remoteAddress, headers, interfaces });

    expect(check("127.0.0.1")).toBe(true);
    expect(check("::ffff:127.0.0.1")).toBe(true);
    expect(check("::1")).toBe(true);
    // The emulator's requests to 192.0.2.1 arrive from the machine's NAT (wg-out) address.
    expect(check("198.51.100.20")).toBe(true);
    expect(check("::ffff:192.0.2.1")).toBe(true);
    // The phone over the VPN, a LAN device, an unknown peer, a request through a local proxy.
    expect(check("192.0.2.2")).toBe(false);
    expect(check("172.16.0.50")).toBe(false);
    expect(check(undefined)).toBe(false);
    expect(check("127.0.0.1", { "x-forwarded-for": "192.0.2.2" })).toBe(false);
  });
});
