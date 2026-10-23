// Hizuri: echo filter. The microphone can pick up the assistant's own spoken reply from the
// speaker. A phrase is echo when it started while a reply was playing (or within 300 ms after)
// and repeats most of that reply's words (5-letter stems).
//
// Strict form (used by both the barge-in check and the turn-level check): only the reply playing
// now counts, the phrase needs 3+ words and 75 % shared stems. The loose form (any reply of the
// last 2 minutes, 50 %) dropped the user's own phrases whenever they repeated the assistant's
// words.
//
// Recent-window form (PASEO_ECHO_RECENT_MS > 0, off by default): the strict check compares with
// everything the assistant said in that window, whether or not a reply is playing now. The
// playing-reply-only check lets through the assistant's own lines heard seconds after it said them.
//
// Phrase form (isPhraseEcho: final transcripts and drafts): the strict check or the loose one, with
// two limits. The loose share alone dropped the user's answers: assistant replies are long, so they
// hold the short common words ("I", "not", "this", "what") and the topic word the user picks up. A
// loose match must also be one stretch of the reply letter by letter, as an echo is. A reply that
// began after the phrase ended is the assistant's answer to it, often in the user's words, and is
// never its echo.
//
// Heard match (heardMatch): how a phrase lines up with the lines the assistant was saying while the
// user spoke, for the echo drop (echo-drop.ts). On the phone's speaker the echo is the assistant's
// line word for word, begun a second after it and ended a second after it.

import { foldLetters, spellLatinNatively } from "../../voice-language/languages.js";

const ECHO_WINDOW_MS = 120_000;
const AFTER_SPEAK_GRACE_MS = 300;
// Recent-window form: a reply that started this soon after the phrase still counts (bench rule).
const RECENT_START_SLACK_MS = 2000;
// Phrase form, loose check: the letter match needed against one stretch of the reply. The user's
// phrases taken for echo score below it, the assistant's echoes above.
const LOOSE_LETTER_MATCH = 0.45;
// Heard match: a line counts when it played until this long before the phrase began (the phone
// plays the assistant's audio about a second late).
const HEARD_GRACE_MS = 1500;
// Heard match: the letters of the phrase's start and end compared on their own.
const END_LETTERS = 12;

interface SpokenText {
  at: number;
  /** When assistant playback ended; unset while it plays. */
  endedAt?: number;
  stems: Set<string>;
  /** Lowercase letters only, no spaces: the quick barge transcript glues and garbles words. */
  letters: string;
  /** The text for the heard match (plainText). */
  plain: string;
}

function lettersOf(text: string): string {
  return (text.toLowerCase().match(/\p{L}/gu) ?? []).join("");
}

/**
 * Heard match: lowercase, letters folded the way the recogniser writes them, and Latin spelled the
 * way a recogniser of another script spells it: the assistant's text spells names in Latin (“Show”,
 * "Claude"), a recogniser of another language in its own letters (voice-language/*.ts).
 */
function plainText(text: string): string {
  return spellLatinNatively(foldLetters(text));
}

/** Edit-distance similarity of `needle` to its best-matching window of `hay` (0..1). */
function partialSimilarity(needle: string, hay: string): number {
  const n = needle.length;
  if (n === 0 || hay.length === 0) {
    return 0;
  }
  // Semi-global Levenshtein: the match may start and end anywhere in `hay`.
  let prev = new Uint32Array(hay.length + 1);
  for (let i = 1; i <= n; i += 1) {
    const cur = new Uint32Array(hay.length + 1);
    cur[0] = i;
    for (let j = 1; j <= hay.length; j += 1) {
      const cost = needle[i - 1] === hay[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return 1 - Math.min(...prev) / n;
}

export function stems(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.slice(0, 5));
}

function longestRun<T>(items: T[], test: (item: T) => boolean): number {
  let best = 0;
  let run = 0;
  for (const item of items) {
    run = test(item) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export interface EchoCheckOptions {
  strict?: boolean;
}

export interface EchoFilterOptions {
  /**
   * > 0: the strict check compares with everything said in this many ms; 0 = off. A function is
   * read on every check (a live knob).
   */
  recentMs?: number | (() => number);
}

/**
 * Hizuri: how a phrase lines up with the assistant's lines heard while the user spoke (heardMatch).
 */
export interface HeardMatch {
  /** Letter match of the whole phrase against one stretch of those lines (0..1). */
  similarity: number;
  /** The same for the phrase's first letters alone. */
  headSimilarity: number;
  /** The same for the phrase's last letters alone. */
  tailSimilarity: number;
  /** Its first two words are words of those lines. */
  startsInAssistantWords: boolean;
  /** Its last two words are words of those lines. */
  endsInAssistantWords: boolean;
  /**
   * The most words in a row that are not words of those lines (the user's words inside the
   * assistant's echo).
   */
  foreignRun: number;
  /** How long after the first of those lines began the phrase began. */
  startLagMs: number;
  /** How long after those lines ended the phrase ended; 0 when one played on. */
  endGapMs: number;
}

/** When a phrase was spoken (ms). */
export interface PhraseSpan {
  startedAt: number;
  endedAt: number;
}

interface MatchOptions {
  strict: boolean;
  now: number;
  /** Phrase form: the end of the phrase (see isPhraseEcho). */
  phraseEndedAt?: number;
}

export class EchoFilter {
  private speakActive = false;
  private lastSpeakEnd = 0;
  private spoken: SpokenText[] = [];
  private readonly recentMsOption: number | (() => number);

  constructor(options: EchoFilterOptions = {}) {
    this.recentMsOption = options.recentMs ?? 0;
  }

  private get recentMs(): number {
    const option = this.recentMsOption;
    return Math.max(0, typeof option === "function" ? option() : option);
  }

  noteSpeakStart(text: string, now = Date.now()): void {
    this.speakActive = true;
    const keepMs = Math.max(ECHO_WINDOW_MS, this.recentMs);
    this.spoken = this.spoken.filter((s) => now - s.at < keepMs);
    this.spoken.push({
      at: now,
      stems: new Set(stems(text)),
      letters: lettersOf(text),
      plain: plainText(text),
    });
  }

  noteSpeakEnd(now = Date.now()): void {
    this.speakActive = false;
    this.lastSpeakEnd = now;
    for (const line of this.spoken) {
      line.endedAt ??= now;
    }
  }

  /** The texts a phrase is compared with; only those begun by `beganBy` when it is given. */
  protected candidates(strict: boolean, now: number, beganBy?: number): SpokenText[] {
    const recent = this.spoken.filter(
      (s) => now - s.at < ECHO_WINDOW_MS && (beganBy === undefined || s.at <= beganBy),
    );
    // Hizuri: two voices (the two Zuris) alternate, so the strict check looks at the last two.
    return strict ? recent.slice(-2) : recent;
  }

  isEcho(
    transcript: string,
    startedAt: number,
    options: EchoCheckOptions = {},
    now = Date.now(),
  ): boolean {
    return this.matches(transcript, startedAt, { strict: options.strict === true, now });
  }

  /**
   * Hizuri: the check of a whole phrase (its final transcript or draft): the strict check, or the
   * loose one when the phrase also matches one stretch of that reply letter by letter. Replies
   * begun after the phrase ended are left out of both.
   */
  isPhraseEcho(transcript: string, phrase: PhraseSpan, now = Date.now()): boolean {
    const phraseEndedAt = phrase.endedAt;
    return (
      this.matches(transcript, phrase.startedAt, { strict: true, now, phraseEndedAt }) ||
      this.matches(transcript, phrase.startedAt, { strict: false, now, phraseEndedAt })
    );
  }

  /**
   * Hizuri: the phrase ends in the assistant's words: its last two words are in a reply of the last
   * 2 minutes begun before the phrase ended. An echo with the user's own words after it ("…open the
   * settings. Never mind, cancel that") ends in the user's.
   */
  endsInAssistantWords(transcript: string, phrase: PhraseSpan, now = Date.now()): boolean {
    const tail = stems(transcript).slice(-2);
    const said = this.candidates(false, now, phrase.endedAt);
    return tail.length > 0 && tail.every((word) => said.some((s) => s.stems.has(word)));
  }

  /**
   * Hizuri: the phrase against the assistant's lines heard while it was said: begun by its end and
   * still playing, or ended at most HEARD_GRACE_MS before it began. Null when there were none.
   */
  heardMatch(transcript: string, phrase: PhraseSpan, now = Date.now()): HeardMatch | null {
    const lines = this.candidates(false, now, phrase.endedAt).filter(
      (s) => s.endedAt === undefined || s.endedAt >= phrase.startedAt - HEARD_GRACE_MS,
    );
    if (lines.length === 0) {
      return null;
    }
    const assistant = lettersOf(lines.map((s) => s.plain).join(" "));
    const plain = plainText(transcript);
    const letters = lettersOf(plain);
    const assistantStems = new Set(lines.flatMap((s) => stems(s.plain)));
    const words = stems(plain);
    const assistantWords = (part: string[]) =>
      part.length > 0 && part.every((w) => assistantStems.has(w));
    const ends = lines.map((s) => s.endedAt ?? Number.POSITIVE_INFINITY);
    return {
      similarity: partialSimilarity(letters, assistant),
      headSimilarity: partialSimilarity(letters.slice(0, END_LETTERS), assistant),
      tailSimilarity: partialSimilarity(letters.slice(-END_LETTERS), assistant),
      startsInAssistantWords: assistantWords(words.slice(0, 2)),
      endsInAssistantWords: assistantWords(words.slice(-2)),
      foreignRun: longestRun(words, (w) => !assistantStems.has(w)),
      startLagMs: phrase.startedAt - Math.min(...lines.map((s) => s.at)),
      endGapMs: Math.max(0, phrase.endedAt - Math.max(...ends)),
    };
  }

  private matches(transcript: string, startedAt: number, options: MatchOptions): boolean {
    const { strict, now, phraseEndedAt } = options;
    if (strict && this.recentMs > 0) {
      return this.isRecentEcho(transcript, startedAt);
    }
    if (!this.speakActive && startedAt > this.lastSpeakEnd + AFTER_SPEAK_GRACE_MS) {
      return false;
    }
    const words = stems(transcript);
    if (words.length < (strict ? 3 : 2)) {
      return false;
    }
    const share = strict ? 0.75 : 0.5;
    const letters = !strict && phraseEndedAt !== undefined ? lettersOf(transcript) : null;
    return this.candidates(strict, now, phraseEndedAt).some(
      (s) =>
        words.filter((w) => s.stems.has(w)).length / words.length >= share &&
        (letters === null || partialSimilarity(letters, s.letters) >= LOOSE_LETTER_MATCH),
    );
  }

  /**
   * Barge-in check only: the quick transcript taken while the assistant's reply plays is a garbled
   * piece of that reply (one or two garbled words), too short for the 3-word rule. It is
   * echo when its letters (5+) match some stretch of the playing reply at 80 %.
   */
  isPlayingReplyFragment(transcript: string): boolean {
    const latest = this.spoken.at(-1);
    if (!this.speakActive || !latest) {
      return false;
    }
    // Only a short garbled piece; a longer phrase is checked by voice in the caller.
    const words = (transcript.match(/\p{L}+/gu) ?? []).length;
    const letters = lettersOf(transcript);
    return words <= 2 && letters.length >= 5 && partialSimilarity(letters, latest.letters) >= 0.8;
  }

  /**
   * Hizuri: the strict rule (3+ words, 75 % shared stems) against the words of every reply
   * started within recentMs before the phrase began, or still playing.
   */
  private isRecentEcho(transcript: string, startedAt: number): boolean {
    const words = stems(transcript);
    if (words.length < 3) {
      return false;
    }
    const latest = this.spoken.length - 1;
    const said = new Set<string>();
    this.spoken.forEach((s, i) => {
      const playing = this.speakActive && i === latest;
      if (
        playing ||
        (s.at >= startedAt - this.recentMs && s.at <= startedAt + RECENT_START_SLACK_MS)
      ) {
        for (const stem of s.stems) {
          said.add(stem);
        }
      }
    });
    return said.size > 0 && words.filter((w) => said.has(w)).length / words.length >= 0.75;
  }
}
