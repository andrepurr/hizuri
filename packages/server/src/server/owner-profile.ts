import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Hizuri: the user's personal folder. The repo ships neutral defaults; a user's own setup
// (names, roles, time zone, private folders) lives in their home folder and never in the repo.
// `<personal>/settings.json` holds PASEO_* knobs under "env"; the daemon applies them at start as
// defaults, so a variable already set in its own environment wins. A value starting with "./" is
// a path inside the personal folder.
//
// The folder is PASEO_PROFILE_DIR, else `$HIZURI_HOME/personal` (HIZURI_HOME defaults to
// ~/.hizuri) when it holds a settings.json. Without one the core defaults apply.

export interface OwnerProfile {
  dir: string;
  env: Record<string, string>;
}

const SETTINGS_FILE = "settings.json";

function expandHome(file: string): string {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

export function findProfileDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PASEO_PROFILE_DIR?.trim();
  if (explicit) {
    return path.resolve(expandHome(explicit));
  }
  const home = expandHome(env.HIZURI_HOME?.trim() || "~/.hizuri");
  const dir = path.resolve(home, "personal");
  return existsSync(path.join(dir, SETTINGS_FILE)) ? dir : null;
}

/** Reads `<dir>/settings.json`; a broken file throws, so a bad profile is never half-applied. */
export function readOwnerProfile(dir: string): OwnerProfile {
  const file = path.join(dir, SETTINGS_FILE);
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  const rawEnv =
    typeof parsed === "object" && parsed !== null && "env" in parsed ? parsed.env : undefined;
  if (rawEnv === undefined) {
    return { dir, env: {} };
  }
  if (typeof rawEnv !== "object" || rawEnv === null || Array.isArray(rawEnv)) {
    throw new Error(`${file}: "env" must be an object of strings`);
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawEnv)) {
    if (typeof value !== "string") {
      throw new Error(`${file}: env.${key} must be a string`);
    }
    env[key] = value.startsWith("./") ? path.join(dir, value.slice(2)) : value;
  }
  return { dir, env };
}

/** Sets every profile knob the environment does not set yet; returns the names it set. */
export function applyOwnerProfile(env: NodeJS.ProcessEnv, profile: OwnerProfile): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(profile.env)) {
    if (env[key] === undefined) {
      env[key] = value;
      applied.push(key);
    }
  }
  return applied;
}
