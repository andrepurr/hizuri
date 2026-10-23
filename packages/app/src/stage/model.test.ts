import type { Stage, StageChange, StageTab } from "@getpaseo/protocol/stage";
import { describe, expect, it } from "vitest";
import { pieSlices, smoothPath, valueScale } from "./chart-geometry";
import { LOTTIE_NAMES, lottieAnimation, lottieLoops } from "./lottie-library";
import {
  blockTypeOf,
  hopPoint,
  PERCH_HOP_ARC,
  perchOnScreen,
  perchPose,
  perchRoom,
  perchScrollTarget,
  perchWindow,
  visiblePerch,
} from "./perch-model";
import {
  applyStageChange,
  canvasPanes,
  formatCount,
  frontTabOfChange,
  layoutRows,
  parseCount,
  resolveVisibleTab,
  type StageRow,
  tabBlocks,
  toBlockNode,
  uniqueKeys,
} from "./model";

function tab(id: string, version = 1, blocks: StageTab["blocks"] = []): StageTab {
  return {
    id,
    title: id,
    blocks,
    createdAt: "2026-10-18T20:00:00.000Z",
    updatedAt: "2026-10-18T20:00:00.000Z",
    version,
  };
}

function stage(tabs: StageTab[], revision = 3, focus: string | null = null): Stage {
  return {
    v: 1,
    agentId: "zuri",
    revision,
    tabs,
    closed: [],
    main: { view: "chat" },
    focus,
    depth: "simple",
    chrome: {},
    updatedAt: "2026-10-18T20:00:00.000Z",
  };
}

function change(input: Partial<StageChange> & { revision: number }): StageChange {
  return {
    agentId: "zuri",
    previousRevision: input.revision - 1,
    upserted: [],
    removed: [],
    order: [],
    closed: [],
    main: { view: "chat" },
    focus: null,
    depth: "simple",
    chrome: {},
    updatedAt: "2026-10-18T20:01:00.000Z",
    ...input,
  };
}

describe("applyStageChange", () => {
  it("replaces the changed tab in place and keeps the assistant's order", () => {
    const before = stage([tab("a"), tab("b")]);
    const result = applyStageChange(
      before,
      change({ revision: 4, upserted: [tab("b", 2)], order: ["a", "b"], focus: "b" }),
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.stage.tabs.map((entry) => `${entry.id}v${entry.version}`)).toEqual([
      "av1",
      "bv2",
    ]);
    expect(result.stage.revision).toBe(4);
    expect(result.stage.focus).toBe("b");
  });

  it("drops a closed tab", () => {
    const result = applyStageChange(
      stage([tab("a"), tab("b")]),
      change({ revision: 4, removed: ["a"], order: ["b"] }),
    );
    expect(result.kind === "applied" && result.stage.tabs.map((entry) => entry.id)).toEqual(["b"]);
  });

  it("ignores a change it already holds and asks again after a missed one", () => {
    const held = stage([tab("a")], 5);
    expect(applyStageChange(held, change({ revision: 5, order: ["a"] })).kind).toBe("ignored");
    expect(applyStageChange(held, change({ revision: 7, order: ["a"] })).kind).toBe("gap");
    expect(applyStageChange(null, change({ revision: 1 })).kind).toBe("gap");
  });
});

describe("frontTabOfChange", () => {
  it("brings forward the tab the assistant just wrote", () => {
    const before = stage([tab("a")], 3, "a");
    expect(
      frontTabOfChange(
        before,
        change({ revision: 4, upserted: [tab("a", 2)], order: ["a"], focus: "a" }),
      ),
    ).toBe("a");
  });

  it("brings forward a tab the assistant switched to, and nothing when it only closed one", () => {
    const before = stage([tab("a"), tab("b")], 3, "a");
    expect(frontTabOfChange(before, change({ revision: 4, order: ["a", "b"], focus: "b" }))).toBe(
      "b",
    );
    expect(
      frontTabOfChange(before, change({ revision: 4, order: ["a"], removed: ["b"], focus: "a" })),
    ).toBeNull();
  });
});

describe("frontTabOfChange and the live tab", () => {
  it("never brings the pager for the live tab", () => {
    const live: StageTab = { ...tab("live"), createdBy: "visual-front" };
    expect(
      frontTabOfChange(
        stage([], 3),
        change({ revision: 4, upserted: [live], order: ["live"], focus: "live" }),
      ),
    ).toBeNull();
  });
});

describe("resolveVisibleTab", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];
  it("keeps the user's pick while it is open, else the assistant's focus, else the assistant's newest", () => {
    expect(resolveVisibleTab({ tabs, focus: "b", pick: "a" })?.id).toBe("a");
    expect(resolveVisibleTab({ tabs, focus: "b", pick: "gone" })?.id).toBe("b");
    expect(resolveVisibleTab({ tabs, focus: null, pick: null })?.id).toBe("c");
    expect(resolveVisibleTab({ tabs: [], focus: null, pick: null })).toBeNull();
  });

  const at = (iso: string) => Date.parse(`2026-10-18T${iso}.000Z`);
  function liveTab(since: number): StageTab {
    return { ...tab("live"), createdBy: "visual-front", data: { since } };
  }
  function assistantTab(id: string, updated: string): StageTab {
    return { ...tab(id), updatedAt: `2026-10-18T${updated}.000Z` };
  }

  it("shows the live tab while the assistant has not brought its own tab forward since the user's phrase", () => {
    const plan = assistantTab("plan", "20:00:00");
    expect(
      resolveVisibleTab({ tabs: [plan, liveTab(at("20:05:00"))], focus: "plan", pick: null })?.id,
    ).toBe("live");
    const fresh = assistantTab("plan", "20:06:00");
    expect(
      resolveVisibleTab({ tabs: [fresh, liveTab(at("20:05:00"))], focus: "plan", pick: null })?.id,
    ).toBe("plan");
    expect(
      resolveVisibleTab({ tabs: [liveTab(at("20:05:00"))], focus: null, pick: null })?.id,
    ).toBe("live");
  });

  it("keeps the user's pick over the live tab", () => {
    const open = [assistantTab("plan", "20:00:00"), liveTab(at("20:05:00"))];
    expect(resolveVisibleTab({ tabs: open, focus: "plan", pick: "plan" })?.id).toBe("plan");
  });

  it("keeps the film the user watches in front while the user talks to the assistant", () => {
    const film: StageTab = {
      ...assistantTab("media", "20:00:00"),
      blocks: [
        {
          type: "media",
          id: "player",
          props: { kind: "video", url: "https://example.com/a.mp4", player: true, playId: "p1" },
        },
      ],
    };
    const open = [film, liveTab(at("20:05:00"))];
    expect(resolveVisibleTab({ tabs: open, focus: "media", pick: null })?.id).toBe("media");
  });
});

describe("tab blocks", () => {
  it("fills bound props from the tab's data", () => {
    const limits = {
      ...tab("limits", 1, [{ type: "limits", id: "limits", bind: { sources: "/usage" } }]),
      data: { usage: [{ sourceId: "claude" }] },
    };
    expect(tabBlocks(limits)[0]?.props.sources).toEqual([{ sourceId: "claude" }]);
  });

  it("pairs number tiles and rings, and gives tables a whole row", () => {
    const blocks = tabBlocks(
      tab("w", 1, [
        { type: "card", id: "intro" },
        { type: "stat", id: "s1" },
        { type: "stat", id: "s2" },
        { type: "progress", id: "r", props: { style: "ring" } },
        { type: "table", id: "t" },
      ]),
    );
    const rowIds = (row: StageRow) =>
      row.kind === "pair" ? row.blocks.map((block) => block.id).join("+") : row.block.id;
    expect(layoutRows(blocks).map(rowIds)).toEqual(["intro", "s1+s2", "r", "t"]);
  });
});

describe("count-up", () => {
  it("counts the number and keeps its currency, unit and separators", () => {
    const money = parseCount("€4,210");
    expect(money).toMatchObject({ prefix: "€", value: 4210, group: "," });
    expect(money && formatCount(money, 1234)).toBe("€1,234");
    const percent = parseCount("98%");
    expect(percent && formatCount(percent, 41.4)).toBe("41%");
    const delta = parseCount("+2.1%");
    expect(delta && formatCount(delta, 1.05)).toBe("+1.1%");
    const latency = parseCount("212 ms");
    expect(latency && formatCount(latency, 99)).toBe("99 ms");
  });

  it("leaves text without a number alone", () => {
    expect(parseCount("—")).toBeNull();
    expect(parseCount("ok")).toBeNull();
  });
});

describe("lottie library", () => {
  const palette = {
    accent: "#6b8afd",
    success: "#6cb17b",
    warning: "#e0b44c",
    danger: "#e06c6c",
    foreground: "#ffffff",
  };
  it("builds every animation as a 200 px, 60 fps composition of shape layers", () => {
    for (const name of LOTTIE_NAMES) {
      const animation = lottieAnimation(name, palette) as {
        fr: number;
        w: number;
        op: number;
        layers: { ty: number; op: number; shapes: unknown[] }[];
      };
      expect(animation.fr).toBe(60);
      expect(animation.w).toBe(200);
      expect(animation.layers.length).toBeGreaterThan(0);
      for (const layer of animation.layers) {
        expect(layer.ty).toBe(4);
        expect(layer.op).toBe(animation.op);
        expect(layer.shapes.length).toBeGreaterThan(0);
      }
    }
  });

  it("colours a success in the theme's success colour and loops only the wait", () => {
    expect(JSON.stringify(lottieAnimation("success", palette))).toContain(
      JSON.stringify([108 / 255, 177 / 255, 123 / 255, 1]),
    );
    expect(lottieLoops("loading")).toBe(true);
    expect(lottieLoops("win")).toBe(false);
  });
});

describe("chart geometry", () => {
  it("rounds the value axis around every value, from zero for bars", () => {
    expect(valueScale([12, 47, 33], false)).toEqual({
      min: 10,
      max: 50,
      ticks: [10, 20, 30, 40, 50],
    });
    expect(valueScale([12, 47, 33], true).min).toBe(0);
    expect(valueScale([5, 5], false).ticks.length).toBeGreaterThan(1);
  });

  it("splits a pie into shares that start where the last one ended", () => {
    const slices = pieSlices(["a", "b", "c"], [50, 30, -4]);
    expect(slices.map((slice) => [slice.share, slice.start])).toEqual([
      [0.625, 0],
      [0.375, 0.625],
      [0, 1],
    ]);
  });

  it("draws a smooth path through the points", () => {
    expect(smoothPath([0, 10], [5, 15])).toBe("M0,5 C5,5 5,15 10,15");
  });

  it("keys repeated labels apart", () => {
    expect(uniqueKeys(["a", "b", "a"])).toEqual(["a", "b", "a#2"]);
  });
});

describe("Zuri perched on a block", () => {
  const stat = { x: 0, y: 0, width: 158, height: 96 };
  const bounds = { left: -16, right: 344 };

  it("sits at the right end of the block's top edge, the edge on its window's anchor line", () => {
    const spot = perchWindow({
      pose: "sit",
      side: undefined,
      block: stat,
      blockType: "stat",
      bounds,
    });
    expect(spot.x).toBe(158 - 36);
    expect(spot.line).toBe(2);
    expect(spot.anchor).toBeCloseTo(spot.above / spot.height);
    expect(spot.target).toBeNull();
  });

  it("stays inside the page sideways at the left end and points at a stat's number", () => {
    const spot = perchWindow({
      pose: "point",
      side: "left",
      block: stat,
      blockType: "stat",
      bounds,
    });
    expect(spot.x - spot.width / 2).toBe(-16);
    // The number sits on the left of the tile, a little below its middle, in the perch window's dp.
    expect(spot.target).toEqual({
      x: Math.round(158 * 0.28 + 16),
      y: Math.round(96 * 0.55 - 2 + spot.above),
    });
  });

  it("points at the middle of a chart", () => {
    const chart = { x: 0, y: 120, width: 328, height: 200 };
    const spot = perchWindow({
      pose: "point",
      side: "right",
      block: chart,
      blockType: "chart",
      bounds,
    });
    const left = spot.x - spot.width / 2;
    const top = spot.line - spot.above;
    expect(spot.target).toEqual({ x: 164 - left, y: 120 + 110 - top });
  });

  it("draws an unknown pose as sitting and leaning lower than sitting", () => {
    expect(perchPose("dance")).toBe("sit");
    const lean = perchWindow({ pose: "lean", side: "right", block: stat, blockType: null, bounds });
    const sit = perchWindow({ pose: "sit", side: "right", block: stat, blockType: null, bounds });
    expect(lean.above).toBeLessThan(sit.above);
  });

  it("makes room above the first block so its head clears the header", () => {
    const first = perchWindow({ pose: "sit", side: "right", block: stat, blockType: null, bounds });
    expect(perchRoom({ window: first, listTop: 72, headerHeight: 60 })).toBe(first.above - 2 - 12);
    const lower = perchWindow({
      pose: "sit",
      side: "right",
      block: { ...stat, y: 400 },
      blockType: null,
      bounds,
    });
    expect(perchRoom({ window: lower, listTop: 72, headerHeight: 60 })).toBe(0);
  });

  it("leaves once the block scrolls under the header or below the view", () => {
    const block = { x: 0, y: 300, width: 328, height: 100 };
    const view = { block, listTop: 72, viewportHeight: 700, headerHeight: 60 };
    expect(perchOnScreen({ ...view, scrollY: 0 })).toBe(true);
    expect(perchOnScreen({ ...view, scrollY: 400 })).toBe(false);
    expect(perchOnScreen({ ...view, scrollY: 380 })).toBe(true);
    expect(perchOnScreen({ ...view, viewportHeight: 380, scrollY: 0 })).toBe(false);
  });

  it("brings a block the user scrolled away from back, with room for its head", () => {
    const block = { x: 0, y: 300, width: 328, height: 100 };
    const view = { block, above: 96, listTop: 72, viewportHeight: 700, headerHeight: 60 };
    expect(perchScrollTarget({ ...view, scrollY: 0 })).toBeNull();
    // 72 + 300 - 96 - 60: the head sits right under the header.
    expect(perchScrollTarget({ ...view, scrollY: 900 })).toBe(216);
    expect(perchScrollTarget({ ...view, block: { ...block, y: 0 }, scrollY: 900 })).toBe(0);
  });

  it("hops in an arc from one block to the next", () => {
    const from = { x: 100, y: 0 };
    const to = { x: 300, y: 200 };
    expect(hopPoint(from, to, 0)).toEqual(from);
    expect(hopPoint(from, to, 1).x).toBe(300);
    expect(hopPoint(from, to, 1).y).toBeCloseTo(200);
    expect(hopPoint(from, to, 0.5).y).toBeCloseTo(100 - PERCH_HOP_ARC);
  });

  it("shows it only on the tab it sits on and finds the block's type in nested blocks", () => {
    const perched = stage([tab("a"), tab("b")]);
    perched.main = {
      view: "chat",
      perch: { tab: "a", block: "s1", pose: "sit", at: "2026-10-19T10:00:00.000Z" },
    };
    expect(visiblePerch(perched, "a")?.block).toBe("s1");
    expect(visiblePerch(perched, "b")).toBeNull();
    const blocks = tabBlocks(
      tab("a", 1, [{ type: "row", id: "r", children: [{ type: "stat", id: "s1" }] }]),
    );
    expect(blockTypeOf(blocks, "s1")).toBe("stat");
    expect(blockTypeOf(blocks, "zz")).toBeNull();
  });
});

describe("one canvas: pages and media laid out together", () => {
  const node = (raw: Record<string, unknown>, id: string) => toBlockNode({ id, ...raw }, {}, id);
  const page = (id: string) => node({ type: "web", props: { html: "<p>deck</p>" } }, id);
  const video = node({ type: "media", props: { kind: "video", url: "/stage-media/v.mp4" } }, "v");
  const audio = node({ type: "media", props: { kind: "audio", url: "/stage-media/a.mp3" } }, "a");

  it("shares the screen between a video, an audio track and two pages, pages taller", () => {
    const panes = canvasPanes([video, page("p1"), audio, page("p2")]);
    expect(panes?.map((pane) => [pane.block.id, pane.kind, pane.weight])).toEqual([
      ["v", "video", 2],
      ["p1", "page", 3],
      ["a", "audio", null],
      ["p2", "page", 3],
    ]);
  });

  it("leaves one file, ordinary blocks, the player and too many panes to the other layouts", () => {
    expect(canvasPanes([page("p")])).toBeNull();
    expect(canvasPanes([page("p"), node({ type: "text", props: { text: "x" } }, "t")])).toBeNull();
    const player = node({ type: "media", props: { kind: "video", player: true } }, "pl");
    expect(canvasPanes([player, page("p")])).toBeNull();
    expect(canvasPanes([1, 2, 3, 4, 5].map((index) => page(`p${index}`)))).toBeNull();
  });
});
