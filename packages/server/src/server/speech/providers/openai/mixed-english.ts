import { readFileSync } from "node:fs";

import { LATIN_SPELLING, spellLatinNatively } from "../../../voice-language/languages.js";
import type { TranscriptFix } from "./stt-vocab.js";

// Hizuri: phrases that mix English into another language. An STT trained on a language with another
// script writes the English words of such a phrase in its own letters, or half in Latin. This turns
// runs of such words back into English with a local word map: common English words spelled in the
// other script, plus the most common words of that language, which must stay as they are.
//
// File format: { "en": { "<native spelling>": ["<english word>", <rank>] },
//                "<language code>": ["<word that stays>", ...] }

// Consonant classes of the other script's letters (voiced/voiceless pairs merged, vowels dropped)
// and the Latin letters spelled natively, both from the language table.
const CONSONANT_CLASS: Readonly<Record<string, string>> = LATIN_SPELLING?.consonants ?? {};

interface MixedEnglishFile {
  en: Record<string, [string, number]>;
  /** The words that stay, under their language's code. */
  [language: string]: Record<string, [string, number]> | string[];
}

interface Candidate {
  form: string;
  word: string;
  rank: number;
}

interface MixedEnglishDictionary {
  en: Record<string, [string, number]>;
  keep: Set<string>;
  bySkeleton: Map<string, Candidate[]>;
}

interface Lookup {
  word: string;
  exact: boolean;
}

interface Token {
  start: number;
  end: number;
  raw: string;
  latinOnly: boolean;
  hit: Lookup | null;
  /** A word of the phrase's own language, never replaced. */
  kept: boolean;
}

function skeleton(native: string): string {
  let out = "";
  for (const ch of native) {
    const c = CONSONANT_CLASS[ch];
    if (c && out[out.length - 1] !== c) {
      out += c;
    }
  }
  return out;
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

export function buildMixedEnglishDictionary(raw: MixedEnglishFile): MixedEnglishDictionary {
  const bySkeleton = new Map<string, Candidate[]>();
  for (const [form, [word, rank]] of Object.entries(raw.en)) {
    const key = skeleton(form);
    const list = bySkeleton.get(key) ?? [];
    list.push({ form, word, rank });
    bySkeleton.set(key, list);
  }
  const keep = Object.entries(raw).flatMap(([language, words]) =>
    language !== "en" && Array.isArray(words) ? words : [],
  );
  return { en: raw.en, keep: new Set(keep), bySkeleton };
}

function lookup(dict: MixedEnglishDictionary, native: string): Lookup | null {
  const exact = dict.en[native];
  if (exact) {
    return { word: exact[0], exact: true };
  }
  if (native.length < 4) {
    return null;
  }
  let best: (Candidate & { dist: number }) | null = null;
  for (const candidate of dict.bySkeleton.get(skeleton(native)) ?? []) {
    const dist = levenshtein(native, candidate.form);
    const close = dist <= Math.max(1, Math.floor(native.length / 4));
    if (
      close &&
      (!best || dist < best.dist || (dist === best.dist && candidate.rank < best.rank))
    ) {
      best = { ...candidate, dist };
    }
  }
  return best ? { word: best.word, exact: false } : null;
}

function tokenize(text: string, dict: MixedEnglishDictionary): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\p{L}+/gu)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const lower = raw.toLowerCase();
    const latinOnly = /^[a-z]+$/.test(lower);
    const native = spellLatinNatively(lower, false);
    tokens.push({
      start,
      end: start + raw.length,
      raw,
      latinOnly,
      hit: latinOnly ? null : lookup(dict, native),
      kept: !latinOnly && dict.keep.has(native),
    });
  }
  return tokens;
}

function isEnglishLooking(token: Token): boolean {
  return token.latinOnly || token.hit !== null;
}

/** Index of the last token of the run that starts at `i` (only spaces or punctuation between words). */
function runEnd(text: string, tokens: Token[], i: number): number {
  let j = i;
  while (
    j + 1 < tokens.length &&
    isEnglishLooking(tokens[j + 1]) &&
    /^[\s,.\-—–!?]*$/u.test(text.slice(tokens[j].end, tokens[j + 1].start))
  ) {
    j++;
  }
  return j;
}

/**
 * Only words that are not kept change. A run needs two of them and one exact match of 4+
 * letters; a lone word must be exact and 5+ letters.
 */
function replaceableWords(run: Token[]): Token[] {
  const words = run.filter((t) => t.hit && !t.kept && !t.latinOnly);
  const exactLong = words.some((t) => t.hit?.exact && t.raw.length >= 4);
  const single = words.length === 1 && words[0].hit?.exact === true && words[0].raw.length >= 5;
  return (words.length >= 2 && exactLong) || single ? words : [];
}

function withCaseOf(raw: string, word: string): string {
  return /^\p{Lu}/u.test(raw) ? word[0].toUpperCase() + word.slice(1) : word;
}

/** Runs of English words written in another script turned back into English. */
export function applyMixedEnglish(text: string, dict: MixedEnglishDictionary): TranscriptFix {
  if (!text) {
    return { text, changed: false };
  }
  const tokens = tokenize(text, dict);
  const replaced: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isEnglishLooking(tokens[i])) {
      i++;
      continue;
    }
    const j = runEnd(text, tokens, i);
    replaced.push(...replaceableWords(tokens.slice(i, j + 1)));
    i = j + 1;
  }
  if (replaced.length === 0) {
    return { text, changed: false };
  }
  let out = "";
  let pos = 0;
  for (const token of replaced) {
    out += text.slice(pos, token.start) + withCaseOf(token.raw, token.hit?.word ?? token.raw);
    pos = token.end;
  }
  out += text.slice(pos);
  return { text: out, changed: out !== text };
}

export interface MixedEnglishFixer {
  fix(text: string): TranscriptFix;
}

/** Loads the word map once; a missing or broken file turns the fixer into a no-op. */
export function createMixedEnglishFixer(file: string): MixedEnglishFixer {
  let dict: MixedEnglishDictionary | null | undefined;
  return {
    fix(text) {
      if (dict === undefined) {
        try {
          dict = buildMixedEnglishDictionary(
            JSON.parse(readFileSync(file, "utf8")) as MixedEnglishFile,
          );
        } catch {
          dict = null;
        }
      }
      return dict ? applyMixedEnglish(text, dict) : { text, changed: false };
    },
  };
}
