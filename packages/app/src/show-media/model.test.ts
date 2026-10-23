import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  EMPTY_MEDIA_HOST_STATE,
  applyMediaCall,
  mediaToolName,
  readMediaCall,
  readMediaCommand,
  readMediaPlan,
  readToolAnswer,
  selectMediaItems,
  takeFreshMediaCalls,
  type AppPlan,
  type VideoPlan,
} from "./model";

let seq = 0;

function call(
  name: string,
  output: unknown,
  options: { status?: "running" | "completed" | "failed"; at?: number; seq?: number } = {},
): StreamItem {
  seq = options.seq ?? seq + 1;
  return {
    kind: "tool_call",
    id: `agent_tool_${seq}`,
    timestamp: new Date(options.at ?? 1_000_000),
    payload: {
      source: "agent",
      data: {
        provider: "claude",
        callId: `call-${seq}`,
        name,
        status: options.status ?? "completed",
        error: null,
        detail: { type: "unknown", input: {}, output },
      },
    },
  };
}

const VIDEO: VideoPlan = {
  lane: "video",
  uri: "/hizuri-media/file/tok/film.mkv",
  contentType: "auto",
  title: "Film",
  startAt: null,
  queue: [],
};

const SPOTIFY: AppPlan = {
  lane: "app",
  app: "spotify",
  url: "https://open.spotify.com/search/Metallica",
  androidPackage: "com.spotify.music",
  query: "Metallica",
  playFromSearch: true,
};

function answerText(payload: Record<string, unknown>): unknown {
  // How the Claude provider hands an MCP tool's text answer to the app.
  return [{ type: "text", text: JSON.stringify(payload) }];
}

describe("mediaToolName", () => {
  it("accepts bare and MCP-prefixed names and nothing else", () => {
    expect(mediaToolName("show_media")).toBe("show_media");
    expect(mediaToolName("mcp__paseo__media_control")).toBe("media_control");
    expect(mediaToolName("show_stat")).toBeNull();
    expect(mediaToolName("Bash")).toBeNull();
  });
});

describe("reading tool answers", () => {
  it("reads text, content blocks, objects and structuredContent", () => {
    const payload = { ok: true, plan: VIDEO };
    expect(readToolAnswer(JSON.stringify(payload))).toEqual(payload);
    expect(readToolAnswer(answerText(payload))).toEqual(payload);
    expect(readToolAnswer(payload)).toEqual(payload);
    expect(readToolAnswer({ structuredContent: payload })).toEqual(payload);
    // The Claude provider's shape: the JSON text, parsed, under `output`.
    expect(readToolAnswer({ output: payload })).toEqual(payload);
    expect(readToolAnswer({ output: JSON.stringify(payload) })).toEqual(payload);
    expect(readToolAnswer("Error: Nothing to show")).toBeNull();
    expect(readToolAnswer({ ok: false })).toBeNull();
  });

  it("reads plans tolerantly: unknown lanes and broken plans are skipped", () => {
    expect(readMediaPlan(VIDEO)).toEqual(VIDEO);
    expect(readMediaPlan({ ...VIDEO, contentType: "smooth", extra: 1 })).toEqual({
      ...VIDEO,
      contentType: "auto",
    });
    expect(readMediaPlan({ lane: "hologram" })).toBeNull();
    expect(readMediaPlan({ lane: "youtube", videoId: null, playlistId: null })).toBeNull();
    expect(readMediaPlan({ ...SPOTIFY, app: "winamp" })).toBeNull();
  });

  it("reads commands and clamps volume", () => {
    expect(readMediaCommand({ action: "next" })).toEqual({ action: "next" });
    expect(readMediaCommand({ action: "volume", volume: 250 })).toEqual({
      action: "volume",
      volume: 100,
    });
    expect(readMediaCommand({ action: "seek", position: null, offset: -15 })).toEqual({
      action: "seek",
      position: null,
      offset: -15,
    });
    expect(readMediaCommand({ action: "seek" })).toBeNull();
    expect(readMediaCommand({ action: "rewind" })).toBeNull();
  });

  it("acts only on completed calls with a readable answer", () => {
    const done = call("mcp__paseo__show_media", answerText({ ok: true, plan: VIDEO }));
    expect(readMediaCall(done)).toMatchObject({ kind: "show", plan: VIDEO });
    const fromClaude = call("mcp__paseo__show_media", { output: { ok: true, plan: VIDEO } });
    expect(readMediaCall(fromClaude)).toMatchObject({ kind: "show", plan: VIDEO });
    expect(readMediaCall(call("show_media", null, { status: "running" }))).toBeNull();
    expect(
      readMediaCall(call("show_media", "Error: No such file", { status: "failed" })),
    ).toBeNull();
  });
});

describe("takeFreshMediaCalls", () => {
  it("runs each new call once and skips history older than the window", () => {
    const now = 10_000_000;
    const old = call("show_media", answerText({ ok: true, plan: VIDEO }), { at: now - 600_000 });
    const fresh = call("media_control", answerText({ ok: true, command: { action: "pause" } }), {
      at: now - 1_000,
    });
    const seen = new Set<string>();

    const first = takeFreshMediaCalls({ items: [old, fresh], seen, now });
    expect(first.map((c) => c.kind)).toEqual(["control"]);
    expect(takeFreshMediaCalls({ items: [old, fresh], seen, now })).toEqual([]);

    // A call that was still running when first seen runs once it completes.
    const running = call("show_media", null, { status: "running", at: now });
    expect(takeFreshMediaCalls({ items: [running], seen, now })).toEqual([]);
    const completed = call("show_media", answerText({ ok: true, plan: SPOTIFY }), {
      at: now,
      seq,
    });
    expect(takeFreshMediaCalls({ items: [completed], seen, now })).toMatchObject([
      { kind: "show", plan: SPOTIFY },
    ]);
  });
});

describe("selectMediaItems", () => {
  it("merges tail and head by item id, keeping only media calls", () => {
    const media = call("show_media", answerText({ ok: true, plan: VIDEO }));
    const other = call("Bash", null);
    const session = {
      agentStreamTail: new Map([["a", [media, other]]]),
      agentStreamHead: new Map([["a", [media]]]),
    };
    expect(selectMediaItems(session, "a")).toEqual([media]);
    expect(selectMediaItems(session, "b")).toEqual([]);
    expect(selectMediaItems(undefined, "a")).toEqual([]);
  });
});

describe("applyMediaCall", () => {
  const pause = { kind: "control", id: "c2", at: 0, command: { action: "pause" } } as const;

  it("a player plan needs nothing here (the stage opens the tab); commands go to the player", () => {
    const opened = applyMediaCall(
      EMPTY_MEDIA_HOST_STATE,
      { kind: "show", id: "c1", at: 0, plan: VIDEO },
      false,
    );
    expect(opened.effects).toEqual([]);
    const paused = applyMediaCall(opened.state, pause, true);
    expect(paused.effects).toEqual([{ type: "player-command", command: { action: "pause" } }]);
  });

  it("the user's app takes over, and commands with no player tab go to the app", () => {
    const opened = applyMediaCall(
      EMPTY_MEDIA_HOST_STATE,
      { kind: "show", id: "c1", at: 0, plan: SPOTIFY },
      true,
    );
    expect(opened.state).toEqual({ external: SPOTIFY });
    expect(opened.effects).toEqual([{ type: "open-app", plan: SPOTIFY }]);
    const next = applyMediaCall(
      opened.state,
      { kind: "control", id: "c3", at: 0, command: { action: "next" } },
      false,
    );
    expect(next.effects).toEqual([
      { type: "external-command", app: SPOTIFY, command: { action: "next" } },
    ]);
    // A film after the app: commands go to hizuri's player, the app is forgotten.
    const film = applyMediaCall(next.state, { kind: "show", id: "c4", at: 0, plan: VIDEO }, false);
    expect(film.state).toEqual({ external: null });
  });
});
