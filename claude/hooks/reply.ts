// The reply gate: the Guardian's surest checks refuse a reply before the user hears or reads it,
// instead of noting it after the fact. A spoken reply (a tool whose name ends in `__speak`) with a
// sure miss is denied before it plays, so the user never hears it; a typed reply gets one `Stop`
// block at the turn's end that sends the agent back to fix it, never when the turn already went on
// for a Stop hook. The sure misses:
//   memory-first      an ask for a card, key, payment or account before memory and the vault
//   check-dont-guess  a claim that a named tool, service or API cannot do something, with no docs
//                     look in the turn; a clock time about “now” with no clock read
// A rule refused twice within GATE_REPEAT_MS lets the next try through as a note, so a false hit
// never keeps the agent silent. Kept free of `$`: register.ts calls it with the session's messages.
import type { SessionMessage } from "claude-code";
import type { Flag } from "./guardian";
import { READ_NAMES, missingFor, textMoment, type ReadKind } from "./moments";
import { any, pattern } from "./words";

export const GATE_REPEAT_MS = 3 * 60 * 1000;
/** How long a spoken reply may wait for the session's messages before it plays unchecked. */
export const GATE_WAIT_MS = 120;
/** At a turn's end nothing plays yet: the typed reply's check may wait longer. */
export const STOP_WAIT_MS = 1000;
/** The rules whose sure misses refuse a reply unless the `guardianBlocks` option says otherwise. */
export const DEFAULT_BLOCKS = "memory-first,check-dont-guess";

export type Block = Pick<Flag, "line" | "rule" | "fix">;

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…:])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Where the turn of a reply at `index` starts: the user's latest own words at or before it. */
export function turnStart(messages: readonly SessionMessage[], index: number): number {
  for (let i = Math.min(index, messages.length - 1); i >= Math.max(0, index - 150); i--) {
    const m = messages[i];
    if (m?.role !== "user" || !m.text.trim() || (m.toolResults?.length ?? 0) > 0) continue;
    // A notice in brackets or a tag (a task notification, a reminder) is not the user's word.
    if (/^\s*<spoken-input/.test(m.text) || !/^\s*[[<]/.test(m.text)) return i;
  }
  return Math.max(0, index - 150);
}

// ── check-dont-guess: what a tool cannot do ──────────────────────────────────────────────────

// Quoted words are the user's or a label on a page, not the agent's claim.
const QUOTES = /«[^»]*»|"[^"]*"|“[^”]*”|`[^`]*`|https?:\/\/\S+|[~/][\w./-]+/g;
// A named tool, service or library: a Latin word with a capital letter, or a CLI name.
const ENTITY =
  /(?<![\p{L}\d])(?:[A-Za-z]*[A-Z][A-Za-z0-9.+-]*[A-Za-z0-9]|[a-z][a-z0-9-]*(?:ctl|cli|js|py))(?![\p{L}\d])/gu;
const NOT_ENTITY = new Set([
  "api",
  "apis",
  "cli",
  "sdk",
  "gpu",
  "cpu",
  "ram",
  "url",
  "ui",
  "ux",
  "ok",
  "ai",
  "id",
  "html",
  "css",
  "json",
  "yaml",
  "pdf",
  "llm",
  "todo",
]);
const CANNOT = pattern(
  () =>
    new RegExp(
      any(
        [
          "(?:does\\s*n[o']t|do\\s*n[o']t|does not|cannot|can'?t)\\s+(?:support|allow|do|pay|run|accept|offer|let)",
          "no\\s+(?:way|api|endpoint|option)\\s+to",
          "only\\s+(?:via|through)\\s+(?:the\\s+)?(?:web|console|dashboard|ui|site)",
        ],
        "CANNOT",
      ),
      "iu",
    ),
);
// Reporting what was just measured: a figure with a unit next to a "measured" verb.
const MEASURED = pattern(
  () =>
    new RegExp(
      `(?:${any(["measured", "benchmarked", "took", "tested"], "MEASURED")})(?!\\p{L})`,
      "iu",
    ),
);
const FIGURE = /\d[\d.,]*\s?(?:%|s(?!\p{L})|ms|GB|MB|fps|×|x(?!\p{L}))/iu;
// A docs look: Context7, a web page, a search, a `--help`, a man page, a README or docs folder read.
const DOCS_TOOL = /^mcp__context7__|^WebFetch$|^WebSearch$|^mcp__.*docs/i;
const HELP_CMD = /\s--help\b|\s-h(?:\s|$)|(?:^|\s)(?:man|tldr)\s+\S/;
const DOCS_PATH = /(?:^|\/)(?:README[^/]*|docs?\/[^\s]*)$/i;

function entitiesOf(sentence: string): string[] {
  const bare = sentence.replace(QUOTES, " ");
  // A short all-caps word is an acronym (VPN, SSH), not a product.
  return [
    ...new Set(
      [...bare.matchAll(ENTITY)]
        .map((m) => m[0])
        .filter(
          (e) => !NOT_ENTITY.has(e.toLowerCase()) && e.length >= 3 && !/^[A-Z0-9]{2,4}$/.test(e),
        ),
    ),
  ];
}

/** A docs look in messages[from..to], or running the tool itself (its result is a measurement). */
function looked(
  messages: readonly SessionMessage[],
  from: number,
  to: number,
  entity: string,
): boolean {
  const e = entity.toLowerCase();
  for (let i = Math.max(0, from); i <= to; i++) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    for (const u of m.toolUses) {
      if (DOCS_TOOL.test(u.tool)) return true;
      if (u.tool === "Read" && DOCS_PATH.test(String(u.input?.["file_path"] ?? ""))) return true;
      if (u.tool !== "Bash") continue;
      const cmd = String(u.input?.["command"] ?? "");
      if (HELP_CMD.test(cmd)) return true;
      for (const seg of cmd.split(/[;&|\n]+|\$\(/)) {
        const word =
          seg
            .trim()
            .replace(/^(?:\S+=\S+\s+|nice(?:\s+-n\s*\S+)?\s+|timeout\s+\S+\s+)*/, "")
            .split(/\s+/)[0] ?? "";
        if (word.toLowerCase().split("/").pop()!.includes(e)) return true;
      }
    }
  }
  return false;
}

/** A claim from memory that a named tool cannot do something, with no docs look in the turn. */
export function toolClaim(
  messages: readonly SessionMessage[],
  index: number,
  text: string,
): Block | null {
  const from = turnStart(messages, index);
  for (const s of sentences(text.replace(/^\s*\[[a-z:.-]+\]\s*/gi, ""))) {
    const bare = s.replace(QUOTES, " ");
    if (!CANNOT().test(bare) || (MEASURED().test(bare) && FIGURE.test(bare))) continue;
    for (const entity of entitiesOf(s)) {
      if (looked(messages, from, index, entity)) return null;
      return {
        rule: "check-dont-guess",
        line: `Said what ${entity} cannot do (“${clip(s, 90)}”) without opening its docs`,
        fix: `Check ${entity} in its official docs first, then say it`,
      };
    }
  }
  return null;
}

// ── check-dont-guess: a clock time about now ─────────────────────────────────────────────────

const CLOCK = pattern(
  () =>
    new RegExp(
      `(?<![\\d:.,/\\w])([01]?\\d|2[0-3]):([0-5]\\d)(?![\\d:]|\\s?(?:${any(["min", "sec", "s(?!\\p{L})"], "DURATION")}))`,
      "gu",
    ),
);
const DATE_CMD = /(?:^|[\s;&|(`$])(?:TZ=\S+\s+)?date(?=$|[\s;&|)`])|datetime\.now|timedatectl/m;
/** A time this close to the user's “now” (in minutes) says what time it is; one far off is a past event or a plan. */
const NOW_MINUTES = 45;
const READ_WINDOW = 1500;
const OWN_LINES = /^\s*(?:<tool_use_error>)?Guardian\b|\[hizuri-guardian\]/;

/** Minutes the user's zone is ahead of UTC at `now`. */
export function zoneOffset(now: number, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    const d = new Date(now);
    return (
      ((((h * 60 + m - (d.getUTCHours() * 60 + d.getUTCMinutes())) % 1440) + 1440 + 720) % 1440) -
      720
    );
  } catch {
    return 0;
  }
}

/**
 * A clock time about now with no clock read in the turn: a time read in a recent tool result or a
 * message is a reading, and so is a UTC time turned into the user's zone; the Guardian's own lines are not.
 */
export function clockGuess(
  messages: readonly SessionMessage[],
  index: number,
  text: string,
  now: number,
  tz: string,
): Block | null {
  const offset = zoneOffset(now, tz);
  const nowMin = Math.floor(now / 60000 + offset) % 1440;
  const minutes = (h: number, m: number) => h * 60 + m;
  const times = [...text.replace(QUOTES, " ").matchAll(CLOCK())]
    .map((m) => minutes(Number(m[1]), Number(m[2])))
    .filter((t) => Math.min(Math.abs(t - nowMin), 1440 - Math.abs(t - nowMin)) <= NOW_MINUTES);
  if (times.length === 0) return null;
  const from = turnStart(messages, index);
  const seen: string[] = [];
  for (let i = Math.max(0, index - READ_WINDOW); i <= Math.min(index, messages.length - 1); i++) {
    const m = messages[i];
    if (!m) continue;
    if (m.role === "user") {
      seen.push(m.text, ...(m.toolResults ?? []).map((r) => r.text ?? ""));
      continue;
    }
    for (const u of m.toolUses) {
      if (i >= from && u.tool === "Bash" && DATE_CMD.test(String(u.input?.["command"] ?? "")))
        return null;
      seen.push(u.text ?? "");
    }
  }
  const read = new Set(
    seen
      .map((s) =>
        s
          .split("\n")
          .filter((l) => !OWN_LINES.test(l))
          .join("\n"),
      )
      .flatMap((s) =>
        [...s.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)/g)].map((x) =>
          minutes(Number(x[1]), Number(x[2])),
        ),
      ),
  );
  const guessed = times.find(
    (t) => !read.has(t) && !read.has((((t - offset) % 1440) + 1440) % 1440),
  );
  if (guessed === undefined) return null;
  const hhmm = `${Math.floor(guessed / 60)}:${String(guessed % 60).padStart(2, "0")}`;
  return {
    rule: "check-dont-guess",
    line: `Said the time ${hhmm} with no clock read in this turn`,
    fix: `Read the clock in the user's zone first (TZ=${tz} date), then say the time`,
  };
}

// ── The gate ─────────────────────────────────────────────────────────────────────────────────

function shortReads(kinds: readonly ReadKind[]): string {
  return kinds.map((k) => READ_NAMES[k]).join(" and ");
}

/** The blocks one reply earns, of the rules allowed to block. */
export function blocksFor(
  messages: readonly SessionMessage[],
  index: number,
  text: string,
  now: number,
  tz: string,
  rules: ReadonlySet<string>,
): Block[] {
  if (rules.size === 0 || !text.trim()) return [];
  const out: Block[] = [];
  if (rules.has("memory-first")) {
    const moment = textMoment(text, index);
    const missing = moment?.kind === "account" ? missingFor(messages, moment) : [];
    if (missing.length > 0) {
      out.push({
        rule: "memory-first",
        line: `Asked the user for a card, key, payment or account (“${clip(moment!.what, 70)}”) before looking in ${shortReads(missing)}`,
        fix: `Look in ${shortReads(missing)} first; ask only if it is not there`,
      });
    }
  }
  if (rules.has("check-dont-guess")) {
    const claim = toolClaim(messages, index, text);
    if (claim) out.push(claim);
    const clock = clockGuess(messages, index, text, now, tz);
    if (clock) out.push(clock);
  }
  return out;
}

/** Drops the rules already refused twice within GATE_REPEAT_MS (they go through) and records the rest. */
export function admit(
  blocks: readonly Block[],
  denied: { rule: string; at: number }[],
  now: number,
): Block[] {
  const recent = denied.filter((d) => now - d.at < GATE_REPEAT_MS);
  const kept = blocks.filter((b) => recent.filter((d) => d.rule === b.rule).length < 2);
  denied.splice(0, denied.length, ...recent, ...kept.map((b) => ({ rule: b.rule, at: now })));
  return kept;
}

/** The refusal the agent reads in place of the spoken reply's result, or as the reason its turn goes on. */
export function blockText(blocks: readonly Block[], kind: "speak" | "chat"): string {
  const what = blocks.map((b) => `${b.line} · rule: ${b.rule}`).join("; ");
  const fix = blocks.map((b) => b.fix).join("; ");
  return kind === "speak"
    ? `Guardian stopped this spoken reply before it played (the user did not hear it): ${what}. Do this first: ${fix}. Then say it again.`
    : `Guardian: your reply went out with a miss: ${what}. Do this now: ${fix}, and correct the reply in one short message.`;
}
