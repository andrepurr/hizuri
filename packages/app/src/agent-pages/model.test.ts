import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  agentPageAt,
  agentPageIndex,
  dragAgentPagePosition,
  latestAgentPageCall,
  pagerTakesBack,
  resolveAgentPageSwipeEnd,
  resolveAgentPageSwipeIntent,
} from "./model";

let seq = 0;

function call(
  name: string,
  input: Record<string, unknown>,
  status: "running" | "completed" | "failed" = "completed",
): StreamItem {
  seq += 1;
  return {
    kind: "tool_call",
    id: `agent_tool_${seq}`,
    timestamp: new Date(1_000 + seq),
    payload: {
      source: "agent",
      data: {
        provider: "claude",
        callId: `call-${seq}`,
        name,
        status,
        error: null,
        detail: { type: "unknown", input, output: null },
      },
    },
  };
}

describe("agent pages", () => {
  it("are face, chat and show, left to right", () => {
    expect([agentPageIndex("face"), agentPageIndex("chat"), agentPageIndex("show")]).toEqual([
      0, 1, 2,
    ]);
    expect([agentPageAt(-1), agentPageAt(1.4), agentPageAt(7)]).toEqual(["face", "chat", "show"]);
  });
});

describe("resolveAgentPageSwipeIntent", () => {
  it("pages on a horizontal drag toward a page that exists", () => {
    expect(resolveAgentPageSwipeIntent({ deltaX: -20, deltaY: 3, index: 1 })).toBe("activate");
    expect(resolveAgentPageSwipeIntent({ deltaX: 20, deltaY: 3, index: 1 })).toBe("activate");
    expect(resolveAgentPageSwipeIntent({ deltaX: -20, deltaY: 3, index: 0 })).toBe("activate");
  });

  it("leaves vertical drags to the chat and waits on small ones", () => {
    expect(resolveAgentPageSwipeIntent({ deltaX: 6, deltaY: 30, index: 1 })).toBe("fail");
    expect(resolveAgentPageSwipeIntent({ deltaX: -8, deltaY: 2, index: 1 })).toBe("wait");
  });

  it("hands a swipe past either end to the panel behind it", () => {
    expect(resolveAgentPageSwipeIntent({ deltaX: 12, deltaY: 0, index: 0 })).toBe("fail");
    expect(resolveAgentPageSwipeIntent({ deltaX: -12, deltaY: 0, index: 2 })).toBe("fail");
  });
});

describe("resolveAgentPageSwipeEnd", () => {
  it("moves one page past a third of the width or on a flick, else returns", () => {
    expect(resolveAgentPageSwipeEnd({ startIndex: 1, position: 1.4, velocityX: 0 })).toBe(2);
    expect(resolveAgentPageSwipeEnd({ startIndex: 1, position: 1.2, velocityX: 0 })).toBe(1);
    expect(resolveAgentPageSwipeEnd({ startIndex: 1, position: 1.1, velocityX: -900 })).toBe(2);
    expect(resolveAgentPageSwipeEnd({ startIndex: 1, position: 0.9, velocityX: 900 })).toBe(0);
  });

  it("never passes the ends or skips a page", () => {
    expect(resolveAgentPageSwipeEnd({ startIndex: 2, position: 2.2, velocityX: -900 })).toBe(2);
    expect(resolveAgentPageSwipeEnd({ startIndex: 0, position: -0.1, velocityX: 900 })).toBe(0);
    expect(resolveAgentPageSwipeEnd({ startIndex: 0, position: 1.9, velocityX: 0 })).toBe(1);
  });

  it("a flick against the drag does not jump the other way", () => {
    expect(resolveAgentPageSwipeEnd({ startIndex: 1, position: 0.95, velocityX: -900 })).toBe(1);
  });
});

describe("dragAgentPagePosition", () => {
  it("follows the finger between pages and resists past the ends", () => {
    expect(dragAgentPagePosition({ startIndex: 1, dragPages: 0.5 })).toBe(1.5);
    expect(dragAgentPagePosition({ startIndex: 0, dragPages: -0.4 })).toBeCloseTo(-0.1);
    expect(dragAgentPagePosition({ startIndex: 2, dragPages: 0.4 })).toBeCloseTo(2.1);
  });
});

describe("latestAgentPageCall", () => {
  it("returns the assistant's newest show_page call with a valid page", () => {
    const items = [
      call("mcp__paseo__show_page", { page: "face" }),
      call("show_stat", { label: "x", value: 1 }),
      call("show_page", { page: "settings" }),
      call("show_page", { page: "show" }, "failed"),
    ];
    expect(latestAgentPageCall(items)).toEqual({
      id: `call-${seq - 3}`,
      page: "face",
      at: items[0]!.timestamp.getTime(),
    });
  });

  it("is null without page calls", () => {
    expect(latestAgentPageCall([call("show_stat", { label: "x", value: 1 })])).toBeNull();
  });
});

describe("pagerTakesBack", () => {
  it("takes Back from the assistant's face or Show back to the chat", () => {
    expect(pagerTakesBack({ active: true, page: "face", coveredByPanel: false })).toBe(true);
    expect(pagerTakesBack({ active: true, page: "show", coveredByPanel: false })).toBe(true);
  });

  it("leaves Back alone on the chat and while the pages are not the active panel", () => {
    expect(pagerTakesBack({ active: true, page: "chat", coveredByPanel: false })).toBe(false);
    expect(pagerTakesBack({ active: false, page: "face", coveredByPanel: false })).toBe(false);
  });

  it("leaves Back to the agent list or the explorer slid over the pages", () => {
    expect(pagerTakesBack({ active: true, page: "face", coveredByPanel: true })).toBe(false);
    expect(pagerTakesBack({ active: true, page: "show", coveredByPanel: true })).toBe(false);
  });
});
