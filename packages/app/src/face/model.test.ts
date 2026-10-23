import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { parseFacePageMessage } from "./bridge";
import { createReplyAnnouncer, faceAvatarUrl, selectLatestSpeak, splitSpeechTags } from "./model";

describe("splitSpeechTags", () => {
  it("reads the emotion, then motion and outfit in either order", () => {
    expect(splitSpeechTags("[happy][motion:greet][outfit:evening] Hello!")).toEqual({
      emotion: "happy",
      intimate: false,
      motion: "greet",
      outfit: "evening",
      text: "Hello!",
    });
    expect(splitSpeechTags("[ sad ] [outfit:noir][gesture:Peace] ok").motion).toBe("peace");
  });

  it("shows [intimate] as the relaxed face", () => {
    expect(splitSpeechTags("[intimate] hi")).toMatchObject({ emotion: "relaxed", intimate: true });
  });

  it("leaves untagged or unknown tags as text", () => {
    expect(splitSpeechTags("[motion:greet] hi")).toMatchObject({ emotion: "neutral", motion: "" });
    expect(splitSpeechTags("[note] hi").text).toBe("[note] hi");
  });
});

function toolCall(callId: string, name: string, input: unknown): StreamItem {
  return {
    kind: "tool_call",
    id: callId,
    timestamp: new Date(0),
    payload: {
      source: "agent",
      data: { callId, name, status: "running", detail: { type: "unknown", input, output: null } },
    },
  } as unknown as StreamItem;
}

describe("selectLatestSpeak", () => {
  it("finds the assistant's latest speak call, MCP-prefixed or not", () => {
    const items = [
      toolCall("a", "speak", "[happy] one"),
      toolCall("b", "mcp__paseo__speak", { text: "[sad] two" }),
      toolCall("c", "mcp__paseo__show_card", { title: "x" }),
    ];
    const session = { agentStreamTail: new Map([["agent", items]]) };
    expect(selectLatestSpeak(session, "agent")).toEqual({ id: "b", text: "[sad] two" });
    const textOnly = { agentStreamTail: new Map([["agent", items.slice(0, 1)]]) };
    expect(selectLatestSpeak(textOnly, "agent")).toEqual({ id: "a", text: "[happy] one" });
    expect(selectLatestSpeak(session, "other")).toBeNull();
  });
});

describe("faceAvatarUrl", () => {
  it("uses the daemon's own origin on a direct connection", () => {
    const direct = { type: "directTcp", endpoint: "192.0.2.1:6768", display: "" } as const;
    expect(faceAvatarUrl(direct, { secure: false })).toBe("http://192.0.2.1:6768/avatar/?host=app");
    const local = { type: "directTcp", endpoint: "127.0.0.1:6797", display: "" } as const;
    expect(faceAvatarUrl(local, { secure: true })).toBe("https://localhost:6797/avatar/?host=app");
  });

  it("has no page through the relay", () => {
    expect(
      faceAvatarUrl({ type: "relay", endpoint: "x", display: "relay" }, { secure: false }),
    ).toBe(null);
    expect(faceAvatarUrl(null, { secure: false })).toBeNull();
  });
});

describe("parseFacePageMessage", () => {
  it("accepts only the page's own message types", () => {
    expect(parseFacePageMessage('{"type":"face.ready"}')).toEqual({ type: "face.ready" });
    expect(parseFacePageMessage({ type: "face.progress", value: 3 })).toEqual({
      type: "face.progress",
      value: 1,
    });
    expect(parseFacePageMessage({ type: "navigate", url: "https://example.com" })).toBeNull();
    expect(parseFacePageMessage("not json")).toBeNull();
  });

  it("keeps a page's request for the voice PCM and drops unknown ones", () => {
    expect(parseFacePageMessage({ type: "face.ready", audio: "pcm16" })).toEqual({
      type: "face.ready",
      audio: "pcm16",
    });
    expect(parseFacePageMessage({ type: "face.ready", audio: "opus" })).toEqual({
      type: "face.ready",
    });
  });
});

describe("createReplyAnnouncer", () => {
  const a = { id: "a", text: "[happy] [motion:wave] Hi" };
  const b = { id: "b", text: "[happy] [motion:kiss] Bye" };
  const chunk = (startedAt: number, durationMs = 700) => ({
    startedAt,
    durationMs,
    audibleAt: startedAt + 50,
  });

  it("sends a new call with its first chunk only", () => {
    const announcer = createReplyAnnouncer(null);
    expect(announcer.chunk(a, chunk(0))).toBe(a);
    expect(announcer.chunk(a, chunk(700))).toBeNull();
    expect(announcer.speak(a, 800)).toBeNull();
  });

  it("tells a call that comes after its voice began, with that voice's start", () => {
    const announcer = createReplyAnnouncer("a");
    expect(announcer.chunk(a, chunk(10_000))).toBeNull();
    expect(announcer.chunk(a, chunk(10_700))).toBeNull();
    expect(announcer.speak(b, 10_900)).toEqual({ speak: b, audibleAt: 10_050 });
    expect(announcer.chunk(b, chunk(11_400))).toBeNull();
  });

  it("leaves a call that comes before its voice to the voice's first chunk", () => {
    const announcer = createReplyAnnouncer(null);
    expect(announcer.chunk(a, chunk(0))).toBe(a);
    expect(announcer.speak(b, 900)).toBeNull();
    expect(announcer.chunk(b, chunk(5_000))).toBe(b);
  });

  it("does not give a call to a stretch already heard out", () => {
    const announcer = createReplyAnnouncer("a");
    announcer.chunk(a, chunk(0, 700));
    expect(announcer.speak(b, 2_000)).toBeNull();
    expect(announcer.chunk(b, chunk(3_000))).toBe(b);
  });

  it("drops a stretch whose call never came in time", () => {
    const announcer = createReplyAnnouncer("a");
    announcer.chunk(a, chunk(0));
    expect(announcer.speak(b, 9_000)).toBeNull();
    expect(announcer.chunk(b, chunk(9_100))).toBe(b);
  });
});
