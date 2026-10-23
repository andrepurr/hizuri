import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { normalizeBlocks } from "./blocks.js";
import { LIVE_TAB_ID, parseSceneAnswer, sceneBlocks, sceneText } from "./live-scenes.js";
import { drawLiveScene } from "./live-tab.js";
import { MAX_OPEN_TABS, StageStore } from "./store.js";

const logger = pino({ level: "silent" });
const AGENT = "agent-1";

describe("parseSceneAnswer", () => {
  test("reads one line of scene JSON, even in a code fence", () => {
    expect(
      parseSceneAnswer('```json\n{"p":"hero","k":"VOICE","t":"From the microphone to Zuri"}\n```'),
    ).toEqual({
      kind: "scene",
      scene: { p: "hero", k: "VOICE", t: "From the microphone to Zuri" },
    });
  });

  test("reads SKIP and KEEP", () => {
    expect(parseSceneAnswer("SKIP")).toEqual({ kind: "skip" });
    expect(parseSceneAnswer("keep.")).toEqual({ kind: "keep" });
  });

  test("rejects a chart whose axes differ and a key outside the scene", () => {
    expect(
      parseSceneAnswer('{"p":"chart","t":"Steps","kind":"bar","x":["Mo","Tu"],"y":[1]}').kind,
    ).toBe("invalid");
    expect(parseSceneAnswer('{"p":"hero","t":"Hello","color":"red"}').kind).toBe("invalid");
    expect(parseSceneAnswer("Sure! Here is a scene.")).toEqual({
      kind: "invalid",
      reason: "no-json",
    });
  });
});

describe("sceneText", () => {
  test("collects every shown string", () => {
    expect(
      sceneText({
        p: "compare",
        k: "LIMITS",
        t: "Spent",
        items: [
          { l: "Week", v: "43%" },
          { l: "5 hours", v: "8%" },
        ],
      }),
    ).toBe("LIMITS \n Spent \n Week \n 43% \n 5 hours \n 8%");
  });
});

describe("sceneBlocks", () => {
  test("gives every scene stable block ids, so an update changes them in place", () => {
    const hero = sceneBlocks({ p: "hero", k: "Voice", t: "The voice lags" });
    expect(hero.map((block) => block.id)).toEqual(["vf-head"]);
    expect(hero[0]).toMatchObject({
      type: "text",
      props: { text: "The voice lags", size: "title" },
    });

    const number = sceneBlocks({ p: "number", k: "LIMITS", v: "43%", t: "Week" });
    expect(number[0]).toMatchObject({
      id: "vf-number",
      type: "stat",
      props: { label: "Week", value: "43%" },
      emphasis: "count-up",
    });
  });

  test("builds valid blocks for every scene of the bank", () => {
    const scenes = [
      { p: "list", t: "Today", items: ["Notes", "Slides"] },
      { p: "steps", t: "Plan", steps: [{ l: "Build", s: "done" }] },
      {
        p: "timeline",
        t: "Day",
        items: [
          { w: "10:00", l: "Review" },
          { w: "14:00", l: "Demo" },
        ],
      },
      { p: "chart", t: "Steps", kind: "bar", x: ["Mo", "Tu"], y: [6000, 9000] },
      { p: "status", t: "Agents", items: [{ l: "APK build", s: "running" }] },
      { p: "win", t: "The build passed" },
      { p: "alert", t: "Cores dropped", s: "Emulator paused" },
    ] as const;
    for (const scene of scenes) {
      const blocks = sceneBlocks(scene as never);
      expect(normalizeBlocks(blocks)).toEqual(blocks);
    }
  });
});

describe("drawLiveScene", () => {
  let home: string;

  beforeEach(async () => {
    home = await mkdtemp(path.join(tmpdir(), "live-tab-"));
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  test("writes the live tab in place and never takes the focus", async () => {
    const store = new StageStore({ paseoHome: home, logger });
    await store.open(AGENT, {
      tabId: "plan",
      title: "Plan",
      blocks: normalizeBlocks([{ type: "text", props: { text: "x" } }]),
    });
    const scene = { p: "hero", k: "VOICE", t: "The voice lags" } as const;
    expect(await drawLiveScene(store, { agentId: AGENT, scene, since: 1000 })).toBeNull();
    const upgraded = { p: "alert", k: "VOICE", t: "Cores dropped to 400 MHz" } as const;
    expect(await drawLiveScene(store, { agentId: AGENT, scene: upgraded, since: 1000 })).toBeNull();

    const stage = await store.get(AGENT);
    expect(stage.focus).toBe("plan");
    expect(stage.tabs.map((tab) => tab.id)).toEqual(["plan", LIVE_TAB_ID]);
    expect(stage.tabs[1]).toMatchObject({
      title: "Now",
      createdBy: "visual-front",
      data: { scene: upgraded, since: 1000 },
    });
  });

  test("stays closed after the user closes it", async () => {
    const store = new StageStore({ paseoHome: home, logger });
    const scene = { p: "hero", t: "Voice" } as const;
    await drawLiveScene(store, { agentId: AGENT, scene, since: 1 });
    await store.close(AGENT, { tabId: LIVE_TAB_ID, by: "user" });
    expect(await drawLiveScene(store, { agentId: AGENT, scene, since: 2 })).toBe("closed-by-user");
  });

  test("never pushes one of the assistant's tabs out", async () => {
    const store = new StageStore({ paseoHome: home, logger });
    for (let index = 0; index < MAX_OPEN_TABS; index += 1) {
      await store.open(AGENT, {
        tabId: `tab-${index}`,
        title: `Tab ${index}`,
        blocks: normalizeBlocks([{ type: "text", props: { text: "x" } }]),
      });
    }
    const scene = { p: "hero", t: "Voice" } as const;
    expect(await drawLiveScene(store, { agentId: AGENT, scene, since: 1 })).toBe("stage-full");
    expect((await store.get(AGENT)).tabs).toHaveLength(MAX_OPEN_TABS);
  });
});
