// Hizuri: while Zuri works, a phrase the voice print calls another voice (people talking nearby)
// waits instead of steering into the assistant's turn. Otherwise each such phrase
// cuts the assistant's turn, and it stops its work to sign it. The waiting phrases reach the
// assistant with the next delivery: along with the user's own next phrase, or as one message of
// their own once the assistant's turn ends. Stop words, the assistant's name and a score above
// PASEO_VOICE_FOREIGN_STEER_SCORE still go at once: the user's own voice is misjudged too (a short
// "wait" scored -0.12). PASEO_VOICE_FOREIGN_QUEUE=0 turns it off.

import type pino from "pino";
import { envFlag, envNumber } from "../../voice-env.js";
import { STOP_ANYWHERE, nameWords, pauseWords } from "./barge-hold.js";
import type { ShortPhraseInfo } from "./short-phrase.js";

const POLL_MS = 1_000;

export interface ForeignPhrase {
  id: string;
  text: string;
  draft?: boolean;
  short?: ShortPhraseInfo;
}

/** Another voice by the voice print, with nothing in it that must reach the assistant at once. */
export function waitsAsForeign(text: string, short: ShortPhraseInfo | undefined): boolean {
  if (!envFlag("PASEO_VOICE_FOREIGN_QUEUE", true) || short?.verdict !== "other-voice") {
    return false;
  }
  const plain = text.replace(/^[^\p{L}]+/u, "");
  if (STOP_ANYWHERE.test(plain) || pauseWords().test(plain) || nameWords().test(plain)) {
    return false;
  }
  return (
    short.score === undefined || short.score <= envNumber("PASEO_VOICE_FOREIGN_STEER_SCORE", 0.15)
  );
}

function listed(phrases: ForeignPhrase[]): string {
  return phrases
    .map((phrase) => {
      const score = phrase.short?.score;
      return `${phrase.id} “${phrase.text}”${score === undefined ? "" : ` (voice ${score.toFixed(2)})`}`;
    })
    .join("\n");
}

function signHint(phrases: ForeignPhrase[]): string {
  const [first] = phrases;
  let all = "";
  if (phrases.length > 1) {
    all = ` (it stands for ${phrases.length === 2 ? "both" : `all ${phrases.length}`})`;
  }
  return `Words to someone else: sign ${first?.id ?? ""} not-for-me with mark_phrases${all} and say nothing about them. If one is clearly the user's words to you, answer it.`;
}

/** The waiting phrases after the user's own words, in the same message. */
export function foreignNote(phrases: ForeignPhrase[]): string {
  return `[While you worked, the voice print heard other voices, not the user's; they waited so they would not cut your turn:\n${listed(phrases)}\n${signHint(phrases)}]`;
}

/** The waiting phrases as a message of their own, once the assistant's turn has ended. */
export function foreignMessage(phrases: ForeignPhrase[]): string {
  return `[Other voices, not the user's by the voice print, while you worked; they waited so they would not cut your turn:]\n${listed(phrases)}\n[${signHint(phrases)}]`;
}

export interface ForeignQueueDeps<P extends ForeignPhrase> {
  /**
   * The assistant's turn still runs, or the user's own words are on their way and will carry the
   * phrases.
   */
  shouldWait(agentId: string): boolean;
  /** Sends the phrases as one message of their own. */
  deliver(agentId: string, phrases: P[]): Promise<void>;
  logger: pino.Logger;
}

/**
 * The phrases of other voices that wait for the assistant's turn to end, in the order they were
 * said.
 */
export class ForeignQueue<P extends ForeignPhrase> {
  private agentId: string | null = null;
  private waiting: P[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: ForeignQueueDeps<P>) {}

  add(agentId: string, phrase: P): void {
    if (this.agentId !== null && this.agentId !== agentId) {
      this.flushNow("agent-changed");
    }
    this.agentId = agentId;
    this.waiting.push(phrase);
    this.deps.logger.info(
      { agentId, phraseId: phrase.id, score: phrase.short?.score, waiting: this.waiting.length },
      "voice.foreign_queue.held",
    );
    this.timer ??= setInterval(() => this.tick(), POLL_MS);
  }

  /** The recogniser's final text of a waiting phrase that went in as a draft; false = not here. */
  correct(id: string, text: string): boolean {
    const phrase = this.waiting.find((waiting) => waiting.id === id);
    if (phrase) {
      phrase.text = text;
      phrase.draft = false;
    }
    return phrase !== undefined;
  }

  /** Every phrase waiting for `agentId`, taken out to go along with the user's words. */
  take(agentId: string): P[] {
    if (this.agentId !== agentId || this.waiting.length === 0) {
      return [];
    }
    const phrases = this.waiting;
    this.reset();
    this.deps.logger.info(
      { agentId, ids: phrases.map((phrase) => phrase.id) },
      "voice.foreign_queue.taken",
    );
    return phrases;
  }

  /** Sends what waits now, whatever the assistant is doing (another agent, the session closing). */
  flushNow(reason: string): void {
    const agentId = this.agentId;
    const phrases = agentId ? this.take(agentId) : [];
    if (!agentId || phrases.length === 0) {
      return;
    }
    this.deps.logger.info(
      { agentId, reason, ids: phrases.map((phrase) => phrase.id) },
      "voice.foreign_queue.flushed",
    );
    void this.deps.deliver(agentId, phrases).catch((error: unknown) => {
      this.deps.logger.error({ agentId, err: error }, "voice.foreign_queue.deliver_failed");
    });
  }

  /** Its chat was archived: what waits is let go, never sent (sending would unarchive it). */
  discard(reason: string): P[] {
    const agentId = this.agentId;
    const phrases = agentId ? this.take(agentId) : [];
    if (phrases.length > 0) {
      this.deps.logger.info(
        { agentId, reason, ids: phrases.map((phrase) => phrase.id) },
        "voice.foreign_queue.dropped",
      );
    }
    return phrases;
  }

  private tick(): void {
    if (this.agentId && !this.deps.shouldWait(this.agentId)) {
      this.flushNow("turn-ended");
    }
  }

  private reset(): void {
    this.waiting = [];
    this.agentId = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
