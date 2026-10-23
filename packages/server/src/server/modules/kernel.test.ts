import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { isBackchannel, holdSignal } from "../session/voice/floor-manager.js";
import { userStopWord } from "../session/voice/barge-hold.js";
import { stopWordsOnlyOn } from "../session/voice/echo-route.js";
import { roomKind } from "../session/voice/short-phrase.js";
import { voiceMode } from "../session/voice/voice-mode.js";
import { moduleSettings } from "../voice-env.js";
import { VoiceSettingsStore } from "../voice-settings/store.js";
import type { ModuleContract } from "./contract.js";
import { createModuleKernel, type ModuleKernel } from "./kernel.js";
import { moduleVersionFile, versionIdOf, writeModuleVersion } from "./versions.js";

// The demo module: one decision, `verdict(text)`, answering a plain object.
interface Demo {
  verdict(text: string): { cut: boolean; why: string };
}

const demoContract: ModuleContract<Demo> = {
  name: "demo",
  decisions: ["verdict"],
  probes: [
    {
      decision: "verdict",
      args: ["stop"],
      check: (answer) =>
        typeof answer === "object" && answer !== null && "cut" in answer
          ? null
          : "expected { cut, why }",
    },
  ],
};

const builtIn: Demo = {
  verdict: (text) => ({ cut: text === "stop", why: "builtin" }),
};

function source(why: string, body = ""): string {
  return `export function verdict(text) { ${body} return { cut: text === "stop", why: ${JSON.stringify(why)} }; }\n`;
}

interface LogLine {
  level: "info" | "warn";
  msg: string;
  obj: Record<string, unknown>;
}

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) cleanup();
});

function setup(kernelOptions: Parameters<typeof createModuleKernel>[0] = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "module-kernel-"));
  const file = path.join(home, "voice-settings.json");
  const lines: LogLine[] = [];
  const logger = {
    info: (obj: object, msg: string) => lines.push({ level: "info", msg, obj: { ...obj } }),
    warn: (obj: object, msg: string) => lines.push({ level: "warn", msg, obj: { ...obj } }),
  };
  const store = new VoiceSettingsStore({ file, logger, env: {}, pollMs: 60_000 });
  const kernel: ModuleKernel = createModuleKernel(kernelOptions);
  cleanups.push(() => {
    kernel.stop();
    store.stop();
    rmSync(home, { recursive: true, force: true });
  });
  // A high limit by default, so a pause of the test runner never rolls a version back; the
  // tests of the limit set it.
  const base = { PASEO_MODULES: true, PASEO_MODULES_MAX_MS: 1000 };
  writeFileSync(file, JSON.stringify(base));
  store.start();
  kernel.start({ paseoHome: home, logger });
  const demo = kernel.register({ contract: demoContract, builtIn });

  /** Write voice-settings.json and apply it as the poller would. */
  async function settings(values: Record<string, unknown>): Promise<void> {
    writeFileSync(file, JSON.stringify({ ...base, ...values }));
    store.reload("test");
    await kernel.settled();
  }
  async function version(why: string, body = ""): Promise<string> {
    return writeModuleVersion({ paseoHome: home, module: "demo", source: source(why, body) });
  }
  function logged(msg: string) {
    return lines.filter((line) => line.msg === msg).map((line) => line.obj);
  }
  return { home, kernel, demo, settings, version, logged, lines };
}

describe("module kernel", () => {
  test("a version loads from $PASEO_HOME/modules/<module>/<content-hash>.mjs with import()", async () => {
    const { home, demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    expect(v1).toMatch(/^[0-9a-f]{16}$/);
    expect(moduleVersionFile({ paseoHome: home, module: "demo", version: v1 })).toBe(
      path.join(home, "modules", "demo", `${v1}.mjs`),
    );

    expect(demo.verdict("stop")).toEqual({ cut: true, why: "builtin" });
    await settings({ modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "v1" });

    // A new file is a fresh copy, not Node's cached v1.
    const v2 = await version("v2");
    await settings({ modules: { demo: { version: v2 } } });
    expect(demo.verdict("go")).toEqual({ cut: false, why: "v2" });
    expect(logged("modules.loaded")).toEqual([
      { module: "demo", version: v1 },
      { module: "demo", version: v2 },
    ]);
  });

  test("a version that does not answer its contract is refused with a clear error; the old one stays", async () => {
    const { home, kernel, demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    await settings({ modules: { demo: { version: v1 } } });

    const missing = await writeModuleVersion({
      paseoHome: home,
      module: "demo",
      source: "export function judge() { return true; }\n",
    });
    await settings({ modules: { demo: { version: missing } } });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "v1" });

    const wrongShape = await writeModuleVersion({
      paseoHome: home,
      module: "demo",
      source: "export function verdict() { return 42; }\n",
    });
    await settings({ modules: { demo: { version: wrongShape } } });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "v1" });

    const edited = await version("edited");
    writeFileSync(
      moduleVersionFile({ paseoHome: home, module: "demo", version: edited }),
      source("x"),
    );
    await settings({ modules: { demo: { version: edited } } });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "v1" });

    expect(logged("modules.refused")).toEqual([
      {
        module: "demo",
        version: missing,
        reason: "no function “verdict” (it exports: judge)",
      },
      {
        module: "demo",
        version: wrongShape,
        reason: 'verdict(["stop"]) answered 42: expected { cut, why }',
      },
      {
        module: "demo",
        version: edited,
        reason: expect.stringContaining("was changed after it was written"),
      },
    ]);
    expect(kernel.status()[0]).toMatchObject({ active: v1, pending: false });
  });

  test("a version that cannot load (bad syntax, a throw at import) is refused; nothing else breaks", async () => {
    const { home, demo, settings, logged } = setup();
    const write = (text: string) =>
      writeModuleVersion({ paseoHome: home, module: "demo", source: text });
    const syntax = await write("export function verdict( {\n");
    const throwsAtImport = await write('throw new Error("top-level failure");\n');
    await settings({ modules: { demo: { version: syntax, shadow: throwsAtImport } } });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "builtin" });
    expect(logged("modules.refused")).toEqual([
      { module: "demo", version: syntax, reason: expect.stringMatching(/^import failed: /) },
      {
        module: "demo",
        version: throwsAtImport,
        reason: "import failed: top-level failure",
      },
    ]);
  });

  test("a shadow runs on the same input, every disagreement is logged, and the outcome never changes", async () => {
    const { kernel, demo, settings, version, logged } = setup();
    const candidate = await version(
      "shadow",
      'if (text === "go") return { cut: true, why: "shadow" };',
    );
    await settings({ modules: { demo: { shadow: candidate } } });
    expect(logged("modules.shadow_started")).toEqual([
      { module: "demo", version: candidate, against: "builtin" },
    ]);

    expect(demo.verdict("go")).toEqual({ cut: false, why: "builtin" });
    expect(demo.verdict("go")).toEqual({ cut: false, why: "builtin" });
    expect(demo.verdict("stop")).toEqual({ cut: true, why: "builtin" });

    expect(logged("modules.shadow_disagree")).toEqual([
      expect.objectContaining({
        module: "demo",
        decision: "verdict",
        active: "builtin",
        shadow: candidate,
        args: ["go"],
        answer: { cut: false, why: "builtin" },
        shadowAnswer: { cut: true, why: "shadow" },
      }),
      expect.objectContaining({ args: ["go"] }),
      // "stop" differs only in `why`, which is still a disagreement.
      expect.objectContaining({ args: ["stop"], shadowAnswer: { cut: true, why: "shadow" } }),
    ]);
    expect(kernel.status()[0]).toMatchObject({
      active: "builtin",
      shadow: candidate,
      shadowCalls: 3,
      disagreements: 3,
    });
  });

  test("a shadow gets a copy of the input: one that writes into it leaves the caller's data alone", async () => {
    const { kernel, settings, home } = setup();
    interface Words {
      first(words: string[]): string;
    }
    const words = kernel.register<Words>({
      contract: { name: "words", decisions: ["first"] },
      builtIn: { first: (list) => list[0] ?? "" },
    });
    const candidate = await writeModuleVersion({
      paseoHome: home,
      module: "words",
      source: "export function first(list) { list.reverse(); return list[0]; }\n",
    });
    await settings({ modules: { words: { shadow: candidate } } });
    const input = ["a", "b"];
    expect(words.first(input)).toBe("a");
    expect(input).toEqual(["a", "b"]);
  });

  test("a switch asked mid-phrase applies at the next phrase boundary, never inside the phrase", async () => {
    const { kernel, demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    const session = {};

    kernel.phraseOpened(session);
    await settings({ modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");
    expect(kernel.status()[0]).toMatchObject({ active: "builtin", pending: true });
    expect(logged("modules.switch")).toEqual([]);

    kernel.phraseClosed(session);
    expect(demo.verdict("stop").why).toBe("v1");
    expect(logged("modules.switch")).toEqual([
      { module: "demo", from: "builtin", to: v1, reason: "settings" },
    ]);
  });

  test("with two sessions the switch waits for the last open phrase", async () => {
    const { kernel, demo, settings, version } = setup();
    const v1 = await version("v1");
    const first = {};
    const second = {};
    kernel.phraseOpened(first);
    kernel.phraseOpened(second);
    await settings({ modules: { demo: { version: v1 } } });
    kernel.phraseClosed(first);
    expect(demo.verdict("stop").why).toBe("builtin");
    kernel.phraseClosed(second);
    expect(demo.verdict("stop").why).toBe("v1");
  });

  test("a phrase left open by a dead session stops holding switches back", async () => {
    let clock = 1_000_000;
    const { kernel, demo, settings, version, logged } = setup({
      stalePhraseMs: 120_000,
      now: () => clock,
    });
    const v1 = await version("v1");
    kernel.phraseOpened({});
    await settings({ modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");

    clock += 121_000;
    await settings({ modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("v1");
    expect(logged("modules.phrase_stale")).toHaveLength(1);
  });

  test("a version that throws is switched back at once; the call is answered by the last good one", async () => {
    const { kernel, demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    await settings({ modules: { demo: { version: v1 } } });
    const broken = await version("broken", 'if (text === "boom") throw new Error("bad input");');
    await settings({ modules: { demo: { version: broken } } });
    expect(demo.verdict("stop").why).toBe("broken");

    const session = {};
    kernel.phraseOpened(session);
    // Mid-phrase: a throwing version does not wait for the boundary.
    expect(demo.verdict("boom")).toEqual({ cut: false, why: "v1" });
    expect(demo.verdict("stop").why).toBe("v1");
    expect(logged("modules.rollback")).toEqual([
      { module: "demo", from: broken, to: v1, reason: "threw in verdict: bad input", mode: "live" },
    ]);

    // The settings still pick it; it stays refused and the last good one stays in force.
    kernel.phraseClosed(session);
    await settings({ modules: { demo: { version: broken } } });
    expect(demo.verdict("stop").why).toBe("v1");
    expect(kernel.status()[0]).toMatchObject({
      active: v1,
      lastGood: v1,
      pending: false,
      refused: { [broken]: "threw in verdict: bad input" },
    });
  });

  test("the last good version survives a rollback, and a rollback from it goes to the builtin", async () => {
    const { demo, settings, version, logged } = setup();
    const v1 = await version("v1", 'if (text === "late") throw new Error("v1 fails too");');
    const v2 = await version("v2", 'if (text === "boom") throw new Error("v2 fails");');
    await settings({ modules: { demo: { version: v1 } } });
    await settings({ modules: { demo: { version: v2 } } });

    expect(demo.verdict("boom").why).toBe("v1");
    expect(demo.verdict("go").why).toBe("v1");
    expect(demo.verdict("late").why).toBe("builtin");
    expect(logged("modules.rollback").map(({ from, to }) => ({ from, to }))).toEqual([
      { from: v2, to: v1 },
      { from: v1, to: "builtin" },
    ]);
  });

  test("a decision slower than 5 ms switches back; the limit is the PASEO_MODULES_MAX_MS knob", async () => {
    const { demo, settings, version, logged } = setup();
    const busy = "const until = performance.now() + 20; while (performance.now() < until) {}";
    const slow = await version("slow", busy);
    await settings({ PASEO_MODULES_MAX_MS: 5, modules: { demo: { version: slow } } });

    // The slow answer is still the answer of this call; the next one is the builtin's.
    expect(demo.verdict("go").why).toBe("slow");
    expect(demo.verdict("go").why).toBe("builtin");
    expect(logged("modules.rollback")).toEqual([
      {
        module: "demo",
        from: slow,
        to: "builtin",
        reason: expect.stringMatching(/^one decision took \d+\.\d\d ms \(limit 5 ms\)$/),
        mode: "live",
      },
    ]);

    const slowToo = await version("slow-too", busy);
    await settings({ PASEO_MODULES_MAX_MS: 200, modules: { demo: { version: slowToo } } });
    expect(demo.verdict("go").why).toBe("slow-too");
    expect(demo.verdict("go").why).toBe("slow-too");
  });

  test("a shadow that throws or is slow is dropped; the version in force keeps deciding", async () => {
    const { kernel, demo, settings, version, logged } = setup();
    // Throws only on "go", so it passes the contract's probe and is shadowed.
    const throwing = await version("t", 'if (text === "go") throw new Error("shadow broke");');
    await settings({ modules: { demo: { shadow: throwing } } });
    expect(demo.verdict("go").why).toBe("builtin");
    expect(kernel.status()[0]).toMatchObject({ shadow: null });

    const slow = await version(
      "s",
      "const until = performance.now() + 20; while (performance.now() < until) {}",
    );
    await settings({ PASEO_MODULES_MAX_MS: 5, modules: { demo: { shadow: slow } } });
    expect(demo.verdict("go").why).toBe("builtin");
    expect(kernel.status()[0]).toMatchObject({ shadow: null });
    expect(logged("modules.rollback")).toEqual([
      {
        module: "demo",
        from: throwing,
        to: "builtin",
        reason: "threw in verdict: shadow broke",
        mode: "shadow",
      },
      expect.objectContaining({ from: slow, to: "builtin", mode: "shadow" }),
    ]);
  });

  test("with PASEO_MODULES off every call goes to the builtin and nothing is loaded", async () => {
    const { demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    await settings({ PASEO_MODULES: false, modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");
    expect(logged("modules.loaded")).toEqual([]);

    await settings({ PASEO_MODULES: true, modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("v1");

    // Off again: back to the builtin at once, no restart.
    await settings({ PASEO_MODULES: false, modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");
  });

  test("taking the version out of the settings switches back to the builtin", async () => {
    const { demo, settings, version, logged } = setup();
    const v1 = await version("v1");
    await settings({ modules: { demo: { version: v1 } } });
    await settings({});
    expect(demo.verdict("stop").why).toBe("builtin");
    expect(logged("modules.switch").map(({ from, to }) => `${from}->${to}`)).toEqual([
      `builtin->${v1}`,
      `${v1}->builtin`,
    ]);
  });

  test("a module's own settings are its section of voice-settings.json, read through voice-env", async () => {
    const { settings } = setup();
    await settings({ modules: { demo: { settings: { holdMs: 400, words: ["stop"] } } } });
    expect(moduleSettings("demo")).toEqual({ holdMs: 400, words: ["stop"] });
    expect(moduleSettings("other")).toEqual({});
  });

  test("the limit is 5 ms by default: 4.9 ms stays, 5.1 ms switches back", async () => {
    const times: number[] = [];
    const { demo, settings, version, logged } = setup({ now: () => times.shift() ?? 0 });
    const v1 = await version("v1");
    await settings({ PASEO_MODULES_MAX_MS: undefined, modules: { demo: { version: v1 } } });
    times.push(0, 4.9);
    expect(demo.verdict("go").why).toBe("v1");
    times.push(10, 15.1);
    expect(demo.verdict("go").why).toBe("v1");
    expect(demo.verdict("go").why).toBe("builtin");
    expect(logged("modules.rollback")).toEqual([
      expect.objectContaining({ reason: "one decision took 5.10 ms (limit 5 ms)" }),
    ]);
  });

  test("a rollback never puts a refused version back in force", async () => {
    const { demo, settings, version, logged } = setup();
    const v1 = await version("v1", 'if (text === "x") throw new Error("v1 fails on x");');
    const v2 = await version("v2", 'if (text === "y") throw new Error("v2 fails on y");');
    await settings({ modules: { demo: { version: v1 } } });
    // v1 is now the last good version and also the shadow of v2.
    await settings({ modules: { demo: { version: v2, shadow: v1 } } });
    expect(demo.verdict("x").why).toBe("v2");
    expect(demo.verdict("y").why).toBe("builtin");
    expect(logged("modules.rollback").map(({ from, to, mode }) => ({ from, to, mode }))).toEqual([
      { from: v1, to: v2, mode: "shadow" },
      { from: v2, to: "builtin", mode: "live" },
    ]);
  });

  test("when the last good version throws on the same input too, the builtin answers", async () => {
    const { demo, settings, version, logged } = setup();
    const v1 = await version("v1", 'if (text === "boom") throw new Error("v1");');
    const v2 = await version("v2", 'if (text === "boom") throw new Error("v2");');
    await settings({ modules: { demo: { version: v1 } } });
    await settings({ modules: { demo: { version: v2 } } });
    expect(demo.verdict("boom")).toEqual({ cut: false, why: "builtin" });
    expect(logged("modules.rollback").map(({ from, to }) => `${from}->${to}`)).toEqual([
      `${v2}->${v1}`,
      `${v1}->builtin`,
    ]);
  });

  test("a version whose file is missing is not refused: it loads once the file exists and the entry changes", async () => {
    const { home, demo, settings, logged } = setup();
    const text = source("late");
    const late = versionIdOf(text);
    await settings({ modules: { demo: { version: late } } });
    expect(demo.verdict("stop").why).toBe("builtin");
    expect(logged("modules.unreadable")).toEqual([
      { module: "demo", version: late, reason: expect.stringContaining("ENOENT") },
    ]);
    expect(logged("modules.refused")).toEqual([]);

    await writeModuleVersion({ paseoHome: home, module: "demo", source: text });
    await settings({ modules: { demo: { version: late, settings: { retry: 1 } } } });
    expect(demo.verdict("stop").why).toBe("late");
  });

  test("an async version is refused at load, and a Promise answer in use rolls back without an unhandled rejection", async () => {
    const { home, kernel, demo, settings, logged } = setup();
    const asyncVersion = await writeModuleVersion({
      paseoHome: home,
      module: "demo",
      source:
        'export async function verdict(text) { return { cut: text === "stop", why: "a" }; }\n',
    });
    await settings({ modules: { demo: { version: asyncVersion } } });
    expect(demo.verdict("stop").why).toBe("builtin");
    expect(logged("modules.refused")).toEqual([
      {
        module: "demo",
        version: asyncVersion,
        reason: "verdict answered a Promise; decisions answer at once",
      },
    ]);

    // No probe guards this module: the Promise shows up in use.
    const late = kernel.register<{ size(n: number): number }>({
      contract: { name: "late", decisions: ["size"] },
      builtIn: { size: (n) => n },
    });
    const rejecting = await writeModuleVersion({
      paseoHome: home,
      module: "late",
      source: 'export function size() { return Promise.reject(new Error("later")); }\n',
    });
    await settings({ modules: { late: { version: rejecting } } });
    expect(late.size(3)).toBe(3);
    expect(logged("modules.rollback")).toEqual([
      {
        module: "late",
        from: rejecting,
        to: "builtin",
        reason: "threw in size: size answered a Promise; decisions answer at once",
        mode: "live",
      },
    ]);
  });

  test("a version in force gets a copy of the input: one that writes into it leaves the caller's data alone", async () => {
    const { kernel, settings, home } = setup();
    const words = kernel.register<{ first(words: string[]): string }>({
      contract: { name: "words", decisions: ["first"] },
      builtIn: { first: (list) => list[0] ?? "" },
    });
    const writer = await writeModuleVersion({
      paseoHome: home,
      module: "words",
      source: "export function first(list) { list.reverse(); return list[0]; }\n",
    });
    await settings({ modules: { words: { version: writer } } });
    const input = ["a", "b"];
    expect(words.first(input)).toBe("b");
    expect(input).toEqual(["a", "b"]);
  });

  test("PASEO_MODULES turned on mid-phrase takes effect when the phrase closes", async () => {
    const { kernel, demo, settings, version } = setup();
    const v1 = await version("v1");
    await settings({ modules: { demo: { version: v1 } } });
    await settings({ PASEO_MODULES: false, modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");

    const session = {};
    kernel.phraseOpened(session);
    await settings({ PASEO_MODULES: true, modules: { demo: { version: v1 } } });
    expect(demo.verdict("stop").why).toBe("builtin");
    kernel.phraseClosed(session);
    expect(demo.verdict("stop").why).toBe("v1");
  });

  test("a shadow the settings replace stops at once, even while the next one fails to load", async () => {
    const { kernel, home, demo, settings, version, logged } = setup();
    const first = await version("first");
    await settings({ modules: { demo: { shadow: first } } });
    const broken = await writeModuleVersion({
      paseoHome: home,
      module: "demo",
      source: "export function judge() {}\n",
    });
    await settings({ modules: { demo: { shadow: broken } } });
    demo.verdict("go");
    expect(kernel.status()[0]).toMatchObject({ shadow: null, shadowCalls: 0, pending: false });
    expect(logged("modules.shadow_stopped")).toEqual([
      { module: "demo", version: first, reason: "settings" },
    ]);
  });

  test("the kernel's files load in the speech worker's strip-only TypeScript mode", () => {
    // The speech worker runs these through the daemon's settings store with
    // --experimental-strip-types, which rejects TypeScript that needs a compile (parameter
    // properties, enums); one such line stops the worker and with it the voice.
    const server = path.join(import.meta.dirname, "..");
    const files = [
      ...readdirSync(import.meta.dirname)
        .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
        .map((name) => path.join(import.meta.dirname, name)),
      path.join(server, "voice-env.ts"),
      path.join(server, "voice-settings", "store.ts"),
      path.join(server, "voice-settings", "knobs.ts"),
    ];
    const failing = files.filter((file) => {
      try {
        stripTypeScriptTypes(readFileSync(file, "utf8"));
        return false;
      } catch {
        return true;
      }
    });
    expect(failing.map((file) => path.relative(server, file))).toEqual([]);
  });

  test("a TurnRules contract fits today's pure turn-rule exports (stage 3 wraps them)", () => {
    const turnRules = {
      holdSignal,
      isBackchannel,
      userStopWord,
      stopWordsOnlyOn,
      roomKind,
      voiceMode,
    };
    type TurnRules = typeof turnRules;
    const { kernel } = setup();
    const rules = kernel.register<TurnRules>({
      contract: {
        name: "turn-rules",
        decisions: [
          "holdSignal",
          "isBackchannel",
          "userStopWord",
          "stopWordsOnlyOn",
          "roomKind",
          "voiceMode",
        ],
      },
      builtIn: turnRules,
    });
    expect(rules.isBackchannel("mhm")).toBe(isBackchannel("mhm"));
    expect(rules.roomKind(-60, -45)).toBe(roomKind(-60, -45));
    expect(rules.voiceMode("speaker", "quiet", false)).toEqual(
      voiceMode("speaker", "quiet", false),
    );
  });
});
