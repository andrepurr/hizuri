// Hizuri: the floor manager (neither brain interrupts the other). Code, not a model, decides when
// the fast front (fast-front.ts) may speak: the user's speech holds everyone (their next phrase
// cuts the front's line, even mid-synthesis); the front speaks only in the user's pause right after
// a phrase, one short line, and not again within a few seconds; Zuri's answer already out drops the
// front's line. Zuri speaking drops it too, unless the front may cut Zuri (PASEO_FAST_FRONT_CUT:
// when the front hears something meaningful, it may interrupt Zuri too): then its line cuts Zuri's
// reply and Zuri re-plans. Zuri's own replies wait for the front's line to end (voice-session.ts
// awaits `frontDone`).
//
// Zuri's own replies get the floor the same way: a reply starts only when the user's phrase is
// closed and the user has been quiet PASEO_VOICE_FLOOR_QUIET_MS (zuriMayStart). Most gaps between
// the recogniser's pieces of one long thought are under 1.5 s. A hold phrase
// (“wait”, “let me finish”, dictation) turns on a hold: no reply of Zuri's starts, the front says
// at most one line, until the user asks something, gives an order, says they are done, or stays
// silent PASEO_VOICE_HOLD_SILENCE_MS. Ending a hold never needs a stop word from the user.
//
// Room turns replace the fixed quiet time: a fixed wait was tried and felt slow. Which of the
// user's sounds hold Zuri's reply depends on the room (situation.ts), and once a phrase of the
// user's closes Zuri waits for the user's thought, not for a timer: Zuri starts the moment the
// user's words have gone to Zuri (the fast front judged the thought finished, or the monologue gap
// sent it). Quiet room: any phrase holds while open; one longer than a backchannel
// (PASEO_VOICE_BACKCHANNEL_MS) also holds until the user's thought is sent. Noisy room: only a
// phrase with recognised words counts, so noise never holds Zuri. Other voices nearby: nothing
// holds Zuri (the detector cannot tell the user's voice from a guest's while they speak); only the
// hold does.

import type { ModeStart } from "./voice-mode.js";
import { CONTINUE_WORDS, isPausePhrase, STOP_ANYWHERE } from "./barge-hold.js";
import { anyOf, foldLetters } from "../../voice-language/languages.js";

export interface FloorState {
  /** The user is talking now (the speech detector has a phrase open). */
  userSpeech: boolean;
  /** Zuri's audio is playing, queued or held. */
  zuriSpeaking: boolean;
  /** The front's line may cut Zuri's reply (PASEO_FAST_FRONT_CUT and a line meant to cut Zuri). */
  mayCutZuri?: boolean;
  /** When the user's phrase ended (or reached the front). */
  phraseAt: number;
  now: number;
}

/** cutZuri: the line goes out over Zuri's reply, which the caller stops first. */
export type FloorVerdict = { speak: true; cutZuri?: boolean } | { speak: false; reason: string };

/**
 * Why a reply of Zuri's waits: the user's phrase is open, a hold is on, or the user's pause is
 * still short.
 */
export type ZuriWaitReason = "user-speaks" | "hold" | "short-pause" | "user-thought";

/** The room around the user (situation.ts): which of the user's sounds hold Zuri's reply. */
export type RoomTurn = "quiet" | "noisy" | "voices";

/** Each room's start rule before voice modes: the same as their table's rows. */
const START_IN_ROOM: Record<RoomTurn, ModeStart> = {
  quiet: "after-user-thought",
  noisy: "after-user-words",
  voices: "at-once",
};

export type ZuriVerdict = { start: true } | { start: false; reason: ZuriWaitReason };

export interface FloorHold {
  since: number;
  reason: string;
}

/** What one phrase of the user's does to the hold. */
export interface HoldSignal {
  kind: "start" | "end";
  reason: string;
}

interface Hit {
  at: number;
  end: number;
  reason: string;
}

interface HoldPatterns {
  start: RegExp;
  ends: RegExp;
  order: RegExp;
  /** CONTINUE_WORDS as word starts (whole-word prefixes, not suffixes of longer words). */
  resume: RegExp;
}

let holdPatterns: HoldPatterns | null = null;
let backchannelPattern: RegExp | null = null;

/** The phrase is only backchannel words (“uh-huh”, “yeah, yeah”): the user listens, not speaks. */
export function isBackchannel(text: string): boolean {
  backchannelPattern ??= new RegExp(
    `^(?:${anyOf((language) => language.backchannelWords)}(?:[\\s,.!…-]+|$))+$`,
    "u",
  );
  const plain = foldLetters(text.trim().toLowerCase()).replace(/[^\p{L}]+$/u, "");
  return plain.length > 0 && backchannelPattern.test(plain);
}

function patterns(): HoldPatterns {
  holdPatterns ??= {
    resume: new RegExp(`(?<!\\p{L})${CONTINUE_WORDS.source}`, "giu"),
    start: new RegExp(`(?<!\\p{L})${anyOf((language) => language.holdPhrases)}(?!\\p{L})`, "giu"),
    ends: new RegExp(`(?<!\\p{L})${anyOf((language) => language.holdEnds)}[\\s.,!…»"]*$`, "iu"),
    order: new RegExp(
      `^(?:\\p{L}+[\\s,]+){0,2}?${anyOf((language) => language.orderWords)}(?!\\p{L})`,
      "iu",
    ),
  };
  return holdPatterns;
}

function allHits(pattern: RegExp, text: string, reason: string): Hit[] {
  const every = new RegExp(
    pattern.source,
    pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
  );
  return [...text.matchAll(every)].map((match) => ({
    at: match.index,
    end: match.index + match[0].length,
    reason,
  }));
}

/**
 * The hold signal of one phrase of the user's, or null. Start: a pure pause request (“wait, one
 * sec”), a hold phrase anywhere (“let me finish”), or a stop word inside the user's sentence while
 * the assistant was speaking (“I don't want, stop, I don't want…”). A stop word that opens an order
 * (“stop, do the other one”) is no hold: the assistant acts on it. End: a question (it ends with
 * “?”), an order near its start (“tell me…”), a continue word in a short phrase, or a done word at
 * its end (“that's it”). When both are there, the later one wins (“wait, how much is it?” asks;
 * “that's all, wait, let me think” holds).
 */
export function holdSignal(text: string, assistantSpeaks: boolean): HoldSignal | null {
  const plain = text.trim().replace(/^[^\p{L}]+/u, "");
  if (!plain) {
    return null;
  }
  const { start, ends, order, resume } = patterns();
  const starts: Hit[] = [...allHits(start, plain, "hold-phrase")];
  if (isPausePhrase(plain)) {
    starts.push({ at: 0, end: plain.length, reason: "pause-word" });
  }
  if (assistantSpeaks) {
    starts.push(...allHits(STOP_ANYWHERE, plain, "stop-word").filter((hit) => hit.at > 0));
  }
  const inStart = (hit: Hit) => starts.some((s) => hit.at >= s.at && hit.at < s.end);
  const endHits: Hit[] = [];
  const words = (plain.match(/\p{L}+/gu) ?? []).length;
  if (/\?[\s»"…)]*$/u.test(plain)) {
    endHits.push({ at: plain.length, end: plain.length, reason: "question" });
  }
  endHits.push(...allHits(order, plain, "order").filter((hit) => !inStart(hit)));
  if (words <= 4) {
    endHits.push(...allHits(resume, plain, "continue-word"));
  }
  endHits.push(...allHits(ends, plain, "done-word").filter((hit) => !inStart(hit)));
  const lastStart = starts.reduce<Hit | null>(
    (last, hit) => (!last || hit.at >= last.at ? hit : last),
    null,
  );
  const lastEnd = endHits.reduce<Hit | null>(
    (last, hit) => (!last || hit.at >= last.at ? hit : last),
    null,
  );
  if (lastStart && (!lastEnd || lastStart.at > lastEnd.at)) {
    return { kind: "start", reason: lastStart.reason };
  }
  return lastEnd ? { kind: "end", reason: lastEnd.reason } : null;
}

export class FloorManager {
  private frontPlaying: Promise<void> | null = null;
  private frontAbort: AbortController | null = null;
  private lastFrontAt = Number.NEGATIVE_INFINITY;
  private lastZuriAt = 0;
  private userSpeaking = false;
  private userLastEndAt = Number.NEGATIVE_INFINITY;
  private holdState: FloorHold | null = null;
  private frontLinesInHold = 0;
  private userPhraseAt = Number.NEGATIVE_INFINITY;
  private userPhraseWords = false;
  /**
   * Phrases longer than a backchannel since the user's thought last went to Zuri (any / with
   * words).
   */
  private openPhrases = 0;
  private openWordedPhrases = 0;

  constructor(
    private readonly minGapMs: () => number,
    private readonly backchannelMs: () => number = () => 1600,
  ) {}

  /** Zuri sent a reply to speak (its speak tool). */
  noteZuri(at: number): void {
    this.lastZuriAt = at;
  }

  /** May the front say its line now? */
  decide(state: FloorState): FloorVerdict {
    if (state.userSpeech) {
      return { speak: false, reason: "user-speaks" };
    }
    if (this.holdState && this.frontLinesInHold >= 1) {
      return { speak: false, reason: "hold" };
    }
    if (state.zuriSpeaking && !state.mayCutZuri) {
      return { speak: false, reason: "zuri-speaks" };
    }
    if (this.frontPlaying) {
      return { speak: false, reason: "front-speaks" };
    }
    if (this.lastZuriAt >= state.phraseAt) {
      return { speak: false, reason: "zuri-answered" };
    }
    if (state.now - this.lastFrontAt < this.minGapMs()) {
      return { speak: false, reason: "front-spoke-recently" };
    }
    return state.zuriSpeaking ? { speak: true, cutZuri: true } : { speak: true };
  }

  /** The speech detector opened (true) or closed (false) a phrase of the user's. */
  noteUserVoice(speaking: boolean, at: number): void {
    if (!this.userSpeaking && speaking) {
      this.userPhraseAt = at;
      this.userPhraseWords = false;
    }
    if (this.userSpeaking && !speaking) {
      this.userLastEndAt = at;
      if (at - this.userPhraseAt >= this.backchannelMs()) {
        this.openPhrases += 1;
        if (this.userPhraseWords) {
          this.openWordedPhrases += 1;
        }
      }
    }
    this.userSpeaking = speaking;
  }

  /**
   * The recogniser heard words of the user's in the open phrase (not Zuri's own reply coming back).
   */
  noteUserWords(): void {
    if (this.userSpeaking) {
      this.userPhraseWords = true;
    }
  }

  /**
   * A phrase long enough to count came back as a backchannel only (“uh-huh”, “yeah”): it holds
   * nothing.
   */
  noteBackchannel(): void {
    this.openPhrases = Math.max(0, this.openPhrases - 1);
    this.openWordedPhrases = Math.max(0, this.openWordedPhrases - 1);
  }

  /**
   * The user's words have gone to Zuri, or nothing of the user's is pending: the thought no longer
   * holds Zuri.
   */
  thoughtSent(): void {
    this.openPhrases = 0;
    this.openWordedPhrases = 0;
  }

  /** Room turns: may a reply of Zuri's start now, in this room? */
  zuriMayStartInRoom(room: RoomTurn): ZuriVerdict {
    return this.zuriMayStartInMode(START_IN_ROOM[room]);
  }

  /** Voice modes (voice-mode.ts): may a reply of Zuri's start now, by the mode's start rule? */
  zuriMayStartInMode(start: ModeStart): ZuriVerdict {
    if (this.holdState) {
      return { start: false, reason: "hold" };
    }
    if (start === "at-once") {
      return { start: true };
    }
    const anyPhrase = start === "after-user-thought";
    if (this.userSpeaking && (anyPhrase || this.userPhraseWords)) {
      return { start: false, reason: "user-speaks" };
    }
    const open = anyPhrase ? this.openPhrases : this.openWordedPhrases;
    return open > 0 ? { start: false, reason: "user-thought" } : { start: true };
  }

  /** May a reply of Zuri's start now? `quietMs` = the user's silence needed after a phrase. */
  zuriMayStart(now: number, quietMs: number): ZuriVerdict {
    if (this.userSpeaking) {
      return { start: false, reason: "user-speaks" };
    }
    if (this.holdState) {
      return { start: false, reason: "hold" };
    }
    if (now - this.userLastEndAt < quietMs) {
      return { start: false, reason: "short-pause" };
    }
    return { start: true };
  }

  /** Turn the hold on (or keep it on). True when it was off. */
  startHold(reason: string, at: number): boolean {
    if (this.holdState) {
      return false;
    }
    this.holdState = { since: at, reason };
    this.frontLinesInHold = 0;
    return true;
  }

  /** Turn the hold off; returns the hold that ended, or null when none was on. */
  endHold(): FloorHold | null {
    const ended = this.holdState;
    this.holdState = null;
    return ended;
  }

  hold(): FloorHold | null {
    return this.holdState;
  }

  /**
   * The hold has outlived `silenceMs` of the user's silence (counted from its start or the user's
   * last word).
   */
  holdSilenceOver(now: number, silenceMs: number): boolean {
    const hold = this.holdState;
    if (!hold || this.userSpeaking) {
      return false;
    }
    return now - Math.max(hold.since, this.userLastEndAt) >= silenceMs;
  }

  /**
   * For the front's next line: aborted when the user starts speaking, during synthesis or playback.
   */
  frontSignal(): AbortSignal {
    this.frontAbort = new AbortController();
    return this.frontAbort.signal;
  }

  /** The user started speaking: the front's line, if any, stops. Returns true when one was cut. */
  userSpeechStarted(): boolean {
    if (!this.frontPlaying || !this.frontAbort || this.frontAbort.signal.aborted) {
      return false;
    }
    this.frontAbort.abort();
    return true;
  }

  /** The front's line is playing; Zuri's replies wait for it. */
  frontStarted(playing: Promise<void>, at: number): void {
    this.lastFrontAt = at;
    if (this.holdState) {
      this.frontLinesInHold += 1;
    }
    const tracked = playing.finally(() => {
      if (this.frontPlaying === tracked) {
        this.frontPlaying = null;
        this.frontAbort = null;
      }
    });
    this.frontPlaying = tracked;
  }

  /** Resolves when the front's line (if any) has ended. Never rejects. */
  frontDone(): Promise<void> {
    return this.frontPlaying?.catch(() => undefined) ?? Promise.resolve();
  }
}
