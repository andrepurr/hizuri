// Hizuri: the facts about Zuri's work the fast front may say aloud. Code, not a model, reads them:
// the helper agents running now (the detached-agents board, a JSON file read on every question,
// PASEO_FAST_FRONT_AGENTS_BOARD) and the tasks in work and next on the user's task board (a task
// tracker's JSON list over HTTP, PASEO_FAST_FRONT_WORK_BOARD with its bearer token
// PASEO_FAST_FRONT_WORK_BOARD_TOKEN, re-read in the background every 20 s); both are unset in the
// core and named by the user's profile. The front answers
// "what's up", "how many agents", "what's next" from these lines; anything not in them stays "let me
// tell you". The lines are plain English; the front says them in the user's language.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { ConfigSecretError, resolveSecretKnob } from "../../data-scopes/secret-refs.js";
import { envString } from "../../voice-env.js";

export interface FrontFacts {
  /** Plain lines for the front's <your_work>. */
  text: string;
  /** What the facts show as done: a “done” line must name one of these. The board lists none. */
  done: readonly string[];
  /** How many helper agents run now; null = unknown, so the front may not count them. */
  agents: number | null;
  /** The user's task board was read: it, not the assistant's own task list, says what is in work. */
  board?: boolean;
}

const MAX_ITEM = 70;

function expandHome(file: string): string {
  return file.startsWith("~/") ? path.join(homedir(), file.slice(2)) : file;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function quote(text: string, max = MAX_ITEM): string {
  return `“${clip(text, max)}”`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Helper agents -------------------------------------------------------------------------

interface BoardAgent {
  id?: unknown;
  task?: unknown;
  status?: unknown;
  progressFile?: unknown;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** An agent on the board is running while its process lives and it wrote no exit code. */
function agentRunning(agent: BoardAgent): boolean {
  if (agent.status !== "running") {
    return false;
  }
  if (typeof agent.progressFile !== "string") {
    return true;
  }
  const dir = path.dirname(agent.progressFile);
  if (existsSync(path.join(dir, "exit"))) {
    return false;
  }
  const pidFile = path.join(dir, "pid");
  if (!existsSync(pidFile)) {
    return true;
  }
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  return Number.isInteger(pid) && pid > 0 && pidAlive(pid);
}

/**
 * What each running helper agent works on, from the board's task line (“#7 Build the report”
 * → “Build the report”). null when there is no board: unknown is not zero.
 */
export function readRunningAgents(boardPath: string): string[] | null {
  if (!boardPath) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(boardPath, "utf8"));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  return parsed
    .filter((entry): entry is BoardAgent => isRecord(entry) && agentRunning(entry))
    .map((agent) => {
      const task = typeof agent.task === "string" ? agent.task : "";
      const title = task.replace(/^#?\d+\s*[·:—-]?\s*/, "").trim();
      return title || (typeof agent.id === "string" ? agent.id : "untitled");
    });
}

// --- The task board ---------------------------------------------------------------------------

/** One task in work or next, in the board's own order. */
export interface BoardTask {
  /** “<number> · <name>” as the board writes it. */
  title: string;
  status: "doing" | "todo";
  /** The first line of its description when it is a state line (“Now: …”, in any language). */
  detail: string;
}

/** How often the board is re-read, and after how long without a good read it is unknown. */
const BOARD_REFRESH_MS = 20_000;
const BOARD_STALE_MS = 90_000;
const BOARD_TIMEOUT_MS = 3_000;
/** How many tasks in work are named (all, up to this), and how many next ones. */
const RUN_SHOWN = 6;
const NEXT_SHOWN = 4;
/** A description's first line that says where the task stands: one capitalised word and a colon (“Now: …”). */
const STATE_LINE = /^\s*(?:\p{Lu}\p{Ll}{1,12}|Now)\s*:\s*(.+)$/u;

/**
 * The tasks in work (doing) and next (todo) of a task list in JSON: an array of
 * `{ title, status, projectId?, description? }` in board order. A `projectId` given narrows it to
 * that project's board. null: not a task list.
 */
export function parseBoard(json: unknown, projectId: string | null = null): BoardTask[] | null {
  if (!Array.isArray(json)) {
    return null;
  }
  const tasks: BoardTask[] = [];
  for (const row of json) {
    if (!isRecord(row) || typeof row.title !== "string") {
      continue;
    }
    if (row.status !== "doing" && row.status !== "todo") {
      continue;
    }
    if (projectId !== null && row.projectId !== projectId) {
      continue;
    }
    const first = typeof row.description === "string" ? (row.description.split("\n")[0] ?? "") : "";
    tasks.push({
      title: row.title.trim(),
      status: row.status,
      detail: STATE_LINE.exec(first)?.[1]?.trim() ?? "",
    });
  }
  // In work first; each group keeps the board's order.
  return [
    ...tasks.filter((task) => task.status === "doing"),
    ...tasks.filter((task) => task.status === "todo"),
  ];
}

/**
 * One read of the board: `url` returns the task list; its `projectId` query parameter, when
 * present, narrows the list here too (an API that ignores it still answers with every task).
 */
export async function fetchBoard(
  url: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BoardTask[] | null> {
  let projectId: string | null = null;
  try {
    projectId = new URL(url).searchParams.get("projectId");
  } catch {
    return null;
  }
  try {
    const response = await fetchImpl(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(BOARD_TIMEOUT_MS),
    });
    if (!response.ok) {
      return null;
    }
    return parseBoard(await response.json(), projectId);
  } catch {
    return null;
  }
}

function sectionLine(label: string, tasks: readonly BoardTask[], shown: number): string {
  if (tasks.length === 0) {
    return `- ${label}: none`;
  }
  const named = tasks.slice(0, shown).map((task) => {
    const detail =
      task.status === "doing" && task.detail ? ` — now: ${clip(task.detail, MAX_ITEM)}` : "";
    return `${quote(task.title)}${detail}`;
  });
  const rest = tasks.length - named.length;
  return `- ${label} (${tasks.length}): ${named.join("; ")}${rest > 0 ? `; and ${rest} more` : ""}`;
}

/** The board as lines for <your_work>. */
export function boardFacts(tasks: readonly BoardTask[]): string[] {
  return [
    "tasks on the user's board:",
    sectionLine(
      "in progress now",
      tasks.filter((task) => task.status === "doing"),
      RUN_SHOWN,
    ),
    sectionLine(
      "next in line",
      tasks.filter((task) => task.status === "todo"),
      NEXT_SHOWN,
    ),
  ];
}

interface BoardWatch {
  url: string;
  token: string;
  tasks: BoardTask[] | null;
  /** When the last good read landed; 0 = never. */
  at: number;
  reading: boolean;
  timer: ReturnType<typeof setInterval>;
}

let watch: BoardWatch | null = null;

async function readBoard(current: BoardWatch): Promise<void> {
  if (current.reading) {
    return;
  }
  current.reading = true;
  try {
    const tasks = await fetchBoard(current.url, current.token);
    if (tasks) {
      current.tasks = tasks;
      current.at = Date.now();
    }
  } finally {
    current.reading = false;
  }
}

/**
 * The board as last read, or null while unknown (never read, or no good read for BOARD_STALE_MS:
 * the front must not answer from an old board). The first call starts the background reads.
 */
function boardSnapshot(url: string, token: string): BoardTask[] | null {
  if (!url) {
    stopBoardWatch();
    return null;
  }
  if (!watch || watch.url !== url || watch.token !== token) {
    stopBoardWatch();
    const timer = setInterval(() => void (watch && readBoard(watch)), BOARD_REFRESH_MS);
    timer.unref?.();
    watch = { url, token, tasks: null, at: 0, reading: false, timer };
    void readBoard(watch);
  }
  return watch.at > 0 && Date.now() - watch.at <= BOARD_STALE_MS ? watch.tasks : null;
}

/** Stops the background reads (the knob was emptied; tests). */
export function stopBoardWatch(): void {
  if (watch) {
    clearInterval(watch.timer);
    watch = null;
  }
}

/**
 * The board from the knobs: its tasks, null while unknown, undefined when no board is set. The
 * token may be a `!secret <name>` reference, filled from what the daemon opened at start; a token
 * the start could not open (it logged why) or one that changed since leaves the board unknown,
 * never read without its token.
 */
function workBoard(): BoardTask[] | null | undefined {
  const knobs = boardKnobs();
  if (!knobs) {
    stopBoardWatch();
    return knobs;
  }
  return boardSnapshot(knobs.url, knobs.token);
}

/** The board's URL and token; undefined when no board is set, null when its token is not open. */
function boardKnobs(): { url: string; token: string } | null | undefined {
  const url = envString("PASEO_FAST_FRONT_WORK_BOARD", "").trim();
  if (!url) {
    return undefined;
  }
  let token: string | undefined;
  try {
    token = resolveSecretKnob(
      "PASEO_FAST_FRONT_WORK_BOARD_TOKEN",
      envString("PASEO_FAST_FRONT_WORK_BOARD_TOKEN", "").trim(),
    );
  } catch (error) {
    if (!(error instanceof ConfigSecretError)) throw error;
  }
  return token === undefined ? null : { url, token };
}

// --- One task on the board -------------------------------------------------------------------

/** A task id in a note: letters, a dash, then letters and digits with at least one digit. */
const TASK_ID = /\b[a-z]{1,4}-(?=[0-9a-z]*\d)[0-9a-z]{4,}\b/gi;
const TASK_CHECK_TIMEOUT_MS = 1_500;
const TASK_CHECK_MAX_IDS = 5;

export type BoardTaskCheck =
  | { kind: "no-board" }
  | { kind: "found"; id: string }
  | { kind: "no-id" }
  | { kind: "not-found"; ids: string[] }
  | { kind: "unreachable"; error: string };

/**
 * Whether a note names a task that exists on the user's task board: `<board URL path>/<id>` must
 * answer 200 (404 = no such task). A board that does not answer is "unreachable": the caller lets
 * the mark through, so an outage of the board never blocks the assistant.
 */
export async function checkBoardTask(
  note: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BoardTaskCheck> {
  const knobs = boardKnobs();
  if (knobs === undefined) {
    return { kind: "no-board" };
  }
  if (knobs === null) {
    return { kind: "unreachable", error: "the board's token is not open" };
  }
  const ids = [...new Set(note.match(TASK_ID) ?? [])].slice(0, TASK_CHECK_MAX_IDS);
  if (ids.length === 0) {
    return { kind: "no-id" };
  }
  let base: URL;
  try {
    base = new URL(knobs.url);
  } catch {
    return { kind: "unreachable", error: "the board's URL is not a URL" };
  }
  const listPath = base.pathname.replace(/\/+$/, "");
  const answers = await Promise.all(
    ids.map(async (id) => {
      try {
        const response = await fetchImpl(`${base.origin}${listPath}/${encodeURIComponent(id)}`, {
          headers: knobs.token ? { Authorization: `Bearer ${knobs.token}` } : {},
          signal: AbortSignal.timeout(TASK_CHECK_TIMEOUT_MS),
        });
        return { id, status: response.status };
      } catch (error) {
        return { id, status: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  const found = answers.find((answer) => answer.status === 200);
  if (found) {
    return { kind: "found", id: found.id };
  }
  const odd = answers.find((answer) => answer.status !== 404);
  if (odd) {
    return { kind: "unreachable", error: odd.error ?? `the board answered HTTP ${odd.status}` };
  }
  return { kind: "not-found", ids };
}

const COUNT_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven"];

/** The agent count in words too: a model copies a digit less reliably than a word. */
function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

// --- All together ----------------------------------------------------------------------------

export interface FrontFactsSources {
  /** The detached-agents board; default PASEO_FAST_FRONT_AGENTS_BOARD. */
  agentsBoard?: string;
  /**
   * The task board as read, null while unknown; default the background reads of
   * PASEO_FAST_FRONT_WORK_BOARD (none when it is unset).
   */
  workBoard?: BoardTask[] | null;
}

// Without this line an unreadable board left only the status line, and the front read “free,
// waiting for you” as “nothing is in work”.
const BOARD_UNKNOWN =
  "tasks on the user's board: unknown right now (it could not be read); say nothing about what is or is not in work";

/** The facts for one question to the front, or null when nothing is known. */
export function buildFrontFacts(sources: FrontFactsSources = {}): FrontFacts | null {
  const agents = readRunningAgents(
    expandHome(sources.agentsBoard ?? envString("PASEO_FAST_FRONT_AGENTS_BOARD", "").trim()),
  );
  const tasks = sources.workBoard !== undefined ? sources.workBoard : workBoard();
  const lines: string[] = [];
  if (tasks) {
    lines.push(...boardFacts(tasks));
  } else if (tasks === null) {
    lines.push(BOARD_UNKNOWN);
  }
  const fromBoard = Boolean(tasks);
  // The agents line goes last, next to the user's question: first, the front counted the
  // "tasks in progress" as agents; last, it does not.
  if (agents) {
    lines.push(
      agents.length > 0
        ? `helper agents running now: ${agents.length} (${countWord(agents.length)}) — ${agents.map((task) => quote(task)).join("; ")}`
        : "helper agents running now: none",
    );
  }
  return lines.length > 0
    ? { text: lines.join("\n"), done: [], agents: agents?.length ?? null, board: fromBoard }
    : null;
}
