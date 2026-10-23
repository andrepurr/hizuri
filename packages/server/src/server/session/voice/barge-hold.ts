import type pino from "pino";

import type { PlaybackHold } from "../../agent/tts-pacer.js";
import { envPositive, envString, envWordList } from "../../voice-env.js";
import { anyOf, wholeWords } from "../../voice-language/languages.js";
import { anyNameForm } from "../../voice-language/assistant-name.js";

// Hizuri: pause/resume barge-in.
//
// While a spoken reply is in progress (armed), the user's voice pauses it at once: START_MS of
// loud voiced audio sets a tentative hold (the pacer stops sending chunks, the reply goes quiet at
// the next pause between words). A quick transcription (verify) then decides: real words confirm
// the hold, anything else (noise, the reply's own words coming back through the speaker) releases
// it at once. RELEASE_MS of the user's silence releases a confirmed hold and the reply goes on
// (the pacer restarts the interrupted sentence). The phrase itself still takes the normal path.
//
// Stop words (pauseWords) make the hold sticky: silence does not end it, only a continue word
// (CONTINUE_WORDS), or STICKY_MAX_MS. Only a pure pause request (isPausePhrase) is sticky, in
// both modes.
//
// Why verify at all: many long sounds during playback carry no words (noise, echo of the
// reply). A rejected check releases the tentative hold and later holds
// in the same utterance wait for real words; the reply's own words twice in one reply end holds
// for that reply. Only LOUD voice counts (VAD window rms >= PASEO_BARGE_HOLD_MIN_RMS): Silero also
// calls a phone's echo residue speech, and counting it made every reply stutter.
//
// Default mode "stop": only verified words
// interrupt — noise never pauses the reply — and an interruption cuts the rest of the reply for
// good (onStop), no resume. PASEO_BARGE_MODE=hold restores pause/resume. In stop mode the verdict
// is the decision: it stops the assistant even when it comes back while the user pauses, and the
// pause does not throw away a check still running (otherwise the user's words were checked, the
// user paused, the check was dropped and the assistant talked on). Speech already going on when a
// reply arms is checked at once. Env: PASEO_BARGE_HOLD=0 turns it off; PASEO_BARGE_HOLD_START_MS
// (1500), _VERIFY_MS (1000), _RELEASE_MS (600), _MAX_MS (60000), _STICKY_MAX_MS (60000),
// _MAX_PER_REPLY (6). Every knob is read where it is used, so voice-settings.json changes it
// mid-session.

/** One pattern per value of the name knob (assistant-name.ts), built when first used. */
function byName(build: (name: string) => RegExp): () => RegExp {
  const built = new Map<string, RegExp>();
  return () => {
    const name = anyNameForm();
    let pattern = built.get(name);
    if (!pattern) {
      pattern = build(name);
      built.set(name, pattern);
    }
    return pattern;
  };
}

/**
 * A pause request: an optional call of the assistant's name, then a pause word
 * (voice-language/*.ts).
 */
export const pauseWords = byName(
  (name) => new RegExp(`^(?:${name}[\\s,]+)?${anyOf((language) => language.pauseStarts)}`, "iu"),
);
/**
 * A stop word anywhere in what the user says while the assistant talks (e.g. "No, that's wrong,
 * wait, stop…" would not cut the reply when pauseWords only matches at the start of the phrase).
 */
export const STOP_ANYWHERE = wholeWords((language) => language.stopWords);
const STOP_EVERY = new RegExp(STOP_ANYWHERE.source, "giu");

/**
 * A stop word the user said, not one of the assistant's own words coming back (if the assistant's
 * reply through the speaker happens to contain the word "stop", only that word is echo and a
 * further stop word from the user must still stop the reply). The assistant's words also count
 * joined in pairs: a recogniser can hear two short words as one stop word.
 */
export function userStopWord(heard: string, assistantTexts: readonly string[]): boolean {
  const said = heard.toLowerCase().match(STOP_EVERY) ?? [];
  if (said.length === 0) {
    return false;
  }
  const assistantWords = new Set<string>();
  for (const text of assistantTexts) {
    const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
    words.forEach((word, i) => {
      assistantWords.add(word);
      if (i > 0) {
        assistantWords.add(words[i - 1] + word);
      }
    });
  }
  // A stop word of two words (“hold on”) is the assistant's when the pair is.
  return said.some((word) => !assistantWords.has(word.replace(/\s+/g, "")));
}
export const CONTINUE_WORDS = new RegExp(
  anyOf((language) => language.continueWords),
  "iu",
);

// Words that may follow a stop word in a pure pause request ("Zuri, wait-wait, someone's calling me").
const pauseFiller = byName(
  (name) => new RegExp(`^(?:${name}|${anyOf((language) => language.pauseFillers)})$`, "iu"),
);

/**
 * Two kinds of interruption: "wait, someone's calling me" is a pause — the reply waits and goes on
 * from the same place on a continue word; anything with content ("wait, the main question…") is an
 * addition — the reply stops and the agent answers anew.
 */
export function isPausePhrase(plain: string): boolean {
  const words = plain.toLowerCase().match(/\p{L}+/gu) ?? [];
  return (
    words.length > 0 &&
    words.length <= 6 &&
    pauseWords().test(plain) &&
    words.every((word) => pauseFiller().test(word))
  );
}
/**
 * The assistant's name anywhere in what the user says while the assistant talks: calling it is the
 * clearest "stop, listen" (short calls of the name would otherwise be rejected as too short while
 * the reply talks on).
 */
export const nameWords = byName((name) => new RegExp(`(?<!\\p{L})${name}(?!\\p{L})`, "iu"));
/**
 * Words for people nearby, not for the assistant: a phrase that opens with one of their names
 * (PASEO_NOT_FOR_ME_NAMES, every word form) or is only listed sounds (PASEO_NOT_FOR_ME_SOUNDS).
 * Both are empty in the core and set by the user's profile. While the assistant talks, such a
 * phrase must not stop the reply.
 */
export function isForOthers(plain: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const words = plain.toLowerCase().match(/\p{L}+/gu) ?? [];
  const first = words[0];
  if (first === undefined) {
    return false;
  }
  const sounds = envWordList("PASEO_NOT_FOR_ME_SOUNDS", env);
  return (
    envWordList("PASEO_NOT_FOR_ME_NAMES", env).includes(first) ||
    (sounds.length > 0 && words.every((word) => sounds.includes(word)))
  );
}
/** The drop word: abandon the reply - no finishing, no resume. */
export const DROP_WORDS = wholeWords((language) => language.dropWords);

export type BargeVerdictReason =
  | "words"
  | "stop-word"
  | "name"
  | "not-for-me"
  | "not-owner"
  | "drop-word"
  | "no-words"
  | "silent-audio"
  | "assistant-words"
  | "assistant-voice"
  | "stt-timeout"
  | "not-stop-word"
  | (string & {});

export interface BargeVerdict {
  accept: boolean;
  reason: BargeVerdictReason;
  sticky?: boolean;
  [detail: string]: unknown;
}

export interface BargeHoldState {
  armed: boolean;
  phase: VerifyPhase;
  held: boolean;
  tentative: boolean;
  sticky: boolean;
  voicedMs: number;
  silenceMs: number;
}

export interface BargeHold {
  /** On while a spoken reply is synthesized or played; counted, replies can overlap. */
  arm(on: boolean): void;
  /** When the voice now being counted began (wall clock); null when the user is not speaking. */
  speechStartedAt(): number | null;
  /** One VAD window: detected = speech above the threshold, loud = loud enough to be the user. */
  onFrame(detected: boolean, frameMs: number, loud?: boolean): void;
  onSpeechStarted(): void;
  onSpeechStopped(): void;
  isSticky(): boolean;
  /** A stop word in the finished phrase: pause (or keep paused) until a continue word. */
  stickyHold(reason: string): boolean;
  /** A continue word: end any hold now. */
  resume(reason: string): void;
  /**
   * The stop-word spotter (stop-spotter.ts) heard a stop word: act on its verdict at once, as on an
   * accepted quick check, whatever check is still waiting for the STT. False when no reply is armed
   * or this reply was already stopped.
   */
  spotted(verdict: BargeVerdict): boolean;
  /** Milliseconds since the last loud voice window; Infinity when none came yet. */
  msSinceLoudVoice(): number;
  state(): BargeHoldState;
}

export interface BargeHoldOptions {
  logger: pino.Logger;
  hold: PlaybackHold;
  verify(info: { voicedMs: number }): Promise<BargeVerdict>;
  onStop?(reason: string, info: { speechStartedAt: number | null }): void;
  env?: NodeJS.ProcessEnv;
}

/**
 * One quick check in flight at a time: a local STT takes only two uploads at once, and a third (the
 * user's phrase) was refused and lost. A check waits for the one before it only until that one is
 * older than the timeout (by then it is abandoned), and the wait counts against its own timeout. An
 * unbounded wait let one STT request that never answered block every later check for ~100 s, so the
 * user talking over the reply could not stop it.
 */
export interface CheckLane {
  run<T>(start: () => Promise<T>, timeoutMs: number): Promise<T | null>;
}

export function createCheckLane(): CheckLane {
  let last: { done: Promise<unknown>; startedAt: number } | null = null;
  return {
    async run<T>(start: () => Promise<T>, timeoutMs: number): Promise<T | null> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      let staleTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const previous = last;
        const staleInMs = previous ? previous.startedAt + timeoutMs - Date.now() : 0;
        if (previous && staleInMs > 0) {
          const stale = new Promise<boolean>((resolve) => {
            staleTimer = setTimeout(() => resolve(true), staleInMs);
          });
          const settled = previous.done.then(
            () => true,
            () => true,
          );
          if ((await Promise.race([settled, stale, timedOut])) === null) {
            return null;
          }
        }
        const request = start();
        last = { done: request, startedAt: Date.now() };
        return await Promise.race([request, timedOut]);
      } finally {
        clearTimeout(timer);
        clearTimeout(staleTimer);
      }
    },
  };
}

/** Check of what the user says: idle -> verifying -> accepted; spent = no more checks until a pause. */
type VerifyPhase = "idle" | "verifying" | "accepted" | "spent";
type HoldHow = "tentative" | "confirmed" | "sticky";

const BURST_GAP_MS = 600; // silence that starts a new attempt
const UNVERIFIED_RELEASE_CAP_MS = 700; // a tentative hold nobody confirmed
// A check that never answers (its own timeouts failed) must not keep the phase "verifying".
const VERIFY_CAP_MS = 10_000;

class BargeHoldMachine implements BargeHold {
  private framesSeen = 0;
  private lastFrameAt = 0;
  private warnedNoFrames = false;
  private armed = false;
  private armCount = 0;
  private phase: VerifyPhase = "idle";
  private held = false;
  private tentative = false;
  private sticky = false;
  private heldAt = 0;
  private lastVoicedAt = 0;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private voicedMs = 0; // voiced audio since the last silence of >= releaseMs
  private voicedSince = 0; // wall clock of the first voiced frame counted in voicedMs
  private silenceMs = 0; // audio time since the last voiced frame
  private holdsThisReply = 0;
  private token = 0;
  private nextVerifyAt: number;
  private checks = 0; // rejected checks since the last silence
  private echoVerdicts = 0;
  private verdictForLog: Record<string, unknown> | null = null;
  private echoThisReply = false; // the reply's own words came back twice: stop trying
  private stoppedThisReply = false; // stop mode cut this reply already
  private tentativeAllowed = true; // false after a rejected check, until the next silence
  private quietVoiceMs = 0;
  private loudVoiceMs = 0;

  private readonly env: NodeJS.ProcessEnv;

  constructor(private readonly options: BargeHoldOptions) {
    this.env = options.env ?? process.env;
    this.nextVerifyAt = this.verifyMs;
  }

  private get mode(): "hold" | "stop" {
    return bargeStopMode(this.env) ? "stop" : "hold";
  }

  private get startMs(): number {
    return envPositive("PASEO_BARGE_HOLD_START_MS", 1500, this.env);
  }

  private get verifyMs(): number {
    const verifyMs = envPositive("PASEO_BARGE_HOLD_VERIFY_MS", 1000, this.env);
    return this.mode === "stop" ? Math.min(verifyMs, this.startMs) : verifyMs;
  }

  private get releaseMs(): number {
    return envPositive("PASEO_BARGE_HOLD_RELEASE_MS", 600, this.env);
  }

  private get unverifiedReleaseMs(): number {
    return Math.min(this.releaseMs, UNVERIFIED_RELEASE_CAP_MS);
  }

  private get maxHoldMs(): number {
    return envPositive("PASEO_BARGE_HOLD_MAX_MS", 60_000, this.env);
  }

  // Well under the 300 s MCP timeout of the speak call, so a forgotten "continue" never hangs it.
  private get stickyMaxMs(): number {
    return envPositive("PASEO_BARGE_HOLD_STICKY_MAX_MS", 60_000, this.env);
  }

  private get maxPerReply(): number {
    return envPositive("PASEO_BARGE_HOLD_MAX_PER_REPLY", 6, this.env);
  }

  private get logger(): pino.Logger {
    return this.options.logger;
  }

  private reset(): void {
    this.phase = "idle";
    this.voicedMs = 0;
    this.nextVerifyAt = this.verifyMs;
    this.checks = 0;
    this.tentativeAllowed = true;
    this.token += 1;
  }

  speechStartedAt(): number | null {
    return this.voicedMs > 0 ? this.voicedSince : null;
  }

  private startHold(how: HoldHow): void {
    // Stop mode still pauses on a pure pause request (isPausePhrase): the rest of the reply waits.
    if (this.mode === "stop" && how !== "sticky") {
      this.phase = "spent";
      this.holdsThisReply += 1;
      this.stoppedThisReply = true;
      this.logger.info({ ...this.verdictForLog, voicedMs: this.voicedMs }, "barge_hold.stop");
      this.options.onStop?.("barge-stop", { speechStartedAt: this.speechStartedAt() });
      return;
    }
    if (!this.held) {
      this.held = true;
      this.heldAt = Date.now();
      this.options.hold.set(true);
      this.ticker = setInterval(() => this.tick(), 100);
    }
    this.tentative = how === "tentative";
    this.sticky = this.sticky || how === "sticky";
    if (this.sticky) {
      this.options.hold.setSticky(true);
    }
    if (!this.tentative) {
      this.holdsThisReply += 1;
    }
    this.logger.info(
      { how, ...(this.tentative ? {} : this.verdictForLog), voicedMs: this.voicedMs },
      "barge_hold.hold",
    );
  }

  private release(reason: string): void {
    if (!this.held) {
      return;
    }
    this.held = false;
    this.tentative = false;
    this.sticky = false;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.options.hold.set(false, reason);
    this.logger.info({ reason, heldMs: Date.now() - this.heldAt }, "barge_hold.release");
  }

  /** Wall-clock release, so a hold ends even if VAD windows stop arriving. */
  private tick(): void {
    const now = Date.now();
    if (this.sticky) {
      if (now - this.heldAt > this.stickyMaxMs) {
        this.release("sticky-max");
      }
      return;
    }
    if (now - this.heldAt > this.maxHoldMs) {
      this.release("max-hold");
      return;
    }
    const quietMs = now - this.lastVoicedAt;
    if (this.tentative && this.phase !== "verifying" && quietMs >= this.unverifiedReleaseMs) {
      this.release("unverified");
    } else if (quietMs >= this.releaseMs) {
      this.release("silence");
    }
  }

  private startVerify(): void {
    this.phase = "verifying";
    const mine = ++this.token;
    const askedAt = Date.now();
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    const capped = new Promise<BargeVerdict>((resolve) => {
      capTimer = setTimeout(
        () => resolve({ accept: false, reason: "verify-timeout" }),
        VERIFY_CAP_MS,
      );
    });
    void Promise.race([
      Promise.resolve().then(() => this.options.verify({ voicedMs: this.voicedMs })),
      capped,
    ])
      .finally(() => clearTimeout(capTimer))
      .catch(
        (error: unknown): BargeVerdict => ({
          accept: false,
          reason: `error: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
      .then((verdict) => this.onVerdict(verdict, mine, Date.now() - askedAt));
  }

  private onVerdict(verdict: BargeVerdict, mine: number, tookMs: number): void {
    if (mine !== this.token || this.phase !== "verifying") {
      return;
    }
    if (!this.armed || !verdict.accept) {
      if (verdict.reason === "assistant-words" || verdict.reason === "assistant-voice") {
        this.echoVerdicts += 1;
        this.echoThisReply = this.echoVerdicts >= 2;
      }
      // The user keeps talking: check again after each further second of voice (3 checks).
      this.checks += 1;
      const retry = this.armed && !this.echoThisReply && this.checks < 3;
      this.nextVerifyAt = retry ? this.voicedMs + 1000 : Infinity;
      this.phase = retry ? "idle" : "spent";
      this.tentativeAllowed = false;
      this.logger.info({ ...verdict, tookMs, armed: this.armed, retry }, "barge_hold.rejected");
      if (this.held && this.tentative) {
        this.release(verdict.reason);
      }
      return;
    }
    this.verdictForLog = { ...verdict, tookMs };
    this.phase = "accepted";
    if (verdict.sticky) {
      this.startHold("sticky");
    } else if (this.mode === "stop") {
      // The verdict is the decision: verified words stop the assistant, also in a pause between the
      // user's words.
      this.startHold("confirmed");
    } else if (this.held) {
      if (this.tentative) {
        this.tentative = false;
        this.holdsThisReply += 1;
        this.logger.info(this.verdictForLog, "barge_hold.confirmed");
      }
    } else if (this.voicedMs >= this.startMs && this.silenceMs === 0) {
      this.startHold("confirmed");
    }
  }

  arm(on: boolean): void {
    this.armCount = Math.max(0, this.armCount + (on ? 1 : -1));
    const armed = this.armCount > 0;
    if (this.armed === armed) {
      return;
    }
    this.armed = armed;
    if (!armed) {
      this.logger.info(
        {
          holds: this.holdsThisReply,
          loudVoiceMs: this.loudVoiceMs,
          quietVoiceMs: this.quietVoiceMs,
        },
        "barge_hold.disarmed",
      );
    }
    this.holdsThisReply = 0;
    this.quietVoiceMs = 0;
    this.loudVoiceMs = 0;
    const speaking = armed && this.voicedMs > 0 && this.silenceMs < this.releaseMs;
    if (armed) {
      this.logger.info(
        {
          mode: this.mode,
          framesSeen: this.framesSeen,
          msSinceLastFrame: this.lastFrameAt ? Date.now() - this.lastFrameAt : null,
          ...(speaking ? { speakingMs: this.voicedMs, phase: this.phase } : {}),
        },
        "barge_hold.armed",
      );
    }
    this.echoThisReply = false;
    this.echoVerdicts = 0;
    this.stoppedThisReply = false;
    if (!armed) {
      this.release("reply-ended");
      this.reset();
    } else if (speaking && !(this.held && !this.tentative)) {
      // The user was already talking when the reply armed: check that speech now,
      // as if it had started after arming, instead of waiting for the next window.
      this.maybeVerify(this.silenceMs === 0);
      this.maybeHold(this.silenceMs === 0);
    }
  }

  onFrame(vad: boolean, frameMs: number, loud?: boolean): void {
    this.framesSeen += 1;
    this.lastFrameAt = Date.now();
    const detected = vad && loud !== false;
    if (this.armed && vad) {
      if (detected) {
        this.loudVoiceMs += frameMs;
      } else {
        this.quietVoiceMs += frameMs;
      }
    }
    if (detected) {
      if (this.voicedMs === 0) {
        this.voicedSince = this.lastFrameAt - frameMs;
      }
      this.voicedMs += frameMs;
      this.silenceMs = 0;
      this.lastVoicedAt = this.lastFrameAt;
    } else if (this.onSilentFrame(frameMs)) {
      return;
    }
    if (!this.armed || (this.held && !this.tentative)) {
      return;
    }
    this.maybeVerify(detected);
    this.maybeHold(detected);
  }

  /** True when the frame ended the attempt (a long enough pause). */
  private onSilentFrame(frameMs: number): boolean {
    this.silenceMs += frameMs;
    // A short pause between phrases: a rejected or spent check gets a fresh start, so the next
    // words can pause the reply again (2 s was too long).
    if (
      !this.held &&
      this.silenceMs >= BURST_GAP_MS &&
      this.silenceMs < BURST_GAP_MS + frameMs &&
      (this.phase === "spent" || (this.phase === "idle" && this.voicedMs > 0))
    ) {
      this.reset();
    }
    if (this.silenceMs < this.releaseMs) {
      return false;
    }
    // Stop mode: the check of words the user said while the assistant talked still decides after a
    // pause.
    if (this.keepsCheck()) {
      return true;
    }
    // The user stopped: the ticker releases a normal hold; forget a check still running.
    if (this.phase !== "idle" || this.voicedMs > 0) {
      if (!this.held && (this.phase === "verifying" || this.phase === "accepted")) {
        this.logger.info(
          { phase: this.phase, voicedMs: this.voicedMs },
          "barge_hold.stopped_before_hold",
        );
      }
      this.reset();
    }
    return true;
  }

  private maybeVerify(detected: boolean): void {
    // A short word ("stop") ends before VERIFY_MS of voice: check it as soon as the user pauses.
    const shortWord =
      this.held &&
      !detected &&
      this.silenceMs >= 160 &&
      this.voicedMs >= 200 &&
      this.nextVerifyAt === this.verifyMs;
    if (this.phase !== "idle" || (this.voicedMs < this.nextVerifyAt && !shortWord)) {
      return;
    }
    if (this.echoThisReply) {
      this.phase = "spent";
      this.release("echo");
      return;
    }
    if (this.holdsThisReply >= this.maxPerReply) {
      this.phase = "spent";
      this.release("limit");
      this.logger.info({ holdsThisReply: this.holdsThisReply }, "barge_hold.limit_reached");
      return;
    }
    this.startVerify();
  }

  private maybeHold(detected: boolean): void {
    if (
      !detected ||
      this.held ||
      this.voicedMs < this.startMs ||
      this.echoThisReply ||
      this.holdsThisReply >= this.maxPerReply
    ) {
      return;
    }
    if (this.phase === "accepted") {
      this.startHold("confirmed");
    } else if (this.mode === "hold" && this.tentativeAllowed && this.phase !== "spent") {
      this.startHold("tentative");
    }
  }

  /** No VAD windows lately means the hold cannot work: say so once, loudly. */
  onSpeechStarted(): void {
    if (!this.warnedNoFrames && Date.now() - this.lastFrameAt > 2000) {
      this.warnedNoFrames = true;
      this.logger.warn(
        { framesSeen: this.framesSeen, armed: this.armed },
        "barge_hold.no_vad_frames",
      );
    }
  }

  /** The VAD closed the phrase: the ticker ends a normal hold, a sticky one stays. */
  onSpeechStopped(): void {
    if (!this.held && !this.keepsCheck()) {
      this.reset();
    }
  }

  /** Stop mode keeps a running check of the user's words through pauses (see the header). */
  private keepsCheck(): boolean {
    return this.mode === "stop" && this.armed && this.phase === "verifying";
  }

  isSticky(): boolean {
    return this.held && this.sticky;
  }

  stickyHold(reason: string): boolean {
    if (!this.armed) {
      return false;
    }
    this.verdictForLog = { reason };
    if (this.held) {
      this.sticky = true;
      this.tentative = false;
      this.options.hold.setSticky(true);
      this.logger.info({ reason }, "barge_hold.sticky");
    } else {
      this.startHold("sticky");
    }
    return true;
  }

  resume(reason: string): void {
    this.release(reason);
  }

  spotted(verdict: BargeVerdict): boolean {
    // A spent quick check does not block it: three STT timeouts or the reply's echo spend the check, and
    // that slow STT is what the spotter is for. The echo guards ran on the spotter's text already.
    if (
      !this.armed ||
      !verdict.accept ||
      this.stoppedThisReply ||
      this.holdsThisReply >= this.maxPerReply
    ) {
      return false;
    }
    if (this.held && !this.tentative) {
      // Held already: only a pure pause request still changes it, into a sticky hold.
      return verdict.sticky === true && !this.sticky && this.stickyHold("spotter");
    }
    // A quick check still waiting for the STT is dropped: this verdict came first.
    this.token += 1;
    this.verdictForLog = { ...verdict, via: "spotter" };
    this.phase = "accepted";
    this.startHold(verdict.sticky ? "sticky" : "confirmed");
    return true;
  }

  msSinceLoudVoice(): number {
    return this.lastVoicedAt ? Date.now() - this.lastVoicedAt : Infinity;
  }

  state(): BargeHoldState {
    return {
      armed: this.armed,
      phase: this.phase,
      held: this.held,
      tentative: this.tentative,
      sticky: this.sticky,
      voicedMs: this.voicedMs,
      silenceMs: this.silenceMs,
    };
  }
}

/** True unless PASEO_BARGE_MODE=hold: an interruption cuts the reply instead of pausing it. */
export function bargeStopMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return envString("PASEO_BARGE_MODE", "stop", env) !== "hold";
}

export function createBargeHold(options: BargeHoldOptions): BargeHold {
  return new BargeHoldMachine(options);
}
