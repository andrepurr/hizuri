import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ShowMediaInputError } from "./plan.js";

// Hizuri (Show window, media): a film or a song on this machine reaches the phone's native player
// as a daemon link, /hizuri-media/file/<token>/<name>. The route sits before daemon auth because
// a video player cannot send the daemon password, so the token is the only key: 32 random bytes,
// one file, many range requests (seeking), gone after the TTL. The player tab on the stage keeps
// the link (show-media/tools.ts), so grants are saved and survive a daemon restart, and showing
// the same file again keeps its link.

export const SHOW_MEDIA_ROUTE = "/hizuri-media";

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TOKENS = 200;

interface FileGrant {
  absolutePath: string;
  expiresAt: number;
}

export interface ShowMediaFileStoreOptions {
  now?: () => number;
  /** Where the grants are kept between daemon runs ($PASEO_HOME/show-media/grants.json). */
  persistPath?: string | null;
}

export function showMediaGrantsPath(paseoHome: string): string {
  return path.join(paseoHome, "show-media", "grants.json");
}

function readGrants(file: string): Map<string, FileGrant> {
  const grants = new Map<string, FileGrant>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return grants;
  }
  if (typeof parsed !== "object" || parsed === null) return grants;
  for (const [token, value] of Object.entries(parsed)) {
    const grant = value as Partial<FileGrant> | null;
    if (typeof grant?.absolutePath === "string" && typeof grant.expiresAt === "number") {
      grants.set(token, { absolutePath: grant.absolutePath, expiresAt: grant.expiresAt });
    }
  }
  return grants;
}

export class ShowMediaFileStore {
  private readonly grants: Map<string, FileGrant>;
  private readonly now: () => number;
  private readonly persistPath: string | null;
  private saving: Promise<void> = Promise.resolve();

  constructor(options: ShowMediaFileStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.persistPath = options.persistPath ?? null;
    this.grants = this.persistPath ? readGrants(this.persistPath) : new Map();
  }

  /** Checks the file and returns the daemon path the app turns into a full URL. */
  async grant(filePath: string): Promise<string> {
    const absolutePath = resolveMediaPath(filePath);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(absolutePath);
    } catch {
      throw new ShowMediaInputError(`No such file on this machine: ${absolutePath}`);
    }
    if (!info.isFile()) {
      throw new ShowMediaInputError(`Not a file: ${absolutePath}`);
    }
    this.prune();
    const expiresAt = this.now() + TOKEN_TTL_MS;
    const known = [...this.grants].find(([, grant]) => grant.absolutePath === absolutePath)?.[0];
    const token = known ?? randomBytes(32).toString("base64url");
    // Re-inserted, so a file shown again is the newest grant and the last to be dropped.
    this.grants.delete(token);
    this.grants.set(token, { absolutePath, expiresAt });
    await this.save().catch(() => {});
    return `${SHOW_MEDIA_ROUTE}/file/${token}/${encodeURIComponent(path.basename(absolutePath))}`;
  }

  resolve(token: string): string | null {
    const grant = this.grants.get(token);
    if (!grant) return null;
    if (grant.expiresAt <= this.now()) {
      this.grants.delete(token);
      return null;
    }
    return grant.absolutePath;
  }

  /** Writes the grants atomically, one write at a time. */
  private save(): Promise<void> {
    const file = this.persistPath;
    if (!file) return Promise.resolve();
    const text = JSON.stringify(Object.fromEntries(this.grants));
    // A failed write leaves the grant working until the daemon restarts.
    const write = async () => {
      mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temp, text, { mode: 0o600 });
      await rename(temp, file);
    };
    this.saving = this.saving.catch(() => {}).then(write);
    return this.saving;
  }

  private prune(): void {
    const now = this.now();
    for (const [token, grant] of this.grants) {
      if (grant.expiresAt <= now) this.grants.delete(token);
    }
    // Map iteration is insertion order, so the oldest grants go first.
    for (const token of this.grants.keys()) {
      if (this.grants.size < MAX_TOKENS) break;
      this.grants.delete(token);
    }
  }
}

function resolveMediaPath(filePath: string): string {
  const trimmed = filePath.trim();
  const expanded =
    trimmed === "~" || trimmed.startsWith("~/") ? path.join(homedir(), trimmed.slice(1)) : trimmed;
  if (!path.isAbsolute(expanded)) {
    throw new ShowMediaInputError(`path must be absolute (or start with ~/): ${filePath}`);
  }
  return path.normalize(expanded);
}
