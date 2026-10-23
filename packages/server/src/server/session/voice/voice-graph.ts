import fs from "node:fs";
import path from "node:path";

import { envFlag, envPath } from "../../voice-env.js";
import type { ShortPhraseInfo } from "./short-phrase.js";

// Hizuri: the phrase graph. Every phrase of the user's gets an id (p…) when the user starts saying
// it, every reply of the assistant's an id (r…). Each reply names the phrases it answers (speak's
// replyTo) and records how much of it the user really heard; the assistant signs for a phrase with
// the mark_phrases tool. One JSON line per event in `<dir>/<UTC date>.jsonl`; Claude Code hooks read
// it and remind the assistant of open phrases and unheard replies. The line format is the event
// types below; the hooks read the same fields.
//
// Rules nobody bypasses: a question is closed by a reply to it that was delivered with nothing
// unheard; every other phrase only by the assistant's own sign. Speaking never signs: a reply that
// says "on it" used to close a task nobody wrote down. A reply is delivered only when it played in
// full and the user did not talk over it; text in the chat without voice closes nothing.
// Ids never restart (they continue from the newest file), so a sign written after midnight still
// names one phrase.

export const SIGN_STATUSES = [
  "answered",
  "task",
  "recorded",
  "correction",
  "thinking",
  "not-for-me",
] as const;
export type SignStatus = (typeof SIGN_STATUSES)[number];

export type PhraseDelivery = "normal" | "steered" | "queued-foreign" | "dropped";

export interface PhraseEventInput {
  id: string;
  spokenAt: number;
  endedAt?: number;
  text: string;
  delivery: PhraseDelivery;
  /** Why it was dropped (echo, junk, other-voice, empty, stop-word, ...) or queued (other-voice). */
  reason?: string;
  deliveredAt?: number;
  /** The id of the message it went to Zuri in (a monologue is one message of several phrases). */
  message?: string;
  /** On a message's first phrase: every phrase id in the message. */
  parts?: string[];
  /** It went to Zuri after a phrase the user started later. */
  late?: boolean;
  saidBefore?: string;
  session?: string;
  /** The text is the recogniser's quick draft; a later line may correct it. */
  draft?: boolean;
  /** The final text replaced this draft, and Zuri got a correction (or the text in place). */
  correctedFrom?: string;
  /** A short phrase: what Zuri was told about it (short-phrase.ts). */
  short?: ShortPhraseInfo;
}

export type ReplyOutcome =
  | "played"
  | "cut"
  | "never-started"
  | "held"
  | "superseded"
  | "text-only"
  | "duplicate"
  | "error";

export interface ReplyEventInput {
  id: string;
  text: string;
  replyTo: string[];
  /** Earlier replies (r…) whose unheard part this reply says again. */
  carries?: string[];
  source: "speak" | "fast-reply";
  jobId: string | null;
  queuedAt: number;
  playStartedAt?: number | null;
  endedAt: number;
  outcome: ReplyOutcome;
  delivered: boolean;
  heardText: string;
  unheardText: string;
  cutReason?: string;
  /** The user's words stopped it, or it was held behind the user's phrase. */
  interrupted?: boolean;
  userSpeechAt?: number | null;
  firstAudioMs?: number | null;
  emitted?: number;
  chunks?: number;
  session?: string;
}

export interface HeardEventInput {
  id: string;
  heardText: string;
  unheardText: string;
  byPhrase: string;
  userSpeechAt: number;
}

export interface SignInput {
  ids: string[];
  status: SignStatus;
  by: "mark_phrases";
  note?: string;
}

export interface SignResult {
  /** The ids the sign closes: a message id stands for all its phrases. */
  ids: string[];
  /** Ids the graph has never seen (a typo, or a phrase from before the graph existed). */
  unknown: string[];
}

export interface VoiceGraph {
  readonly dir: string;
  nextPhraseId(): string;
  nextReplyId(): string;
  phrase(event: PhraseEventInput): void;
  sign(input: SignInput): SignResult;
  reply(event: ReplyEventInput): void;
  heard(event: HeardEventInput): void;
}

const FILE_RE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function shortFields(short: ShortPhraseInfo): Record<string, unknown> {
  return {
    ms: short.durationMs,
    ...(short.score !== undefined ? { score: Math.round(short.score * 100) / 100 } : {}),
    verified: short.verified,
    verdict: short.verdict,
    roomDb: short.roomDb,
    room: short.room,
  };
}

function idNumber(id: unknown, prefix: string): number {
  if (typeof id !== "string" || !id.startsWith(prefix)) {
    return 0;
  }
  const n = Number(id.slice(prefix.length));
  return Number.isInteger(n) && n > 0 ? n : 0;
}

class FileVoiceGraph implements VoiceGraph {
  private phraseCount = 0;
  private replyCount = 0;
  private readonly known = new Set<string>();
  private readonly messageParts = new Map<string, string[]>();

  constructor(readonly dir: string) {
    this.recover();
  }

  /** Counters and phrase ids from the two newest files, so ids continue after a restart. */
  private recover(): void {
    let files: string[];
    try {
      files = fs
        .readdirSync(this.dir)
        .filter((name) => FILE_RE.test(name))
        .sort();
    } catch {
      return;
    }
    for (const name of files.slice(-2)) {
      let body: string;
      try {
        body = fs.readFileSync(path.join(this.dir, name), "utf8");
      } catch {
        continue;
      }
      for (const line of body.split("\n")) {
        this.remember(line);
      }
    }
  }

  private remember(line: string): void {
    if (!line.trim()) {
      return;
    }
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (event.type === "phrase") {
      this.phraseCount = Math.max(this.phraseCount, idNumber(event.id, "p"));
      if (typeof event.id === "string") {
        this.known.add(event.id);
      }
      if (typeof event.id === "string" && Array.isArray(event.parts)) {
        this.messageParts.set(
          event.id,
          event.parts.filter((part): part is string => typeof part === "string"),
        );
      }
    } else if (event.type === "reply") {
      this.replyCount = Math.max(this.replyCount, idNumber(event.id, "r"));
    }
  }

  nextPhraseId(): string {
    this.phraseCount += 1;
    return `p${this.phraseCount}`;
  }

  nextReplyId(): string {
    this.replyCount += 1;
    return `r${this.replyCount}`;
  }

  private append(event: Record<string, unknown>): void {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const now = Date.now();
      const line = JSON.stringify({ v: 1, at: iso(now), ...event });
      fs.appendFileSync(path.join(this.dir, `${iso(now).slice(0, 10)}.jsonl`), `${line}\n`);
    } catch {
      // The graph must never break the voice path.
    }
  }

  phrase(event: PhraseEventInput): void {
    this.known.add(event.id);
    if (event.parts && event.parts.length > 1) {
      this.messageParts.set(event.id, event.parts);
    }
    this.append({
      type: "phrase",
      id: event.id,
      spokenAt: iso(event.spokenAt),
      ...(event.endedAt !== undefined ? { endedAt: iso(event.endedAt) } : {}),
      text: event.text,
      delivery: event.delivery,
      ...(event.reason ? { reason: event.reason } : {}),
      ...(event.deliveredAt !== undefined ? { deliveredAt: iso(event.deliveredAt) } : {}),
      ...(event.message ? { message: event.message } : {}),
      ...(event.parts && event.parts.length > 1 ? { parts: event.parts } : {}),
      ...(event.late ? { late: true, saidBefore: event.saidBefore } : {}),
      ...(event.draft ? { draft: true } : {}),
      ...(event.correctedFrom !== undefined ? { correctedFrom: event.correctedFrom } : {}),
      ...(event.short ? { short: shortFields(event.short) } : {}),
      ...(event.session ? { session: event.session } : {}),
    });
  }

  sign(input: SignInput): SignResult {
    const ids: string[] = [];
    const unknown: string[] = [];
    for (const raw of input.ids) {
      const id = raw.trim();
      if (!id || ids.includes(id)) {
        continue;
      }
      if (!this.known.has(id)) {
        unknown.push(id);
      }
      for (const part of this.messageParts.get(id) ?? [id]) {
        if (!ids.includes(part)) {
          ids.push(part);
        }
      }
    }
    this.append({
      type: "sign",
      ids,
      status: input.status,
      by: input.by,
      ...(input.note ? { note: input.note } : {}),
      ...(unknown.length > 0 ? { unknown } : {}),
    });
    return { ids, unknown };
  }

  reply(event: ReplyEventInput): void {
    this.append({
      type: "reply",
      id: event.id,
      text: event.text,
      replyTo: event.replyTo,
      ...(event.carries?.length ? { carries: event.carries } : {}),
      source: event.source,
      jobId: event.jobId,
      queuedAt: iso(event.queuedAt),
      ...(event.playStartedAt ? { playStartedAt: iso(event.playStartedAt) } : {}),
      endedAt: iso(event.endedAt),
      outcome: event.outcome,
      delivered: event.delivered,
      heardText: event.heardText,
      unheardText: event.unheardText,
      ...(event.cutReason ? { cutReason: event.cutReason } : {}),
      ...(event.interrupted ? { interrupted: true } : {}),
      ...(event.userSpeechAt ? { userSpeechAt: iso(event.userSpeechAt) } : {}),
      ...(event.firstAudioMs !== undefined ? { firstAudioMs: event.firstAudioMs } : {}),
      ...(event.emitted !== undefined ? { emitted: event.emitted } : {}),
      ...(event.chunks !== undefined ? { chunks: event.chunks } : {}),
      ...(event.session ? { session: event.session } : {}),
    });
  }

  heard(event: HeardEventInput): void {
    this.append({
      type: "heard",
      id: event.id,
      heardText: event.heardText,
      unheardText: event.unheardText,
      delivered: false,
      reason: "talked-over",
      byPhrase: event.byPhrase,
      userSpeechAt: iso(event.userSpeechAt),
    });
  }
}

const graphs = new Map<string, VoiceGraph>();

/** One graph per directory: every voice session and the MCP tools share its counters. */
export function getVoiceGraph(dir: string): VoiceGraph {
  const resolved = path.resolve(dir);
  let graph = graphs.get(resolved);
  if (!graph) {
    graph = new FileVoiceGraph(resolved);
    graphs.set(resolved, graph);
  }
  return graph;
}

/**
 * The graph the daemon uses: PASEO_VOICE_GRAPH_DIR, else `<paseoHome>/voice-graph`.
 * PASEO_VOICE_GRAPH=0 turns it off.
 */
export function resolveVoiceGraph(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): VoiceGraph | null {
  if (!envFlag("PASEO_VOICE_GRAPH", true, env)) {
    return null;
  }
  return getVoiceGraph(envPath("PASEO_VOICE_GRAPH_DIR", path.join(paseoHome, "voice-graph"), env));
}
