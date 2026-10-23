// The Guardian's trigger moments: when an agent most often goes wrong (a question to the user, a
// sign-up, card or key, creating something that may already exist, anything public, a task start or
// hand-off, a compaction), what it read before them, and its answers to notes. Kept free of `$`.
import type { SessionMessage, ToolUseSummary } from "claude-code";
import { any, pattern } from "./words";

export type MomentKind = "question" | "account" | "create" | "public" | "task" | "compaction";
export interface Moment {
  kind: MomentKind;
  index: number;
  what: string;
  visual?: boolean;
}
export type ReadKind = "memory" | "vault" | "docs" | "brand";

/** How far back "what it read first" looks: about a quarter of an hour of work. */
export const LOOKBACK = 150;

export const COMPACTION_SUMMARY =
  /^\s*This session is being continued from a previous conversation/;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

// ── Trigger moments ──────────────────────────────────────────────────────────────────────────

const QUESTION = pattern(
  () => new RegExp(`(\\?|(?<!\\p{L})(${any([], "QUESTION_WORD")}))\\s*[?!.…]*\\s*$`, "iu"),
);
const STANDARD_QUESTION = pattern(
  () =>
    new RegExp(
      `(${any(["or not", "is this for me"], "STANDARD_QUESTION")})[^.!?]{0,20}[?!.…\\p{L}\\s]*$`,
      "iu",
    ),
);
const ACCOUNT_ASK = pattern(
  () =>
    new RegExp(
      `(?<!\\p{L})(${any(["enter your", "send me", "top up", "pay for", "sign up", "log in", "add your"], "ACCOUNT_VERB")})(?!\\p{L})[^.!?]{0,60}(${any(["card", "key", "password", "account", "wallet", "dollars?", "\\$\\s?\\d", "€\\s?\\d", "apple pay", "google pay", "code", "login"], "ACCOUNT_OBJECT")})`,
      "iu",
    ),
);
const ACCOUNT_URL =
  /(sign-?up|signup|register|login|log-in|signin|sign-in|checkout|billing|wallet|payment|subscribe|onboarding|create-account)/i;
const ACCOUNT_CLICK =
  /\b(sign ?up|register|log ?in|sign ?in|pay\b|pay \$|buy|top ?up|subscribe|checkout|create account|add card|purchase)/i;
const PUBLIC_CMD =
  /\bgit(?:\s+-C\s+\S+)?\s+push\b|wrangler\s+pages\s+deploy|\bgh\s+repo\s+create\b|\bgh\s+repo\s+edit\b[^\n]*visibility|\bgh\s+release\s+create\b|\bnpm\s+publish\b|\bvercel\b[^\n]*--prod/;
const PUBLIC_PATH =
  /(^|\/)README(\.[a-z]{2})?\.md$|(^|\/)site\/\S*\.(html|css|js|svg)$|(^|\/)(index|landing)\.html$/i;
const VISUAL_PATH = /\.(html|css|svg|png|jpe?g|webp|gif|mp4)$/i;
// Where new tools live: a skill, a script in a bin folder, a service unit or timer.
const CREATE_PATH = /\/skills\/[^/]+\/SKILL\.md$|\.(service|timer)$|\/(\.local\/)?bin\/[^/]+$/;
const CREATE_CMD =
  /\bgit\s+init\b|\bsystemctl\s+--user\s+enable\b|\bcat\s*>\s*\S*\/skills\/[^/\s]+\/SKILL\.md|\bcat\s*>\s*\S*\.(service|timer)\b|\bgh\s+repo\s+create\b/;
const WRITE_TO =
  /(?:\bcat\s*>|\btee\s+|\bsed\s+-i\S*\s+(?:'[^']*'|"[^"]*"|\S+)\s+|python3?\s+-\s+|\bcp\s+\S+\s+|>\s*)("?)([~/][^\s"';|&]+)\1/g;

function pathMoment(path: string, created: boolean, index: number): Moment | null {
  if (!path) return null;
  if (PUBLIC_PATH.test(path))
    return { kind: "public", index, what: path, visual: VISUAL_PATH.test(path) };
  if (created && CREATE_PATH.test(path)) return { kind: "create", index, what: path };
  return null;
}

function bashMoment(input: Record<string, unknown>, index: number): Moment | null {
  const cmd = str(input["command"]);
  const pub = PUBLIC_CMD.exec(cmd);
  if (pub)
    return {
      kind: "public",
      index,
      what: clip(pub[0], 60),
      visual: /wrangler|site|html/.test(cmd),
    };
  if (CREATE_CMD.test(cmd))
    return { kind: "create", index, what: clip(str(input["description"]) || cmd, 80) };
  for (const m of cmd.matchAll(WRITE_TO)) {
    const hit = pathMoment(m[2] ?? "", false, index);
    if (hit) return hit;
  }
  return null;
}

function mcpMoment(tool: string, input: Record<string, unknown>, index: number): Moment | null {
  if (/^mcp__.*(navigate|open_url|goto)/.test(tool) && ACCOUNT_URL.test(str(input["url"])))
    return { kind: "account", index, what: clip(str(input["url"]), 80) };
  const target = `${str(input["element"])} ${str(input["text"])}`;
  if (/^mcp__.*(click|type|fill)/.test(tool) && ACCOUNT_CLICK.test(target)) {
    const what = clip(str(input["element"]) || "a payment or sign-up form", 80);
    return { kind: "account", index, what };
  }
  if (/^mcp__.*(tweet|post_|publish|create_post)/i.test(tool))
    return { kind: "public", index, what: tool };
  return null;
}

/** The trigger moment of one tool call, from its name and input; null for an ordinary step. */
export function toolMoment(
  tool: string,
  input: Record<string, unknown>,
  index = -1,
  resultText = "",
): Moment | null {
  if (tool.endsWith("__speak")) return textMoment(str(input["text"]), index);
  if (tool === "AskUserQuestion") return { kind: "question", index, what: "AskUserQuestion" };
  if (tool === "Agent" || tool === "Task")
    return { kind: "task", index, what: `agent: ${clip(str(input["description"]), 80)}` };
  if (tool === "Write") {
    const created = !/updated|has been (?:updated|modified)/i.test(resultText);
    return pathMoment(str(input["file_path"]), created, index);
  }
  if (tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit")
    return pathMoment(str(input["file_path"]) || str(input["notebook_path"]), false, index);
  if (tool === "Bash") return bashMoment(input, index);
  return mcpMoment(tool, input, index);
}

/** A moment in the agent's words to the user: a question, or an ask for a card, key or account. */
export function textMoment(text: string, index = -1): Moment | null {
  const t = text.replace(/^\s*\[[a-z]+\]\s*/i, "").trim();
  if (!t) return null;
  if (ACCOUNT_ASK().test(t)) return { kind: "account", index, what: clip(t, 120) };
  // The question is the last sentence; a short check-in (“how are you?”) needs no memory search.
  const parts = t.split(/(?<=[.!?…])\s+|\n+/);
  const last = parts[parts.length - 1] ?? "";
  const words = (last.replace(QUESTION, "").match(/\p{L}+/gu) ?? []).length;
  if (QUESTION().test(last) && !STANDARD_QUESTION().test(last) && words >= 4)
    return { kind: "question", index, what: clip(last, 120) };
  return null;
}

/** Every trigger moment in messages[from..to). */
export function momentsIn(
  messages: readonly SessionMessage[],
  from: number,
  to = messages.length,
): Moment[] {
  const out: Moment[] = [];
  for (let i = Math.max(0, from); i < to; i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") {
      if (COMPACTION_SUMMARY.test(m.text))
        out.push({ kind: "compaction", index: i, what: "the conversation was compacted" });
      continue;
    }
    if (!m.toolUses.some((u) => u.tool.endsWith("__speak"))) {
      const hit = textMoment(m.text, i);
      if (hit) out.push(hit);
    }
    for (const u of m.toolUses) {
      const hit = toolMoment(u.tool, u.input ?? {}, i, u.text ?? "");
      if (hit) out.push(hit);
    }
  }
  return out;
}

// ── What it read before ──────────────────────────────────────────────────────────────────────

const MEMORY_CMD = /\bhizuri-(recall|memory)\b/;
const MEMORY_QUERY = /hizuri-recall\s+(?:-\S+\s+)*(["'])([^"']{2,120})\1/g;
const VAULT_CMD = /\bhizuri-secret\b/;
const DOCS = /(^|\/)(VISION|TECH-DESIGN|ARCHITECTURE|README|AGENTS|CLAUDE)\.md\b/;
const BRAND = /(^|\/)(brand|design|style-?guide)\.md\b/i;
// A real read of a doc: a Read, or cat/sed/head/tail/less/python over it; a bare grep is a peek.
const READ_CMD = /\b(cat|sed|head|tail|less|bat|python3?|awk)\b/;

export interface Reads {
  kinds: Set<ReadKind>;
  skills: Set<string>;
  queries: string[];
}

function readsOfUse(u: ToolUseSummary, acc: Reads): void {
  const input = u.input ?? {};
  if (u.tool === "Skill") {
    const s = str(input["skill"]);
    acc.skills.add(s);
    if (/searching-memory|remember/.test(s)) acc.kinds.add("memory");
    return;
  }
  if (/^mcp__.*(recall|search_memory)/.test(u.tool)) {
    acc.kinds.add("memory");
    acc.queries.push(clip(str(input["query"]), 60));
    return;
  }
  if (u.tool === "Read") {
    const p = str(input["file_path"]);
    if (DOCS.test(p)) acc.kinds.add("docs");
    if (BRAND.test(p)) acc.kinds.add("brand");
    const skill = /\/skills\/([^/]+)\/SKILL\.md$/.exec(p);
    if (skill?.[1]) acc.skills.add(skill[1]);
    return;
  }
  if (u.tool !== "Bash") return;
  const cmd = str(input["command"]);
  if (MEMORY_CMD.test(cmd)) {
    acc.kinds.add("memory");
    for (const m of cmd.matchAll(MEMORY_QUERY)) acc.queries.push(clip(m[2] ?? "", 60));
  }
  if (VAULT_CMD.test(cmd)) acc.kinds.add("vault");
  if (READ_CMD.test(cmd)) {
    if (DOCS.test(cmd)) acc.kinds.add("docs");
    if (BRAND.test(cmd)) acc.kinds.add("brand");
  }
}

/** What the agent read in messages[from..to): memory searches, the vault, project docs, skills. */
export function readsIn(
  messages: readonly SessionMessage[],
  from: number,
  to = messages.length,
): Reads {
  const acc: Reads = { kinds: new Set(), skills: new Set(), queries: [] };
  for (let i = Math.max(0, from); i < to; i++) {
    const m = messages[i];
    if (m?.role === "assistant") for (const u of m.toolUses) readsOfUse(u, acc);
  }
  return acc;
}

/** Where "recent" starts for a moment at `index`: the last compaction or LOOKBACK messages back. */
export function lookbackStart(messages: readonly SessionMessage[], index: number): number {
  const floor = Math.max(0, index - LOOKBACK);
  for (let i = index; i >= floor; i--)
    if (messages[i]?.role === "user" && COMPACTION_SUMMARY.test(messages[i]!.text)) return i;
  return floor;
}

/** What a moment needs read first; the always-first memory search leads. */
export function needs(m: Moment): ReadKind[] {
  switch (m.kind) {
    case "account":
      return ["memory", "vault"];
    case "public":
      return m.visual ? ["memory", "brand"] : ["memory", "docs"];
    case "compaction":
      return ["docs", "memory"];
    default:
      return ["memory"];
  }
}

export const AFTER_COMPACTION: readonly ReadKind[] = ["docs", "memory"];

export const READ_NAMES: Record<ReadKind, string> = {
  memory: "a memory search on the topic (hizuri-recall)",
  vault: "the vault (hizuri-secret)",
  docs: "the project's docs (README, docs/VISION.md, docs/TECH-DESIGN.md)",
  brand: "the project's brand and design docs (docs/brand.md, docs/design.md)",
};

/** The reads a moment needed and did not get in its lookback window. */
export function missingFor(messages: readonly SessionMessage[], m: Moment): ReadKind[] {
  const got = readsIn(messages, lookbackStart(messages, m.index), m.index + 1).kinds;
  return needs(m).filter((k) => !got.has(k));
}

// ── Task numbers ─────────────────────────────────────────────────────────────────────────────

const TASK_NUMBER = pattern(
  () =>
    new RegExp(
      `(${any(["task", "issue", "ticket"], "TASK_WORD")})\\s*(?:№|#|no\\.?)?\\s*\\d{1,5}\\b|#\\d{1,5}\\b`,
      "iu",
    ),
);

/** Whether the agent named a task number in the brief or in its words a few messages before. */
export function namedTask(messages: readonly SessionMessage[], index: number): boolean {
  for (let i = index; i >= Math.max(0, index - 6); i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    if (TASK_NUMBER().test(m.text)) return true;
    for (const u of m.toolUses) {
      const words = `${str(u.input?.["text"])} ${str(u.input?.["description"])} ${i === index ? str(u.input?.["prompt"]).slice(0, 600) : ""}`;
      if (TASK_NUMBER().test(words)) return true;
    }
  }
  return false;
}

// ── Answers to notes ─────────────────────────────────────────────────────────────────────────

export type Verb = "done" | "doing" | "disagree" | "other";
export interface NoteAnswer {
  id: string;
  verb: Verb;
  text: string;
  index: number;
}

const ANSWER = pattern(
  () =>
    new RegExp(
      `(?:${any(["Guardian"], "GUARDIAN_NAME")})\\s*,?\\s*(g\\d+)\\s*[:—–-]\\s*([^\\n]{0,400})`,
      "giu",
    ),
);
const DONE = pattern(() => new RegExp(`^(${any(["done", "already"], "ANSWER_DONE")})`, "iu"));
const DOING = pattern(() => new RegExp(`^(${any(["doing"], "ANSWER_DOING")})`, "iu"));
const DISAGREE = pattern(
  () => new RegExp(`^(${any(["disagree", "wrong"], "ANSWER_DISAGREE")})`, "iu"),
);

function verbOf(s: string): Verb {
  const t = s.trim();
  if (DONE().test(t)) return "done";
  if (DOING().test(t)) return "doing";
  if (DISAGREE().test(t)) return "disagree";
  return "other";
}

/** The agent's answers in messages[from..): `Guardian g7: done — …` in chat text (or speech). */
export function answersIn(messages: readonly SessionMessage[], from: number): NoteAnswer[] {
  const out: NoteAnswer[] = [];
  for (let i = Math.max(0, from); i < messages.length; i++) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const texts = [
      m.text,
      ...m.toolUses.filter((u) => u.tool.endsWith("__speak")).map((u) => str(u.input?.["text"])),
    ];
    for (const t of texts) {
      for (const a of t.matchAll(ANSWER())) {
        const body = (a[2] ?? "").trim();
        out.push({ id: (a[1] ?? "").toLowerCase(), verb: verbOf(body), text: body, index: i });
      }
    }
  }
  return out;
}

const SPOKEN = /<spoken-input id="(p\d{1,8})"[^>]*>([\s\S]*?)<\/spoken-input>/g;

/** The user's spoken phrases by id in messages[from..): a corrected text wins over the first draft. */
export function phrasesIn(
  messages: readonly SessionMessage[],
  from: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = Math.max(0, from); i < messages.length; i++) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    for (const hit of m.text.matchAll(SPOKEN))
      out[hit[1] ?? ""] = clip((hit[2] ?? "").replace(/\[[^\]]*\]/g, ""), 300);
  }
  return out;
}

/** The user's words behind a phrase id the agent cites: from the view, else from `known`. */
export function citedPhrases(
  messages: readonly SessionMessage[],
  answer: string,
  known: Readonly<Record<string, string>> = {},
): string[] {
  const ids = [...new Set([...answer.matchAll(/\bp\d{1,8}\b/g)].map((m) => m[0]))].slice(0, 3);
  const inView = phrasesIn(messages, 0);
  return ids.map((id) => {
    const words = inView[id] ?? known[id];
    return words ? `${id}: “${words}”` : `${id}: (not in view)`;
  });
}
