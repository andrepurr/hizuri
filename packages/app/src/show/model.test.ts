import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  EMPTY_SHOW_STATE,
  deriveShowState,
  isFreshShowCall,
  parseLimitsOutput,
  parseScreenOutput,
  resolveVisibleWindowId,
  screenStreamUrl,
  selectShowItems,
  showToolName,
} from "./model";

let seq = 0;

function call(
  name: string,
  input: Record<string, unknown>,
  options: { status?: "running" | "completed" | "failed"; output?: unknown; at?: number } = {},
): StreamItem {
  seq += 1;
  return {
    kind: "tool_call",
    id: `agent_tool_${seq}`,
    timestamp: new Date(options.at ?? 1_000 + seq),
    payload: {
      source: "agent",
      data: {
        provider: "claude",
        callId: `call-${seq}`,
        name,
        status: options.status ?? "completed",
        error: null,
        detail: { type: "unknown", input, output: options.output ?? null },
      },
    },
  };
}

const LIMITS_TEXT = JSON.stringify({
  ok: true,
  sources: [
    {
      sourceId: "claude",
      sourceLabel: "Claude",
      windows: [{ id: "five_hour", label: "Session", usedPct: 34, resetsAt: null }],
    },
  ],
});

describe("showToolName", () => {
  it("strips the MCP server prefix and keeps only show tools", () => {
    expect(showToolName("mcp__paseo__show_stat")).toBe("show_stat");
    expect(showToolName("show_limits")).toBe("show_limits");
    expect(showToolName("mcp__paseo__speak")).toBeNull();
    expect(showToolName("Bash")).toBeNull();
    // Films and music go to the media player, so they never pop the Show stage open.
    expect(showToolName("mcp__paseo__show_media")).toBeNull();
  });
});

describe("deriveShowState", () => {
  it("is empty without show calls", () => {
    expect(deriveShowState([call("mcp__paseo__speak", { text: "hi" })])).toBe(EMPTY_SHOW_STATE);
  });

  it("puts widgets into the window Zuri names and makes it active", () => {
    const state = deriveShowState([
      call("mcp__paseo__show_stat", { window: "Money", label: "Balance", value: "€4.10" }),
      call("mcp__paseo__show_card", { window: "Build", title: "Green", body: "All tests pass" }),
    ]);
    expect(state.windows.map((window) => window.title)).toEqual(["Money", "Build"]);
    expect(state.activeWindowId).toBe("build");
    expect(state.windows[0]?.widgets).toEqual([
      {
        id: "stat:balance",
        kind: "stat",
        props: { label: "Balance", value: "€4.10" },
        status: "completed",
      },
    ]);
  });

  it("updates a widget in place by label or explicit id", () => {
    const state = deriveShowState([
      call("show_progress", { window: "Build", label: "Tests", percent: 10 }),
      call("show_progress", { window: "Build", label: "Tests", percent: 80 }),
      call("show_stat", { window: "Build", id: "eta", label: "ETA", value: "4 min" }),
      call("show_stat", { window: "Build", id: "eta", label: "ETA", value: "1 min" }),
    ]);
    const widgets = state.windows[0]?.widgets ?? [];
    expect(
      widgets.map((widget) => [widget.id, widget.props.percent ?? widget.props.value]),
    ).toEqual([
      ["progress:tests", 80],
      ["eta", "1 min"],
    ]);
  });

  it("without a window name, reuses the active window, else the default one", () => {
    const first = deriveShowState([call("show_card", { title: "Hi", body: "x" })]);
    expect(first.windows.map((window) => window.title)).toEqual(["Show"]);
    const second = deriveShowState([
      call("show_card", { window: "Agents", title: "A", body: "x" }),
      call("show_card", { title: "B", body: "y" }),
    ]);
    expect(second.windows.map((window) => window.widgets.length)).toEqual([2]);
  });

  it("draws nothing for a call the daemon rejected", () => {
    const state = deriveShowState([
      call("show_progress", { label: "x", percent: 140 }, { status: "failed" }),
    ]);
    expect(state.windows).toEqual([]);
  });

  it("shows limits as loading until the result arrives, then with its numbers", () => {
    const running = deriveShowState([call("show_limits", {}, { status: "running" })]);
    expect(running.windows[0]).toMatchObject({
      title: "Limits",
      widgets: [{ id: "limits", kind: "limits", status: "running", props: {} }],
    });
    const done = deriveShowState([
      call("show_limits", {}, { output: [{ type: "text", text: LIMITS_TEXT }] }),
    ]);
    expect(done.windows[0]?.widgets[0]).toMatchObject({
      status: "completed",
      props: { sources: [{ sourceId: "claude" }] },
    });
  });

  it("a refresh in flight keeps the last numbers instead of flashing back to loading", () => {
    const first = call("show_limits", {}, { output: [{ type: "text", text: LIMITS_TEXT }] });
    const refreshing = call("show_limits", { refresh: true }, { status: "running" });
    expect(deriveShowState([first, refreshing]).windows[0]?.widgets[0]).toMatchObject({
      status: "completed",
      props: { sources: [{ sourceId: "claude" }] },
    });
  });

  it("a result that does not parse shows no data, not loading forever", () => {
    const state = deriveShowState([call("show_limits", {}, { output: "not json" })]);
    expect(state.windows[0]?.widgets[0]).toMatchObject({ status: "completed", props: {} });
  });

  it("a show_page call moves pages only: it opens no window and is not a new show", () => {
    const shown = call("show_stat", { label: "Balance", value: "€4" });
    const before = deriveShowState([shown]);
    const after = deriveShowState([shown, call("mcp__paseo__show_page", { page: "face" })]);
    expect(after).toEqual(before);
    expect(deriveShowState([call("show_page", { page: "show" })])).toEqual(EMPTY_SHOW_STATE);
  });

  // The Claude provider pushes a running update each time a top-level key of the input has
  // streamed in; a 24-row table's rows take Zuri ~30 s to write.
  it("a widget call still streaming in changes nothing until it completes", () => {
    const rows = [["33", "Three pages"]];
    const shown = call("show_table", {
      window: "Kanban",
      id: "kanban",
      title: "Kanban 16:22",
      columns: ["#", "Task"],
      rows,
    });
    const before = deriveShowState([shown]);
    for (const partial of [
      {},
      { window: "Kanban" },
      { window: "Kanban", id: "kanban" },
      { window: "Kanban", id: "kanban", title: "Kanban 16:24", columns: ["#", "Task"] },
    ]) {
      const streaming = call("show_table", partial, { status: "running" });
      expect(deriveShowState([shown, streaming])).toEqual(before);
    }
    const done = deriveShowState([
      shown,
      call("show_table", { window: "Kanban", id: "kanban", title: "Kanban 16:24", rows: [] }),
    ]);
    expect(done.windows[0]?.widgets.map((widget) => widget.props.title)).toEqual(["Kanban 16:24"]);
    expect(done.lastCall).not.toEqual(before.lastCall);
  });

  it("a first widget still streaming in opens nothing yet", () => {
    const state = deriveShowState([call("show_card", { window: "A" }, { status: "running" })]);
    expect(state.windows).toEqual([]);
    expect(state.lastCall).toBeNull();
  });

  it("a window closed and refilled keeps its old content until the refill completes", () => {
    const shown = [
      call("show_card", { window: "News", title: "n", body: "" }),
      call("show_table", { window: "Kanban", id: "kanban", columns: ["#"], rows: [["1"]] }),
    ];
    const close = call("show_window", { window: "Kanban", action: "close" }, { at: 5_000 });
    const before = deriveShowState(shown);
    // The refill's block starts before the close's result: first with no input at all.
    for (const partial of [{}, { window: "Kanban" }, { window: "Kanban", id: "k-work" }]) {
      const refill = call("show_card", partial, { status: "running", at: 4_990 });
      const state = deriveShowState([...shown, close, refill]);
      expect(state.windows).toEqual(before.windows);
      expect(state.activeWindowId).toBe("kanban");
    }
    const refilled = deriveShowState([
      ...shown,
      close,
      call("show_card", { window: "Kanban", id: "k-work", title: "In work", body: "33" }),
    ]);
    expect(refilled.windows.map((window) => window.id)).toEqual(["news", "kanban"]);
    expect(refilled.windows[1]?.widgets.map((widget) => widget.id)).toEqual(["k-work"]);
    expect(refilled.activeWindowId).toBe("kanban");
  });

  it("a close goes through once the next call names another window", () => {
    const shown = [
      call("show_card", { window: "News", title: "n", body: "" }),
      call("show_card", { window: "Kanban", title: "k", body: "" }),
    ];
    const close = call("show_window", { window: "Kanban", action: "close" });
    const elsewhere = call("show_card", { window: "News" }, { status: "running" });
    const state = deriveShowState([...shown, close, elsewhere]);
    expect(state.windows.map((window) => window.id)).toEqual(["news"]);
    expect(state.activeWindowId).toBe("news");
  });

  it("a close that returned before the next call began stays closed while that call streams", () => {
    const shown = [
      call("show_card", { window: "Plan", title: "p", body: "" }),
      call("show_table", { window: "Kanban", id: "kanban", columns: ["#"], rows: [["1"]] }),
      call("show_window", { window: "Plan" }),
    ];
    const close = call("show_window", { window: "Plan", action: "close" }, { at: 5_000 });
    const closed = deriveShowState([...shown, close]);
    expect(closed.activeWindowId).toBe("kanban");
    // The assistant's next message, seconds later: its first running update has no input yet.
    const next = call("show_table", {}, { status: "running", at: 9_000 });
    expect(deriveShowState([...shown, close, next])).toEqual(closed);
  });

  it("show_window switches to an existing window and closes one", () => {
    const items = [
      call("show_card", { window: "A", title: "a", body: "" }),
      call("show_card", { window: "B", title: "b", body: "" }),
      call("show_window", { window: "a" }),
    ];
    expect(deriveShowState(items).activeWindowId).toBe("a");
    const closed = deriveShowState([
      ...items,
      call("show_window", { window: "A", action: "close" }),
    ]);
    expect(closed.windows.map((window) => window.id)).toEqual(["b"]);
    expect(closed.activeWindowId).toBe("b");
  });
});

describe("parseLimitsOutput", () => {
  it("reads the JSON from text, blocks or structured content", () => {
    expect(parseLimitsOutput(LIMITS_TEXT)?.sources).toHaveLength(1);
    expect(parseLimitsOutput({ structuredContent: JSON.parse(LIMITS_TEXT) })?.sources).toHaveLength(
      1,
    );
    expect(parseLimitsOutput(`sources_count=1\n\n${LIMITS_TEXT}`)?.sources).toHaveLength(1);
    expect(parseLimitsOutput({ output: JSON.parse(LIMITS_TEXT) })?.sources).toHaveLength(1);
    expect(parseLimitsOutput("not json")).toBeNull();
  });
});

describe("show_screen", () => {
  const SCREEN_OUTPUT = {
    ok: true,
    window: "Screen",
    screen: { url: "http://192.0.2.1:8481/" },
  };

  it("opens a Screen window with the stream URL once the call completes", () => {
    const running = deriveShowState([call("mcp__paseo__show_screen", {}, { status: "running" })]);
    expect(running.windows).toEqual([
      { id: "screen", title: "Screen", widgets: [], screen: { url: null } },
    ]);
    const done = deriveShowState([
      call("show_limits", {}, { output: LIMITS_TEXT }),
      call("mcp__paseo__show_screen", {}, { output: { output: SCREEN_OUTPUT } }),
    ]);
    expect(done.activeWindowId).toBe("screen");
    expect(done.windows.map((window) => window.screen)).toEqual([
      null,
      { url: "http://192.0.2.1:8481/" },
    ]);
  });

  it("loads only http(s) stream URLs", () => {
    expect(parseScreenOutput(JSON.stringify(SCREEN_OUTPUT))).toBe("http://192.0.2.1:8481/");
    expect(parseScreenOutput({ screen: { url: "javascript:alert(1)" } })).toBeNull();
    expect(parseScreenOutput({ screen: { url: "not a url" } })).toBeNull();
    expect(parseScreenOutput("not json")).toBeNull();
  });

  it("is watch-only (#shared) until the user takes over", () => {
    expect(screenStreamUrl("http://192.0.2.1:8481/", false)).toBe("http://192.0.2.1:8481/#shared");
    expect(screenStreamUrl("http://192.0.2.1:8481/#shared", true)).toBe("http://192.0.2.1:8481/");
  });
});

describe("resolveVisibleWindowId", () => {
  const state = deriveShowState([
    call("show_card", { window: "A", title: "a", body: "" }),
    call("show_card", { window: "B", title: "b", body: "" }),
  ]);

  it("keeps the user's pick until Zuri shows something newer", () => {
    const pick = { windowId: "a", afterCallId: state.lastCall?.id ?? null };
    expect(resolveVisibleWindowId({ state, userPick: pick })).toBe("a");
    expect(resolveVisibleWindowId({ state, userPick: { ...pick, afterCallId: "older" } })).toBe(
      "b",
    );
  });
});

describe("isFreshShowCall", () => {
  it("opens only for a new call made in the last two minutes", () => {
    const lastCall = { id: "c1", at: 10_000 };
    expect(isFreshShowCall({ lastCall, seenCallId: null, now: 20_000 })).toBe(true);
    expect(isFreshShowCall({ lastCall, seenCallId: "c1", now: 20_000 })).toBe(false);
    expect(isFreshShowCall({ lastCall, seenCallId: null, now: 10_000 + 3 * 60_000 })).toBe(false);
  });
});

describe("selectShowItems", () => {
  it("collects show calls from tail and head without duplicates", () => {
    const stat = call("show_stat", { label: "x", value: "1" });
    const speak = call("mcp__paseo__speak", { text: "hi" });
    const running = call("show_limits", {}, { status: "running" });
    const session = {
      agentStreamTail: new Map([["agent", [speak, stat]]]),
      agentStreamHead: new Map([["agent", [stat, running]]]),
    };
    expect(selectShowItems(session, "agent")).toEqual([stat, running]);
    expect(selectShowItems(session, "other")).toEqual([]);
    expect(selectShowItems(undefined, "agent")).toEqual([]);
  });
});
