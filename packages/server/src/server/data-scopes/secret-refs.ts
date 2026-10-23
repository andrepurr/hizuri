// Hizuri: `!secret <name>` references in config.json and in a few env knobs, and the values the
// daemon opened for them at start (config-secrets.ts). Kept apart from the start check so the
// places that fill a value in (agent provider settings, the OpenAI speech keys, a plugin
// registry's authorization, the fast front's task board token) import no vault code.
//
// Values are kept by config path, not by name: only the fields listed below are filled, and the
// same reference text anywhere else (a label, an argv) stays text.

const REF_START = /^\s*!secret(?:\s|$)/;
const REF = /^\s*!secret\s+([a-z0-9][a-z0-9-]{0,39})(?:\.([A-Za-z0-9_-]{1,40}))?\s*$/;

/** A value meant as a reference (`!secret` and a space, leading spaces allowed), well-formed or not. */
export function isSecretRefText(value: string): boolean {
  return REF_START.test(value);
}

export type ConfigSecretErrorCode =
  | "bad-reference"
  | "unsupported-field"
  | "unknown-secret"
  | "secret-field"
  | "vault"
  | "not-loaded"
  | "literal-secret"
  | "bad-mode";

/**
 * Names config fields only. A name the vault does not hold is never echoed either: it may be a
 * token pasted after `!secret`.
 */
export class ConfigSecretError extends Error {
  constructor(
    public readonly code: ConfigSecretErrorCode,
    message: string,
    public readonly fields: readonly string[] = [],
  ) {
    super(message);
    this.name = "ConfigSecretError";
  }
}

export interface SecretRef {
  /** Dotted config path, e.g. `agents.providers.custom.env.API_TOKEN`, for messages. */
  path: string;
  /** The same path as keys: a key may hold dots (a registry host). */
  keys: string[];
  /** The value as written in config.json. */
  text: string;
  name: string;
  field: string | null;
}

export interface ParsedSecretRef {
  name: string;
  field: string | null;
}

/** The name and field of a `!secret` value; null for any other value. */
export function parseSecretRef(value: string): ParsedSecretRef | null {
  if (!isSecretRefText(value)) return null;
  const match = REF.exec(value);
  if (!match) {
    throw new ConfigSecretError(
      "bad-reference",
      'not a secret reference: write "!secret <name>" (lowercase letters, digits and dashes, at most 40) or "!secret <name>.<field>"',
    );
  }
  return { name: match[1]!, field: match[2] ?? null };
}

/** Where a caller fills references: the config path of its value and the fields below it. */
export interface SecretRefSite {
  /** Config path of the value handed over. */
  at: readonly string[];
  /** Fields below `at` that are filled; `*` matches any key, `[]` the value itself. */
  fields: ReadonlyArray<readonly string[]>;
}

/** An agent provider's configured env (config.json `agents.providers`). */
export const PROVIDER_SETTINGS_SITE: SecretRefSite = {
  at: ["agents", "providers"],
  fields: [["*", "env", "*"]],
};

/** The OpenAI speech keys (config.json `providers.openai`). */
export const OPENAI_KEYS_SITE: SecretRefSite = {
  at: ["providers", "openai"],
  fields: [["apiKey"], ["stt", "apiKey"], ["tts", "apiKey"]],
};

/** A plugin registry's authorization (config.json `pluginRegistries.<host>.authorization`). */
export function registryAuthorizationSite(host: string): SecretRefSite {
  return { at: ["pluginRegistries", host, "authorization"], fields: [[]] };
}

/**
 * Env knobs that may name a secret, wherever the knob is set (the user's personal settings.json,
 * owner-profile.ts, or the daemon's own environment). The env keeps the reference text, so agent
 * processes that inherit it never see a value; the point of use fills it (resolveSecretKnob).
 * Their paths are `env.<KNOB>`; config.json has no top-level `env`.
 */
export const SECRET_KNOBS: readonly string[] = ["PASEO_FAST_FRONT_WORK_BOARD_TOKEN"];

export const ENV_KNOBS_SITE: SecretRefSite = {
  at: ["env"],
  fields: SECRET_KNOBS.map((knob) => [knob]),
};

/** Whether an `env.<KNOB>` path is a knob the daemon fills. */
export function isFilledKnob(keys: readonly string[]): boolean {
  return siteFields(ENV_KNOBS_SITE).some((pattern) => matchesPattern(keys, pattern));
}

/** Every config.json field the daemon fills, as patterns. */
export const SECRET_REF_FIELDS: ReadonlyArray<readonly string[]> = [
  ...siteFields(PROVIDER_SETTINGS_SITE),
  ...siteFields(OPENAI_KEYS_SITE),
  ["pluginRegistries", "*", "authorization"],
];

function siteFields(site: SecretRefSite): string[][] {
  return site.fields.map((field) => site.at.concat(field));
}

export function matchesPattern(keys: readonly string[], pattern: readonly string[]): boolean {
  return (
    pattern.length === keys.length &&
    pattern.every((segment, index) => segment === "*" || segment === keys[index])
  );
}

export function isFilledField(keys: readonly string[]): boolean {
  return SECRET_REF_FIELDS.some((pattern) => matchesPattern(keys, pattern));
}

/** What the start opened for one field: the reference text and its value (none if unopened). */
export interface OpenedField {
  text: string;
  value: string | undefined;
}

/** Fields by config path (`pathKey`). A field the start could not open has no value. */
export type LoadedConfigSecrets = ReadonlyMap<string, OpenedField>;

export function pathKey(keys: readonly string[]): string {
  return JSON.stringify(keys);
}

// null outside the daemon (the CLI reading a config, tests that build a daemon without its
// worker): nothing is filled there. The daemon worker always sets it before reading the config.
let loaded: LoadedConfigSecrets | null = null;

export function setLoadedConfigSecrets(next: LoadedConfigSecrets | null): void {
  loaded = next;
}

export interface ResolveSecretRefsInput<T> extends SecretRefSite {
  value: T;
}

/**
 * The value with every reference in the site's fields replaced by what the start opened; the
 * same object when nothing changed. A field the start could not open becomes undefined (unset;
 * the start logged why). A reference the start never saw there (config.json edited since) fails,
 * so a config reload that adds one is rolled back. References outside the fields stay text.
 */
export function resolveSecretRefs<T>(input: ResolveSecretRefsInput<T>): T {
  if (loaded === null) return input.value;
  const opened = loaded;
  const { at, fields } = input;
  /** Whether a filled field lies at or below this relative path. */
  function reachable(rel: readonly string[]): boolean {
    return fields.some(
      (field) =>
        field.length >= rel.length &&
        rel.every((key, index) => field[index] === "*" || field[index] === key),
    );
  }
  function replace(item: unknown, rel: string[]): unknown {
    if (!reachable(rel)) return item;
    if (typeof item === "string") {
      if (!isSecretRefText(item) || !fields.some((field) => matchesPattern(rel, field))) {
        return item;
      }
      const keys = [...at, ...rel];
      const entry = opened.get(pathKey(keys));
      // Spaces around a reference do not count: the schema trims some fields (the speech keys).
      if (entry?.text.trim() === item.trim()) return entry.value;
      const where = keys.join(".");
      throw new ConfigSecretError(
        "not-loaded",
        `${where} names a secret that was not opened at daemon start; restart the daemon after adding it`,
        [where],
      );
    }
    if (Array.isArray(item)) {
      const next = item.map((entry, index) => replace(entry, [...rel, String(index)]));
      return next.some((entry, index) => entry !== item[index]) ? next : item;
    }
    if (item && typeof item === "object") {
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(item)) {
        next[key] = replace(entry, [...rel, key]);
        changed ||= next[key] !== entry;
      }
      return changed ? next : item;
    }
    return item;
  }
  return replace(input.value, []) as T;
}

/**
 * An env knob's value with a reference filled from what the start opened (ENV_KNOBS_SITE):
 * undefined when the start could not open it, the text itself for a plain value or a knob that
 * is not filled. Throws `not-loaded` when the reference changed since the start.
 */
export function resolveSecretKnob(name: string, text: string): string | undefined {
  return resolveSecretRefs({ ...ENV_KNOBS_SITE, value: { [name]: text } })[name];
}
