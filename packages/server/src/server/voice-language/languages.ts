import { en } from "./en.js";
import { readSetupLanguages, setupLanguagesDir } from "./setup-languages.js";
import type { LatinSpelling, VoiceLanguage } from "./types.js";

// Hizuri: every language the voice knows: English from the repo, the others from the user's setup
// folder (setup-languages.ts). A new language is one more file there.

export const LANGUAGES: readonly VoiceLanguage[] = [en, ...readSetupLanguages(setupLanguagesDir())];

/** The table for a language code ("de", "de-AT", "en"…); English for anything unknown. */
export function voiceLanguage(code: string | undefined): VoiceLanguage {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((language) => language.code === base) ?? en;
}

/** One list from every language, without repeats. */
export function allWords(pick: (language: VoiceLanguage) => readonly string[]): string[] {
  return [...new Set(LANGUAGES.flatMap(pick))];
}

/** `(?:a|b|c)` of every language's fragments. */
export function anyOf(pick: (language: VoiceLanguage) => readonly string[]): string {
  return `(?:${allWords(pick).join("|")})`;
}

/** Whole words of every language: not glued to other letters on either side. */
export function wholeWords(
  pick: (language: VoiceLanguage) => readonly string[],
  flags = "iu",
): RegExp {
  return new RegExp(`(?<!\\p{L})${anyOf(pick)}(?!\\p{L})`, flags);
}

/** Lowercase, with the letters a recogniser writes either way folded into one. */
export function foldLetters(text: string): string {
  let out = text.toLowerCase();
  for (const language of LANGUAGES) {
    for (const [from, to] of language.letterFolds) {
      out = out.replaceAll(from, to);
    }
  }
  return out;
}

/** How the non-Latin recogniser spells Latin words; null when none does. */
export const LATIN_SPELLING: LatinSpelling | null =
  LANGUAGES.find((language) => language.latinSpelling)?.latinSpelling ?? null;

/** Latin letters spelled the way that recogniser writes them; other letters stay. */
export function spellLatinNatively(text: string, withPairs = true): string {
  if (!LATIN_SPELLING) {
    return text;
  }
  let out = text;
  if (withPairs) {
    for (const [pair, letter] of LATIN_SPELLING.pairs) {
      out = out.replace(pair, letter);
    }
  }
  return out.replace(/[a-z]/g, (letter) => LATIN_SPELLING?.letters[letter] ?? letter);
}

/** The default PASEO_BARGE_STOP_RE: a phrase opening with a stop word, in any language. */
export function defaultBargeStopPattern(): string {
  return `^(${allWords((language) => language.bargeStopWords).join("|")})`;
}

/** The default wake pattern: a phrase opening with one of these interrupts a busy agent. */
export function defaultWakePattern(): string {
  return `^(${allWords((language) => language.wakeWords).join("|")})`;
}
