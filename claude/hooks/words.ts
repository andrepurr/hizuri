// The Guardian's words in the user's other languages. The plugin holds English only; the words of
// every other language come from the "guardian" section of the user's language files,
// `$HIZURI_HOME/setup/languages/<code>.json` (register.ts reads them at session start). A pattern
// built from them is a `pattern()`: built on first use and again after the words change.

/** What each list is for; the pattern that uses it holds the English words. */
export const WORD_KEYS = [
  /** The user asked about the reply language. */
  "LANGUAGE_ASK",
  /** Stale advice that is a lesson for next time. */
  "NEXT_TIME",
  "FORWARD",
  /** Stale advice that redoes a sent message (“rewrite the answer”): a verb and its object. */
  "REDO_VERB",
  "REDO_OBJECT",
  /** Stale advice that undoes finished work. */
  "UNDO",
  /** A complaint about the agent. */
  "COMPLAINT",
  /** A spoken question to the user ends with this word (voice replies say it instead of “?”). */
  "QUESTION_WORD",
  /** A standard question that is not a trigger moment. */
  "STANDARD_QUESTION",
  /** A sign-up, card or key asked of the user: a verb and its object. */
  "ACCOUNT_VERB",
  "ACCOUNT_OBJECT",
  /** “task 12”. */
  "TASK_WORD",
  /** The agent's answer to a Guardian note: done, doing, disagree, and the Guardian's name. */
  "ANSWER_DONE",
  "ANSWER_DOING",
  "ANSWER_DISAGREE",
  "GUARDIAN_NAME",
  /** The reply gate: “X cannot do Y” said about a tool. */
  "CANNOT",
  /** The reply gate: a figure reported as measured. */
  "MEASURED",
  /** A clock time followed by one of these is a duration, not a time of day. */
  "DURATION",
] as const;

export type WordKey = (typeof WORD_KEYS)[number];

let extra: Partial<Record<WordKey, string[]>> = {};
let generation = 0;

/**
 * Takes the "guardian" sections of the user's language files, in place of any earlier ones.
 * Returns the problems found: an unknown key or a list that is not all strings is left out.
 */
export function setWords(sections: readonly unknown[]): string[] {
  const next: Partial<Record<WordKey, string[]>> = {};
  const problems: string[] = [];
  for (const section of sections) {
    if (typeof section !== "object" || section === null || Array.isArray(section)) {
      problems.push("a guardian section is not an object");
      continue;
    }
    for (const [key, list] of Object.entries(section)) {
      if (!(WORD_KEYS as readonly string[]).includes(key)) {
        problems.push(`unknown key ${key}`);
        continue;
      }
      if (!Array.isArray(list) || !list.every((w) => typeof w === "string" && w.length > 0)) {
        problems.push(`${key} is not a list of words`);
        continue;
      }
      const k = key as WordKey;
      next[k] = [...(next[k] ?? []), ...list];
    }
  }
  extra = next;
  generation += 1;
  return problems;
}

/** The user's words for one list, every language together. */
export function words(key: WordKey): readonly string[] {
  return extra[key] ?? [];
}

/** English words and the user's other languages' as one `a|b|c` alternation; `(?!)` when empty. */
export function any(english: readonly string[], key?: WordKey): string {
  const all = [...english, ...(key ? words(key) : [])];
  return all.length ? all.join("|") : "(?!)";
}

/** A value built from the words: built on first use, built again after `setWords`. */
export function pattern<T>(make: () => T): () => T {
  let built = -1;
  let value: T;
  return () => {
    if (built !== generation) {
      value = make();
      built = generation;
    }
    return value;
  };
}
