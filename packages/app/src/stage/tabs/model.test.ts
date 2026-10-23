import type { StageTab } from "@getpaseo/protocol/stage";
import { describe, expect, it } from "vitest";
import {
  CAPSULE_BOTTOM,
  CAPSULE_HEIGHT,
  CHIP_BOTTOM,
  CHIP_HEIGHT,
  cardDismissed,
  dragTabPosition,
  fingerDragTabs,
  insideTouchZone,
  railCancelled,
  railDotY,
  railHeldCenter,
  railIndexAt,
  settleTab,
  switcherInsets,
  tabKind,
} from "./model";

describe("dragTabPosition", () => {
  it("follows the finger between the first and the last tab", () => {
    expect(dragTabPosition({ startIndex: 1, dragTabs: 0.4, count: 5 })).toBeCloseTo(1.4);
    expect(dragTabPosition({ startIndex: 1, dragTabs: -1, count: 5 })).toBeCloseTo(0);
  });

  it("pulls back like a rubber band past either end", () => {
    expect(dragTabPosition({ startIndex: 0, dragTabs: -1, count: 5 })).toBeCloseTo(-0.3);
    expect(dragTabPosition({ startIndex: 4, dragTabs: 1, count: 5 })).toBeCloseTo(4.3);
  });

  it("holds a single tab in place with resistance both ways", () => {
    expect(dragTabPosition({ startIndex: 0, dragTabs: 0.5, count: 1 })).toBeCloseTo(0.15);
  });
});

describe("fingerDragTabs", () => {
  it("counts the drag from where the finger first touched, not from where the pan started", () => {
    // A flick on a slow frame: the pan starts late, but the whole 247 dp still count.
    expect(fingerDragTabs({ downX: 305, x: 57, width: 411, gain: 1 })).toBeCloseTo(0.603, 3);
    expect(fingerDragTabs({ downX: 57, x: 305, width: 411, gain: 1.15 })).toBeCloseTo(-0.694, 3);
  });

  it("never divides by a width not measured yet", () => {
    expect(fingerDragTabs({ downX: 10, x: 0, width: 0, gain: 1 })).toBe(10);
  });
});

describe("settleTab", () => {
  it("springs back from a short drag", () => {
    expect(settleTab({ startIndex: 2, position: 2.3, velocity: 0, count: 5 })).toBe(2);
  });

  it("moves on past half a tab", () => {
    expect(settleTab({ startIndex: 2, position: 2.6, velocity: 0, count: 5 })).toBe(3);
    expect(settleTab({ startIndex: 2, position: 1.4, velocity: 0, count: 5 })).toBe(1);
  });

  it("moves on a flick even from a short drag", () => {
    expect(settleTab({ startIndex: 2, position: 2.15, velocity: 2, count: 5 })).toBe(3);
    expect(settleTab({ startIndex: 2, position: 1.9, velocity: -2, count: 5 })).toBe(1);
  });

  it("never moves more than one tab per swipe", () => {
    expect(settleTab({ startIndex: 1, position: 2.4, velocity: 9, count: 5 })).toBe(2);
  });

  it("stays inside the tabs at both ends", () => {
    expect(settleTab({ startIndex: 0, position: -0.3, velocity: -4, count: 5 })).toBe(0);
    expect(settleTab({ startIndex: 4, position: 4.3, velocity: 4, count: 5 })).toBe(4);
    expect(settleTab({ startIndex: 0, position: 0.2, velocity: 3, count: 1 })).toBe(0);
  });
});

describe("the dot rail", () => {
  const rail = { centerY: 500, spacing: 40, count: 5 };

  it("centres its dots on the rail", () => {
    expect(railDotY({ ...rail, index: 2 })).toBe(500);
    expect(railDotY({ ...rail, index: 0 })).toBe(420);
    expect(railDotY({ ...rail, index: 4 })).toBe(580);
  });

  it("picks the dot nearest the thumb and stays on the rail past its ends", () => {
    expect(railIndexAt({ ...rail, y: 505 })).toBe(2);
    expect(railIndexAt({ ...rail, y: 441 })).toBe(1);
    expect(railIndexAt({ ...rail, y: 10 })).toBe(0);
    expect(railIndexAt({ ...rail, y: 2000 })).toBe(4);
  });

  it("spreads the held dots around the touched one, so it stays under the thumb", () => {
    // Five dots spread 40 apart; the thumb lands where the first dot sits at rest.
    const center = railHeldCenter({ y: 420, index: 0, spacing: 40, count: 5, height: 1000 });
    expect(railDotY({ index: 0, centerY: center, spacing: 40, count: 5 })).toBe(420);
    expect(railIndexAt({ y: 420, centerY: center, spacing: 40, count: 5 })).toBe(0);
  });

  it("keeps the spread dots on a short rail", () => {
    // A rail 200 tall; spread 40 apart the five dots take all of it (0…160 past the first one).
    const top = railHeldCenter({ y: 60, index: 0, spacing: 40, count: 5, height: 200 });
    expect(railDotY({ index: 4, centerY: top, spacing: 40, count: 5 })).toBe(200);
    const bottom = railHeldCenter({ y: 140, index: 4, spacing: 40, count: 5, height: 200 });
    expect(railDotY({ index: 0, centerY: bottom, spacing: 40, count: 5 })).toBe(0);
  });

  it("cancels once the thumb slides well off the rail to the left", () => {
    expect(railCancelled({ dx: -40 })).toBe(false);
    expect(railCancelled({ dx: -120 })).toBe(true);
    expect(railCancelled({ dx: 30 })).toBe(false);
  });
});

describe("the deck", () => {
  it("closes a card flung or dragged a third of the way off", () => {
    expect(cardDismissed({ dx: 60, vx: 100, width: 400 })).toBe(false);
    expect(cardDismissed({ dx: -140, vx: 0, width: 400 })).toBe(true);
    expect(cardDismissed({ dx: 40, vx: 900, width: 400 })).toBe(true);
  });
});

describe("swipe inside", () => {
  it("leaves the left edge to the pages and the right edge to the files", () => {
    expect(insideTouchZone({ x: 12, width: 400 })).toBe("pages");
    expect(insideTouchZone({ x: 392, width: 400 })).toBe("files");
    expect(insideTouchZone({ x: 200, width: 400 })).toBe("tabs");
  });
});

describe("switcherInsets", () => {
  it("keeps tab content clear of the switcher", () => {
    expect(switcherInsets("capsule").bottom).toBeGreaterThan(CAPSULE_BOTTOM + CAPSULE_HEIGHT);
    expect(switcherInsets("deck").bottom).toBeGreaterThan(CHIP_BOTTOM + CHIP_HEIGHT);
    expect(switcherInsets("rail").right).toBeGreaterThan(0);
    expect(switcherInsets("inside").bottom).toBeGreaterThan(0);
  });
});

function tab(blocks: StageTab["blocks"], createdBy?: string): StageTab {
  return {
    id: "t",
    title: "t",
    blocks,
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z",
    version: 1,
    ...(createdBy ? { createdBy } : {}),
  };
}

describe("tabKind", () => {
  it("names what a tab holds, for its card in the deck", () => {
    expect(tabKind(tab([{ type: "text", props: { text: "hi" } }]))).toBe("blocks");
    expect(tabKind(tab([{ type: "web", props: { html: "<p>x</p>" } }]))).toBe("page");
    expect(tabKind(tab([{ type: "web", props: { html: "", screen: true } }]))).toBe("screen");
    expect(tabKind(tab([{ type: "image", props: { images: [{ src: "a.png" }] } }]))).toBe(
      "picture",
    );
    expect(tabKind(tab([{ type: "media", props: { kind: "video", src: "a.mp4" } }]))).toBe("video");
    expect(
      tabKind(tab([{ type: "media", props: { player: true, kind: "video", url: "https://x/a" } }])),
    ).toBe("player");
    expect(tabKind(tab([], "visual-front"))).toBe("live");
    expect(
      tabKind(
        tab([
          { type: "media", props: { kind: "video", url: "/stage-media/v.mp4" } },
          { type: "web", props: { html: "<p>deck</p>" } },
        ]),
      ),
    ).toBe("canvas");
  });
});
