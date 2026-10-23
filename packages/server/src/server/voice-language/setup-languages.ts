import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { en } from "./en.js";
import type { VoiceLanguage } from "./types.js";

// Hizuri: the repo ships English only. Every other language is one JSON file in the user's setup
// folder, `$HIZURI_HOME/setup/languages/<code>.json` (HIZURI_HOME defaults to ~/.hizuri), read
// once when the voice code loads. HIZURI_LANGUAGES_DIR names another folder; set to "" it turns
// the extra languages off (the repo's tests run that way).
//
// The file's "voice" object holds the same keys as en.ts. JSON has no regular expressions and no
// functions, so a regular expression is written as {"regex": "<source>", "flags": "<flags>"}, and
// fastReplyExamples is a list of [line, label] pairs where {name} stands for the assistant's name
// and {other} for a person near the user (fastReplyOtherDefault when none is set). Other sections
// of the file belong to other readers (the Claude Code plugin reads "guardian").

const KEYS_ONLY_SOME_LANGUAGES_HAVE = new Set(["latinSpelling", "stopSpotterModel"]);

// No parameter properties here: the speech worker loads this file with Node's type stripping, which
// takes erasable TypeScript only.
export class SetupLanguageError extends Error {
  readonly file: string;

  constructor(file: string, detail: string) {
    super(`${file}: ${detail}`);
    this.name = "SetupLanguageError";
    this.file = file;
  }
}

function expandHome(file: string): string {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

/** The folder of the user's language files; null when extra languages are off. */
export function setupLanguagesDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.HIZURI_LANGUAGES_DIR;
  if (explicit !== undefined) {
    return explicit.trim() ? path.resolve(expandHome(explicit.trim())) : null;
  }
  const home = expandHome(env.HIZURI_HOME?.trim() || "~/.hizuri");
  return path.resolve(home, "setup", "languages");
}

function revive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(revive);
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (
      typeof record.regex === "string" &&
      Object.keys(record).every((k) => k === "regex" || k === "flags")
    ) {
      return new RegExp(record.regex, typeof record.flags === "string" ? record.flags : "");
    }
    return Object.fromEntries(Object.entries(record).map(([key, inner]) => [key, revive(inner)]));
  }
  return value;
}

function kind(value: unknown): string {
  if (value instanceof RegExp) return "regex";
  if (Array.isArray(value)) return "list";
  return typeof value;
}

function fastReplyExamples(
  file: string,
  rows: unknown,
  otherDefault: unknown,
): VoiceLanguage["fastReplyExamples"] {
  const valid =
    Array.isArray(rows) &&
    rows.every(
      (row) =>
        Array.isArray(row) && row.length === 2 && row.every((cell) => typeof cell === "string"),
    );
  if (!valid) {
    throw new SetupLanguageError(
      file,
      "voice.fastReplyExamples must be a list of [line, label] pairs",
    );
  }
  const fallback = typeof otherDefault === "string" ? otherDefault : "";
  const pairs = rows as [string, string][];
  return (other, name) =>
    pairs.map(([line, label]) => [
      line.replaceAll("{name}", name).replaceAll("{other}", other ?? fallback),
      label,
    ]);
}

/** One language from the "voice" object of a setup file, checked key by key against English. */
export function parseSetupLanguage(file: string, voice: unknown): VoiceLanguage {
  if (typeof voice !== "object" || voice === null || Array.isArray(voice)) {
    throw new SetupLanguageError(file, 'no "voice" object');
  }
  const raw = revive(voice) as Record<string, unknown>;
  const { fastReplyExamples: rows, fastReplyOtherDefault, ...rest } = raw;
  const template = en as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(template)) {
    if (key === "fastReplyExamples") continue;
    if (!(key in rest)) {
      if (KEYS_ONLY_SOME_LANGUAGES_HAVE.has(key)) continue;
      throw new SetupLanguageError(file, `voice.${key} is missing`);
    }
    if (kind(rest[key]) !== kind(value)) {
      throw new SetupLanguageError(
        file,
        `voice.${key} must be a ${kind(value)}, not a ${kind(rest[key])}`,
      );
    }
  }
  for (const key of Object.keys(rest)) {
    if (!(key in template) && !KEYS_ONLY_SOME_LANGUAGES_HAVE.has(key)) {
      throw new SetupLanguageError(file, `voice.${key} is not a key of a voice language`);
    }
  }
  return {
    ...(rest as unknown as VoiceLanguage),
    fastReplyExamples: fastReplyExamples(file, rows, fastReplyOtherDefault),
  };
}

/** Every `<code>.json` of the folder, sorted by name; a broken file throws. */
export function readSetupLanguages(dir: string | null): VoiceLanguage[] {
  if (!dir || !existsSync(dir)) {
    return [];
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const languages: VoiceLanguage[] = [];
  for (const name of files) {
    const file = path.join(dir, name);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      throw new SetupLanguageError(file, `not valid JSON (${(error as Error).message})`);
    }
    const voice =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { voice?: unknown }).voice
        : undefined;
    if (voice === undefined) continue;
    const language = parseSetupLanguage(file, voice);
    if (language.code === en.code || languages.some((known) => known.code === language.code)) {
      throw new SetupLanguageError(file, `language "${language.code}" is already loaded`);
    }
    languages.push(language);
  }
  return languages;
}
