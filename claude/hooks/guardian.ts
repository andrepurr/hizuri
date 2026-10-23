// The Guardian's pure parts: the checker's instructions, the transcript digest it reads, the parser
// for its answer, the pattern check and the guards. Kept free of `$` so tests call them directly.
import type { SessionMessage, ToolUseSummary } from "claude-code";
import { COMPACTION_SUMMARY } from "./moments";
import { any, pattern } from "./words";

/** The user asked about the reply language. */
const LANGUAGE_ASK = pattern(() => new RegExp(any(["english", "language"], "LANGUAGE_ASK"), "i"));

/** Messages judged when a session has no stored cursor yet (a fresh or unknown session). */
export const WINDOW = 60;
/** Already-checked messages shown before the new part, for context only. */
export const LEAD = 6;
/** The user's earlier words passed along, so a permission they gave is not flagged as a break. */
export const EARLIER_INPUTS = 10;
/** Upper bound of the digest's new part, in characters (about 8K tokens). */
export const NEW_PART_CHARS = 30000;

export interface Flag {
  line: string;
  rule: string;
  fix: string;
  evidence?: string;
  /** The kind of trigger moment a pattern flag is about. */
  moment?: string;
}
export type Answer = { kind: "none" } | { kind: "flag"; flag: Flag } | { kind: "unparsed" };
export interface Verdict {
  id: string;
  ok: boolean;
  missing: string;
}

export function role(language: string): string {
  return `You are the hizuri Guardian, a quiet side checker. The agent you watch works for one user, who talks to it by text or by voice. You read what the agent just did and check it against its rules below. You never talk to anyone. Each flag becomes a note with an id (g7) in the agent's own context at its next step, a minute or more after the step you judge, so the moment may have passed. The agent must answer each note with one line: done with proof, doing now, or disagree with a reason.

What you get: <now> is the moment the new part ended. <new_since_last_check> holds the agent's steps you have not checked yet; everything before it is context. Lines are led by their message number (#12). USER lines are the user's words; NOTICE and TASK NOTIFICATION lines come from the system; AGENT lines are the agent's (chat text, speech, tool calls, a tool's result after →). <moments>, when present, lists the trigger moments in the new part (a question to the user, a sign-up, card or key, creating something that may already exist, anything public, a task start or hand-off) with what the agent read before each. <answers>, when present, holds the agent's answers to earlier notes for you to judge.

Check the new part in this order:
1. Trigger moments, more carefully than ordinary steps: before each, did the agent search memory on its topic (memory-first: a search on another topic does not count; before asking for a key, card or account also the vault), read the project docs it needs (project-docs: the vision and tech design for product work, the brand and design docs for anything visual or public), load the matching skill, name the task it starts (name-the-task)? Does the work contradict the project's docs or an existing feature without the agent saying so to the user (matches-project)? A line in <moments> marked "already flagged" is done: do not flag it again.
2. The user's words: a question or request left with no answer or action; work started that the user did not ask for; the form they asked for not kept; a part of the ask dropped or cut without the user's decision; a choice that was the user's made for them.
3. Language: chat or speech in another language than the user's latest message.
4. Changed files: a Write, an Edit, a sed -i, a > redirect or a config change whose full path the agent's reply does not name. Judge this one only when the trigger says the turn ended (name-changed-files).
5. The rest of the rules.

Do not flag: a preference that is not in the rules; something the transcript cannot show (it may lie outside what you see); a break the agent fixed later in the new part; anything the user allowed or asked for in their own words; the work of subagents (only the agent's own steps count); a break already listed in <already_flagged> unless it happened again in the new part; the agent's “Guardian gN: …” answer lines themselves. Each flag must rest on a line you can point to. A false alarm costs more than a miss.

The fix is what the agent can still do when it reads the note. Never ask it to rewrite, resend or re-say a message already sent, or to stop, undo, revert or restore finished work: that moment is gone. Then give the lesson for next time, starting with "Next time". Only harm that still stands gets an action for now: a wrong claim not yet corrected, a changed file not yet named, a secret left in a file, a read it still needs before going on.

Judging answers: "done" holds when the proof it names (a message, a command, a file) is visible in the transcript; "doing now" holds when the new part shows it being done; "disagree" holds when the user's own words (a phrase id it cites is quoted for you) or a rule back it. Give the benefit of the doubt: an answer that is plausible and not contradicted by the transcript holds.

Answer with at most two flag lines, the break that hurts the user most first, each line
flag: <what happened, one plain sentence, at most 25 words> · rule: <the rule key, without brackets> · fix: <one concrete action or lesson, at most 15 words> · evidence: #<message number>
or, when nothing breaks a rule, exactly
flag: none
Then, for each answer in <answers>, one line
answer: <id> · ok
or
answer: <id> · missing: <what is still missing, at most 15 words>
Write the sentences in ${language}; keep "flag:", "rule:", "fix:", "evidence:", "answer:", "ok", "missing:" and the rule key in English.`;
}

/**
 * A message's identity across calls: `$.session.messages()` holds only the newest 4096 entries,
 * so an index does not stay put in a long session; tool-use ids and text do.
 */
export function fingerprint(m: SessionMessage | undefined): string {
  if (!m) return "";
  const ids = m.toolUses.map((u) => u.tool_use_id).join(",");
  const results = (m.toolResults ?? []).map((r) => r.tool_use_id).join(",");
  return `${m.role}|${ids}|${results}|${m.text.slice(0, 200)}`;
}

/** The first message after the one the last check ended on; the last WINDOW when it is not found. */
export function startIndex(messages: readonly SessionMessage[], fp: string | undefined): number {
  const fallback = Math.max(0, messages.length - WINDOW);
  if (!fp) return fallback;
  for (let i = messages.length - 1; i >= Math.max(0, messages.length - 1000); i--) {
    if (fingerprint(messages[i]) === fp) return i + 1;
  }
  return fallback;
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function clip(s: string, n: number): string {
  const t = oneLine(s);
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

/** Long replies keep their start and their end: the list of changed files is usually last. */
function clipEnds(s: string, n: number): string {
  const t = oneLine(s);
  if (t.length <= n) return t;
  const tail = Math.floor(n * 0.4);
  return `${t.slice(0, n - tail - 3)} … ${t.slice(-tail)}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/** What one user-role row says, by who said it. */
export function userLines(text: string): string[] {
  const body = text.replace(REMINDER, "").trim();
  if (!body) return [];
  const spoken = [...body.matchAll(/<spoken-input[^>]*>([\s\S]*?)<\/spoken-input>/g)];
  if (spoken.length > 0) return spoken.map((m) => `USER (spoken): ${clip(m[1] ?? "", 1500)}`);
  if (body.startsWith("<task-notification>")) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(body)?.[1] ?? body;
    return [`TASK NOTIFICATION: ${clip(summary, 200)}`];
  }
  if (COMPACTION_SUMMARY.test(body))
    return [
      `NOTICE (the conversation was compacted; this summary replaces what came before): ${clip(body, 300)}`,
    ];
  if (body.startsWith("[Request interrupted")) return ["USER interrupted the agent."];
  if (/^\[[^\]]{2,60}\]/.test(body) || body.startsWith("<")) return [`NOTICE: ${clip(body, 300)}`];
  return [`USER (typed): ${clip(body, 1500)}`];
}

export function isSpeak(tool: string): boolean {
  return tool.endsWith("__speak");
}

function toolLine(use: ToolUseSummary): string {
  const input = use.input ?? {};
  const name = use.tool;
  let line: string;
  if (isSpeak(name)) {
    line = `AGENT (speech): ${clipEnds(str(input["text"]), 1200)}`;
  } else if (name === "Bash") {
    const bg = input["run_in_background"] === true ? " [background]" : "";
    line = `AGENT tool Bash${bg} [${clip(str(input["description"]), 120)}] $ ${clip(str(input["command"]), 500)}`;
  } else if (name === "Write") {
    const content = str(input["content"]);
    line = `AGENT tool Write ${str(input["file_path"])} (${content.length} chars): ${clip(content, 160)}`;
  } else if (name === "Edit" || name === "Read" || name === "NotebookEdit") {
    line = `AGENT tool ${name} ${str(input["file_path"]) || str(input["notebook_path"])}`;
  } else if (name === "Agent" || name === "Task") {
    const kind = str(input["subagent_type"]) || "general";
    line = `AGENT tool Agent [${kind}] ${clip(str(input["description"]), 120)}: ${clip(str(input["prompt"]), 400)}`;
  } else if (name === "Skill") {
    line = `AGENT tool Skill ${str(input["skill"])}`;
  } else {
    line = `AGENT tool ${name.replace(/^mcp__/, "")}: ${clip(JSON.stringify(input), 240)}`;
  }
  if (use.isError) line += ` → ERROR: ${clip(use.text ?? "", 200)}`;
  return line;
}

// The engine's own filler when a notice needs no answer; not the agent's words, so never judged.
const FILLER = /^\s*No response requested\.?\s*$/i;

/** The digest lines of one message, each led by its index. */
export function messageLines(m: SessionMessage, index: number): string[] {
  if (m.role === "user") return userLines(m.text).map((l) => `#${index} ${l}`);
  const out: string[] = [];
  if (m.text.trim() && !FILLER.test(m.text))
    out.push(`#${index} AGENT (chat): ${clipEnds(m.text, 1500)}`);
  for (const use of m.toolUses) out.push(`#${index} ${toolLine(use)}`);
  return out;
}

function fitNewPart(lines: string[]): string {
  const text = lines.join("\n");
  if (text.length <= NEW_PART_CHARS) return text;
  const head = Math.floor(NEW_PART_CHARS * 0.2);
  return `${text.slice(0, head)}\n[… the middle of the new part is cut …]\n${text.slice(-(NEW_PART_CHARS - head))}`;
}

export interface PromptInput {
  messages: readonly SessionMessage[];
  start: number;
  now: string;
  trigger: string;
  alreadyFlagged: readonly string[];
  /** Trigger moments in the new part, one line each, with what the agent read before. */
  moments?: readonly string[];
  /** The agent's answers to earlier notes, for the checker to judge. */
  answers?: readonly string[];
  /** Set during the careful stretch after a compaction. */
  afterCompaction?: string;
}

/** The sections a check adds when it has them: the careful stretch, the moments, the answers. */
function extraSections(p: PromptInput): string[] {
  const out: string[] = [];
  if (p.afterCompaction) out.push(`<after_compaction>\n${p.afterCompaction}\n</after_compaction>`);
  if (p.moments?.length) out.push(`<moments>\n${p.moments.join("\n")}\n</moments>`);
  if (p.answers?.length) out.push(`<answers>\n${p.answers.join("\n")}\n</answers>`);
  out.push(
    p.answers?.length
      ? "Check the new part against the rules, then judge each answer: flag lines first, then one answer line per id."
      : "Check the new part against the rules and answer with flag lines only.",
  );
  return out;
}

/** The checker's user message, or null when nothing new from the agent is there to judge. */
export function buildPrompt(p: PromptInput): string | null {
  const { messages, start } = p;
  const fresh = messages.slice(start);
  if (!fresh.some((m) => m.role === "assistant") && !p.answers?.length) return null;
  const earlier: string[] = [];
  for (let i = Math.max(0, start - LEAD - 200); i < start - LEAD; i++) {
    const m = messages[i];
    if (m?.role !== "user") continue;
    for (const l of userLines(m.text))
      if (l.startsWith("USER (")) earlier.push(`#${i} ${clip(l, 240)}`);
  }
  const context: string[] = [];
  for (let i = Math.max(0, start - LEAD); i < start; i++) {
    const m = messages[i];
    if (m) context.push(...messageLines(m, i));
  }
  const newLines: string[] = [];
  fresh.forEach((m, k) => newLines.push(...messageLines(m, start + k)));
  return [
    `<now>${p.now}</now>`,
    `<trigger>${p.trigger}</trigger>`,
    `<already_flagged>\n${p.alreadyFlagged.join("\n") || "(nothing yet)"}\n</already_flagged>`,
    `<user_earlier_words>\n${earlier.slice(-EARLIER_INPUTS).join("\n") || "(none in view)"}\n</user_earlier_words>`,
    `<context_already_checked>\n${context.join("\n") || "(none)"}\n</context_already_checked>`,
    `<new_since_last_check>\n${fitNewPart(newLines)}\n</new_since_last_check>`,
    ...extraSections(p),
  ].join("\n");
}

/** Reads one line of the checker's reply: `flag: none`, or `flag: … · rule: … · fix: … · evidence: …`. */
export function parseLine(line: string): Answer {
  const body = line.replace(/^flag\s*:\s*/i, "");
  if (/^none\b/i.test(body)) return { kind: "none" };
  const m =
    /^(.*?)\s*[·|]\s*rule\s*:\s*\[?([a-z0-9-]+)\]?\s*[·|]\s*fix\s*:\s*(.+?)(?:\s*[·|]\s*evidence\s*:\s*(.+))?$/i.exec(
      body,
    );
  if (!m) return { kind: "unparsed" };
  return {
    kind: "flag",
    flag: {
      line: (m[1] ?? "").trim(),
      rule: (m[2] ?? "").toLowerCase(),
      fix: (m[3] ?? "").trim(),
      evidence: (m[4] ?? "").trim(),
    },
  };
}

/** Reads the checker's reply: no flag or answer lines at all is `unparsed`, `flag: none` is none. */
export function parseAnswer(text: string): Answer[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/^[-*]\s+/, ""))
    .filter((l) => /^flag\s*:/i.test(l));
  if (lines.length === 0)
    return parseVerdicts(text).length > 0 ? [{ kind: "none" }] : [{ kind: "unparsed" }];
  return lines.slice(0, 2).map(parseLine);
}

/** The checker's verdicts on the agent's answers: `answer: g7 · ok` or `answer: g7 · missing: …`. */
export function parseVerdicts(text: string): Verdict[] {
  const out: Verdict[] = [];
  for (const raw of text.split("\n")) {
    const m = /^[-*]?\s*answer\s*:\s*(g\d+)\s*[·|:-]\s*(.+)$/i.exec(raw.trim());
    if (!m) continue;
    const rest = (m[2] ?? "").trim();
    const missing = /^missing\s*:\s*(.+)$/i.exec(rest);
    out.push({
      id: (m[1] ?? "").toLowerCase(),
      ok: !missing && /^ok\b/i.test(rest),
      missing: missing ? (missing[1] ?? "").trim() : "",
    });
  }
  return out;
}

// The pattern check: the agent answering in another script than the user wrote in (a non-Latin
// script to Latin or back) is caught at no model cost. Quotes, code and paths are not prose.
const QUOTED = /«[^»]*»|"[^"]*"|“[^”]*”|`[^`]*`|```[\s\S]*?```|https?:\/\/\S+|[~/][\w./-]+/g;

function script(text: string, minLetters: number): "latin" | "other" | null {
  const bare = text.replace(QUOTED, " ");
  const all = (bare.match(/\p{L}/gu) ?? []).length;
  if (all < minLetters) return null;
  const latin = (bare.match(/\p{Script=Latin}/gu) ?? []).length / all;
  if (latin < 0.4) return "other";
  return latin > 0.85 ? "latin" : null;
}

function userWords(m: SessionMessage): string | null {
  if (m.role !== "user") return null;
  const line = userLines(m.text).find((l) => l.startsWith("USER ("));
  return line ? line.replace(/^USER \([a-z]+\): /, "") : null;
}

/** Pattern checks over the agent's own words in the new part; at most one flag per rule. */
export function quickFlags(messages: readonly SessionMessage[], start: number): Flag[] {
  let last = "";
  for (let i = Math.max(0, start - 200); i < start; i++) {
    const w = messages[i] && userWords(messages[i]!);
    if (w) last = w;
  }
  for (let i = start; i < messages.length; i++) {
    const m = messages[i]!;
    const w = userWords(m);
    if (w) {
      last = w;
      continue;
    }
    if (m.role !== "assistant") continue;
    const theirs = script(last, 8);
    if (!theirs || LANGUAGE_ASK().test(last)) continue;
    const texts = [
      m.text,
      ...m.toolUses.filter((u) => isSpeak(u.tool)).map((u) => str(u.input["text"])),
    ];
    for (const text of texts.filter(Boolean)) {
      const ours = script(text, 30);
      if (ours && ours !== theirs) {
        return [
          {
            line: `The agent answered in ${ours === "latin" ? "a Latin-script language" : "a non-Latin-script language"} while the user wrote in another: “${clip(text, 60)}”`,
            rule: "reply-language",
            fix: "Next time reply in the language of the user's latest message",
            evidence: `#${i}`,
          },
        ];
      }
    }
  }
  return [];
}

/** The text hizuri's daemon parses into a guardian note: one line, led by the marker; the id leads the note. */
export function noteText(flag: Flag, id?: string): string {
  return `[hizuri-guardian] ${id ? `${id}: ` : ""}${flag.line} · rule: ${flag.rule} · fix: ${flag.fix}`;
}

/** The same flag in other words still counts as seen: compare on letters and digits alone. */
export function normalize(line: string): string {
  return line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Stale advice: a note reaches the agent after the step it judges, so a fix that redoes a sent
// message or undoes finished work is no longer doable. It becomes the lesson for next time.
const NEXT_TIME = pattern(
  () => new RegExp(`^(${any(["next time", "from now on", "in future"], "NEXT_TIME")})`, "iu"),
);
const FORWARD = pattern(
  () => new RegExp(`(${any(["next time", "from now on"], "FORWARD")})`, "iu"),
);
const REDO_MESSAGE = pattern(() => {
  const verb = any(
    ["rewrite", "re-?send", "re-?say", "redo", "repeat", "say (?:it|this|that) again"],
    "REDO_VERB",
  );
  const object = any(["answer", "reply", "report", "message", "chat", "speech"], "REDO_OBJECT");
  return new RegExp(`(?<!\\p{L})(${verb})(?!\\p{L})[^.;]*?(${object})`, "iu");
});
const UNDO = pattern(
  () =>
    new RegExp(
      `(?<!\\p{L})(${any(["stop", "revert", "roll ?back", "undo", "restore", "re-?run", "restart"], "UNDO")})(?!\\p{L})`,
      "iu",
    ),
);
// Harm that still stands keeps its action: a file still holding a secret or unnamed changes.
const LIVE_HARM = new Set([
  "secrets",
  "name-changed-files",
  "personal-layer",
  "reread-after-compact",
]);

/** The flag with a fix the agent can still act on: a redo or undo of the past becomes the lesson. */
export function freshFix(flag: Flag): Flag & { staleFix?: string } {
  const fix = flag.fix.trim();
  if (!fix || NEXT_TIME().test(fix) || LIVE_HARM.has(flag.rule)) return flag;
  const stale = (REDO_MESSAGE().test(fix) || UNDO().test(fix)) && !FORWARD().test(fix);
  if (!stale) return flag;
  return {
    ...flag,
    fix: `Next time keep rule ${flag.rule}; do not redo what is done`,
    staleFix: fix,
  };
}

/** A note on its way to the agent: a new one, a reminder of an unanswered one, or a follow-up. */
export interface AgentNote {
  flag: Flag;
  at: number;
  id?: string;
  kind?: "new" | "reminder" | "follow-up";
}

const KIND_TEXT = {
  new: "",
  reminder: "no answer yet · ",
  "follow-up": "your answer did not hold · ",
};

export function hhmm(ms: number, tz: string): string {
  try {
    return new Date(ms).toLocaleTimeString("sv-SE", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toISOString().slice(11, 16);
  }
}

/** What the agent reads in its own context: the notes, their ids, and how to answer them. */
export function agentContext(notes: readonly AgentNote[], tz: string): string {
  return [
    "hizuri Guardian notes: a small side model checked your recent steps against your rules.",
    ...notes.map(
      (n, i) =>
        `${n.id ?? `${i + 1}.`} · ${hhmm(n.at, tz)} · ${KIND_TEXT[n.kind ?? "new"]}rule ${n.flag.rule}: ${n.flag.line} · fix: ${n.flag.fix}`,
    ),
    "Answer each note at once with one chat line, no tool needed, then carry on; nobody waits: `Guardian g7: done — <proof: message, command or file>`, `Guardian g7: doing now — <what>`, or `Guardian g7: disagree — <why: the user's words with the phrase id, or the rule that allows it>`. Do not re-say old replies or undo finished work because of them. Each one is already a line in the retro log.",
  ].join("\n");
}

// ── Guards: deterministic checks on the turn, no model call ──────────────────────────────────

/** Words of a complaint about the agent's last reply, in every language the user set up. */
const COMPLAINT = pattern(
  () =>
    new RegExp(
      `(?<!\\p{L})(${any(
        [
          "wrong",
          "again\\?",
          "again!",
          "i told you",
          "i said",
          "not what i asked",
          "you forgot",
          "you ignored",
          "stop doing",
          "why did you",
          "that's not",
          "thats not",
          "doesn't work",
          "broke",
        ],
        "COMPLAINT",
      )})(?!\\p{L})`,
      "iu",
    ),
);

export function isComplaint(text: string): boolean {
  const body = text.replace(REMINDER, " ");
  return /^\s*\/(?:hizuri:)?refreshing-rules\b/.test(body) || COMPLAINT().test(body);
}

/** A rule, skill, agent or output-style file: what the skill reviewer must see once written. */
const RULE_FILE =
  /(^|\/)SKILL\.md$|(^|\/)(CLAUDE|AGENTS)\.md$|\/rules\/[^/]+\.md$|\/agents\/[^/]+\.md$|\/output-styles\/[^/]+\.md$|\/\.hizuri\/personal\/(rules\.md|skills\/[^/]+\.md)$/;

export function ruleFile(file: string): boolean {
  return RULE_FILE.test(file);
}

const EDITS = new Set(["Write", "Edit", "MultiEdit"]);

export function isEdit(tool: string): boolean {
  return EDITS.has(tool);
}

/** The vault's session key and the bare Bitwarden CLI: only hizuri-secret may touch them. */
export function touchesVault(tool: string, input: Record<string, unknown>): boolean {
  const text =
    tool === "Bash"
      ? str(input["command"])
      : str(input["file_path"]) || str(input["path"]) || str(input["pattern"]);
  if (/\.hizuri\/secrets\b/.test(text)) return true;
  return tool === "Bash" && /(^|[;&|(]\s*|\s)bw\s+(get|list|export|unlock|serve)\b/.test(text);
}

export function editedRuleFiles(uses: readonly ToolUseSummary[]): string[] {
  const files = uses
    .filter((u) => isEdit(u.tool))
    .map((u) => str(u.input["file_path"]))
    .filter((f) => f && ruleFile(f));
  return [...new Set(files)];
}

export function reviewerRan(uses: readonly ToolUseSummary[]): boolean {
  return uses.some(
    (u) =>
      (u.tool === "Agent" || u.tool === "Task") &&
      /skill-reviewer/.test(str(u.input["subagent_type"])),
  );
}

/** The tool uses of the current turn: everything after the last message the user typed or said. */
export function turnUses(messages: readonly SessionMessage[]): ToolUseSummary[] {
  let i = messages.length - 1;
  while (
    i >= 0 &&
    !(
      messages[i]!.role === "user" &&
      userLines(messages[i]!.text).some((l) => l.startsWith("USER ("))
    )
  )
    i--;
  return messages.slice(i + 1).flatMap((m) => (m.role === "assistant" ? m.toolUses : []));
}
