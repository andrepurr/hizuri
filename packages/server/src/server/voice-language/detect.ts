import { LANGUAGES, voiceLanguage } from "./languages.js";
import type { VoiceLanguage } from "./types.js";

// Hizuri: the language a voice session speaks. It starts as the recogniser's language
// (PASEO_VOICE_LANGUAGE, default English) and then follows what the user says: once their phrases
// are in another language several times in a row, the lines the assistant says aloud switch to it.
// A single phrase in another language (a quoted English sentence in Spanish talk) does not switch
// it.

/** Letters a phrase needs before its script says anything. */
const MIN_LETTERS = 6;
/** The share of its letters one script needs. */
const MIN_SHARE = 0.7;
/** Phrases in a row in another language before the session follows it. */
export const SWITCH_AFTER = 3;

/** The language a phrase is written in, by its letters; null when too short or mixed. */
export function phraseLanguage(text: string): VoiceLanguage | null {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (letters < MIN_LETTERS) {
    return null;
  }
  const byScript = new Map<string, VoiceLanguage>();
  for (const language of LANGUAGES) {
    if (!byScript.has(language.script)) {
      byScript.set(language.script, language);
    }
  }
  for (const [script, language] of byScript) {
    const count = (text.match(new RegExp(`\\p{Script=${script}}`, "gu")) ?? []).length;
    if (count / letters >= MIN_SHARE) {
      return language;
    }
  }
  return null;
}

export class SessionLanguage {
  private language: VoiceLanguage;
  private candidate: VoiceLanguage | null = null;
  private streak = 0;

  constructor(recogniserLanguage: string | undefined) {
    this.language = voiceLanguage(recogniserLanguage);
  }

  get current(): VoiceLanguage {
    return this.language;
  }

  /** One finished phrase from the user; returns true when the session language changed. */
  observe(text: string): boolean {
    const heard = phraseLanguage(text);
    if (!heard) {
      return false;
    }
    if (heard === this.language) {
      this.candidate = null;
      this.streak = 0;
      return false;
    }
    this.streak = heard === this.candidate ? this.streak + 1 : 1;
    this.candidate = heard;
    if (this.streak < SWITCH_AFTER) {
      return false;
    }
    this.language = heard;
    this.candidate = null;
    this.streak = 0;
    return true;
  }
}
