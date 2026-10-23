// The Guardian's working parts, free of `$`: one check, the notes the agent must answer, the
// careful stretch after a compaction. register.ts hands them an Io built from `$`; tests and a
// replay can hand them their own.
//
// A note's life: a flag becomes note gN (ids per session, kept in the store) and reaches the agent
// on its next tool result or the user's next prompt. The agent answers with one chat line,
// `Guardian gN: done — …`, `doing now — …` or `disagree — …`. The next check finds the line by
// pattern and the checker judges it: it holds → closed; it does not → one follow-up naming what is
// missing. No answer after two of the agent's steps → one reminder. A second miss closes the note
// as ignored or unresolved, one retro line records it, and the Guardian stops asking. Two rounds
// at most, never a loop, and never a blocked call.
import type { SessionMessage } from "claude-code";
import {
  buildPrompt,
  agentContext,
  fingerprint,
  freshFix,
  normalize,
  noteText,
  parseAnswer,
  parseVerdicts,
  quickFlags,
  startIndex,
  type AgentNote,
  type Flag,
} from "./guardian";
import {
  AFTER_COMPACTION,
  COMPACTION_SUMMARY,
  READ_NAMES,
  answersIn,
  citedPhrases,
  type NoteAnswer,
  lookbackStart,
  missingFor,
  momentsIn,
  namedTask,
  phrasesIn,
  readsIn,
  type Moment,
  type ReadKind,
} from "./moments";

export interface Settings {
  model: string;
  every: number;
  language: string;
  /** After a compaction: check every `denseEvery` steps for `denseSteps` steps or `denseMs`. */
  denseEvery: number;
  denseSteps: number;
  denseMs: number;
}

export interface CompleteRequest {
  model: string;
  effort: "low";
  system: { text: string; cache: true }[];
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}
export type CompleteResult =
  | { isAnswered: true; text: string; usage: unknown }
  | { isAnswered: false; reason: string; usage?: unknown };

/** What the core needs from the engine; register.ts builds it from `$`. */
export interface Io {
  now(): Promise<number>;
  messages(): Promise<readonly SessionMessage[]>;
  storeGet(key: string): Promise<unknown>;
  storeSet(key: string, value: unknown): Promise<void>;
  complete(request: CompleteRequest): Promise<CompleteResult>;
  uiLog(text: string): void;
  exists(path: string): Promise<boolean>;
  /** One line in the check log. */
  log(record: Record<string, unknown>): Promise<void>;
  /** One dated line in the retro log, the file the weekly retro reads. */
  retro(text: string, by: string): Promise<void>;
}

type NoteKind = "flag" | "compaction";
export interface Note extends Flag {
  id: string;
  kind: NoteKind;
  /** 1: the note itself; 2: its one reminder or follow-up. */
  round: 1 | 2;
  at: number;
  /** Waiting for the agent's next tool result or prompt, since this time. */
  queuedAt?: number;
  sendAs?: "new" | "reminder" | "follow-up";
  deliveredAt?: number;
  deliveredStep?: number;
  deliveredTurn?: number;
  answer?: string;
}
interface NoteBook {
  next: number;
  open: Note[];
}
interface Seen {
  at: number;
  session: string;
  rule: string;
  key: string;
  shown?: boolean;
  moment?: string;
}
type Cursors = Record<string, { fp: string; at: number }>;

export interface State {
  settings: Settings | null;
  system: string | null;
  home: string;
  tz: string;
  sessionId: string;
  /** Main-agent model requests so far in this process, and since the last check. */
  steps: number;
  sinceCheck: number;
  turnEnds: number;
  /** Queued notes, mirrored here so a tool call with nothing to hand over never reads the store. */
  queued: number;
  compactedAt: number;
  /** The note raised for the last compaction: the checker's own flags of the same reads are dropped. */
  compactionNote: string;
  dense: { untilStep: number; untilMs: number } | null;
}

export function newState(): State {
  return {
    settings: null,
    system: null,
    home: "",
    tz: "UTC",
    sessionId: "",
    steps: 0,
    sinceCheck: 0,
    turnEnds: 0,
    queued: 0,
    compactedAt: 0,
    compactionNote: "",
    dense: null,
  };
}

const SEEN_KEEP = 200;
const CURSORS_KEEP = 100;
const BOOKS_KEEP = 50;
/** The user's phrases kept per session, so an answer citing one still checks out after a compaction. */
const PHRASES_KEEP = 300;
// A rule shown once stays quiet while it keeps coming back; after this long with no flag of it at
// all, its next break is news again. A trigger moment is its own event and is news again sooner.
const SAME_RULE_QUIET_MS = 30 * 60 * 1000;
const MOMENT_QUIET_MS = 10 * 60 * 1000;
const SAME_WORDS_QUIET_MS = 60 * 60 * 1000;
// A note the agent has not received by then is about a moment long gone: it stays in the log only.
const FOR_AGENT_MAX_AGE_MS = 30 * 60 * 1000;
const CHECK_TIMEOUT_MS = 90_000;
/** The agent's steps after a note reached it before it counts as unanswered (the first should answer). */
const ANSWER_STEPS = 2;
/** The agent's steps after the compaction note before the reads it asks for are due. */
const REREAD_STEPS = 10;

export function stamp(ms: number, tz: string): string {
  try {
    return new Date(ms).toLocaleString("sv-SE", { timeZone: tz, hour12: false }).slice(0, 16);
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

// ── Store ────────────────────────────────────────────────────────────────────────────────────

async function readCursors(io: Io): Promise<Cursors> {
  const v = await io.storeGet("cursors");
  return v && typeof v === "object" ? (v as Cursors) : {};
}

async function writeCursor(
  io: Io,
  st: State,
  cursors: Cursors,
  fp: string,
  at: number,
): Promise<void> {
  const next: Cursors = { ...cursors, [st.sessionId]: { fp, at } };
  const keep = Object.entries(next)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, CURSORS_KEEP);
  await io.storeSet("cursors", Object.fromEntries(keep));
}

async function seenFlags(io: Io): Promise<Seen[]> {
  const v = await io.storeGet("seen");
  return Array.isArray(v) ? (v as Seen[]) : [];
}

async function readBooks(io: Io): Promise<Record<string, NoteBook>> {
  const v = await io.storeGet("notes");
  return v && typeof v === "object" ? (v as Record<string, NoteBook>) : {};
}

/** This session's note book: the id counter and the notes still open. */
export async function loadBook(io: Io, st: State): Promise<NoteBook> {
  const book = (await readBooks(io))[st.sessionId];
  return book && Array.isArray(book.open)
    ? { next: Number(book.next) || 0, open: book.open }
    : { next: 0, open: [] };
}

async function saveBook(io: Io, st: State, book: NoteBook): Promise<void> {
  const books = await readBooks(io);
  books[st.sessionId] = book;
  await io.storeSet("notes", Object.fromEntries(Object.entries(books).slice(-BOOKS_KEEP)));
  st.queued = book.open.filter((n) => n.queuedAt !== undefined).length;
}

/** The user's phrases by id seen so far in this session, the new part's added. */
async function rememberPhrases(
  io: Io,
  st: State,
  messages: readonly SessionMessage[],
  from: number,
): Promise<Record<string, string>> {
  const all = (await io.storeGet("phrases")) as Record<string, Record<string, string>> | undefined;
  const mine = { ...all?.[st.sessionId], ...phrasesIn(messages, from) };
  const keep = Object.fromEntries(Object.entries(mine).slice(-PHRASES_KEEP));
  const sessions = Object.entries({ ...all, [st.sessionId]: keep }).slice(-BOOKS_KEEP);
  await io.storeSet("phrases", Object.fromEntries(sessions));
  return keep;
}

/**
 * Not news: the same words within an hour; the same rule within half an hour (a moment's note:
 * within ten minutes of a shown note on the same kind of moment). Other sessions never count.
 */
async function isRepeat(io: Io, st: State, flag: Flag, now: number): Promise<boolean> {
  const key = normalize(flag.line);
  return (await seenFlags(io)).some((s) => {
    if (s.session !== st.sessionId) return false;
    if (s.key === key && now - s.at < SAME_WORDS_QUIET_MS) return true;
    if (s.rule !== flag.rule) return false;
    if (flag.moment)
      return s.moment === flag.moment && s.shown === true && now - s.at < MOMENT_QUIET_MS;
    return now - s.at < SAME_RULE_QUIET_MS;
  });
}

async function remember(io: Io, st: State, flag: Flag, now: number, shown: boolean): Promise<void> {
  const seen = await seenFlags(io);
  seen.push({
    at: now,
    session: st.sessionId,
    rule: flag.rule,
    key: normalize(flag.line),
    shown,
    ...(flag.moment ? { moment: flag.moment } : {}),
  });
  await io.storeSet("seen", seen.slice(-SEEN_KEEP));
}

// ── Posting notes ────────────────────────────────────────────────────────────────────────────

/**
 * Shows each new flag once as note gN: a card, a retro line and a note for the agent. A repeat is
 * only logged. A fix that redoes or undoes the past is first turned into the lesson for next time.
 */
async function post(
  io: Io,
  st: State,
  book: NoteBook,
  raw: readonly Flag[],
  record: Record<string, unknown>,
  by: string,
): Promise<void> {
  for (const flag of raw.map(freshFix)) {
    const now = await io.now();
    const repeat = await isRepeat(io, st, flag, now);
    await remember(io, st, flag, now, !repeat);
    if (repeat) {
      await io.log({ ...record, outcome: "repeat", ...flag });
      continue;
    }
    const { staleFix: _stale, moment: _moment, ...shown } = flag;
    book.next += 1;
    const id = `g${book.next}`;
    book.open.push({ ...shown, id, kind: "flag", round: 1, at: now, queuedAt: now, sendAs: "new" });
    io.uiLog(noteText(shown, id));
    await io.retro(`${id}: ${shown.line} · rule: ${shown.rule}`, by);
    await io.log({ ...record, outcome: "flag", id, ...flag });
  }
}

function requeue(note: Note, now: number, sendAs: "reminder" | "follow-up", fix?: string): void {
  note.round = 2;
  note.queuedAt = now;
  note.sendAs = sendAs;
  if (fix) note.fix = fix;
  delete note.deliveredAt;
  delete note.deliveredStep;
  delete note.deliveredTurn;
}

async function closeUnanswered(
  io: Io,
  st: State,
  book: NoteBook,
  note: Note,
  outcome: "ignored" | "unresolved",
): Promise<void> {
  book.open = book.open.filter((n) => n !== note);
  const how = outcome === "ignored" ? "left unanswered" : "answered without proof twice";
  await io.retro(
    `Guardian note ${note.id} ${how}: ${note.line} · rule: answer-guardian`,
    "Guardian",
  );
  await io.log({
    at: new Date(await io.now()).toISOString(),
    session: st.sessionId,
    outcome,
    id: note.id,
    rule: note.rule,
  });
}

/** The notes waiting for the agent, as one context block; older ones are dropped and logged. */
export async function takeForAgent(
  io: Io,
  st: State,
  via: "tool-result" | "prompt",
): Promise<string | null> {
  if (st.queued === 0) return null;
  const now = await io.now();
  const book = await loadBook(io, st);
  const queued = book.open.filter((n) => n.queuedAt !== undefined);
  const stale = new Set(queued.filter((n) => now - (n.queuedAt ?? 0) > FOR_AGENT_MAX_AGE_MS));
  const fresh = queued.filter((n) => !stale.has(n));
  book.open = book.open.filter((n) => !stale.has(n));
  for (const n of fresh) {
    delete n.queuedAt;
    n.deliveredAt = now;
    n.deliveredStep = st.steps;
    n.deliveredTurn = st.turnEnds;
  }
  await saveBook(io, st, book);
  if (fresh.length === 0) return null;
  await io.log({
    at: new Date(now).toISOString(),
    session: st.sessionId,
    outcome: "to-agent",
    via,
    ids: fresh.map((n) => n.id),
  });
  const notes: AgentNote[] = fresh.map((n) => ({
    flag: { line: n.line, rule: n.rule, fix: n.fix },
    at: n.at,
    id: n.id,
    kind: n.sendAs ?? "new",
  }));
  return agentContext(notes, st.tz);
}

// ── Compaction ───────────────────────────────────────────────────────────────────────────────

const COMPACTION_LINE =
  "The conversation was just compacted: you work from a short summary and may easily go wrong";
const COMPACTION_FIX =
  "Re-read the project's docs (README, docs/VISION.md, docs/TECH-DESIGN.md) and search memory on the topic first";

/** A compaction happened: queue the re-read note at once and check densely for a while. */
export async function onCompacted(io: Io, st: State, via: "event" | "summary"): Promise<void> {
  const settings = st.settings;
  if (!st.system || !settings) return;
  const now = await io.now();
  st.compactedAt = now;
  st.dense = { untilStep: st.steps + settings.denseSteps, untilMs: now + settings.denseMs };
  const book = await loadBook(io, st);
  // One compaction note at a time: an older one still open is replaced by this one.
  book.open = book.open.filter((n) => n.kind !== "compaction");
  book.next += 1;
  const note: Note = {
    id: `g${book.next}`,
    kind: "compaction",
    rule: "reread-after-compact",
    line: COMPACTION_LINE,
    fix: COMPACTION_FIX,
    round: 1,
    at: now,
    queuedAt: now,
    sendAs: "new",
  };
  book.open.push(note);
  st.compactionNote = note.id;
  io.uiLog(noteText(note, note.id));
  await saveBook(io, st, book);
  await io.log({
    at: new Date(now).toISOString(),
    session: st.sessionId,
    outcome: "compaction",
    via,
    id: note.id,
  });
}

/** Checks run every `every` steps, every `denseEvery` in the careful stretch after a compaction. */
export function stepEvery(st: State): number {
  const s = st.settings;
  if (!s) return 6;
  return st.dense && st.steps < st.dense.untilStep ? s.denseEvery : s.every;
}

function summaryIndex(messages: readonly SessionMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i]?.role === "user" && COMPACTION_SUMMARY.test(messages[i]!.text)) return i;
  return -1;
}

/** The reads the compaction note asks for that are not visible since the summary. */
function compactionMissing(messages: readonly SessionMessage[]): ReadKind[] {
  const got = readsIn(messages, Math.max(0, summaryIndex(messages)), messages.length).kinds;
  return AFTER_COMPACTION.filter((k) => !got.has(k));
}

// ── Trigger moments ──────────────────────────────────────────────────────────────────────────

const ACTS: Record<string, string> = {
  question: "asked the user a question",
  account: "asked the user for a card, key, payment or account",
  create: "created something new",
  public: "made something public",
  task: "handed a task to an agent",
};

/** Free pattern flags at trigger moments: what the agent should have read first and did not. */
export function momentFlags(
  messages: readonly SessionMessage[],
  moments: readonly Moment[],
): { flags: Flag[]; lines: string[] } {
  const flags: Flag[] = [];
  const lines: string[] = [];
  const has = (rule: string) => flags.some((f) => f.rule === rule);
  for (const m of moments) {
    if (m.kind === "compaction") continue;
    const missing = missingFor(messages, m);
    const got = readsIn(messages, lookbackStart(messages, m.index), m.index + 1);
    const memoryMissing = missing.filter((k) => k === "memory" || k === "vault");
    const docsMissing = missing.filter((k) => k === "docs" || k === "brand");
    let flagged = "";
    if (memoryMissing.length > 0 && !has("memory-first")) {
      const names = memoryMissing.map((k) => READ_NAMES[k]).join(" and ");
      flags.push({
        line: `The agent ${ACTS[m.kind]} (“${clip(m.what, 60)}”) without first looking at ${names}`,
        rule: "memory-first",
        fix: `Look now: ${names}; if the answer is there, tell the user`,
        evidence: `#${m.index}`,
        moment: m.kind,
      });
      flagged = "memory-first";
    } else if (docsMissing.length > 0 && m.kind === "public" && !has("project-docs")) {
      const names = docsMissing.map((k) => READ_NAMES[k]).join(" and ");
      flags.push({
        line: `Public or visual work (${clip(m.what, 60)}) done without reading ${names}`,
        rule: "project-docs",
        fix: `Read ${names} and compare; tell the user any mismatch`,
        evidence: `#${m.index}`,
        moment: m.kind,
      });
      flagged = "project-docs";
    }
    if (m.kind === "task" && !namedTask(messages, m.index) && !has("name-the-task")) {
      flags.push({
        line: `A task handed to an agent (${clip(m.what, 60)}) with no task number and subject`,
        rule: "name-the-task",
        fix: "Name the task: “doing task N · subject”",
        evidence: `#${m.index}`,
        moment: m.kind,
      });
      flagged = flagged ? `${flagged}, name-the-task` : "name-the-task";
    }
    const read = [...got.kinds].join(", ") || "nothing";
    const queries = got.queries.length
      ? `; memory searched for: ${got.queries
          .slice(-4)
          .map((q) => `“${q}”`)
          .join(", ")}`
      : "";
    const skills = got.skills.size ? `; skills loaded: ${[...got.skills].join(", ")}` : "";
    lines.push(
      `#${m.index} ${m.kind}${m.visual ? " (visual)" : ""}: ${clip(m.what, 100)} — read in the recent window: ${read}${queries}${skills}; missing: ${missing.join(", ") || "none"}${flagged ? ` (already flagged: ${flagged})` : ""}`,
    );
  }
  return { flags, lines };
}

// ── The check ────────────────────────────────────────────────────────────────────────────────

/** Notes the agent has not answered in time get one reminder, then close as ignored. */
async function chaseUnanswered(
  io: Io,
  st: State,
  book: NoteBook,
  now: number,
  answered: Set<string>,
): Promise<void> {
  for (const note of book.open) {
    if (note.deliveredAt === undefined || answered.has(note.id)) continue;
    const steps = st.steps - (note.deliveredStep ?? st.steps);
    const turned = st.turnEnds > (note.deliveredTurn ?? st.turnEnds);
    const due =
      note.kind === "compaction"
        ? steps >= REREAD_STEPS || (turned && steps >= ANSWER_STEPS)
        : steps >= ANSWER_STEPS || turned;
    if (!due) continue;
    if (note.round === 1) {
      requeue(note, now, "reminder");
      await io.log({
        at: new Date(now).toISOString(),
        session: st.sessionId,
        outcome: "reminder",
        id: note.id,
      });
    } else {
      await closeUnanswered(io, st, book, note, note.answer ? "unresolved" : "ignored");
    }
  }
}

type Base = Record<string, unknown>;

/** The compaction note closes once the reads show up; a “done” without them gets one follow-up. */
async function judgeCompactionNote(
  io: Io,
  st: State,
  book: NoteBook,
  note: Note,
  a: NoteAnswer | undefined,
  messages: readonly SessionMessage[],
  base: Base,
): Promise<boolean> {
  if (a) note.answer = clip(`${a.verb}: ${a.text}`, 300);
  const missing = compactionMissing(messages);
  if (missing.length === 0 || a?.verb === "disagree") {
    book.open = book.open.filter((n) => n !== note);
    const by = missing.length === 0 ? "pattern" : "its-reason";
    await io.log({ ...base, outcome: "answer-ok", id: note.id, by });
    return false;
  }
  if (note.deliveredAt === undefined) return false;
  note.fix = missing.map((k) => READ_NAMES[k]).join("; ");
  if (a?.verb !== "done") return false;
  if (note.round === 2) {
    await closeUnanswered(io, st, book, note, "unresolved");
    return true;
  }
  requeue(note, await io.now(), "follow-up");
  await io.log({ ...base, outcome: "follow-up", id: note.id, missing });
  return true;
}

/** The agent's answers in the new part, matched to open notes: what the checker must judge. */
async function gatherAnswers(
  io: Io,
  st: State,
  book: NoteBook,
  messages: readonly SessionMessage[],
  start: number,
  base: Base,
): Promise<{ toJudge: string[]; judged: Set<string>; answered: Set<string> }> {
  const known = await rememberPhrases(io, st, messages, start);
  // The latest answer to a note wins.
  const answers = new Map(answersIn(messages, start).map((a) => [a.id, a]));
  const toJudge: string[] = [];
  const judged = new Set<string>();
  const answered = new Set<string>();
  for (const note of book.open) {
    const a = answers.get(note.id);
    if (note.kind === "compaction") {
      if (await judgeCompactionNote(io, st, book, note, a, messages, base)) answered.add(note.id);
      continue;
    }
    if (!a || note.deliveredAt === undefined) continue;
    note.answer = clip(`${a.verb}: ${a.text}`, 300);
    answered.add(note.id);
    judged.add(note.id);
    const cited = citedPhrases(messages, a.text, known);
    const words = cited.length ? ` · the user's words it cites: ${cited.join(" | ")}` : "";
    toJudge.push(
      `${note.id} (rule ${note.rule}; note: ${note.line}; fix: ${note.fix}) — its answer #${a.index}: “${clip(a.text, 300)}”${words}`,
    );
  }
  return { toJudge, judged, answered };
}

/** The checker's verdicts: an answer that holds closes its note, one that does not is followed up once. */
async function applyVerdicts(
  io: Io,
  st: State,
  book: NoteBook,
  judged: ReadonlySet<string>,
  text: string,
  base: Base,
): Promise<void> {
  const verdicts = new Map(parseVerdicts(text).map((v) => [v.id, v]));
  for (const id of judged) {
    const note = book.open.find((n) => n.id === id);
    if (!note) continue;
    const v = verdicts.get(id);
    if (!v || v.ok) {
      book.open = book.open.filter((n) => n !== note);
      await io.log({ ...base, outcome: v ? "answer-ok" : "answer-assumed-ok", id });
    } else if (note.round === 1) {
      requeue(note, await io.now(), "follow-up", v.missing);
      await io.log({ ...base, outcome: "follow-up", id, missing: v.missing });
    } else {
      await closeUnanswered(io, st, book, note, "unresolved");
    }
  }
}

/** The free part of a check, run at a trigger moment: what the agent should have read first. */
async function momentCheck(
  io: Io,
  st: State,
  messages: readonly SessionMessage[],
  start: number,
  base: Base,
): Promise<void> {
  const moments = momentsIn(messages, start).filter((m) => m.kind !== "compaction");
  const { flags } = momentFlags(messages, moments);
  const book = await loadBook(io, st);
  await post(io, st, book, flags, { ...base, by: "moment" }, "guard");
  await saveBook(io, st, book);
  if (flags.length === 0) await io.log({ ...base, outcome: "moment-clean" });
}

/** What the checker is told during the careful stretch after a compaction. */
function afterCompactionText(
  st: State,
  messages: readonly SessionMessage[],
  summaryAt: number,
): string | undefined {
  if (!st.dense || summaryAt < 0) return undefined;
  const missing = compactionMissing(messages);
  const covered = st.compactionNote
    ? ` Note ${st.compactionNote} already asks for these reads: never flag the missing reads themselves.`
    : "";
  return `The conversation was compacted at #${summaryAt}; the agent works from its summary and must first read ${AFTER_COMPACTION.map((k) => READ_NAMES[k]).join(" and ")}; still missing: ${missing.join(", ") || "none"}.${covered} Judge this stretch more carefully than usual: flag work that goes wrong because of it (a decision, a question, something public or new that the docs or memory contradict).`;
}

export type Trigger = "step" | "end" | "moment";

export async function check(
  io: Io,
  st: State,
  trigger: Trigger,
  turnId: string,
  step: number,
): Promise<void> {
  const settings = st.settings;
  if (!st.system || !settings) return;
  if (await io.exists(`${st.home}/guardian-off`)) return;
  const startedAt = await io.now();
  const messages = await io.messages();
  const cursors = await readCursors(io);
  const start = startIndex(messages, cursors[st.sessionId]?.fp);
  const base = {
    at: new Date(startedAt).toISOString(),
    session: st.sessionId,
    turnId,
    trigger,
    step,
    dense: st.dense !== null,
    model: settings.model,
  };
  // A trigger moment gets the free pattern check at once; the next model check sees the moment too.
  if (trigger === "moment") {
    await momentCheck(io, st, messages, start, base);
    return;
  }
  st.sinceCheck = 0;
  if (st.dense && startedAt > st.dense.untilMs) st.dense = null;

  // A compaction the event did not report (an older engine, a restart): the summary row tells.
  const summaryAt = summaryIndex(messages);
  if (summaryAt >= start && startedAt - st.compactedAt > 10 * 60 * 1000)
    await onCompacted(io, st, "summary");

  const book = await loadBook(io, st);
  const { toJudge, judged, answered } = await gatherAnswers(io, st, book, messages, start, base);
  await chaseUnanswered(io, st, book, startedAt, answered);

  const moments = momentsIn(messages, start).filter((m) => m.kind !== "compaction");
  const fromMoments = momentFlags(messages, moments);
  const afterCompaction = afterCompactionText(st, messages, summaryAt);
  const already = (await seenFlags(io))
    .filter((s) => s.session === st.sessionId)
    .slice(-8)
    .map((s) => `- rule ${s.rule}: ${s.key}`);
  const prompt = buildPrompt({
    messages,
    start,
    now: `${stamp(startedAt, st.tz)} ${st.tz}`,
    trigger: trigger === "step" ? `step ${step} of a running turn` : "the turn just ended",
    alreadyFlagged: [
      ...already,
      ...fromMoments.flags.map((f) => `- rule ${f.rule}: ${normalize(f.line)}`),
    ],
    moments: fromMoments.lines,
    answers: toJudge,
    ...(afterCompaction ? { afterCompaction } : {}),
  });
  if (prompt === null) {
    await saveBook(io, st, book);
    await io.log({ ...base, outcome: "nothing-new" });
    return;
  }
  await post(io, st, book, quickFlags(messages, start), { ...base, by: "pattern" }, "Guardian");
  await post(io, st, book, fromMoments.flags, { ...base, by: "moment" }, "guard");
  await saveBook(io, st, book);
  const r = await io.complete({
    model: settings.model,
    effort: "low",
    system: [{ text: st.system, cache: true }],
    prompt,
    maxTokens: 500,
    timeoutMs: CHECK_TIMEOUT_MS,
  });
  const record = {
    ...base,
    by: "model",
    ms: (await io.now()) - startedAt,
    moments: moments.length,
    judged: toJudge.length,
    usage: r.usage,
  };
  if (!r.isAnswered) {
    await io.log({ ...record, outcome: `error:${r.reason}` });
    return;
  }
  await writeCursor(io, st, cursors, fingerprint(messages[messages.length - 1]), startedAt);
  // The book again: a note may have reached the agent while the checker thought.
  const fresh = await loadBook(io, st);
  await applyVerdicts(io, st, fresh, judged, r.text, base);
  const parsed = parseAnswer(r.text);
  // The compaction note already asks for the re-reads; the checker's own flag of them says it twice.
  const covered = (f: Flag) =>
    f.rule === "reread-after-compact" &&
    st.compactionNote !== "" &&
    startedAt - st.compactedAt < settings.denseMs;
  const flags = parsed.flatMap((a) => (a.kind === "flag" && !covered(a.flag) ? [a.flag] : []));
  if (flags.length > 0) await post(io, st, fresh, flags, record, "Guardian");
  else
    await io.log({
      ...record,
      outcome: parsed.some((x) => x.kind === "flag") ? "none" : (parsed[0]?.kind ?? "unparsed"),
    });
  await saveBook(io, st, fresh);
}

/** Posts flags found outside a check (a guard's own, no model) as notes the agent must answer. */
export async function postNotes(
  io: Io,
  st: State,
  flags: readonly Flag[],
  by: string,
): Promise<void> {
  const book = await loadBook(io, st);
  const at = new Date(await io.now()).toISOString();
  await post(io, st, book, flags, { at, session: st.sessionId, by }, by);
  await saveBook(io, st, book);
}
