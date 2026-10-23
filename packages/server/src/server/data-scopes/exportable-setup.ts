import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readOwnerProfile } from "../owner-profile.js";
import { configPathScope, settingScope, tokenShape, type DataScope } from "./scopes.js";
import { parseSecretRef } from "./secret-refs.js";

// Hizuri: the shareable part of the user's setup, by rule (scopes.ts): every `personal` value
// left out, every `secret` value nulled. Later stages pack it as a `.hzmod` modification; that
// step still runs the personal guard over the text and shows the user what goes out.
// Two value rules back the scopes up: a value shaped like a token is nulled wherever it sits,
// and a setup field that names a path in a home folder is left out whole.

export interface SetupSources {
  /** Parsed config.json. */
  config: unknown;
  /** Parsed voice-settings.json: the live voice knobs. */
  voiceSettings?: Record<string, unknown>;
  /** The env of the personal folder's settings.json. */
  profileEnv?: Record<string, string>;
}

export interface NulledSecret {
  /** `config.<path>` or `knobs.<KEY>`. */
  path: string;
  /** The vault name when the field was a `!secret` reference. */
  name: string | null;
}

export interface ExportableSetup {
  format: "hizuri-setup/1";
  config: Record<string, unknown>;
  knobs: Record<string, unknown>;
  secrets: NulledSecret[];
  /** Paths left out as personal, without their values. */
  dropped: string[];
}

const HOME_PATH =
  /(?:^|[\s"'=:])(?:~\/|\/home\/[^/\s]+|\/Users\/[^/\s]+|\/root\b|[A-Za-z]:\\Users\\)/;
/** A URL with a password in it (`scheme://user:password@host`). */
const CREDENTIAL_URL = /[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i;
/**
 * Config sections left out whole: the keys of `pluginRegistries` are the user's registry hosts
 * and the only value is a credential.
 */
const DROPPED_SECTIONS = new Set(["pluginRegistries"]);

interface Walk {
  secrets: NulledSecret[];
  dropped: string[];
}

interface Placed {
  value: unknown;
  /** `config.<path>` or `knobs.<KEY>`. */
  where: string;
  walk: Walk;
}

type Cleaned = { keep: true; value: unknown } | { keep: false };

/** A setup value with secret-looking strings nulled; left out when it names a home folder. */
function cleanSetupValue({ value, where, walk }: Placed): Cleaned {
  let homePath = false;
  function clean(item: unknown): unknown {
    if (typeof item === "string") {
      if (tokenShape(item) || CREDENTIAL_URL.test(item)) {
        walk.secrets.push({ path: where, name: null });
        return null;
      }
      if (HOME_PATH.test(item)) homePath = true;
      return item;
    }
    if (Array.isArray(item)) return item.map(clean);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, clean(entry)]));
    }
    return item;
  }
  const cleaned = clean(value);
  if (homePath) {
    walk.dropped.push(where);
    return { keep: false };
  }
  return { keep: true, value: cleaned };
}

/** The vault name of a well-formed reference; null for anything else. */
function secretName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    return parseSecretRef(value)?.name ?? null;
  } catch {
    // A malformed reference is nulled like any secret; its text is not a name.
    return null;
  }
}

interface ConfigWalk {
  value: unknown;
  keys: string[];
  walk: Walk;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Lists the vault names in a section that is left out whole. */
function noteSectionSecrets({ value, keys, walk }: ConfigWalk): void {
  if (isPlainObject(value) || Array.isArray(value)) {
    for (const [key, entry] of Object.entries(value)) {
      noteSectionSecrets({ value: entry, keys: [...keys, key], walk });
    }
  } else if (configPathScope(keys) === "secret") {
    walk.secrets.push({ path: `config.${keys[0]}`, name: secretName(value) });
  }
}

/**
 * The exportable part of one config value: objects and lists of objects field by field, any
 * other value by its scope.
 */
function exportConfigValue({ value, keys, walk }: ConfigWalk): Cleaned {
  if (keys.length === 1 && DROPPED_SECTIONS.has(keys[0]!)) {
    noteSectionSecrets({ value, keys, walk });
    walk.dropped.push(`config.${keys[0]}`);
    return { keep: false };
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const kept = exportConfigValue({ value: entry, keys: [...keys, key], walk });
      if (kept.keep) out[key] = kept.value;
    }
    return Object.keys(out).length > 0 ? { keep: true, value: out } : { keep: false };
  }
  if (Array.isArray(value) && value.some((item) => isPlainObject(item) || Array.isArray(item))) {
    const out = value.flatMap((item, index) => {
      const kept = exportConfigValue({ value: item, keys: [...keys, String(index)], walk });
      return kept.keep ? [kept.value] : [];
    });
    return out.length > 0 ? { keep: true, value: out } : { keep: false };
  }
  const where = `config.${keys.join(".")}`;
  const scope: DataScope = configPathScope(keys) ?? "personal";
  if (scope === "secret") {
    walk.secrets.push({ path: where, name: secretName(value) });
    return { keep: true, value: null };
  }
  if (scope === "personal") {
    walk.dropped.push(where);
    return { keep: false };
  }
  return cleanSetupValue({ value, where, walk });
}

interface KnobWalk {
  key: string;
  value: unknown;
  knobs: Record<string, unknown>;
  /** `profile` or `voiceSettings`, for the dropped list. */
  from: string;
  walk: Walk;
}

function addKnob({ key, value, knobs, from, walk }: KnobWalk): void {
  const where = `knobs.${key}`;
  const scope = settingScope(key);
  if (scope === "secret") {
    walk.secrets.push({ path: where, name: secretName(value) });
    knobs[key] = null;
  } else if (scope === "personal") {
    walk.dropped.push(`${from}.${key}`);
  } else {
    const cleaned = cleanSetupValue({ value, where, walk });
    if (cleaned.keep) knobs[key] = cleaned.value;
  }
}

/**
 * The configuration and knob values anyone may get: personal values dropped, secrets nulled.
 * Knobs from voice-settings.json win over the personal folder's, as they do in the daemon.
 */
export function exportableSetup(sources: SetupSources): ExportableSetup {
  const walk: Walk = { secrets: [], dropped: [] };
  const exported = exportConfigValue({ value: sources.config, keys: [], walk });
  const config = exported.keep && isPlainObject(exported.value) ? exported.value : {};
  // One value per knob, the one the daemon runs with: voice-settings.json over the profile.
  const sourced = new Map<string, { value: unknown; from: string }>();
  for (const [key, value] of Object.entries(sources.profileEnv ?? {})) {
    sourced.set(key, { value, from: "profile" });
  }
  for (const [key, value] of Object.entries(sources.voiceSettings ?? {})) {
    sourced.set(key, { value, from: "voiceSettings" });
  }
  const knobs: Record<string, unknown> = {};
  for (const [key, { value, from }] of sourced) addKnob({ key, value, knobs, from, walk });
  return { format: "hizuri-setup/1", config, knobs, secrets: walk.secrets, dropped: walk.dropped };
}

/** A JSON file, `{}` when missing; a parse error names the file only (the text may hold a token). */
function readJsonFile(file: string): unknown {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${file} is not valid JSON`);
  }
}

export interface SetupSourceFiles {
  paseoHome: string;
  profileDir: string | null;
  voiceSettingsFile?: string;
}

/** The sources of a daemon home and a personal folder; a file that does not parse throws. */
export function readSetupSources(input: SetupSourceFiles): SetupSources {
  const voice = readJsonFile(
    input.voiceSettingsFile ?? path.join(input.paseoHome, "voice-settings.json"),
  );
  return {
    config: readJsonFile(path.join(input.paseoHome, "config.json")),
    voiceSettings: voice && typeof voice === "object" ? (voice as Record<string, unknown>) : {},
    profileEnv: input.profileDir ? readOwnerProfile(input.profileDir).env : {},
  };
}
