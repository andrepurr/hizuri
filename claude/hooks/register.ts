// hizuri: the self-learning loop, run by the agent alone.
//
// 1. Guardian: once N model requests of the main agent passed since the last check (every 2nd for a
//    while after a compaction) and once when a turn ends, a small model reads the steps since the
//    last check against the rules (`rules/core.md` plus the user's `~/.hizuri/personal/rules.md`),
//    beside free pattern checks; at each trigger moment (a question to the user, a sign-up, card or
//    key, something new or public, a hand-off) the free check of what was read first runs at once.
//    Each new flag becomes note gN: a guardian note card (`$.ui.log`), a
//    dated retro line, and a line in the agent's own context on its next tool result or the user's
//    next prompt. The agent must answer each note in one line; the next check judges the answer,
//    reminds once, then logs it as ignored (core.ts). Nothing is awaited on the turn's own path.
// 2. Guards, with no model call: a complaint (retro line and refresh check), a rule or skill file
//    written without the reviewer, and the vault (a secret must never enter a transcript).
// 3. The reply gate (reply.ts): the surest misses of the rules in the `guardianBlocks` option refuse
//    the reply itself, a spoken one before it plays and a typed one with one Stop block. Its own
//    failure, a slow read or a third refusal of the same rule lets the reply through.
import type { EngineInterface, Register, SessionMessage } from "claude-code";
import {
  check,
  newState,
  onCompacted,
  postNotes,
  stamp,
  stepEvery,
  takeForAgent,
  type Io,
  type Trigger,
} from "./core";
import {
  editedRuleFiles,
  isComplaint,
  isEdit,
  reviewerRan,
  role,
  ruleFile,
  touchesVault,
  turnUses,
} from "./guardian";
import { toolMoment } from "./moments";
import { DEFAULT_BLOCKS, GATE_WAIT_MS, STOP_WAIT_MS, admit, blockText, blocksFor } from "./reply";
import { setWords } from "./words";

type Engine = EngineInterface;
const LOG_KEEP = 3000;
// A hooks module may import nothing but its own files, so no fileURLToPath: decode by hand.
const RULES = decodeURIComponent(new URL("../rules/core.md", import.meta.url).pathname);

// One session per process, so the module's own variables are this session's.
const state = newState();
const run = {
  logLines: [] as string[],
  running: null as Promise<void> | null,
  pending: null as { trigger: Trigger; turnId: string } | null,
  stepModel: "",
  skipModels: ["haiku"],
  complaint: false,
  /** The rules whose sure misses refuse a reply, and the refusals of the last minutes by rule. */
  blocks: new Set<string>(),
  denied: [] as { rule: string; at: number }[],
  /** Replies the gate already refused, so the next look does not refuse them twice. */
  refused: [] as string[],
};

/** ISO week of a date in the user's zone, as the retro log names its files: 2026-W43. */
export function isoWeek(ms: number, tz: string): string {
  const day = stamp(ms, tz).slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  // The ISO week is the one holding this week's Thursday.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The session's messages; none in a mode that binds no session (a print run that never started). */
async function sessionMessages($: Engine): Promise<readonly SessionMessage[]> {
  try {
    const messages = await $.session.messages();
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
}

async function log($: Engine, record: Record<string, unknown>): Promise<void> {
  if (!state.home) return;
  run.logLines.push(JSON.stringify(record));
  if (run.logLines.length > LOG_KEEP) run.logLines = run.logLines.slice(-LOG_KEEP);
  await $.fs
    .write(`${state.home}/guardian/${state.sessionId}.jsonl`, run.logLines.join("\n") + "\n")
    .catch(() => undefined);
}

/**
 * The Guardian's words in the user's other languages (words.ts): the "guardian" section of each
 * `<home>/setup/languages/<code>.json`. A file that does not parse is named on the screen.
 */
async function loadWords($: Engine, home: string): Promise<void> {
  const dir = `${home}/setup/languages`;
  const entries = await $.fs.list(dir).catch(() => []);
  const sections: unknown[] = [];
  const problems: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
    const text = await $.fs.read(`${dir}/${entry.name}`).catch(() => null);
    try {
      const parsed: unknown = typeof text === "string" ? JSON.parse(text) : null;
      const section = (parsed as { guardian?: unknown } | null)?.guardian;
      if (section !== undefined) sections.push(section);
    } catch {
      problems.push(`${entry.name} is not valid JSON`);
    }
  }
  problems.push(...setWords(sections));
  if (problems.length)
    $.ui.log(`hizuri Guardian: language files in ${dir}: ${problems.join("; ")}`);
}

/** One dated line in this week's retro log, the file the weekly retro reads. */
async function retroLine($: Engine, text: string, by: string): Promise<void> {
  if (!state.home) return;
  const now = await $.clock.now();
  const file = `${state.home}/personal/retro/${isoWeek(now, state.tz)}.md`;
  const before = await $.fs.read(file).catch(() => "");
  const head =
    typeof before === "string" && before
      ? before.replace(/\n*$/, "\n")
      : `# Retro log ${isoWeek(now, state.tz)}\n\n`;
  await $.fs
    .write(
      file,
      `${head}- ${stamp(now, state.tz)} · ${text.replace(/\s+/g, " ").trim()} · by ${by}\n`,
    )
    .catch(() => undefined);
}

function ioOf($: Engine): Io {
  return {
    now: () => $.clock.now(),
    messages: () => sessionMessages($),
    storeGet: (key) => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value as never),
    complete: (request) => $.model.complete(request),
    uiLog: (text) => $.ui.log(text),
    exists: (path) => $.fs.exists(path),
    log: (record) => log($, record),
    retro: (text, by) => retroLine($, text, by),
  };
}

/** Runs one check beside the turn; a turn end or a moment that arrives meanwhile is checked right after it. */
function launch($: Engine, trigger: Trigger, turnId: string, step: number): void {
  const model = run.stepModel.toLowerCase();
  if (run.skipModels.some((word) => word && model.includes(word))) return;
  if (run.running) {
    if (trigger === "end" || (trigger === "moment" && run.pending?.trigger !== "end"))
      run.pending = { trigger, turnId };
    return;
  }
  run.running = check(ioOf($), state, trigger, turnId, step)
    .catch((err) =>
      log($, {
        at: new Date().toISOString(),
        session: state.sessionId,
        turnId,
        trigger,
        outcome: `error:${String(err).slice(0, 200)}`,
      }),
    )
    .finally(() => {
      run.running = null;
      const pending = run.pending;
      run.pending = null;
      if (pending) launch($, pending.trigger, pending.turnId, -1);
    });
}

/**
 * The gate on one reply: the refusal text when a blocking rule is surely broken, else null. A spoken
 * reply is the in-flight tool use; a typed one is the turn's last message. Never throws: any error,
 * a skipped model or a messages read slower than the wait lets the reply through.
 */
async function gate(
  $: Engine,
  target: { kind: "speak"; toolUseId: string; text: string } | { kind: "chat" },
): Promise<string | null> {
  if (!state.system || run.blocks.size === 0) return null;
  if (run.skipModels.some((word) => word && run.stepModel.toLowerCase().includes(word)))
    return null;
  const t0 = Date.now();
  try {
    const messages = await Promise.race([
      sessionMessages($),
      $.clock.sleep(target.kind === "speak" ? GATE_WAIT_MS : STOP_WAIT_MS).then(() => null),
    ]);
    if (!messages || messages.length === 0) return null;
    let index = messages.length - 1;
    let text = "";
    let key = "";
    if (target.kind === "speak") {
      const at = messages.findLastIndex(
        (m) => m.role === "assistant" && m.toolUses.some((u) => u.tool_use_id === target.toolUseId),
      );
      if (at >= 0) index = at;
      text = target.text;
      key = `speak:${target.toolUseId}`;
    } else {
      const last = messages[index];
      if (last?.role !== "assistant") return null;
      text = last.text;
      key = `chat:${text.slice(0, 160)}`;
    }
    if (run.refused.includes(key)) return null;
    const now = await $.clock.now();
    const blocks = admit(
      blocksFor(messages, index, text, now, state.tz, run.blocks),
      run.denied,
      now,
    );
    if (blocks.length === 0) return null;
    run.refused = [...run.refused.slice(-99), key];
    void log($, {
      at: new Date(now).toISOString(),
      session: state.sessionId,
      trigger: "gate",
      reply: target.kind,
      outcome: "block",
      rules: blocks.map((b) => b.rule),
      ms: Date.now() - t0,
    });
    return blockText(blocks, target.kind);
  } catch (err) {
    void log($, {
      at: new Date().toISOString(),
      session: state.sessionId,
      trigger: "gate",
      outcome: `error:${String(err).slice(0, 200)}`,
    });
    return null;
  }
}

function resultText(result: unknown): string {
  const t = (result as { text?: unknown } | null)?.text;
  return typeof t === "string" ? t : "";
}

export const register: Register = (on, options) => {
  state.settings = {
    model: String(options["guardianModel"] ?? "haiku"),
    every: Math.max(1, Number(options["guardianEvery"] ?? 6)),
    language: String(options["language"] ?? "English"),
    denseEvery: 2,
    denseSteps: 30,
    denseMs: 30 * 60 * 1000,
  };
  run.blocks = new Set(
    String(options["guardianBlocks"] ?? DEFAULT_BLOCKS)
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean),
  );

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    const settings = state.settings;
    const home = (await $.env.get("HIZURI_HOME")) ?? `${(await $.env.get("HOME")) ?? ""}/.hizuri`;
    await loadWords($, home.replace(/\/$/, ""));
    if (!settings || (await $.env.get("HIZURI_GUARDIAN")) === "off") return result;
    state.home = home.replace(/\/$/, "");
    state.tz =
      (await $.env.get("HIZURI_TIME_ZONE")) ??
      (await $.env.get("TZ")) ??
      Intl.DateTimeFormat().resolvedOptions().timeZone ??
      "UTC";
    const core = await $.fs.read(RULES).catch(() => null);
    if (typeof core !== "string" || !core.trim()) return result;
    const personal = await $.fs.read(`${state.home}/personal/rules.md`).catch(() => "");
    state.system = `${role(settings.language)}\n\n<rules>\n${core.trim()}\n${typeof personal === "string" ? personal.trim() : ""}\n</rules>`;
    state.sessionId = await $.session.id();
    const previous = await $.fs
      .read(`${state.home}/guardian/${state.sessionId}.jsonl`)
      .catch(() => "");
    run.logLines = typeof previous === "string" ? previous.split("\n").filter(Boolean) : [];
    // Notes still waiting from before a restart keep their ids and reach the agent as before.
    const books = (await $.store.get("notes")) as
      | Record<string, { open?: { queuedAt?: number }[] }>
      | undefined;
    state.queued = (books?.[state.sessionId]?.open ?? []).filter(
      (n) => n.queuedAt !== undefined,
    ).length;
    return result;
  });

  on("turn.step", async function* ($, e, next) {
    if (e.agentId === undefined) {
      run.stepModel = e.model;
      state.steps += 1;
      state.sinceCheck += 1;
      if (state.system && state.sinceCheck >= stepEvery(state))
        launch($, "step", e.turnId, e.index);
    }
    return yield* next(e);
  });

  on("tool.call", async ($, e, next) => {
    if (!state.system || e.agentId !== undefined) return next(e);
    const input = e as unknown as Record<string, unknown>;
    // secrets: the vault is reached through hizuri-secret only, so a value never enters a transcript.
    if (touchesVault(e.tool, input)) {
      return {
        deny: "Secrets stay in the vault: use hizuri-secret (type, pipe or env), never the session key or bare bw.",
      };
    }
    if (e.tool.endsWith("__speak")) {
      const refused = await gate($, {
        kind: "speak",
        toolUseId: e.tool_use_id,
        text: String(input["text"] ?? ""),
      });
      if (refused) return { deny: refused };
    }
    const result = await next(e);
    if (result.deny !== undefined) return result;
    // A trigger moment gets the free pattern check at once (no model call).
    if (toolMoment(e.tool, input, -1, resultText(result))) launch($, "moment", "", -1);
    const context: string[] = [];
    const file = String(input["file_path"] ?? "");
    if (isEdit(e.tool) && ruleFile(file)) {
      context.push(
        `You changed ${file}, a rule or skill file. Follow the writing-skills skill, and before you finish launch the hizuri:skill-reviewer agent on it (Agent tool, subagent_type "hizuri:skill-reviewer") and apply what it finds.`,
      );
    }
    const notes = await takeForAgent(ioOf($), state, "tool-result");
    if (notes) context.push(notes);
    return context.length > 0
      ? { ...result, context: [...(result.context ?? []), ...context] }
      : result;
    // A guard that fails lets the call or the prompt through unchanged (the mods API .catch).
    // oxlint-disable-next-line promise/no-callback-in-promise
  }).catch(($, e, next) => next(e));

  on("prompt.submit", async ($, e, next) => {
    if (!state.system) return next(e);
    const context: string[] = [];
    run.complaint = isComplaint(e.text);
    if (run.complaint) {
      context.push(
        "hizuri: this sounds like a complaint about your last reply. Before anything else run the refreshing-rules skill: re-read the rules, find every break without asking, log one retro line per break (hizuri-retro add), redo the reply. If it is not a complaint, carry on.",
      );
    }
    const notes = await takeForAgent(ioOf($), state, "prompt");
    if (notes) context.push(notes);
    return next(context.length > 0 ? { ...e, context: [...(e.context ?? []), ...context] } : e);
    // A guard that fails lets the call or the prompt through unchanged (the mods API .catch).
    // oxlint-disable-next-line promise/no-callback-in-promise
  }).catch(($, e, next) => next(e));

  // A typed reply with a sure miss: the turn goes on once so the agent fixes it; never a second round.
  on("classic.Stop", async ($, e, next) => {
    const result = await next(e);
    if (!state.system || e.stop_hook_active || result.block !== undefined) return result;
    const refused = await gate($, { kind: "chat" });
    return refused ? { ...result, block: refused } : result;
    // oxlint-disable-next-line promise/no-callback-in-promise
  }).catch(($, e, next) => next(e));

  // A compaction of the main conversation: the re-read note goes out at once, checks get denser.
  on("session.compact", async ($, e, next) => {
    const result = await next(e);
    if (
      state.system &&
      e.agentId === undefined &&
      e.trigger !== "precompute" &&
      result.messages !== undefined
    ) {
      onCompacted(ioOf($), state, "event").catch((err) =>
        log($, {
          at: new Date().toISOString(),
          session: state.sessionId,
          outcome: `error:${String(err).slice(0, 200)}`,
        }),
      );
    }
    return result;
    // oxlint-disable-next-line promise/no-callback-in-promise
  }).catch(($, e, next) => next(e));

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    if (!state.system || e.agentId !== undefined || e.isAborted) return result;
    state.turnEnds += 1;
    launch($, "end", e.turnId, -1);
    const uses = turnUses(await sessionMessages($));
    const edited = editedRuleFiles(uses);
    if (edited.length > 0 && !reviewerRan(uses)) {
      await postNotes(
        ioOf($),
        state,
        [
          {
            line: `Changed ${edited.join(", ")} without the skill reviewer`,
            rule: "reviewed-rules",
            fix: "Launch the hizuri:skill-reviewer agent on these files now",
          },
        ],
        "guard",
      );
    }
    if (
      run.complaint &&
      !uses.some(
        (u) => u.tool === "Bash" && /\bhizuri-retro\s+add\b/.test(String(u.input["command"] ?? "")),
      )
    ) {
      await retroLine(
        $,
        "The user complained; the agent wrote no retro line for it · rule: retro-line",
        "guard",
      );
    }
    run.complaint = false;
    return result;
  });
};
