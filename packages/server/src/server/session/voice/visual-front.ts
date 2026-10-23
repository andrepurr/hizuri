// Hizuri: the visual front. Next to the fast front, a second always-open Claude Haiku session turns
// each of the user's phrases, and each of Zuri's spoken replies, into one scene from the live-scene
// bank (stage/live-scenes.ts). Code checks it (no number on screen that nobody said) and writes it
// into the live tab "Now" of the stage, in place, so the screen moves instead of flashing. Zuri
// calls no tool for it.
//
// PASEO_VISUAL_FRONT = off (default) | shadow (log the scene it would draw) | on (draw it), read on
// every phrase, so voice-settings.json switches it live. The model is PASEO_VISUAL_FRONT_MODEL
// (default: the fast front's model). The role is the file PASEO_VISUAL_FRONT_PERSONA, re-read when
// it changes, else the neutral built-in role (front-roles.ts); a custom role can be set in a
// personal folder.
//
// The live tab never takes the user's screen: it is written without the stage focus, and the app
// shows it in front only on the Show page and only while Zuri has not brought its own tab forward
// since the user's phrase (packages/app/src/stage/model.ts, resolveVisibleTab).

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type pino from "pino";

import { claudeQuery } from "../../agent/providers/claude/query.js";
import {
  checkProviderLaunchAvailable,
  createProviderEnv,
  resolveProviderLaunch,
} from "../../agent/provider-launch-config.js";
import { type LiveScene, parseSceneAnswer, sceneText } from "../../stage/live-scenes.js";
import { BUILTIN_VISUAL_FRONT_ROLE } from "./front-roles.js";
import { envPositive, envString } from "../../voice-env.js";
import { MessageInput } from "./fast-front.js";
import { ungroundedNumbers } from "./number-words.js";

export type VisualFrontMode = "off" | "shadow" | "on";

/** A live partial is drawn from this many words on, and asked again after this many more. */
const LIVE_MIN_WORDS = 4;
const LIVE_STEP_WORDS = 3;

/** Read on every event, so voice-settings.json switches it without a restart. */
export function visualFrontMode(env: NodeJS.ProcessEnv = process.env): VisualFrontMode {
  const mode = envString("PASEO_VISUAL_FRONT", "off", env).trim().toLowerCase();
  return mode === "on" || mode === "shadow" ? mode : "off";
}

export type VisualEventKind = "phrase" | "reply";

export interface VisualEvent {
  kind: VisualEventKind;
  /** The user's words (a whole thought so far) or Zuri's spoken reply. */
  text: string;
  at: number;
  /** When the user's phrase ended, for the latency log. */
  endedAt?: number;
  /** A partial transcript: the user is still speaking. */
  live?: boolean;
}

/** What one scene check decided. */
export type SceneCheck =
  | { kind: "scene"; scene: LiveScene }
  | { kind: "skip" }
  | { kind: "keep" }
  | { kind: "rejected"; reason: string };

/**
 * The code check every scene passes before it is drawn: valid JSON of a known scene, and every
 * number it shows said in the user's words, the assistant's reply or the facts (the fast front's
 * rule for its lines).
 */
export function checkScene(raw: string, sources: readonly string[]): SceneCheck {
  const answer = parseSceneAnswer(raw);
  if (answer.kind === "invalid") return { kind: "rejected", reason: answer.reason };
  if (answer.kind !== "scene") return answer;
  const invented = ungroundedNumbers(sceneText(answer.scene), sources);
  if (invented.length > 0) {
    return { kind: "rejected", reason: `invented-number ${invented.slice(0, 3).join(",")}` };
  }
  return answer;
}

function clip(text: string, max: number): string {
  const body = text
    .replace(/\[[a-z:]+\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return body.length <= max ? body : `${body.slice(0, max - 1)}…`;
}

/** The message the model gets for one event. */
export function buildVisualMessage(params: {
  event: VisualEvent;
  onScreen: LiveScene | null;
  /** The facts of Zuri's work, only when they changed since the session last saw them. */
  facts?: string | null;
}): string {
  const { event, onScreen, facts } = params;
  const words = clip(event.text, event.kind === "phrase" ? 600 : 900);
  return [
    `<on_screen>${onScreen ? JSON.stringify(onScreen) : "empty"}</on_screen>`,
    ...(facts ? [`<your_work>\n${facts}\n</your_work>`] : []),
    event.kind === "phrase"
      ? `<user_phrase>${words}</user_phrase>`
      : `<assistant_says>${words}</assistant_says>`,
  ].join("\n");
}

function skillBody(text: string): string {
  return text.startsWith("---") ? text.split("---").slice(2).join("---").trim() : text.trim();
}

function expandHome(file: string): string {
  return file.startsWith("~/") ? path.join(homedir(), file.slice(2)) : file;
}

export function visualFrontRole(): { text: string; stamp: string } {
  const file = expandHome(envString("PASEO_VISUAL_FRONT_PERSONA", "").trim());
  if (!file) {
    return { text: BUILTIN_VISUAL_FRONT_ROLE, stamp: "builtin" };
  }
  if (!existsSync(file)) {
    throw new Error(`visual front role file not found (${file})`);
  }
  return {
    text: skillBody(readFileSync(file, "utf8")),
    stamp: `${file}@${statSync(file).mtimeMs}`,
  };
}

export interface VisualAnswer {
  text: string;
  ms: number;
  ttftMs?: number;
  /** What Claude Code reports for the session so far, for the cost log. */
  costUsd?: number;
}

interface ModelReply {
  text: string;
  ttftMs?: number;
  costUsd?: number;
}

interface Waiter {
  resolve: (reply: ModelReply) => void;
  reject: (error: Error) => void;
  text: string;
}

interface ModelSession {
  query: Query;
  input: MessageInput;
  waiters: Waiter[];
  turns: number;
  closed: boolean;
  stamp: string;
}

/**
 * One Claude Code process (Haiku, no tools) for the whole daemon, like the fast front's: a warm
 * session answers in about a second. Replaced after PASEO_VISUAL_FRONT_RECYCLE_TURNS events or a
 * role change; stops after PASEO_VISUAL_FRONT_IDLE_MS without events.
 */
export class VisualFrontModel implements VisualAsker {
  private session: ModelSession | null = null;
  private starting: Promise<ModelSession> | null = null;
  private binary: Promise<string> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private calls = 0;

  constructor(private readonly logger: pino.Logger) {}

  warm(): void {
    void this.ensureSession().catch((error: unknown) => {
      this.logger.warn({ err: String(error) }, "visual_front.warm_failed");
    });
  }

  /** True when the next call starts a fresh session (its cold start is slower). */
  get cold(): boolean {
    return !this.session || this.session.closed || this.session.turns === 0;
  }

  async ask(message: string): Promise<VisualAnswer | null> {
    const startedAt = Date.now();
    if (this.calls >= envPositive("PASEO_VISUAL_FRONT_MAX_CALLS", 600)) return null;
    this.calls += 1;
    let timeoutMs = envPositive("PASEO_VISUAL_FRONT_TIMEOUT_MS", 6000);
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const session =
        this.session && !this.session.closed ? this.session : await this.ensureSession();
      if (session.turns === 0) timeoutMs += 3000;
      session.turns += 1;
      const reply = new Promise<ModelReply>((resolve, reject) => {
        session.waiters.push({ resolve, reject, text: "" });
      });
      session.input.push({
        type: "user",
        message: { role: "user", content: message },
        parent_tool_use_id: null,
      });
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      });
      const answer = await Promise.race([reply, timeout]);
      if (session.turns >= envPositive("PASEO_VISUAL_FRONT_RECYCLE_TURNS", 40)) {
        this.closeSession("recycle");
        this.warm();
      } else if (session.stamp !== visualFrontRole().stamp) {
        this.closeSession("role-changed");
        this.warm();
      }
      if (!answer) {
        this.logger.info({ ms: Date.now() - startedAt }, "visual_front.timeout");
        return null;
      }
      return { ...answer, ms: Date.now() - startedAt };
    } catch (error) {
      this.logger.warn({ err: String(error) }, "visual_front.failed");
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      this.armIdle();
    }
  }

  close(): void {
    this.closeSession("close");
  }

  private armIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(
      () => this.closeSession("idle"),
      envPositive("PASEO_VISUAL_FRONT_IDLE_MS", 60 * 60_000),
    );
    this.idleTimer.unref?.();
  }

  private closeSession(reason: string): void {
    const session = this.session;
    this.session = null;
    if (!session || session.closed) return;
    session.closed = true;
    session.input.end();
    session.query.close();
    for (const waiter of session.waiters.splice(0)) {
      waiter.reject(new Error(`visual front session closed: ${reason}`));
    }
    this.logger.info({ reason, turns: session.turns, calls: this.calls }, "visual_front.closed");
  }

  private async resolveBinary(): Promise<string> {
    this.binary ??= (async () => {
      const launch = await resolveProviderLaunch({ defaultBinary: "claude" });
      const availability = await checkProviderLaunchAvailable(launch);
      if (!availability.available) throw new Error("Claude binary not found for the visual front");
      return availability.resolvedPath ?? launch.command;
    })();
    return this.binary;
  }

  private ensureSession(): Promise<ModelSession> {
    const role = visualFrontRole();
    if (this.session && !this.session.closed && this.session.stamp === role.stamp) {
      return Promise.resolve(this.session);
    }
    this.starting ??= this.startSession(role).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startSession(role: { text: string; stamp: string }): Promise<ModelSession> {
    this.closeSession("replaced");
    const input = new MessageInput();
    const model = envString(
      "PASEO_VISUAL_FRONT_MODEL",
      envString("PASEO_FAST_FRONT_MODEL", "claude-haiku-5-5"),
    );
    const query = claudeQuery({
      prompt: input,
      options: {
        model,
        systemPrompt: role.text,
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
        stderr: (data: string) => this.logger.debug({ stderr: data.trim() }, "visual_front.stderr"),
      },
    });
    const session: ModelSession = {
      query,
      input,
      waiters: [],
      turns: 0,
      closed: false,
      stamp: role.stamp,
    };
    this.session = session;
    this.logger.info({ model }, "visual_front.started");
    void this.read(session);
    return session;
  }

  /** One reader per process: each `result` answers the oldest waiting event. */
  private async read(session: ModelSession): Promise<void> {
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
          if (!waiter) continue;
          const text = message.subtype === "success" ? message.result || waiter.text : "";
          let ttftMs = firstTokenAt !== null ? firstTokenAt - sentAt : undefined;
          if (message.subtype === "success" && typeof message.ttft_ms === "number") {
            ttftMs = message.ttft_ms;
          }
          waiter.resolve({
            text,
            ...(ttftMs !== undefined ? { ttftMs } : {}),
            ...(typeof message.total_cost_usd === "number"
              ? { costUsd: message.total_cost_usd }
              : {}),
          });
          firstTokenAt = null;
          sentAt = Date.now();
        }
      }
    } catch (error) {
      this.logger.warn({ err: String(error) }, "visual_front.stream_failed");
    } finally {
      if (this.session === session) this.closeSession("stream-ended");
    }
  }
}

export interface VisualAsker {
  ask(message: string): Promise<VisualAnswer | null>;
  warm(): void;
}

interface RecordedAnswer {
  kind: VisualEventKind;
  text: string;
  answer: string;
  ms: number;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
}

function answerFields(answer: VisualAnswer | null): Record<string, unknown> {
  if (!answer) return {};
  return {
    ms: answer.ms,
    ttftMs: answer.ttftMs,
    costUsd: answer.costUsd,
    raw: answer.text.slice(0, 400),
  };
}

/**
 * Test daemons without a Claude login (a build machine): PASEO_VISUAL_FRONT_REPLAY names a JSON list of
 * answers the real model gave for the same phrases and replies, played back after the latency it
 * took. A replayed phrase comes back from the recogniser a little different, so the closest
 * recorded text wins (most shared words); none close = SKIP.
 */
export class ReplayVisualModel implements VisualAsker {
  private readonly answers: RecordedAnswer[];

  constructor(file: string) {
    this.answers = JSON.parse(readFileSync(expandHome(file), "utf8")) as RecordedAnswer[];
  }

  warm(): void {}

  async ask(message: string): Promise<VisualAnswer | null> {
    const match = /<(user_phrase|assistant_says)>([\s\S]*?)<\/\1>/.exec(message);
    if (!match) return null;
    const kind: VisualEventKind = match[1] === "user_phrase" ? "phrase" : "reply";
    const said = new Set(wordsOf(match[2] ?? ""));
    let best: RecordedAnswer | null = null;
    let bestShare = 0;
    for (const recorded of this.answers) {
      if (recorded.kind !== kind) continue;
      const own = wordsOf(recorded.text);
      const shared = own.filter((word) => said.has(word)).length;
      const share = shared / Math.max(4, Math.min(own.length, said.size));
      if (share > bestShare) {
        best = recorded;
        bestShare = share;
      }
    }
    const answer = best && bestShare >= 0.5 ? best : null;
    const ms = answer?.ms ?? 900;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { text: answer?.answer ?? "SKIP", ms };
  }
}

let sharedModel: VisualAsker | null = null;

/** One model session for the whole daemon (or the recorded answers, on a test daemon). */
export function sharedVisualFrontModel(logger: pino.Logger): VisualAsker {
  const replay = envString("PASEO_VISUAL_FRONT_REPLAY", "");
  sharedModel ??= replay
    ? new ReplayVisualModel(replay)
    : new VisualFrontModel(logger.child({ component: "visual-front" }));
  return sharedModel;
}

export interface VisualFrontOptions {
  /** Asks the model; null = no answer (timeout, budget, error). */
  ask: (message: string) => Promise<VisualAnswer | null>;
  /** Draws the scene on the live tab; returns why it was not drawn, or null when it was. */
  draw: (input: { agentId: string; scene: LiveScene; since: number }) => Promise<string | null>;
  /** The facts of Zuri's work for this agent (front-facts.ts), or null. */
  facts: (agentId: string) => string | null;
  mode: () => VisualFrontMode;
  log: (fields: Record<string, unknown>, message: string) => void;
}

interface PendingEvent {
  agentId: string;
  event: VisualEvent;
  /** The phrase count when it was queued: a reply older than the user's newest phrase is stale. */
  phraseSeq: number;
}

/**
 * The visual front of one voice session: one event at a time, the newest waiting event replaces
 * an older one, and a reply answered after the user's next phrase arrived is dropped. The scene on
 * screen and the moment the user's phrase started it travel with every draw, so the app knows when
 * the live tab is newer than the assistant's own tabs.
 */
export class VisualFront {
  private onScreen = new Map<string, LiveScene>();
  private since = 0;
  private phraseSeq = 0;
  /** The words of the user's thought last asked about, so a live partial asks only when it grew. */
  private askedWords = 0;
  private askedText: string | null = null;
  private busy = false;
  private pending: PendingEvent | null = null;
  private sentFacts: string | null = null;
  /**
   * The user's last phrases and the assistant's last replies: the words a number on screen must
   * come from.
   */
  private recent: string[] = [];

  constructor(private readonly options: VisualFrontOptions) {}

  /**
   * The user's words so far. `live` = a partial transcript while the user still speaks: drawn from
   * 4 words on and asked again only after 3 more, so the screen starts moving before the user
   * stops.
   */
  phrase(agentId: string, text: string, options: { endedAt?: number; live?: boolean } = {}): void {
    if (this.options.mode() === "off" || !text.trim()) return;
    const count = text.trim().split(/\s+/).length;
    if (options.live) {
      if (count < LIVE_MIN_WORDS || count - this.askedWords < LIVE_STEP_WORDS) return;
    } else if (text === this.askedText) {
      return;
    }
    this.askedWords = count;
    this.askedText = text;
    this.phraseSeq += 1;
    this.queue({
      agentId,
      event: {
        kind: "phrase",
        text,
        at: Date.now(),
        ...(options.endedAt ? { endedAt: options.endedAt } : {}),
        ...(options.live ? { live: true } : {}),
      },
      phraseSeq: this.phraseSeq,
    });
  }

  /** The user's thought went to Zuri: the next words start a new one. */
  sent(): void {
    this.askedWords = 0;
    this.askedText = null;
  }

  reply(agentId: string, text: string): void {
    if (this.options.mode() === "off" || !text.trim()) return;
    // A reply never replaces the user's waiting phrase: the user's words come first.
    if (this.pending?.event.kind === "phrase") return;
    this.queue({
      agentId,
      event: { kind: "reply", text, at: Date.now() },
      phraseSeq: this.phraseSeq,
    });
  }

  private queue(item: PendingEvent): void {
    this.pending = item;
    if (!this.busy) void this.drain();
  }

  private async drain(): Promise<void> {
    this.busy = true;
    try {
      while (this.pending) {
        const item = this.pending;
        this.pending = null;
        await this.handle(item);
      }
    } finally {
      this.busy = false;
    }
  }

  private async handle(item: PendingEvent): Promise<void> {
    const { agentId, event } = item;
    const mode = this.options.mode();
    if (mode === "off") return;
    this.recent = [...this.recent.slice(-5), event.text];
    const facts = this.options.facts(agentId);
    const factsChanged = facts !== null && facts !== this.sentFacts;
    if (factsChanged) this.sentFacts = facts;
    const onScreen = this.onScreen.get(agentId) ?? null;
    const message = buildVisualMessage({
      event,
      onScreen,
      facts: factsChanged ? facts : null,
    });
    const answer = await this.options.ask(message);
    const base = {
      mode,
      event: event.live ? "live" : event.kind,
      text: clip(event.text, 160),
      ...answerFields(answer),
    };
    if (!answer) {
      this.options.log({ ...base, why: "no-answer" }, "voice.visual_front");
      return;
    }
    const check = checkScene(answer.text, [
      ...this.recent,
      facts ?? "",
      onScreen ? sceneText(onScreen) : "",
    ]);
    if (check.kind !== "scene") {
      this.options.log(
        { ...base, why: check.kind === "rejected" ? check.reason : check.kind },
        "voice.visual_front",
      );
      return;
    }
    if (event.kind === "reply" && item.phraseSeq !== this.phraseSeq) {
      this.options.log({ ...base, why: "stale", scene: check.scene.p }, "voice.visual_front");
      return;
    }
    await this.show({ agentId, event, mode, scene: check.scene, log: base });
  }

  private async show(params: {
    agentId: string;
    event: VisualEvent;
    mode: VisualFrontMode;
    scene: LiveScene;
    log: Record<string, unknown>;
  }): Promise<void> {
    const { agentId, event, mode, scene } = params;
    if (event.kind === "phrase") this.since = event.at;
    let why: string | null = null;
    if (mode === "on") {
      why = await this.options.draw({ agentId, scene, since: this.since || event.at });
    }
    if (why === null) this.onScreen.set(agentId, scene);
    const drawnAt = Date.now();
    this.options.log(
      {
        ...params.log,
        scene: scene.p,
        drawn: mode === "on" && why === null,
        ...(why ? { why } : {}),
        ...(event.endedAt !== undefined ? { sinceStopMs: drawnAt - event.endedAt } : {}),
      },
      "voice.visual_front",
    );
  }
}
