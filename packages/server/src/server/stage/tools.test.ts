import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { registerShowTools } from "../show-tools/tools.js";
import { createShowStageMirror } from "./show-mirror.js";
import { StageStore } from "./store.js";
import { registerStageTools } from "./tools.js";

const logger = pino({ level: "silent" });
const AGENT = "zuri";

interface RegisteredTool {
  config: PaseoToolConfig;
  handler: (args: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>;
}

let home: string;
let store: StageStore;
let tools: Map<string, RegisteredTool>;

function call(name: string, args: unknown): Promise<PaseoToolResult> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(args, {});
}

function textOf(result: PaseoToolResult): string {
  return result.content.map((part) => part.text ?? "").join("");
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "stage-tools-"));
  store = new StageStore({ paseoHome: home, logger });
  tools = new Map();
  const registerTool = (
    name: string,
    config: PaseoToolConfig,
    handler: RegisteredTool["handler"],
  ) => tools.set(name, { config, handler });
  registerStageTools({ registerTool, store, owner: AGENT, callerAgentId: AGENT });
  registerShowTools({
    registerTool,
    usage: null,
    stage: createShowStageMirror({ store, owner: AGENT, logger }),
  });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("stage tools", () => {
  test("stage_open draws blocks and names every block id for later updates", async () => {
    const result = await call("stage_open", {
      title: "Lamps",
      tab: "lamps",
      blocks: [
        { type: "text", props: { text: "Three under €100", size: "title" } },
        {
          type: "row",
          children: [
            { type: "offer", id: "orbit", props: { title: "Orbit", price: "€89" } },
            { type: "offer", props: { title: "Halo", price: "€79" } },
          ],
        },
      ],
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      tab: "lamps",
      version: 1,
      blockIds: ["b1", "b2", "orbit", "b3"],
    });
    const stage = await store.get(AGENT);
    expect(stage.tabs[0]?.blocks[1]).toMatchObject({
      type: "row",
      children: [{ id: "orbit", fallback: "Orbit — €89" }, { id: "b3" }],
    });
  });

  test("a wrong block comes back to the assistant with the exact place and reason", async () => {
    const chart = await call("stage_open", {
      title: "Trend",
      blocks: [
        {
          type: "stack",
          children: [
            {
              type: "chart",
              props: {
                kind: "line",
                x: ["a", "b", "c", "d"],
                series: [{ name: "s", values: [1, 2, 3] }],
              },
            },
          ],
        },
      ],
    });
    expect(chart.isError).toBe(true);
    expect(textOf(chart)).toBe(
      "blocks[0].children[0] (chart): series[0].values has 3 values, x has 4",
    );

    const unknown = await call("stage_open", { title: "Map", blocks: [{ type: "map" }] });
    expect(textOf(unknown)).toContain("unknown block type “map”; known: stat, progress, card");

    const typo = await call("stage_open", {
      title: "Typo",
      blocks: [{ type: "stat", props: { label: "Balance", value: "€1", colour: "red" } }],
    });
    expect(textOf(typo)).toContain("blocks[0] (stat):");
    expect(textOf(typo)).toContain("colour");
  });

  test("the main tab can be neither replaced nor closed", async () => {
    for (const tab of ["chat", "main", "face"]) {
      const closed = await call("stage_close", { tab });
      expect(closed.isError).toBe(true);
      expect(textOf(closed)).toContain("is the main tab (your face and the chat)");
    }
    const opened = await call("stage_open", {
      title: "Chat",
      blocks: [{ type: "text", props: { text: "x" } }],
    });
    expect(textOf(opened)).toContain("“chat” is the main tab");
  });

  test("stage_update moves a bound number in place and replaces a block by id", async () => {
    await call("stage_open", {
      title: "Build",
      blocks: [
        { type: "progress", id: "apk", bind: { percent: "/percent" }, props: { label: "APK" } },
        { type: "card", id: "note", props: { title: "Note", body: "started" } },
      ],
      data: { percent: 5 },
    });
    const update = await call("stage_update", {
      tab: "build",
      set: { "/percent": 64 },
      replace: [{ type: "card", id: "note", props: { title: "Note", body: "gradle" } }],
      append: [{ type: "steps", props: { steps: [{ label: "sign", state: "todo" }] } }],
    });
    expect(update.structuredContent).toMatchObject({ version: 2, blockIds: ["b1"] });
    const tab = (await store.get(AGENT)).tabs[0]!;
    expect(tab.data).toEqual({ percent: 64 });
    expect(tab.blocks.map((block) => block.id)).toEqual(["apk", "note", "b1"]);

    const missing = await call("stage_update", {
      tab: "build",
      replace: [{ type: "card", id: "ghost", props: { title: "x", body: "y" } }],
    });
    expect(textOf(missing)).toBe(
      "replace[0] needs the id of a block in tab “build”; its blocks: apk, note, b1",
    );
  });

  test("a template opens filled with data", async () => {
    const result = await call("stage_open", {
      title: "Limits",
      template: "limits",
      data: { usage: [{ sourceId: "claude" }] },
    });
    expect(result.isError).toBeUndefined();
    const tab = (await store.get(AGENT)).tabs[0]!;
    expect(tab.blocks[0]).toMatchObject({ type: "limits", bind: { sources: "/usage" } });
    expect(tab.data).toEqual({ usage: [{ sourceId: "claude" }] });
  });

  test("stage_blocks picks blocks by tag and lists the templates", async () => {
    const result = await call("stage_blocks", { tags: ["money"] });
    const catalogue = result.structuredContent as {
      blocks: Array<{ type: string; props: { properties?: Record<string, unknown> } }>;
      templates: Array<{ name: string }>;
    };
    expect(catalogue.blocks.map((block) => block.type)).toEqual([
      "stat",
      "chart",
      "offer",
      "figure",
    ]);
    expect(Object.keys(catalogue.blocks[0]!.props.properties ?? {})).toContain("delta");
    expect(catalogue.templates.map((template) => template.name)).toEqual([
      "limits",
      "status",
      "result",
      "compare",
    ]);
  });

  test("stage_focus switches the main tab's view; stage_list shows what the user looks at", async () => {
    await call("stage_open", { title: "Pics", blocks: [{ type: "text", props: { text: "x" } }] });
    await call("stage_focus", { view: "face", bubble: true });
    await store.reportFocus(AGENT, { focus: "pics" });
    const list = (await call("stage_list", {})).structuredContent as Record<string, unknown>;
    expect(list).toMatchObject({
      focus: "main",
      main: { view: "face", bubble: true },
      viewing: { focus: "pics" },
      tabs: [{ id: "pics", seenAt: expect.any(String) }],
    });
  });

  test("stage_focus with a slide flips the tab's live page and says so", async () => {
    await call("stage_open", {
      title: "Deck",
      blocks: [{ type: "web", props: { html: "<p>deck</p>" } }],
    });
    await call("stage_open", { title: "Pics", blocks: [{ type: "text", props: { text: "x" } }] });
    const flipped = await call("stage_focus", { tab: "deck", slide: 3 });
    expect(flipped.isError).toBeUndefined();
    expect(textOf(flipped)).toBe("In front now: tab deck, on slide 3.");
    const stage = await store.get(AGENT);
    expect(stage.focus).toBe("deck");
    expect(stage.main.slides?.deck?.slide).toBe(3);

    const noTab = await call("stage_focus", { slide: 2 });
    expect(noTab.isError).toBe(true);
    expect(textOf(noTab)).toBe("slide needs the tab whose page to flip");
    const noPage = await call("stage_focus", { tab: "pics", slide: 2 });
    expect(noPage.isError).toBe(true);
  });

  test("stage_perch sits the assistant on a block, hops to another and leaves", async () => {
    await call("stage_open", {
      title: "Money",
      focus: false,
      blocks: [
        { type: "stat", id: "total", props: { label: "Total", value: "€1,240" } },
        {
          type: "chart",
          id: "trend",
          props: { kind: "line", x: ["a", "b"], series: [{ name: "s", values: [1, 2] }] },
        },
      ],
    });
    const sat = await call("stage_perch", { tab: "money", block: "total" });
    expect(sat.isError).toBeUndefined();
    expect(sat.structuredContent).toMatchObject({
      perch: { tab: "money", block: "total", pose: "sit", side: null },
    });
    await call("stage_perch", { tab: "money", block: "trend", pose: "point", side: "left" });
    let list = (await call("stage_list", {})).structuredContent as Record<string, unknown>;
    expect(list).toMatchObject({
      focus: "money",
      main: { perch: { tab: "money", block: "trend", pose: "point", side: "left" } },
    });

    expect(textOf(await call("stage_perch", { tab: "money" }))).toContain("give tab and block");
    expect(textOf(await call("stage_perch", { tab: "main", block: "x" }))).toContain(
      "is the main tab",
    );
    expect(textOf(await call("stage_perch", { tab: "money", block: "gone" }))).toContain(
      "has no block “gone”",
    );

    await call("stage_perch", { off: true });
    list = (await call("stage_list", {})).structuredContent as Record<string, unknown>;
    expect((list.main as Record<string, unknown>).perch).toBeUndefined();
  });

  test("show_* calls write the same windows and widget ids into the stage", async () => {
    await call("show_table", { window: "Kanban", title: "Tasks", columns: ["A"], rows: [["1"]] });
    await call("show_table", { window: "Kanban", title: "Tasks", columns: ["A"], rows: [["2"]] });
    await call("show_stat", { label: "Done", value: "3" });
    let stage = await store.get(AGENT);
    expect(stage.tabs).toHaveLength(1);
    const kanban = stage.tabs[0]!;
    expect(kanban).toMatchObject({ title: "Kanban", version: 3 });
    expect(kanban.blocks.map((block) => block.id)).toEqual(["table:tasks", "stat:done"]);
    expect(kanban.blocks[0]).toMatchObject({ props: { rows: [["2"]] } });

    await call("show_page", { page: "face" });
    stage = await store.get(AGENT);
    expect(stage).toMatchObject({ focus: null, main: { view: "face" } });

    await call("show_window", { window: "Kanban", action: "close" });
    stage = await store.get(AGENT);
    expect(stage.tabs).toEqual([]);
    expect(stage.closed).toEqual([expect.objectContaining({ title: "Kanban", closedBy: "agent" })]);
  });

  test("a show_* call that the stage cannot hold still succeeds", async () => {
    const result = await call("show_chart", {
      window: "Bad",
      kind: "line",
      x: ["a", "b"],
      series: [{ name: "s", values: [1] }],
    });
    expect(result.isError).toBeUndefined();
    expect((await store.get(AGENT)).tabs).toEqual([]);
  });
});
