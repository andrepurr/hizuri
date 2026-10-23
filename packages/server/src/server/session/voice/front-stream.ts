// Hizuri: the fast front on the user's live words.
// While the user speaks, the streaming recogniser's live text of the whole thought
// (the phrases not yet sent to Zuri plus the words being spoken) goes to the fast front
// (fast-front.ts) as it grows. Each time the front answers as if the user stopped right there: WAIT
// (the thought is unfinished), SKIP, or the one line it would say. Nothing is spoken and nothing
// reaches Zuri while the user talks: voice-session.ts acts on the answer once the user is silent
// and the phrase's text is in. By then the answer about the last words is usually already there, so
// neither the old silence gap nor a fresh model call stands between the last word and the front's
// line.
//
// One question is in flight at a time; words that arrive meanwhile wait, and only the newest are
// asked next. An answer counts for any text with nearly the same words: the recogniser's final text
// of a phrase differs a little from its live text (punctuation, a word re-heard).

import type { FastFrontResult } from "./fast-front.js";
import { anyOf, foldLetters } from "../../voice-language/languages.js";

/**
 * live = asked from the recogniser's live text while the user may still speak; phrase = after
 * stopping.
 */
export type FrontAskKind = "live" | "phrase";

/**
 * done: the thought is finished (line null = nothing to say); zuriSpeaking: the line was asked for
 * while Zuri spoke, so it may cut it (PASEO_FAST_FRONT_CUT). none: no answer (timeout, error,
 * busy).
 */
export type FrontAnswer =
  | { state: "done"; line: string | null; why?: string; zuriSpeaking?: boolean }
  | { state: "wait" }
  | { state: "none"; why: string };

/** The front's result plus whether Zuri was speaking when it was asked. */
export interface FrontStreamResult extends FastFrontResult {
  zuriSpeaking?: boolean;
}

export type FrontVerdict = FrontAnswer | { state: "pending" };

export interface FrontStreamDeps {
  ask(text: string, kind: FrontAskKind): Promise<FrontStreamResult>;
  /** An answer arrived: the session checks again whether the thought may go. */
  onAnswer(): void;
  log(event: Record<string, unknown>, message: string): void;
  /** Live words need at least this many words before they are asked about. */
  minLiveWords(): number;
}

interface Asked {
  stems: string[];
  text: string;
  kind: FrontAskKind;
}

interface Answered {
  stems: string[];
  kind: FrontAskKind;
  answer: FrontAnswer;
}

/** Five-letter word stems, letters folded (foldLetters): endings and punctuation do not count. */
export function wordStems(text: string): string[] {
  return (foldLetters(text).match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => word.slice(0, 5));
}

/**
 * An answer about `answered` holds for `text` when `text` is no longer, ends on the same word (the
 * ending decides whether a thought is finished: "I need to" vs "I need to call") and differs in
 * at most one word in ten (at least one): the final text re-hears a word or adds punctuation.
 */
export function coversWords(answered: readonly string[], text: readonly string[]): boolean {
  if (text.length === 0) {
    return true;
  }
  if (answered.length === 0 || text.length > answered.length) {
    return false;
  }
  if (text[text.length - 1] !== answered[answered.length - 1]) {
    return false;
  }
  const known = new Set(answered);
  const added = text.filter((stem) => !known.has(stem)).length;
  return added <= Math.max(1, Math.floor(text.length / 10));
}

// A final text may run a few words past the live words the front judged finished: the recogniser's
// last partial lags the user's voice by a decode or two, so the final usually ends with words no
// live question saw (it usually needs one more question, ~1-2 s). A
// finished verdict holds for up to MAX_EXTRA_WORDS more words unless the final ends on a word that
// cannot end a thought.
const MAX_EXTRA_WORDS = 6;
const OPEN_END = new RegExp(`(?:^|[^\\p{L}])${anyOf((language) => language.openEndWords)}$`, "u");

/** The text ends on a word that cannot end a thought ("and", "because", "about"…). */
export function endsOpen(text: string): boolean {
  const plain = foldLetters(text).replace(/[^\p{L}\p{N}]+$/u, "");
  return OPEN_END.test(plain);
}

/** A finished verdict about `answered` holds for a final text that only adds a few closing words. */
export function extendsFinished(answered: readonly string[], text: string): boolean {
  const stems = wordStems(text);
  const extra = stems.length - answered.length;
  if (answered.length === 0 || extra < 0 || extra > MAX_EXTRA_WORDS) {
    return false;
  }
  const heard = new Set(stems);
  const lost = answered.filter((stem) => !heard.has(stem)).length;
  return lost <= Math.max(1, Math.floor(answered.length / 10)) && !endsOpen(text);
}

export function answerOf(result: FrontStreamResult): FrontAnswer {
  if (result.line) {
    return {
      state: "done",
      line: result.line,
      ...(result.zuriSpeaking ? { zuriSpeaking: true } : {}),
    };
  }
  switch (result.why) {
    case "wait":
      return { state: "wait" };
    case "timeout":
    case "error":
    case "budget":
    case "busy":
    case undefined:
      return { state: "none", why: result.why ?? "no-answer" };
    default:
      // SKIP, or a line the code check rejected: finished, nothing to say.
      return { state: "done", line: null, why: result.why };
  }
}

export class FrontStream {
  private generation = 0;
  private inFlight: Asked | null = null;
  private next: Asked | null = null;
  private answered: Answered | null = null;
  private askCount = 0;

  constructor(private readonly deps: FrontStreamDeps) {}

  /** Model calls made by this stream so far. */
  get asks(): number {
    return this.askCount;
  }

  /** The thought's words grew while the user speaks: ask about the newest ones. */
  live(text: string): void {
    const stems = wordStems(text);
    if (stems.length < this.deps.minLiveWords()) {
      return;
    }
    this.request({ stems, text, kind: "live" });
  }

  /**
   * The answer that covers these words, if one came; never asks. final: the user stopped, and a
   * finished verdict also holds for a final text that adds a few closing words (extendsFinished).
   */
  peek(text: string, final = false): FrontAnswer | null {
    const answered = this.answered;
    if (!answered) {
      return null;
    }
    if (coversWords(answered.stems, wordStems(text))) {
      return answered.answer;
    }
    return final && answered.answer.state === "done" && extendsFinished(answered.stems, text)
      ? answered.answer
      : null;
  }

  /**
   * The front's verdict on these words once the user stopped: its answer when one covers them, else
   * `pending` while it is asked. A WAIT about live words is asked again now that the user stopped
   * (the live answer did not know the user would pause there).
   */
  verdict(text: string): FrontVerdict {
    const known = this.peek(text, true);
    if (known && !(known.state === "wait" && this.answered?.kind === "live")) {
      return known;
    }
    const stems = wordStems(text);
    if (stems.length === 0) {
      return { state: "none", why: "no-words" };
    }
    this.request({ stems, text, kind: "phrase" }, known !== null);
    return { state: "pending" };
  }

  /** The thought went to Zuri: answers still in flight are about it and count no more. */
  reset(): void {
    this.generation += 1;
    this.inFlight = null;
    this.next = null;
    this.answered = null;
  }

  /**
   * again: ask even though an answer covers these words (a live WAIT, asked after the user
   * stopped).
   */
  private request(ask: Asked, again = false): void {
    // A question about (nearly) the same words is already out or answered.
    const covering = this.next ?? this.inFlight;
    if (
      covering &&
      coversWords(covering.stems, ask.stems) &&
      (!again || covering.kind === "phrase")
    ) {
      return;
    }
    if (!again && !covering && this.answered && coversWords(this.answered.stems, ask.stems)) {
      return;
    }
    if (this.inFlight) {
      this.next = ask;
      return;
    }
    this.send(ask);
  }

  private send(ask: Asked): void {
    this.inFlight = ask;
    this.askCount += 1;
    void this.answer(ask, this.generation);
  }

  private async answer(ask: Asked, generation: number): Promise<void> {
    const sentAt = Date.now();
    let result: FrontStreamResult;
    try {
      result = await this.deps.ask(ask.text, ask.kind);
    } catch (error) {
      result = { line: null, raw: String(error), why: "error", ms: Date.now() - sentAt, call: 0 };
    }
    if (generation !== this.generation) {
      this.deps.log(
        { kind: ask.kind, ms: result.ms, why: result.why ?? null, line: result.line },
        "voice.front_stream.stale",
      );
      return;
    }
    const answer = answerOf(result);
    this.answered = { stems: ask.stems, kind: ask.kind, answer };
    this.inFlight = null;
    this.deps.log(
      {
        kind: ask.kind,
        words: ask.stems.length,
        ms: result.ms,
        ttftMs: result.ttftMs,
        call: result.call,
        state: answer.state,
        line: answer.state === "done" ? answer.line : null,
        why: result.why ?? null,
        text: ask.text.slice(-200),
      },
      "voice.front_stream.answer",
    );
    const next = this.next;
    this.next = null;
    if (next) {
      this.request(next);
    }
    this.deps.onAnswer();
  }
}
