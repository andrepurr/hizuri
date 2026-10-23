import { envWordList } from "../voice-env.js";
import { allWords, LANGUAGES } from "./languages.js";
import type { VoiceLanguage } from "./types.js";

// Hizuri: the assistant's name. The core ships Zuri; a user renames it to anything (a man, an
// alien) in their personal settings:
// - PASEO_ASSISTANT_NAME: the name in prompts, lines and the app;
// - PASEO_ASSISTANT_NAME_<LANG> (e.g. _DE): how that language writes it, when it differs;
// - PASEO_ASSISTANT_NAME_FORMS: every form a recogniser writes it in, "|"-separated regex
//   fragments of any language. Without it the names above are the forms; with no name set, the
//   language tables' own forms of Zuri.
// Every value is read when used, so a change in voice-settings.json applies mid-session.

export const DEFAULT_ASSISTANT_NAME = "Zuri";

function ownName(code: string, env: NodeJS.ProcessEnv): string | undefined {
  return env[`PASEO_ASSISTANT_NAME_${code.toUpperCase()}`]?.trim() || undefined;
}

/** The name in a language's lines; without a language, the name the app shows. */
export function assistantName(
  language?: VoiceLanguage,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    (language ? ownName(language.code, env) : undefined) ??
    (env.PASEO_ASSISTANT_NAME?.trim() || undefined) ??
    language?.defaultName ??
    DEFAULT_ASSISTANT_NAME
  );
}

/** The user's own names by language code, for the app; null when they kept the default. */
export function ownAssistantNames(
  env: NodeJS.ProcessEnv = process.env,
): { name: string; byLanguage: Record<string, string> } | null {
  const byLanguage: Record<string, string> = {};
  for (const language of LANGUAGES) {
    const name = ownName(language.code, env);
    if (name) {
      byLanguage[language.code] = name;
    }
  }
  const name = env.PASEO_ASSISTANT_NAME?.trim();
  if (!name && Object.keys(byLanguage).length === 0) {
    return null;
  }
  return { name: name || DEFAULT_ASSISTANT_NAME, byLanguage };
}

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every form a recogniser writes the name in, as regex fragments. */
export function assistantNameForms(env: NodeJS.ProcessEnv = process.env): string[] {
  const forms = envWordList("PASEO_ASSISTANT_NAME_FORMS", env);
  if (forms.length > 0) {
    return forms;
  }
  const names = [
    env.PASEO_ASSISTANT_NAME?.trim(),
    ...LANGUAGES.map((language) => ownName(language.code, env)),
  ].filter((name): name is string => Boolean(name));
  if (names.length > 0) {
    return [...new Set(names.map((name) => escapeWord(name.toLowerCase())))];
  }
  return allWords((language) => language.nameForms);
}

/** `(?:a|b)` of the name forms, for building patterns. */
export function anyNameForm(env: NodeJS.ProcessEnv = process.env): string {
  return `(?:${assistantNameForms(env).join("|")})`;
}

/** A line of a language table with `{name}` filled in. */
export function withName(line: string, language: VoiceLanguage): string {
  return line.replaceAll("{name}", assistantName(language));
}
