// Hizuri: the fast front. The assistant (an Opus agent) needs 10-60 s before it
// speaks; a second, always-open Claude Haiku session on the user's own Claude login answers in
// about a second with one short line in its voice: an acknowledgement, a short clarifying
// question, or what it is busy with, read from a status line code builds out of its tool calls
// (status-line.ts). It never does the work. Code checks every line (stage directions, “done”
// claims, length) before it is spoken; the floor manager (floor-manager.ts) decides when it may
// speak; the assistant gets every line it said in its next message.
//
// PASEO_FAST_FRONT=shadow logs what it would say; =on speaks it; off (default) does nothing.
// The role is the file PASEO_FAST_FRONT_PERSONA (else the neutral built-in role, front-roles.ts),
// with an optional brief about the user appended (PASEO_FAST_FRONT_BRIEF); both are re-read when
// they change. The user's own role and brief are set in their personal folder (owner-profile.ts).
// One Claude Code process serves the whole daemon; it is replaced after
// PASEO_FAST_FRONT_RECYCLE_TURNS phrases (so its context stays small) or a role change, and stops
// after PASEO_FAST_FRONT_IDLE_MS without phrases.
//
// PASEO_FAST_FRONT_STREAM=on feeds it the user's live words while they speak (front-stream.ts); it
// answers WAIT while the thought is unfinished, and its answer decides when the thought goes to
// Zuri (voice-session.ts).
//
// PASEO_FAST_FRONT_FACTS (default on) adds <your_work>: the helper agents running now and the tasks
// in work and next on the user's task board (front-facts.ts), so it answers "what's up", "how many
// agents", "what's next" itself. A “done” or a number it says must be in those facts.
//
// An answer that misses PASEO_FAST_FRONT_TIMEOUT_MS replaces the process: a stuck one answered
// nothing for 11 minutes (~50 timeouts in a row) while every phrase queued behind the last. One
// question is out at a time; another meanwhile gets "busy".

import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type pino from "pino";

import { claudeQuery, type ClaudeQueryFactory } from "../../agent/providers/claude/query.js";
import {
  checkProviderLaunchAvailable,
  createProviderEnv,
  resolveProviderLaunch,
} from "../../agent/provider-launch-config.js";
import {
  envFlag,
  envNonNegative,
  envPositive,
  envString,
  envWordList,
  voiceTimeZone,
} from "../../voice-env.js";
import { en } from "../../voice-language/en.js";
import { allWords, anyOf, LANGUAGES } from "../../voice-language/languages.js";
import { assistantNameForms } from "../../voice-language/assistant-name.js";
import type { VoiceLanguage } from "../../voice-language/types.js";
import { BUILTIN_FAST_FRONT_ROLE } from "./front-roles.js";
import type { FrontFacts } from "./front-facts.js";

export type FastFrontMode = "off" | "shadow" | "on";

/** Read on every phrase, so voice-settings.json switches it without a restart. */
export function fastFrontMode(env: NodeJS.ProcessEnv = process.env): FastFrontMode {
  const mode = envString("PASEO_FAST_FRONT", "off", env).trim().toLowerCase();
  return mode === "on" || mode === "shadow" ? mode : "off";
}

/**
 * The user's live words go to the front as they speak (front-stream.ts); read live like the mode.
 */
export function fastFrontStream(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    fastFrontMode(env) !== "off" &&
    envString("PASEO_FAST_FRONT_STREAM", "off", env).trim().toLowerCase() === "on"
  );
}

/** The front gets the facts of Zuri's work (front-facts.ts); read live like the mode. */
export function fastFrontFacts(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag("PASEO_FAST_FRONT_FACTS", true, env);
}

export interface FastFrontInput {
  /** The user's words: one phrase or a whole monologue. */
  phrase: string;
  at: number;
  /** Zuri's status line (status-line.ts). */
  status: string;
  /**
   * The assistant's agents and the user's task board (front-facts.ts); null when unknown or off.
   */
  facts?: FrontFacts | null;
  /** The phrase graph directory: a fresh front session starts from its last turns. */
  graphDir?: string | null;
  /**
   * Stream mode (front-stream.ts): the user's words so far, judged as if they stopped there (WAIT
   * allowed). live = asked while the user may still speak (own budget); phrase = asked after they
   * stopped.
   */
  stream?: "live" | "phrase";
  /** Noise and other voices around the user (situation.ts). */
  situation?: string;
  /** Zuri is in the middle of a reply that the line would cut (PASEO_FAST_FRONT_CUT). */
  zuriSpeaking?: boolean;
  /** The language the user speaks: a line in another one is not said (default English). */
  language?: VoiceLanguage;
}

export type FrontCheck = { line: string } | { skip: true } | { wait: true } | { rejected: string };

export interface FastFrontResult {
  /** The line to say, after the code check; null = say nothing. */
  line: string | null;
  raw: string;
  /**
   * SKIP, WAIT, a rejection reason, timeout, error, budget, or busy (another question is out);
   * absent when there is a line.
   */
  why?: string;
  ms: number;
  /** The model's time to first token, as Claude Code reports it. */
  ttftMs?: number;
  call: number;
}

const MAX_WORDS = 18;
const MAX_CHARS = 160;
const TAG = /^\[[a-z:]+\]\s*/i;

// A line that narrates instead of speaking (the probe once said "Zuri will tell <the user's name>
// that…"). The front is Zuri, so its name in a line is always narration ("Zuri will sort it out
// now"); so are the user's own names, PASEO_USER_NAME_FORMS (every form, "|"-separated; personal
// folder). The words of every language are in voice-language/*.ts.
const STAGE_WORDS = allWords((language) => language.stageWords).join("|");
const LINE_LABELS = anyOf((language) => language.lineLabels);
const stageDirections = new Map<string, RegExp>();

function stageDirection(): RegExp {
  const users = envWordList("PASEO_USER_NAME_FORMS")
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const names = [assistantNameForms().join("|"), users].filter(Boolean).join("|");
  let pattern = stageDirections.get(names);
  if (!pattern) {
    const words = `${STAGE_WORDS}|${names}`;
    pattern = new RegExp(
      `(^|[^\\p{L}])(${words})([^\\p{L}]|$)|^${LINE_LABELS}\\s*:|[()*_#[\\]{}<>]`,
      "iu",
    );
    stageDirections.set(names, pattern);
  }
  return pattern;
}

// “Done” claims: the front did nothing and knows only the status line. Hearing and recording are
// true by construction (the user's phrase always reaches Zuri), so "got it", "noted" stay allowed.
const DONE_WORDS = new Set(allWords((language) => language.doneWords));

// The board's own words: “done” may name an item the board shows as ready or live.
const BOARD_DONE_WORDS = new Set(allWords((language) => language.boardDoneWords));

// Times and yes/no answers are facts only the slower Zuri knows, so the fast front never states
// them. Numbers too, unless the facts hold them.
const TIME_CLAIM = new RegExp(
  `(^|[^\\p{L}])${anyOf((language) => language.timeClaims)}([^\\p{L}]|$)|^${anyOf((language) => [language.noWord])}([^\\p{L}]|$)`,
  "iu",
);

// Words every board line shares; they do not tie a line to one item.
const GENERIC_STEMS = new Set(allWords((language) => language.genericStems));

function stems(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/\p{L}{5,}/gu) ?? [])
      .map((word) => word.slice(0, 5))
      .filter((stem) => !GENERIC_STEMS.has(stem)),
  );
}

/** A “done” line names something the board shows as done, by its words or its number. */
function doneGrounded(line: string, words: readonly string[], facts?: FrontFacts | null): boolean {
  if (!facts || facts.done.length === 0 || !words.every((word) => BOARD_DONE_WORDS.has(word))) {
    return false;
  }
  const done = facts.done.join(" ");
  const known = new Set([...stems(done), ...(done.match(/\d+/g) ?? [])]);
  return [...stems(line), ...(line.match(/\d+/g) ?? [])].some((token) => known.has(token));
}

/**
 * "Two agents" says how many helper agents run; it must match the facts (the board's
 * tasks in work are not agents).
 */
function agentCountGrounded(line: string, facts?: FrontFacts | null): boolean {
  for (const language of LANGUAGES) {
    const said = language.agentCount.exec(line)?.[1]?.toLowerCase();
    if (!said) {
      continue;
    }
    const count = language.noneCount.test(said)
      ? 0
      : (language.countWords[said] ?? (/^\d+$/.test(said) ? Number(said) : null));
    if (count !== null && count !== (facts?.agents ?? null)) {
      return false;
    }
  }
  return true;
}

/** Every number in the line is one the facts hold. */
function numbersGrounded(line: string, facts?: FrontFacts | null): boolean {
  const numbers = line.match(/\d+/g);
  if (!numbers) {
    return true;
  }
  const known = new Set(facts?.text.match(/\d+/g) ?? []);
  return numbers.every((number) => known.has(number));
}

/** A line in the user's language: a name or a term in other letters may stay in it. */
function inLanguage(line: string, language: VoiceLanguage): boolean {
  const own = (line.match(new RegExp(`\\p{Script=${language.script}}`, "gu")) ?? []).length;
  const other = (line.match(/\p{L}/gu) ?? []).length - own;
  return own > 0 && other <= own / 3;
}

/** The code check every line passes before it is spoken; `facts` are what it may state. */
export function checkFrontLine(
  raw: string,
  facts?: FrontFacts | null,
  language: VoiceLanguage = en,
): FrontCheck {
  const first =
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim()
      .split("\n")
      .find((row) => row.trim()) ?? "";
  const line = first
    .replace(TAG, "")
    .replace(/^["«»“”'\s-]+|["«»“”'\s]+$/g, "")
    .trim();
  if (!line || /^skip\b/i.test(line)) {
    return { skip: true };
  }
  // Stream mode: the thought is not finished yet; nobody answers.
  if (/^wait\b/i.test(line)) {
    return { wait: true };
  }
  if (
    raw
      .trim()
      .split("\n")
      .filter((row) => row.trim()).length > 1
  ) {
    return { rejected: "several-lines" };
  }
  const words = line.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS || line.length > MAX_CHARS) {
    return { rejected: "too-long" };
  }
  if (!inLanguage(line, language)) {
    return { rejected: "wrong-language" };
  }
  if (stageDirection().test(line)) {
    return { rejected: "stage-direction" };
  }
  const done = (line.toLowerCase().match(/\p{L}+/gu) ?? []).filter((word) => DONE_WORDS.has(word));
  if (done.length > 0 && !doneGrounded(line, done, facts)) {
    return { rejected: "done-claim" };
  }
  if (TIME_CLAIM.test(line) || !numbersGrounded(line, facts) || !agentCountGrounded(line, facts)) {
    return { rejected: "fact-claim" };
  }
  if (/\p{Extended_Pictographic}/u.test(line)) {
    return { rejected: "emoji" };
  }
  return { line };
}

function localTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", {
    timeZone: voiceTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clean(text: string): string {
  return text
    .replace(/\[[a-z:]+\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function short(text: string, max: number): string {
  const body = clean(text);
  return body.length <= max ? body : `${body.slice(0, max - 1)}…`;
}

/** The message the front gets for one phrase. */
export function buildFrontMessage(params: {
  input: FastFrontInput;
  zuriSaid: readonly string[];
  history: readonly string[];
  /** The user's phrases that reached the conversation since the session's last message. */
  recent?: readonly string[];
  /** The facts are the same as in the session's last message: a short mark instead. */
  factsUnchanged?: boolean;
}): string {
  const { input, zuriSaid, history, recent = [], factsUnchanged } = params;
  const work = factsUnchanged
    ? '<your_work unchanged="yes"/>'
    : input.facts && `<your_work>\n${input.facts.text}\n</your_work>`;
  return [
    ...(history.length > 0 ? [`<earlier_turns>\n${history.join("\n")}\n</earlier_turns>`] : []),
    ...(recent.length > 0 ? [`<recent_turns>\n${recent.join("\n")}\n</recent_turns>`] : []),
    `<time>${localTime(input.at)}</time>`,
    `<your_status>${input.status}</your_status>`,
    ...(work ? [work] : []),
    `<you_said_aloud_since>${zuriSaid.map((line) => `“${short(line, 300)}”`).join(" ")}</you_said_aloud_since>`,
    ...(input.situation ? [`<situation>${input.situation}</situation>`] : []),
    ...(input.zuriSpeaking ? ["<you_are_speaking>yes</you_are_speaking>"] : []),
    userWords(input),
  ].join("\n");
}

/**
 * The user's words: a phrase, or (stream mode) the user's words so far, marked when they have
 * stopped talking.
 */
function userWords(input: FastFrontInput): string {
  const words = input.phrase.trim();
  if (!input.stream) {
    return `<user_phrase>${words}</user_phrase>`;
  }
  return input.stream === "phrase"
    ? `<user_words paused="yes">${words}</user_words>`
    : `<user_words>${words}</user_words>`;
}

interface GraphLine {
  id?: string;
  at?: string;
  type?: string;
  text?: string;
  delivery?: string;
  source?: string;
}

/** The phrase graph keeps the newest rows at the end; ~400 of them fit in this many bytes. */
const GRAPH_TAIL_BYTES = 256 * 1024;

function tailRows(file: string, bytes: number): string[] {
  const fd = openSync(file, "r");
  try {
    const size = statSync(file).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    const rows = buffer.toString("utf8").split("\n");
    // A cut first row is half a line.
    return start > 0 ? rows.slice(1) : rows;
  } finally {
    closeSync(fd);
  }
}

export interface GraphTurns {
  /** “User: …” / “You: …”, oldest first. */
  turns: string[];
  /** Every graph row read, so the next call can skip them. */
  ids: string[];
}

/**
 * The last turns of the phrase graph (the user's phrases and Zuri's replies as “You”), oldest
 * first. A phrase written twice (its text corrected) counts once, with its last text. `seen`: rows
 * the session already got are skipped; `phrasesOnly`: only the user's phrases.
 */
export function readGraphTail(
  dir: string,
  options: { limit: number; seen?: ReadonlySet<string>; phrasesOnly?: boolean },
): GraphTurns {
  let names: string[];
  try {
    names = readdirSync(dir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
      .sort()
      .slice(-2);
  } catch {
    return { turns: [], ids: [] };
  }
  const turns = new Map<string, string>();
  for (const name of names) {
    for (const row of tailRows(path.join(dir, name), GRAPH_TAIL_BYTES)) {
      let event: GraphLine;
      try {
        event = JSON.parse(row) as GraphLine;
      } catch {
        continue;
      }
      const key = event.id ?? `${event.at ?? ""}|${event.text ?? ""}`;
      let turn: string | null = null;
      if (event.type === "phrase" && event.text && event.delivery !== "dropped") {
        turn = `User: ${short(event.text, 200)}`;
      } else if (event.type === "reply" && event.text && !options.phrasesOnly) {
        turn = `You: ${short(event.text, 200)}`;
      }
      if (turn) {
        // A corrected phrase replaces its text in place.
        turns.set(key, turn);
      }
    }
  }
  const ids = [...turns.keys()];
  const fresh = ids.filter((id) => !options.seen?.has(id)).map((id) => turns.get(id) ?? "");
  return { turns: fresh.slice(-options.limit), ids };
}

/** The last turns of the phrase graph, oldest first. */
export function readGraphTurns(dir: string, limit: number): string[] {
  return readGraphTail(dir, { limit }).turns;
}

function skillBody(text: string): string {
  return text.startsWith("---") ? text.split("---").slice(2).join("---").trim() : text.trim();
}

function expandHome(file: string): string {
  return file.startsWith("~/") ? path.join(homedir(), file.slice(2)) : file;
}

/**
 * The fast front's system prompt: the role file PASEO_FAST_FRONT_PERSONA, else the built-in role,
 * plus the brief PASEO_FAST_FRONT_BRIEF when it is set and exists. The stamp changes with either.
 */
export function fastFrontPrompt(): { text: string; stamp: string } {
  const personaPath = expandHome(envString("PASEO_FAST_FRONT_PERSONA", "").trim());
  if (personaPath && !existsSync(personaPath)) {
    throw new Error(`fast front role file not found (${personaPath})`);
  }
  const briefPath = expandHome(envString("PASEO_FAST_FRONT_BRIEF", "").trim());
  const brief = briefPath && existsSync(briefPath) ? readFileSync(briefPath, "utf8").trim() : "";
  const stamp = [personaPath || "builtin", briefPath]
    .filter(Boolean)
    .map((file) => (existsSync(file) ? `${file}@${statSync(file).mtimeMs}` : file))
    .join("|");
  const role = personaPath ? skillBody(readFileSync(personaPath, "utf8")) : BUILTIN_FAST_FRONT_ROLE;
  const text = [
    role,
    ...(brief ? [`<who_the_user_is>\n${skillBody(brief)}\n</who_the_user_is>`] : []),
  ].join("\n\n");
  return { text, stamp };
}

interface Waiter {
  resolve: (reply: { text: string; ttftMs?: number }) => void;
  reject: (error: Error) => void;
  text: string;
}

/** A pushable async iterable: the streaming input of one Claude Code process. */
export class MessageInput implements AsyncIterable<SDKUserMessage> {
  private queue: SDKUserMessage[] = [];
  private pull: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
  private done = false;

  push(message: SDKUserMessage): void {
    if (this.pull) {
      const pull = this.pull;
      this.pull = null;
      pull({ value: message, done: false });
      return;
    }
    this.queue.push(message);
  }

  end(): void {
    this.done = true;
    this.pull?.({ value: undefined, done: true });
    this.pull = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const message = this.queue.shift();
        if (message) {
          return Promise.resolve({ value: message, done: false });
        }
        if (this.done) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.pull = resolve;
        });
      },
    };
  }
}

interface FrontSession {
  query: Query;
  input: MessageInput;
  waiters: Waiter[];
  /** Every message sent, live checks included. */
  turns: number;
  closed: boolean;
  promptStamp: string;
  /** The facts text last sent in full, so an unchanged board costs one short tag. */
  lastFacts: string | null;
  /** Phrase graph rows this session already got (seed or recent turns). */
  graphSeen: Set<string>;
}

const NO_FACTS: FrontFacts = { text: "unknown right now", done: [], agents: null };

/** The facts this message carries: in full when new to the session, else a short mark. */
function sessionFacts(
  session: FrontSession,
  input: FastFrontInput,
): { input: FastFrontInput; factsUnchanged: boolean } {
  // Facts gone after this session saw some (switched off, board unreadable): it must not answer
  // from the old ones.
  const facts = input.facts ?? (session.lastFacts !== null ? NO_FACTS : null);
  const factsUnchanged = facts !== null && facts.text === session.lastFacts;
  if (facts !== null) {
    session.lastFacts = facts.text;
  }
  return { input: { ...input, facts }, factsUnchanged };
}

/** Tests run the front on a fake Claude Code process. */
export interface FastFrontDeps {
  queryFactory?: ClaudeQueryFactory;
  binary?: string;
}

/** The user's phrases since the session's last message, or the seed of a fresh session. */
function graphContext(
  session: FrontSession,
  graphDir: string | null | undefined,
): { history: string[]; recent: string[] } {
  if (!graphDir) {
    return { history: [], recent: [] };
  }
  const fresh = session.turns === 0;
  const limit = fresh
    ? envPositive("PASEO_FAST_FRONT_SEED_TURNS", 12)
    : envNonNegative("PASEO_FAST_FRONT_RECENT_TURNS", 4);
  if (limit === 0) {
    return { history: [], recent: [] };
  }
  const tail = readGraphTail(graphDir, {
    limit,
    seen: session.graphSeen,
    phrasesOnly: !fresh,
  });
  for (const id of tail.ids) {
    session.graphSeen.add(id);
  }
  return fresh ? { history: tail.turns, recent: [] } : { history: [], recent: tail.turns };
}

export class FastFront {
  private session: FrontSession | null = null;
  private calls = 0;
  private liveCalls = 0;
  private zuriSaid: string[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private binary: Promise<string> | null = null;
  private starting: Promise<FrontSession> | null = null;
  /** A question is out: the next one gets "busy" instead of queueing behind it. */
  private asking = false;

  constructor(
    private readonly logger: pino.Logger,
    private readonly deps: FastFrontDeps = {},
  ) {}

  /** Zuri's speak text, for the next phrase's context. */
  noteZuri(text: string): void {
    this.zuriSaid = [...this.zuriSaid.slice(-3), text];
  }

  /** Start the Claude Code process ahead of the first phrase (no model call). */
  warm(): void {
    void this.ensureSession().catch((error: unknown) => {
      this.logger.warn({ err: String(error) }, "fast_front.warm_failed");
    });
  }

  async respond(input: FastFrontInput): Promise<FastFrontResult> {
    const startedAt = Date.now();
    if (this.asking) {
      return { line: null, raw: "", why: "busy", ms: 0, call: this.calls + this.liveCalls };
    }
    const call = this.takeCall(input.stream === "live");
    if (call === null) {
      return { line: null, raw: "", why: "budget", ms: 0, call: this.calls + this.liveCalls };
    }
    this.asking = true;
    let timeoutMs = envPositive("PASEO_FAST_FRONT_TIMEOUT_MS", 3500);
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const session =
        this.session && !this.session.closed ? this.session : await this.ensureSession();
      if (session.turns === 0) {
        // A fresh process writes the prompt cache first (probe: 3.9 s once, then 1.1-2.7 s).
        timeoutMs += 2500;
      }
      const text = buildFrontMessage({
        ...sessionFacts(session, input),
        ...graphContext(session, input.graphDir),
        zuriSaid: this.zuriSaid,
      });
      this.zuriSaid = [];
      session.turns += 1;
      const reply = new Promise<{ text: string; ttftMs?: number }>((resolve, reject) => {
        session.waiters.push({ resolve, reject, text: "" });
      });
      // Closing the session rejects an answer nobody waits for any more.
      reply.catch(() => undefined);
      session.input.push({
        type: "user",
        message: { role: "user", content: text },
        parent_tool_use_id: null,
      });
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      const answer = await Promise.race([reply, timeout]);
      const ms = Date.now() - startedAt;
      if (!answer) {
        // A process that misses its time is stuck or slow, and every next phrase would wait behind
        // its answer: a fresh one takes the next phrase.
        this.logger.info({ call, ms }, "fast_front.timeout");
        this.closeSession("timeout");
        this.warm();
        return { line: null, raw: "", why: "timeout", ms, call };
      }
      const check = checkFrontLine(answer.text, input.facts, input.language);
      const result: FastFrontResult = {
        line: "line" in check ? check.line : null,
        raw: answer.text,
        ms,
        call,
        ...(answer.ttftMs !== undefined ? { ttftMs: answer.ttftMs } : {}),
        ...("skip" in check ? { why: "skip" } : {}),
        ...("wait" in check ? { why: "wait" } : {}),
        ...("rejected" in check ? { why: check.rejected } : {}),
      };
      // A new process starts right away, not on the next phrase: its cold start took 4-6 s. In
      // stream mode a thought takes several small checks; three count as one phrase.
      const recycle = envPositive("PASEO_FAST_FRONT_RECYCLE_TURNS", 40);
      if (session.turns >= (input.stream ? recycle * 3 : recycle)) {
        this.closeSession("recycle");
        this.warm();
      } else if (session.promptStamp !== this.systemPrompt().stamp) {
        this.closeSession("role-changed");
        this.warm();
      }
      return result;
    } catch (error) {
      this.logger.warn({ err: String(error), call }, "fast_front.failed");
      return { line: null, raw: "", why: "error", ms: Date.now() - startedAt, call };
    } finally {
      this.asking = false;
      if (timer) {
        clearTimeout(timer);
      }
      this.armIdle();
    }
  }

  close(): void {
    this.closeSession("close");
  }

  /**
   * Counts one call against its budget: live checks (stream mode) have their own, since a phrase
   * takes several. Returns the call's number, or null when the budget is spent.
   */
  private takeCall(live: boolean): number | null {
    if (live) {
      if (this.liveCalls >= envPositive("PASEO_FAST_FRONT_STREAM_MAX_CALLS", 2000)) {
        return null;
      }
      this.liveCalls += 1;
    } else {
      if (this.calls >= envPositive("PASEO_FAST_FRONT_MAX_CALLS", 300)) {
        return null;
      }
      this.calls += 1;
    }
    return this.calls + this.liveCalls;
  }

  private armIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(
      () => this.closeSession("idle"),
      envPositive("PASEO_FAST_FRONT_IDLE_MS", 60 * 60_000),
    );
    this.idleTimer.unref?.();
  }

  private closeSession(reason: string): void {
    const session = this.session;
    this.session = null;
    if (!session || session.closed) {
      return;
    }
    session.closed = true;
    session.input.end();
    session.query.close();
    for (const waiter of session.waiters.splice(0)) {
      waiter.reject(new Error(`fast front session closed: ${reason}`));
    }
    this.logger.info(
      { reason, turns: session.turns, calls: this.calls, liveCalls: this.liveCalls },
      "fast_front.closed",
    );
  }

  /** The role plus the brief; a change starts a new session on the next phrase. */
  private systemPrompt(): { text: string; stamp: string } {
    return fastFrontPrompt();
  }

  private async resolveBinary(): Promise<string> {
    if (this.deps.binary) {
      return this.deps.binary;
    }
    this.binary ??= (async () => {
      const launch = await resolveProviderLaunch({ defaultBinary: "claude" });
      const availability = await checkProviderLaunchAvailable(launch);
      if (!availability.available) {
        throw new Error("Claude binary not found for the fast front");
      }
      return availability.resolvedPath ?? launch.command;
    })();
    return this.binary;
  }

  /** The open session, or the one starting (one at a time, even when warm() and a phrase race). */
  private ensureSession(): Promise<FrontSession> {
    const prompt = this.systemPrompt();
    if (this.session && !this.session.closed && this.session.promptStamp === prompt.stamp) {
      return Promise.resolve(this.session);
    }
    this.starting ??= this.startSession(prompt).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startSession(prompt: { text: string; stamp: string }): Promise<FrontSession> {
    this.closeSession("replaced");
    const input = new MessageInput();
    const model = envString("PASEO_FAST_FRONT_MODEL", "claude-haiku-5-5");
    const query = claudeQuery(
      {
        prompt: input,
        options: {
          model,
          systemPrompt: prompt.text,
          // No tools, no settings, hooks, CLAUDE.md or MCP servers: a bare voice.
          tools: [],
          settingSources: [],
          mcpServers: {},
          strictMcpConfig: true,
          persistSession: false,
          thinking: { type: "disabled" },
          includePartialMessages: true,
          cwd: tmpdir(),
          pathToClaudeCodeExecutable: await this.resolveBinary(),
          env: createProviderEnv({ baseEnv: process.env }),
          stderr: (data: string) => this.logger.debug({ stderr: data.trim() }, "fast_front.stderr"),
        },
      },
      this.deps.queryFactory ? { queryFactory: this.deps.queryFactory } : {},
    );
    const session: FrontSession = {
      query,
      input,
      waiters: [],
      turns: 0,
      closed: false,
      promptStamp: prompt.stamp,
      lastFacts: null,
      graphSeen: new Set(),
    };
    this.session = session;
    this.logger.info({ model }, "fast_front.started");
    void this.read(session);
    return session;
  }

  /** One reader per process: each `result` answers the oldest waiting phrase. */
  private async read(session: FrontSession): Promise<void> {
    let firstTokenAt: number | null = null;
    let sentAt = Date.now();
    try {
      for await (const message of session.query as AsyncIterable<SDKMessage>) {
        const waiter = session.waiters[0];
        if (message.type === "stream_event") {
          const event = message.event;
          if (waiter && event.type === "content_block_delta" && event.delta.type === "text_delta") {
            firstTokenAt ??= Date.now();
            waiter.text += event.delta.text;
          }
        } else if (message.type === "result") {
          session.waiters.shift();
          if (!waiter) {
            continue;
          }
          const text = message.subtype === "success" ? message.result || waiter.text : "";
          let ttftMs = firstTokenAt !== null ? firstTokenAt - sentAt : undefined;
          if (message.subtype === "success" && typeof message.ttft_ms === "number") {
            ttftMs = message.ttft_ms;
          }
          waiter.resolve({ text, ...(ttftMs !== undefined ? { ttftMs } : {}) });
          firstTokenAt = null;
          sentAt = Date.now();
        }
      }
    } catch (error) {
      this.logger.warn({ err: String(error) }, "fast_front.stream_failed");
    } finally {
      if (this.session === session) {
        this.closeSession("stream-ended");
      }
    }
  }
}

let shared: FastFront | null = null;

/** One fast front for the whole daemon: every voice session shares its Claude Code process. */
export function sharedFastFront(logger: pino.Logger): FastFront {
  shared ??= new FastFront(logger.child({ component: "fast-front" }));
  return shared;
}
