import { describe, expect, mock, test, type Engine } from "claude-code/testing";
import type { On, SessionMessage } from "claude-code";
import {
  agentContext,
  touchesVault,
  buildPrompt,
  freshFix,
  isComplaint,
  noteText,
  parseAnswer,
  parseVerdicts,
  quickFlags,
  ruleFile,
  turnUses,
} from "./guardian";
import { answersIn, citedPhrases, momentsIn, readsIn, textMoment, toolMoment } from "./moments";
import { admit, clockGuess, toolClaim, zoneOffset } from "./reply";
import { setWords } from "./words";

const FLAG =
  "flag: The agent changed config.json and did not name the file · rule: name-changed-files · fix: Name /srv/app/config.json in the reply";

const MESSAGES: SessionMessage[] = [
  { role: "user", text: '<spoken-input id="p1">fix the config</spoken-input>', toolUses: [] },
  {
    role: "assistant",
    text: "Done.",
    toolUses: [
      {
        tool_use_id: "toolu_1",
        tool: "Edit",
        input: { file_path: "/srv/app/config.json" },
        text: "ok",
      },
    ],
  },
];

const START = { cwd: "/srv/app", surface: null, isInteractive: false };
const end = (turnId: string, answer = "Done.") => ({
  answer,
  durationMs: 10,
  isAborted: false,
  turnId,
  reason: "answer" as const,
});

function world(
  on: On,
  replies: string[],
  messages: SessionMessage[] = [...MESSAGES],
  { messagesThrow = false, files = {} as Record<string, string> } = {},
) {
  const logged: string[] = [];
  const asked: string[] = [];
  const writes = new Map<string, string>();
  const clock = mock.clock(on, { now: 1_792_000_000_000 });
  mock.env(on, { HOME: "/home/u", HIZURI_TIME_ZONE: "UTC" });
  mock.store(on, {});
  on("fs.read", ($, e) => {
    const path = (e as unknown as { path: string }).path;
    if (writes.has(path)) return { value: writes.get(path)! };
    if (path in files) return { value: files[path]! };
    if (path.endsWith("/rules/core.md"))
      return { value: "1. [name-changed-files] Name every changed file by full path." };
    throw new Error("ENOENT");
  });
  on("fs.write", ($, e) => {
    const w = e as unknown as { path: string; text: string };
    writes.set(w.path, w.text);
    return { value: undefined };
  });
  on("fs.list", ($, e) => {
    const dir = `${(e as unknown as { path: string }).path}/`;
    const names = Object.keys(files).filter((f) => f.startsWith(dir));
    if (!names.length) throw new Error("ENOENT");
    return {
      value: names.map((f) => ({
        name: f.slice(dir.length),
        kind: "file",
        size: files[f]!.length,
      })),
    };
  });
  on("fs.exists", () => ({ value: false }));
  on("session.id", () => ({ value: "session-1" }));
  on("session.messages", () => {
    if (messagesThrow) throw new Error("messages broke");
    return { value: [...messages] };
  });
  on("model.complete", ($, e) => {
    asked.push(e.prompt);
    const text = replies.shift() ?? "flag: none";
    const usage = {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };
    return { value: { isAnswered: true as const, text, usage } };
  });
  on("ui.log", ($, e) => {
    logged.push(e.text);
    return { value: undefined };
  });
  on("session.start", ($, e) => ({ cwd: e.cwd }));
  on("turn.complete", ($, e) => ({ text: e.answer }));
  const toolContext: (readonly string[] | undefined)[] = [];
  const promptContext: (readonly string[] | undefined)[] = [];
  on("tool.call", () => ({ result: "ok" as never }));
  on("prompt.submit", ($, e) => {
    promptContext.push(e.context);
    return { text: e.text, ...(e.context ? { context: e.context } : {}) };
  });
  const runTool = async (
    $: Engine,
    call: Record<string, unknown> = { tool: "Bash", command: "ls" },
  ) => {
    const r = await $.tool.call(call as never);
    toolContext.push((r as { context?: readonly string[] }).context);
    return r as { deny?: string; context?: readonly string[] };
  };
  const retro = () =>
    [...writes.entries()].find(([p]) => p.includes("/personal/retro/"))?.[1] ?? "";
  // The engine beneath answers a step at once, with no chunks.
  // oxlint-disable-next-line require-yield
  on("turn.step", async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: "",
      toolUses: [],
      stopReason: "end_turn",
      usage: null,
    };
  });
  on("session.compact", () => ({
    messages: [
      {
        role: "user" as const,
        text: "This session is being continued from a previous conversation.",
        toolUses: [],
      },
    ],
  }));
  const step = async ($: Engine, index: number) => {
    for await (const _chunk of $.turn.step({
      turnId: "t",
      index,
      model: "claude-opus-5-5",
      messageCount: 2,
    })) {
      // drain
    }
  };
  return {
    logged,
    asked,
    writes,
    clock,
    messages,
    toolContext,
    promptContext,
    runTool,
    retro,
    step,
  };
}

describe("reading the checker", () => {
  test("reads none, a flag, and junk", async () => {
    expect(parseAnswer("flag: none")).toEqual([{ kind: "none" }]);
    expect(parseAnswer(`${FLAG} · evidence: #7`)[0]).toEqual({
      kind: "flag",
      flag: {
        line: "The agent changed config.json and did not name the file",
        rule: "name-changed-files",
        fix: "Name /srv/app/config.json in the reply",
        evidence: "#7",
      },
    });
    expect(parseAnswer("everything is fine")[0]?.kind).toBe("unparsed");
  });

  test("the digest marks spoken input and tool calls, and skips a part with nothing from the agent", async () => {
    const prompt =
      buildPrompt({
        messages: MESSAGES,
        start: 0,
        now: "now",
        trigger: "end",
        alreadyFlagged: [],
      }) ?? "";
    expect(prompt).toContain("#0 USER (spoken): fix the config");
    expect(prompt).toContain("#1 AGENT tool Edit /srv/app/config.json");
    expect(
      buildPrompt({
        messages: MESSAGES.slice(0, 1),
        start: 0,
        now: "now",
        trigger: "end",
        alreadyFlagged: [],
      }),
    ).toBe(null);
  });

  test("a fix that redoes the past becomes the lesson; a fix still doable stays", async () => {
    expect(
      freshFix({ line: "x", rule: "reply-language", fix: "Rewrite the reply in Greek" }).fix,
    ).toMatch(/^Next time/);
    expect(freshFix({ line: "x", rule: "name-changed-files", fix: "Name the file now" }).fix).toBe(
      "Name the file now",
    );
  });

  test("an answer in the user's own script is not flagged", async () => {
    const messages: SessionMessage[] = [
      { role: "user", text: "please fix the config", toolUses: [] },
      {
        role: "assistant",
        text: "I fixed the configuration file and restarted the service for you.",
        toolUses: [],
      },
    ];
    expect(quickFlags(messages, 0)).toEqual([]);
  });
});

describe("the guards", () => {
  test("a memory search or a read counts as a look; rule files are recognised", async () => {
    const look = (command: string) =>
      readsIn(
        [
          {
            role: "assistant",
            text: "",
            toolUses: [{ tool_use_id: "a", tool: "Bash", input: { command } }],
          },
        ],
        0,
      ).kinds;
    expect(look('hizuri-recall "port daemon"').has("memory")).toBe(true);
    expect(look("ls").size).toBe(0);
    expect(look("hizuri-secret type github password").has("vault")).toBe(true);
    expect(look("cat docs/brand.md").has("brand")).toBe(true);
    expect(ruleFile("/home/u/.hizuri/personal/skills/x/SKILL.md")).toBe(true);
    expect(ruleFile("/home/u/.hizuri/personal/rules.md")).toBe(true);
    expect(ruleFile("/home/u/.hizuri/personal/USER.md")).toBe(false);
    expect(ruleFile("/repo/claude/rules/core.md")).toBe(true);
    expect(turnUses(MESSAGES).map((u) => u.tool)).toEqual(["Edit"]);
  });

  test("complaints are recognised; plain requests are not", async () => {
    expect(isComplaint("that is wrong, I told you to use the other file")).toBe(true);
    expect(isComplaint("/hizuri:refreshing-rules")).toBe(true);
    expect(isComplaint("please add a test for the parser")).toBe(false);
  });

  test("a question is seen in the text, in speech and in AskUserQuestion", async () => {
    expect(textMoment("Which port should the daemon use?")?.kind).toBe("question");
    expect(
      toolMoment("mcp__paseo__speak", { text: "[neutral] Shall I deploy it to the server?" })?.kind,
    ).toBe("question");
    expect(toolMoment("AskUserQuestion", {})?.kind).toBe("question");
    expect(textMoment("Done, the file is saved.")).toBe(null);
  });
});

describe("the vault", () => {
  test("the session key and bare bw are off limits; hizuri-secret is the way", async () => {
    expect(touchesVault("Bash", { command: "cat ~/.hizuri/secrets/bw-session" })).toBe(true);
    expect(touchesVault("Read", { file_path: "/home/u/.hizuri/secrets/memory-password" })).toBe(
      true,
    );
    expect(touchesVault("Bash", { command: "BW_SESSION=x bw get password github" })).toBe(true);
    expect(touchesVault("Bash", { command: 'hizuri-secret type "github" password' })).toBe(false);
  });
});

describe("the loop", () => {
  test(
    "a turn end posts one note, writes a retro line, and the same flag again stays quiet",
    { timeoutMs: 20000 },
    async ($, on) => {
      const w = world(on, [FLAG, FLAG]);
      await $.session.start(START);
      await $.turn.complete(end("t1"));
      await w.clock.settle();
      expect(w.logged).toEqual([
        "[hizuri-guardian] g1: The agent changed config.json and did not name the file · rule: name-changed-files · fix: Name /srv/app/config.json in the reply",
      ]);
      expect(w.retro()).toContain("g1: The agent changed config.json");
      expect(w.retro()).toContain("· rule: name-changed-files · by Guardian");
      w.messages.push(
        { role: "user", text: "again", toolUses: [] },
        { role: "assistant", text: "Done again.", toolUses: [] },
      );
      await $.turn.complete(end("t2"));
      await w.clock.settle();
      expect(w.asked.length).toBe(2);
      expect(w.logged.length).toBe(1);
    },
  );

  test("the note rides once on the next tool result", { timeoutMs: 20000 }, async ($, on) => {
    const w = world(on, [FLAG]);
    await $.session.start(START);
    await $.turn.complete(end("t1"));
    await w.clock.settle();
    await w.runTool($);
    await w.runTool($);
    expect(w.toolContext[0]?.[0]).toContain("hizuri Guardian notes");
    expect(w.toolContext[1]).toBe(undefined);
  });

  test(
    "a plain question without a look is not refused: it becomes a note the agent must answer",
    { timeoutMs: 20000 },
    async ($, on) => {
      const ask: SessionMessage = {
        role: "assistant",
        text: "",
        toolUses: [{ tool_use_id: "q", tool: "AskUserQuestion", input: { questions: [] } }],
      };
      const w = world(on, [], [{ role: "user", text: "set up the backup", toolUses: [] }, ask]);
      await $.session.start(START);
      const first = await w.runTool($, { tool: "AskUserQuestion", questions: [] });
      expect(first.deny).toBe(undefined);
      await w.clock.settle();
      expect(w.logged[0]).toContain("rule: memory-first");
      expect(w.asked.length).toBe(0); // the free pattern check: no model call
      const next = await w.runTool($);
      expect(next.context?.[0]).toContain("Guardian g7: disagree");
    },
  );

  test(
    "a question in the final answer with no look becomes a memory-first note and a retro line",
    { timeoutMs: 20000 },
    async ($, on) => {
      const messages: SessionMessage[] = [
        { role: "user", text: "set up the backup", toolUses: [] },
        { role: "assistant", text: "Where should the backups go?", toolUses: [] },
      ];
      const w = world(on, [], messages);
      await $.session.start(START);
      await $.turn.complete(end("t1", "Where should the backups go?"));
      await w.clock.settle();
      expect(w.logged.some((l) => l.includes("rule: memory-first"))).toBe(true);
      expect(w.retro()).toContain("rule: memory-first · by guard");
    },
  );

  test(
    "a complaint adds the retro and refresh instruction to the prompt",
    { timeoutMs: 20000 },
    async ($, on) => {
      const w = world(on, []);
      await $.session.start(START);
      await $.prompt.submit({
        text: "wrong again, I told you to keep the old port",
        wait: false,
        origin: { kind: "sdk" },
      });
      expect(w.promptContext[0]?.[0]).toContain("hizuri-retro add");
      expect(w.promptContext[0]?.[0]).toContain("refreshing-rules");
    },
  );

  test("writing a skill file asks for the reviewer", { timeoutMs: 20000 }, async ($, on) => {
    const w = world(on, []);
    await $.session.start(START);
    const r = await w.runTool($, {
      tool: "Write",
      file_path: "/home/u/.hizuri/personal/skills/x/SKILL.md",
      content: "---",
    });
    expect(r.context?.[0]).toContain("hizuri:skill-reviewer");
  });
});

describe("notes the agent must answer", () => {
  const said = (text: string): SessionMessage => ({ role: "user", text, toolUses: [] });
  const agent = (text: string): SessionMessage => ({ role: "assistant", text, toolUses: [] });

  test("each note has an id and says how to answer; no “they can be wrong” line", async () => {
    expect(noteText({ line: "x", rule: "memory-first", fix: "y" }, "g3")).toBe(
      "[hizuri-guardian] g3: x · rule: memory-first · fix: y",
    );
    const ctx = agentContext(
      [{ flag: { line: "x", rule: "r", fix: "y" }, at: 0, id: "g3" }],
      "UTC",
    );
    expect(ctx).toContain("g3 · ");
    expect(ctx).toContain("Guardian g7: done — <proof");
    expect(ctx).not.toContain("They can be wrong");
  });

  test(
    "an answer that holds closes the note: no reminder later",
    { timeoutMs: 30000 },
    async ($, on) => {
      const w = world(on, [FLAG, "flag: none\nanswer: g1 · ok"]);
      await $.session.start(START);
      await $.turn.complete(end("t1"));
      await w.clock.settle();
      await w.runTool($);
      w.messages.push(
        said('<spoken-input id="p14">keep the old port</spoken-input>'),
        agent("Guardian g1: disagree — the user said to keep it (p14)"),
      );
      await $.turn.complete(end("t2"));
      await w.clock.settle();
      expect(w.asked[1]).toContain("<answers>");
      expect(w.asked[1]).toContain("p14: “keep the old port”");
      w.messages.push(said("next"), agent("Done."));
      await w.step($, 1);
      await w.step($, 2);
      await $.turn.complete(end("t3"));
      await w.clock.settle();
      await w.runTool($);
      expect(w.toolContext.slice(1).every((c) => c === undefined)).toBe(true);
    },
  );

  test(
    "no answer: one reminder, then a retro line and silence",
    { timeoutMs: 30000 },
    async ($, on) => {
      const w = world(on, [FLAG]);
      await $.session.start(START);
      await $.turn.complete(end("t1"));
      await w.clock.settle();
      await w.runTool($);
      const turn = async (id: string) => {
        w.messages.push(said(`more ${id}`), agent(`Done ${id}.`));
        await w.step($, 1);
        await w.step($, 2);
        await $.turn.complete(end(id));
        await w.clock.settle();
        await w.runTool($);
      };
      await turn("a");
      expect(w.toolContext[1]?.[0]).toContain("no answer yet");
      await turn("b");
      expect(w.retro()).toContain("Guardian note g1 left unanswered");
      await turn("c");
      expect(w.toolContext.slice(2).every((c) => c === undefined)).toBe(true);
    },
  );

  test("a compaction queues the re-read note at once", { timeoutMs: 30000 }, async ($, on) => {
    const w = world(on, []);
    await $.session.start(START);
    await $.session.compact({ trigger: "auto", messages: [...w.messages] } as never);
    await w.clock.settle();
    expect(w.logged[0]).toContain("rule: reread-after-compact");
    const r = await w.runTool($);
    expect(r.context?.[0]).toContain("docs/VISION.md");
  });

  test("a site page written without the brand docs, and a hand-off with no task number", async () => {
    const write: SessionMessage = {
      role: "assistant",
      text: "",
      toolUses: [
        {
          tool_use_id: "w",
          tool: "Write",
          input: { file_path: "/srv/app/site/index.html" },
          text: "File created",
        },
      ],
    };
    expect(momentsIn([write], 0)).toEqual([
      expect.objectContaining({ kind: "public", visual: true }),
    ]);
    expect(toolMoment("Agent", { description: "x", prompt: "y" })?.kind).toBe("task");
    expect(toolMoment("Bash", { command: "git push origin main" })?.kind).toBe("public");
  });

  test("answers are found, and verdicts parse", async () => {
    const found = answersIn(
      [
        agent(
          "Guardian g1: done — named /srv/x in the reply\nGuardian g2: disagree — the user said “raise it” (p14)",
        ),
      ],
      0,
    );
    expect(found.map((a) => [a.id, a.verb])).toEqual([
      ["g1", "done"],
      ["g2", "disagree"],
    ]);
    expect(
      citedPhrases([said('<spoken-input id="p14">raise it, please</spoken-input>')], "p14"),
    ).toEqual(["p14: “raise it, please”"]);
    expect(parseVerdicts("flag: none\nanswer: g1 · ok\nanswer: g2 · missing: no proof")).toEqual([
      { id: "g1", ok: true, missing: "" },
      { id: "g2", ok: false, missing: "no proof" },
    ]);
  });
});

describe("the reply gate", () => {
  const NOW = 1_792_000_000_000; // 17:46 UTC, the world's clock
  const asked: SessionMessage = { role: "user", text: "keep the backup running", toolUses: [] };
  const said = (text: string, ...toolUses: SessionMessage["toolUses"]): SessionMessage => ({
    role: "assistant",
    text,
    toolUses,
  });
  const bash = (command: string, text = "ok") => ({
    tool_use_id: command,
    tool: "Bash",
    input: { command },
    text,
  });
  const speak = (text: string) => ({ tool: "mcp__hizuri__speak", text });
  const TOP_UP = "Please top up the storage account with $20, then I can go on.";

  test(
    "a spoken ask for money or a key before memory and the vault is refused before it plays",
    { timeoutMs: 20000 },
    async ($, on) => {
      const w = world(on, [], [asked, said("")]);
      await $.session.start(START);
      const r = await w.runTool($, speak(TOP_UP));
      expect(r.deny).toContain("Guardian stopped this spoken reply");
      expect(r.deny).toContain("rule: memory-first");
      w.messages.push(
        said("", bash('hizuri-recall "storage account"'), bash("hizuri-secret list")),
      );
      expect((await w.runTool($, speak(TOP_UP))).deny).toBe(undefined);
    },
  );

  test(
    "the third refusal of a rule goes through, the option turns the gate off, and its own error lets the reply play",
    { timeoutMs: 20000 },
    async ($, on) => {
      const denied: { rule: string; at: number }[] = [];
      const block = { rule: "memory-first", line: "x", fix: "y" };
      expect(admit([block], denied, NOW)).toHaveLength(1);
      expect(admit([block], denied, NOW + 1000)).toHaveLength(1);
      expect(admit([block], denied, NOW + 2000)).toHaveLength(0);
      expect(admit([block], denied, NOW + 4 * 60 * 1000)).toHaveLength(1);
      const w = world(on, [], [asked, said("")], { messagesThrow: true });
      await $.session.start(START);
      expect((await w.runTool($, speak(TOP_UP))).deny).toBe(undefined);
    },
  );

  test(
    "no rules in the option: notes only",
    { timeoutMs: 20000, options: { guardianBlocks: "" } },
    async ($, on) => {
      const w = world(on, [], [asked, said("")]);
      await $.session.start(START);
      expect((await w.runTool($, speak(TOP_UP))).deny).toBe(undefined);
    },
  );

  test(
    "a typed reply with a sure miss is sent back once, never while a Stop hook already continued it",
    { timeoutMs: 20000 },
    async ($, on) => {
      const w = world(on, [], [asked, said(TOP_UP)]);
      on("classic.Stop", () => ({}));
      await $.session.start(START);
      const first = await $.classic.Stop({
        stop_hook_active: false,
        last_assistant_message: TOP_UP,
      } as never);
      expect((first as { block?: string }).block).toContain("rule: memory-first");
      const again = await $.classic.Stop({
        stop_hook_active: true,
        last_assistant_message: TOP_UP,
      } as never);
      expect((again as { block?: string }).block).toBe(undefined);
      w.messages.push(said("Done."));
      const fine = await $.classic.Stop({
        stop_hook_active: false,
        last_assistant_message: "Done.",
      } as never);
      expect((fine as { block?: string }).block).toBe(undefined);
    },
  );

  test("what a tool cannot do needs its docs first; a measurement is no claim", async () => {
    const claim = "Acme does not support paying through the API.";
    expect(toolClaim([asked, said(claim)], 1, claim)?.rule).toBe("check-dont-guess");
    const docs = said("", {
      tool_use_id: "d",
      tool: "WebFetch",
      input: { url: "https://acme.example/docs" },
      text: "...",
    });
    expect(toolClaim([asked, docs, said(claim)], 2, claim)).toBe(null);
    const ran = said("", bash("acmectl pay --dry-run", "error: unsupported"));
    expect(toolClaim([asked, ran, said(claim)], 2, claim)).toBe(null);
    const measured = "Tested it twice, Acme cannot run it, 0% done in 30 s.";
    expect(toolClaim([asked, said(measured)], 1, measured)).toBe(null);
  });

  test("a clock time about now needs a clock read; a time read in a result, a plan or a duration does not", async () => {
    const now = "It is 17:50 now, starting the backup.";
    expect(clockGuess([asked, said(now)], 1, now, NOW, "UTC")?.rule).toBe("check-dont-guess");
    expect(clockGuess([asked, said("", bash("TZ=UTC date")), said(now)], 2, now, NOW, "UTC")).toBe(
      null,
    );
    const read = said("", bash("backup-status", '{"next":"17:50"}'));
    expect(clockGuess([asked, read, said(now)], 2, now, NOW, "UTC")).toBe(null);
    const plan = "The next run is at 23:00.";
    expect(clockGuess([asked, said(plan)], 1, plan, NOW, "UTC")).toBe(null);
    const length = "The clip is 17:30 min long.";
    expect(clockGuess([asked, said(length)], 1, length, NOW, "UTC")).toBe(null);
    // A UTC time read in a result counts once it is turned into the user's zone.
    const tokyoNow = "It is 2:50 now.";
    expect(zoneOffset(NOW, "Asia/Tokyo")).toBe(540);
    const utc = said("", bash("job-status", '{"at":"2026-10-14T17:50:00Z"}'));
    expect(clockGuess([asked, said(tokyoNow)], 1, tokyoNow, NOW, "Asia/Tokyo")?.rule).toBe(
      "check-dont-guess",
    );
    expect(clockGuess([asked, utc, said(tokyoNow)], 2, tokyoNow, NOW, "Asia/Tokyo")).toBe(null);
  });
});

describe("words of the user's other languages", () => {
  test("a language file adds its words to the patterns; the next set replaces them", async () => {
    expect(isComplaint("zut alors")).toBe(false);
    expect(setWords([{ COMPLAINT: ["zut alors"], QUESTION_WORD: ["quoi"] }])).toEqual([]);
    expect(isComplaint("zut alors, encore")).toBe(true);
    expect(textMoment("On garde la sauvegarde, quoi")?.kind).toBe("question");
    expect(setWords([{ COMPLAINT: [1], TYPO: ["x"] }, "words"])).toEqual([
      "COMPLAINT is not a list of words",
      "unknown key TYPO",
      "a guardian section is not an object",
    ]);
    expect(isComplaint("zut alors")).toBe(false);
    setWords([]);
  });

  test(
    "the session start reads the guardian section of each language file in the setup folder",
    { timeoutMs: 20000 },
    async ($, on) => {
      const dir = "/home/u/.hizuri/setup/languages";
      const w = world(on, [], undefined, {
        files: {
          [`${dir}/xx.json`]: JSON.stringify({ voice: {}, guardian: { COMPLAINT: ["zut alors"] } }),
          [`${dir}/yy.json`]: "{",
        },
      });
      await $.session.start(START);
      expect(w.logged).toEqual([
        `hizuri Guardian: language files in ${dir}: yy.json is not valid JSON`,
      ]);
      await $.prompt.submit({ text: "zut alors, encore", wait: false, origin: { kind: "sdk" } });
      expect(w.promptContext[0]?.[0]).toContain("refreshing-rules");
    },
  );
});
