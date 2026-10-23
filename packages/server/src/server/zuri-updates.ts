import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import path from "node:path";
import express from "express";
import type { Logger } from "pino";

// Zuri: a self-hosted server for over-the-air JS updates (Expo Updates protocol v0 and v1),
// adapted from expo/custom-expo-updates-server (MIT). Updates live in
// $PASEO_HOME/zuri-updates/<runtimeVersion>/<unix-seconds>/ as written by
// scripts/zuri-publish-update.sh: `expo export` output plus expoConfig.json.
// Staged updates live in <runtimeVersion>/staging/<unix-seconds>/ and go only to apps on this
// machine (the Android emulator), so an update is tried there before the phone sees it;
// scripts/zuri-promote-update.sh moves one into the live folder.
// Mounted before daemon auth: an app fetches updates without the daemon password, so
// bundles must never contain secrets (EXPO_PUBLIC_* values are public by design).

export const ZURI_UPDATES_ROUTE = "/zuri-updates";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const UPDATE_NAME = /^\d+$/;
const STAGING_DIR = "staging";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  json: "application/json",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

export type UpdatePlatform = "android" | "ios";

interface ExportedAssetMetadata {
  path: string;
  ext: string;
}

interface ExportMetadata {
  fileMetadata: Partial<
    Record<UpdatePlatform, { bundle: string; assets: ExportedAssetMetadata[] }>
  >;
}

export interface ManifestAsset {
  hash: string;
  key: string;
  fileExtension: string;
  contentType: string;
  url: string;
}

export interface UpdateManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: ManifestAsset;
  assets: ManifestAsset[];
  metadata: Record<string, never>;
  extra: { expoClient?: unknown };
}

export interface UpdatesHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer | string;
}

function jsonError(status: number, error: string): UpdatesHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error }),
  };
}

function base64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Expo wants a UUID-shaped update id; the first 128 bits of a sha256 hash give one. */
export function hashToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

type NetworkInterfaces = ReturnType<typeof networkInterfaces>;

function normalizeAddress(address: string): string {
  const unzoned = address.toLowerCase().split("%")[0];
  return unzoned.startsWith("::ffff:") && unzoned.includes(".") ? unzoned.slice(7) : unzoned;
}

/**
 * True when the request comes from this machine: a loopback peer or one of its own interface
 * addresses. An emulator's requests to the machine's VPN address can arrive from another of its
 * own addresses (rewritten by NAT), so loopback alone is not enough. The socket peer is used, never
 * X-Forwarded-For, and a forwarded request counts as remote: a local proxy relays someone
 * else's request. The kernel drops inbound packets that claim a local source address.
 */
export function isFromThisMachine(input: {
  remoteAddress: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  interfaces?: NetworkInterfaces;
}): boolean {
  if (input.remoteAddress === undefined) {
    return false;
  }
  if (input.headers["x-forwarded-for"] !== undefined || input.headers.forwarded !== undefined) {
    return false;
  }
  const address = normalizeAddress(input.remoteAddress);
  if (address.startsWith("127.") || address === "::1") {
    return true;
  }
  return Object.values(input.interfaces ?? networkInterfaces()).some((infos) =>
    (infos ?? []).some((info) => normalizeAddress(info.address) === address),
  );
}

export interface PublishedUpdate {
  dir: string;
  name: string;
  staged: boolean;
}

async function listUpdateNames(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((name) => UPDATE_NAME.test(name));
  } catch {
    return [];
  }
}

export async function findLatestUpdate(input: {
  updatesDir: string;
  runtimeVersion: string;
  includeStaged: boolean;
}): Promise<PublishedUpdate | null> {
  if (!SAFE_SEGMENT.test(input.runtimeVersion)) {
    return null;
  }
  const runtimeDir = path.join(input.updatesDir, input.runtimeVersion);
  const updates: PublishedUpdate[] = (await listUpdateNames(runtimeDir)).map((name) => ({
    dir: path.join(runtimeDir, name),
    name,
    staged: false,
  }));
  if (input.includeStaged) {
    const stagingDir = path.join(runtimeDir, STAGING_DIR);
    for (const name of await listUpdateNames(stagingDir)) {
      updates.push({ dir: path.join(stagingDir, name), name, staged: true });
    }
  }
  // Newest first; on equal stamps the live copy wins.
  updates.sort((a, b) => Number(b.name) - Number(a.name) || Number(a.staged) - Number(b.staged));
  return updates[0] ?? null;
}

/**
 * The update id hashes the runtime version together with the export metadata. expo-updates keys
 * downloaded updates by id, stores the runtime version each was fetched under, and launches only
 * updates of the APK's own runtime. With an id from the export alone, the same JS published under
 * a new APK's runtime kept the id the app had fetched under its old runtime: the app took it as
 * already downloaded and launched its embedded bundle on every start.
 */
function updateIdFor(input: { runtimeVersion: string; metadata: Buffer }): string {
  return hashToUuid(
    createHash("sha256").update(`${input.runtimeVersion}\n`).update(input.metadata).digest("hex"),
  );
}

async function readExportMetadata(updateDir: string): Promise<{
  metadata: ExportMetadata;
  raw: Buffer;
  createdAt: string;
}> {
  const metadataPath = path.join(updateDir, "metadata.json");
  const raw = await readFile(metadataPath);
  const stats = await stat(metadataPath);
  return {
    metadata: JSON.parse(raw.toString("utf8")) as ExportMetadata,
    raw,
    createdAt: stats.mtime.toISOString(),
  };
}

async function describeAsset(input: {
  updateDir: string;
  relativePath: string;
  ext: string | null;
  assetUrl: (relativePath: string) => string;
}): Promise<ManifestAsset> {
  const contents = await readFile(path.join(input.updateDir, input.relativePath));
  const isLaunchAsset = input.ext === null;
  return {
    hash: base64Url(createHash("sha256").update(contents).digest("base64")),
    key: createHash("md5").update(contents).digest("hex"),
    fileExtension: isLaunchAsset ? ".bundle" : `.${input.ext}`,
    contentType: isLaunchAsset
      ? "application/javascript"
      : (CONTENT_TYPES[input.ext ?? ""] ?? "application/octet-stream"),
    url: input.assetUrl(input.relativePath),
  };
}

// Published update folders never change, and hashing a 40 MB bundle on every launch check is
// waste, so manifests are cached per folder.
const MANIFEST_CACHE_LIMIT = 8;
const manifestCache = new Map<string, Promise<UpdateManifest>>();

function cachedUpdateManifest(
  input: Parameters<typeof buildUpdateManifest>[0],
): Promise<UpdateManifest> {
  const key = `${input.updateDir}|${input.platform}|${input.baseUrl}`;
  const cached = manifestCache.get(key);
  if (cached) {
    return cached;
  }
  const built = buildUpdateManifest(input);
  built.catch(() => manifestCache.delete(key));
  manifestCache.set(key, built);
  if (manifestCache.size > MANIFEST_CACHE_LIMIT) {
    const oldest = manifestCache.keys().next().value;
    if (oldest !== undefined) manifestCache.delete(oldest);
  }
  return built;
}

export async function buildUpdateManifest(input: {
  updateDir: string;
  staged: boolean;
  runtimeVersion: string;
  platform: UpdatePlatform;
  baseUrl: string;
}): Promise<UpdateManifest> {
  const { metadata, raw, createdAt } = await readExportMetadata(input.updateDir);
  const platformMetadata = metadata.fileMetadata[input.platform];
  if (!platformMetadata) {
    throw new Error(`The update has no ${input.platform} bundle`);
  }
  const updateName = path.basename(input.updateDir);
  const assetUrl = (relativePath: string) => {
    const query = new URLSearchParams({
      runtimeVersion: input.runtimeVersion,
      update: updateName,
      platform: input.platform,
      path: relativePath,
    });
    if (input.staged) {
      query.set("staged", "1");
    }
    return `${input.baseUrl}${ZURI_UPDATES_ROUTE}/assets?${query.toString()}`;
  };
  let expoClient: unknown;
  try {
    expoClient = JSON.parse(await readFile(path.join(input.updateDir, "expoConfig.json"), "utf8"));
  } catch {
    expoClient = undefined;
  }
  return {
    id: updateIdFor({ runtimeVersion: input.runtimeVersion, metadata: raw }),
    createdAt,
    runtimeVersion: input.runtimeVersion,
    launchAsset: await describeAsset({
      updateDir: input.updateDir,
      relativePath: platformMetadata.bundle,
      ext: null,
      assetUrl,
    }),
    assets: await Promise.all(
      platformMetadata.assets.map((asset) =>
        describeAsset({
          updateDir: input.updateDir,
          relativePath: asset.path,
          ext: asset.ext,
          assetUrl,
        }),
      ),
    ),
    metadata: {},
    extra: expoClient === undefined ? {} : { expoClient },
  };
}

function multipartResponse(input: {
  partName: "manifest" | "directive";
  json: unknown;
  protocolVersion: number;
}): UpdatesHttpResponse {
  const boundary = `zuri-${randomBytes(12).toString("hex")}`;
  const body =
    `--${boundary}\r\n` +
    `content-disposition: form-data; name="${input.partName}"\r\n` +
    "content-type: application/json; charset=utf-8\r\n\r\n" +
    `${JSON.stringify(input.json)}\r\n` +
    `--${boundary}--\r\n`;
  return {
    status: 200,
    headers: {
      "expo-protocol-version": String(input.protocolVersion),
      "expo-sfv-version": "0",
      "cache-control": "private, max-age=0",
      "content-type": `multipart/mixed; boundary=${boundary}`,
    },
    body,
  };
}

function readPlatform(value: unknown): UpdatePlatform | null {
  return value === "android" || value === "ios" ? value : null;
}

export async function handleManifestRequest(input: {
  updatesDir: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  baseUrl: string;
  fromThisMachine: boolean;
}): Promise<UpdatesHttpResponse> {
  const header = (name: string): string | undefined => {
    const value = input.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const protocolVersion = Number.parseInt(header("expo-protocol-version") ?? "0", 10) === 1 ? 1 : 0;
  const platform = readPlatform(header("expo-platform") ?? input.query.platform);
  if (!platform) {
    return jsonError(400, "Unsupported platform. Expected either ios or android.");
  }
  const runtimeVersion = header("expo-runtime-version") ?? input.query["runtime-version"];
  if (typeof runtimeVersion !== "string" || runtimeVersion.length === 0) {
    return jsonError(400, "No runtimeVersion provided.");
  }
  const update = await findLatestUpdate({
    updatesDir: input.updatesDir,
    runtimeVersion,
    includeStaged: input.fromThisMachine,
  });
  if (!update) {
    // No update published for this native build: the app keeps its embedded bundle.
    return jsonError(404, `No update for runtime version ${runtimeVersion}`);
  }
  const manifest = await cachedUpdateManifest({
    updateDir: update.dir,
    staged: update.staged,
    runtimeVersion,
    platform,
    baseUrl: input.baseUrl,
  });
  if (protocolVersion === 1 && header("expo-current-update-id") === manifest.id) {
    return multipartResponse({
      partName: "directive",
      json: { type: "noUpdateAvailable" },
      protocolVersion,
    });
  }
  return multipartResponse({ partName: "manifest", json: manifest, protocolVersion });
}

export async function handleAssetRequest(input: {
  updatesDir: string;
  query: Record<string, unknown>;
  fromThisMachine: boolean;
}): Promise<UpdatesHttpResponse> {
  const { runtimeVersion, update, path: relativePath } = input.query;
  const platform = readPlatform(input.query.platform);
  if (
    !platform ||
    typeof runtimeVersion !== "string" ||
    typeof update !== "string" ||
    typeof relativePath !== "string" ||
    !SAFE_SEGMENT.test(runtimeVersion) ||
    !UPDATE_NAME.test(update)
  ) {
    return jsonError(400, "Expected runtimeVersion, update, platform and path.");
  }
  const staged = input.query.staged === "1";
  if (staged && !input.fromThisMachine) {
    return jsonError(404, "Unknown update.");
  }
  const updateDir = staged
    ? path.join(input.updatesDir, runtimeVersion, STAGING_DIR, update)
    : path.join(input.updatesDir, runtimeVersion, update);
  let metadata: ExportMetadata;
  try {
    ({ metadata } = await readExportMetadata(updateDir));
  } catch {
    return jsonError(404, "Unknown update.");
  }
  const platformMetadata = metadata.fileMetadata[platform];
  const isLaunchAsset = platformMetadata?.bundle === relativePath;
  const asset = platformMetadata?.assets.find((candidate) => candidate.path === relativePath);
  // Only files the export metadata lists are served, which also rules out path traversal.
  if (!isLaunchAsset && !asset) {
    return jsonError(404, "Unknown asset.");
  }
  const body = await readFile(path.join(updateDir, relativePath));
  return {
    status: 200,
    headers: {
      "content-type": isLaunchAsset
        ? "application/javascript"
        : (CONTENT_TYPES[asset?.ext ?? ""] ?? "application/octet-stream"),
      "cache-control": "public, max-age=31536000, immutable",
    },
    body,
  };
}

function send(res: express.Response, response: UpdatesHttpResponse): void {
  res.status(response.status);
  for (const [name, value] of Object.entries(response.headers)) {
    res.setHeader(name, value);
  }
  res.end(response.body);
}

function requestFromThisMachine(req: express.Request): boolean {
  return isFromThisMachine({ remoteAddress: req.socket.remoteAddress, headers: req.headers });
}

export function createZuriUpdatesRouter(input: {
  updatesDir: string;
  logger: Logger;
}): express.Router {
  const router = express.Router();
  router.get("/manifest", (req, res) => {
    handleManifestRequest({
      updatesDir: input.updatesDir,
      headers: req.headers,
      query: req.query,
      baseUrl: `${req.protocol}://${req.get("host") ?? "localhost"}`,
      fromThisMachine: requestFromThisMachine(req),
    })
      .then((response) => send(res, response))
      .catch((error: unknown) => {
        input.logger.warn({ err: error }, "Zuri update manifest failed");
        send(res, jsonError(500, "Update manifest failed"));
      });
  });
  router.get("/assets", (req, res) => {
    handleAssetRequest({
      updatesDir: input.updatesDir,
      query: req.query,
      fromThisMachine: requestFromThisMachine(req),
    })
      .then((response) => send(res, response))
      .catch((error: unknown) => {
        input.logger.warn({ err: error }, "Zuri update asset failed");
        send(res, jsonError(500, "Update asset failed"));
      });
  });
  return router;
}
