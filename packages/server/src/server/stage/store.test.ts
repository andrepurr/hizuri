import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { StageChange } from "@getpaseo/protocol/stage";
import { normalizeBlocks } from "./blocks.js";
import { MAX_OPEN_TABS, StageStore } from "./store.js";

const logger = pino({ level: "silent" });
const AGENT = "agent-1";
let home: string;
let clock: number;

function createStore(): StageStore {
  return new StageStore({ paseoHome: home, logger, now: () => new Date(clock++ * 1000) });
}

function card(id: string, title: string) {
  return normalizeBlocks([{ type: "card", id, props: { title, body: `${title} body` } }]);
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "stage-store-"));
  clock = 1_800_000_000;
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("stage store", () => {
  test("a tab survives a daemon restart with its revision", async () => {
    const store = createStore();
    const opened = await store.open(AGENT, { title: "Lamps", blocks: card("best", "Orbit") });
    expect(opened).toMatchObject({
      replaced: false,
      revision: 1,
      tab: { id: "lamps", version: 1 },
    });

    const restarted = await createStore().get(AGENT);
    expect(restarted.revision).toBe(1);
    expect(restarted.focus).toBe("lamps");
    expect(restarted.tabs.map((tab) => [tab.id, tab.title, tab.blocks[0]?.id])).toEqual([
      ["lamps", "Lamps", "best"],
    ]);
  });

  test("the same title replaces the same tab and keeps the old version for restore", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Lamps", blocks: card("best", "Orbit") });
    const replaced = await store.open(AGENT, { title: "Lamps", blocks: card("best", "Halo") });
    expect(replaced).toMatchObject({ replaced: true, tab: { version: 2 } });

    const back = await store.restore(AGENT, { tabId: "lamps", version: 1 });
    expect(back.tab.version).toBe(3);
    expect((back.tab.blocks[0] as { props: { title: string } }).props.title).toBe("Orbit");
  });

  test("an update changes data and blocks in place", async () => {
    const store = createStore();
    await store.open(AGENT, {
      title: "Build",
      blocks: normalizeBlocks([
        { type: "progress", id: "bar", bind: { percent: "/percent" }, props: { label: "APK" } },
        { type: "stack", id: "notes", children: [] },
      ]),
      data: { percent: 10 },
    });
    const updated = await store.update(AGENT, {
      tabId: "build",
      set: { "/percent": 64, "/steps/0": "prebuild" },
      append: card("done", "Gradle"),
      appendTo: "notes",
    });
    expect(updated.tab.data).toEqual({ percent: 64, steps: { "0": "prebuild" } });
    expect(updated.tab.blocks[1]).toMatchObject({ id: "notes", children: [{ id: "done" }] });

    const removed = await store.update(AGENT, { tabId: "build", remove: ["done"] });
    expect(removed.tab.blocks[1]).toMatchObject({ id: "notes", children: [] });
    await expect(store.update(AGENT, { tabId: "build", remove: ["ghost"] })).rejects.toThrow(
      "tab “build” has no block “ghost”; its blocks: bar, notes",
    );
  });

  test("closing keeps the tab for restore and moves the screen back to the main tab", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Result", blocks: card("r", "Ordered") });
    const closed = await store.close(AGENT, {
      tabId: "result",
      by: "agent",
      exit: "fold-into-face",
    });
    expect(closed).toMatchObject({ closed: true, deleted: false });
    let stage = await store.get(AGENT);
    expect(stage.focus).toBeNull();
    expect(stage.closed).toEqual([
      expect.objectContaining({ id: "result", closedBy: "agent", exit: "fold-into-face" }),
    ]);

    const restored = await store.restore(AGENT, { tabId: "result" });
    expect(restored.tab.version).toBe(2);
    stage = await store.get(AGENT);
    expect(stage.tabs.map((tab) => tab.id)).toEqual(["result"]);
    expect(stage.closed).toEqual([]);
  });

  test("a user close is harmless twice; an agent close of an unknown tab names the open ones", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Limits", blocks: card("l", "Limits") });
    await store.close(AGENT, { tabId: "limits", by: "user" });
    await expect(store.close(AGENT, { tabId: "limits", by: "user" })).resolves.toMatchObject({
      closed: false,
    });
    await expect(store.close(AGENT, { tabId: "nope", by: "agent" })).rejects.toThrow(
      "no tab “nope”; open: none",
    );
  });

  test("delete forgets the tab, its closed entry and its kept versions", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Secret", blocks: card("s", "x") });
    await store.close(AGENT, { tabId: "secret", by: "agent", delete: true });
    expect((await store.get(AGENT)).closed).toEqual([]);
    await expect(store.restore(AGENT, { tabId: "secret" })).rejects.toThrow(
      "nothing kept for tab “secret”",
    );
  });

  test("the thirteenth tab closes the oldest unpinned one", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Pinned", blocks: card("p", "p"), pin: true });
    for (let index = 1; index < MAX_OPEN_TABS; index += 1) {
      await store.open(AGENT, { title: `Tab ${index}`, blocks: card("c", `${index}`) });
    }
    const extra = await store.open(AGENT, { title: "Extra", blocks: card("c", "extra") });
    expect(extra.autoClosed).toEqual(["tab-1"]);
    const stage = await store.get(AGENT);
    expect(stage.tabs).toHaveLength(MAX_OPEN_TABS);
    expect(stage.tabs[0]?.id).toBe("pinned");
  });

  test("subscribers get each change once, chained by revision; what the user looks at is silent", async () => {
    const store = createStore();
    const changes: StageChange[] = [];
    const unsubscribe = store.subscribe(AGENT, (change) => changes.push(change));
    await store.open(AGENT, { title: "One", blocks: card("a", "1") });
    await store.open(AGENT, { title: "Two", blocks: card("a", "2"), focus: false });
    await store.focus(AGENT, { view: "face" });
    await store.reportFocus(AGENT, { focus: "one" });
    await store.close(AGENT, { tabId: "one", by: "user" });
    unsubscribe();
    await store.open(AGENT, { title: "Three", blocks: card("a", "3") });

    expect(changes.map((change) => [change.previousRevision, change.revision])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(changes[1]).toMatchObject({
      upserted: [{ id: "two" }],
      order: ["one", "two"],
      focus: "one",
    });
    expect(changes[2]).toMatchObject({ upserted: [], main: { view: "face" }, focus: null });
    expect(changes[3]).toMatchObject({
      removed: ["one"],
      closed: [{ id: "one", closedBy: "user" }],
    });
    const stage = await store.get(AGENT);
    expect(stage.viewing).toMatchObject({ focus: "one" });
  });

  test("an unreadable stage file is set aside and the stage starts empty", async () => {
    await mkdir(path.join(home, "stage"), { recursive: true });
    await writeFile(path.join(home, "stage", `${AGENT}.json`), "{ not json");
    const stage = await createStore().get(AGENT);
    expect(stage).toMatchObject({ revision: 0, tabs: [] });
    const files = await readdir(path.join(home, "stage"));
    expect(files.some((file) => file.startsWith(`${AGENT}.json.corrupt-`))).toBe(true);
  });

  test("agent ids that could leave the stage folder are refused", async () => {
    const store = createStore();
    await expect(store.get("../../etc/passwd")).rejects.toThrow("invalid agent id");
    await expect(store.get("a/b")).rejects.toThrow("invalid agent id");
  });

  test("templates are saved and listed by name", async () => {
    const store = createStore();
    await store.saveTemplate({ name: "my-limits", title: "Limits", blocks: [{ type: "limits" }] });
    expect((await store.listTemplates()).map((template) => template.name)).toEqual(["my-limits"]);
    const raw = JSON.parse(
      await readFile(path.join(home, "stage", "templates", "my-limits.json"), "utf8"),
    );
    expect(raw.title).toBe("Limits");
    expect(await store.deleteTemplate("my-limits")).toBe(true);
    expect(await store.listTemplates()).toEqual([]);
  });

  test("the assistant perches on a block, hops with a new time, and leaves a block that goes", async () => {
    const store = createStore();
    const changes: StageChange[] = [];
    store.subscribe(AGENT, (change) => changes.push(change));
    await store.open(AGENT, {
      title: "Money",
      blocks: [...card("total", "Total"), ...card("trend", "Trend")],
      focus: false,
    });
    await expect(
      store.perch(AGENT, { tabId: "money", blockId: "nope", pose: "sit" }),
    ).rejects.toThrow("has no block “nope”; its blocks: total, trend");
    await expect(
      store.perch(AGENT, { tabId: "other", blockId: "total", pose: "sit" }),
    ).rejects.toThrow("no open tab “other”");

    await store.perch(AGENT, { tabId: "money", blockId: "total", pose: "sit" });
    let stage = await store.get(AGENT);
    expect(stage.focus).toBe("money");
    expect(stage.main.perch).toMatchObject({ tab: "money", block: "total", pose: "sit" });
    expect(changes.at(-1)?.main.perch).toMatchObject({ block: "total" });
    const firstAt = stage.main.perch!.at;

    await store.perch(AGENT, { tabId: "money", blockId: "total", pose: "point", side: "left" });
    stage = await store.get(AGENT);
    expect(stage.main.perch).toMatchObject({ pose: "point", side: "left" });
    expect(stage.main.perch!.at).not.toBe(firstAt);

    await store.update(AGENT, { tabId: "money", remove: ["total"] });
    stage = await store.get(AGENT);
    expect(stage.main.perch).toBeUndefined();
    expect(changes.at(-1)?.main.perch).toBeUndefined();

    await store.perch(AGENT, { tabId: "money", blockId: "trend", pose: "lean" });
    await store.close(AGENT, { tabId: "money", by: "user" });
    expect((await store.get(AGENT)).main.perch).toBeUndefined();
  });

  test("the assistant flips a page's slide without touching the tab, and a new page starts over", async () => {
    const store = createStore();
    const changes: StageChange[] = [];
    store.subscribe(AGENT, (change) => changes.push(change));
    const page = normalizeBlocks([{ type: "web", id: "file", props: { html: "<p>deck</p>" } }]);
    await store.open(AGENT, { title: "Deck", blocks: page, focus: false });
    await store.open(AGENT, { title: "Money", blocks: card("total", "Total") });
    await expect(store.slide(AGENT, { tabId: "money", slide: 2 })).rejects.toThrow(
      "tab “money” holds no page",
    );
    await expect(store.slide(AGENT, { tabId: "other", slide: 2 })).rejects.toThrow(
      "no open tab “other”",
    );

    await store.slide(AGENT, { tabId: "deck", slide: 3 });
    let stage = await store.get(AGENT);
    expect(stage.focus).toBe("deck");
    expect(stage.main.slides?.deck).toMatchObject({ slide: 3, version: 1 });
    // The page itself does not travel again: only the frame changes.
    expect(changes.at(-1)?.upserted).toEqual([]);
    expect(changes.at(-1)?.main.slides?.deck?.slide).toBe(3);
    const firstAt = stage.main.slides!.deck!.at;

    await store.slide(AGENT, { tabId: "deck", slide: 3 });
    stage = await store.get(AGENT);
    expect(stage.main.slides!.deck!.at).not.toBe(firstAt);
    expect((await createStore().get(AGENT)).main.slides?.deck?.slide).toBe(3);

    await store.open(AGENT, { title: "Deck", blocks: page });
    expect((await store.get(AGENT)).main.slides).toBeUndefined();

    await store.slide(AGENT, { tabId: "deck", slide: 2 });
    await store.close(AGENT, { tabId: "deck", by: "user" });
    expect((await store.get(AGENT)).main.slides).toBeUndefined();
  });

  test("hiding the assistant clears the perch and keeps the rest of the main tab", async () => {
    const store = createStore();
    await store.open(AGENT, { title: "Money", blocks: card("total", "Total") });
    await store.focus(AGENT, { bubble: true });
    await store.perch(AGENT, { tabId: "money", blockId: "total", pose: "sit" });
    const { revision } = await store.perch(AGENT, null);
    const stage = await store.get(AGENT);
    expect(stage.revision).toBe(revision);
    expect(stage.main).toEqual({ view: "chat", bubble: true });
    const restarted = await createStore().get(AGENT);
    expect(restarted.main.perch).toBeUndefined();
  });
});
