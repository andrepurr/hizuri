import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { faceActivity, selectToolRunning } from "./activity";

const quiet = { hearing: false, speaking: false, answering: false, toolRunning: false };

describe("faceActivity", () => {
  it("is idle with nothing going on", () => {
    expect(faceActivity(quiet)).toBe("idle");
  });

  it("listens while the user speaks, even while the assistant speaks or works", () => {
    expect(faceActivity({ ...quiet, hearing: true })).toBe("listening");
    expect(
      faceActivity({ hearing: true, speaking: true, answering: true, toolRunning: true }),
    ).toBe("listening");
  });

  it("speaks over thinking and working", () => {
    expect(faceActivity({ ...quiet, speaking: true, answering: true, toolRunning: true })).toBe(
      "speaking",
    );
  });

  it("thinks while answering, works while a tool runs", () => {
    expect(faceActivity({ ...quiet, answering: true })).toBe("thinking");
    expect(faceActivity({ ...quiet, answering: true, toolRunning: true })).toBe("working");
  });

  it("ignores a running tool outside the assistant's turn", () => {
    expect(faceActivity({ ...quiet, toolRunning: true })).toBe("idle");
  });
});

function toolCall(callId: string, name: string, status: string): StreamItem {
  return {
    kind: "tool_call",
    id: callId,
    timestamp: new Date(0),
    payload: {
      source: "agent",
      data: { callId, name, status, detail: { type: "unknown", input: null, output: null } },
    },
  } as unknown as StreamItem;
}

function userMessage(id: string): StreamItem {
  return { kind: "user_message", id, text: "hi", timestamp: new Date(0) } as StreamItem;
}

function session(items: StreamItem[]) {
  return { agentStreamTail: new Map([["agent", items]]) };
}

describe("selectToolRunning", () => {
  it("finds a running tool call other than speak", () => {
    expect(selectToolRunning(session([toolCall("a", "Bash", "running")]), "agent")).toBe(true);
    expect(
      selectToolRunning(
        session([toolCall("a", "Bash", "running"), toolCall("b", "Read", "completed")]),
        "agent",
      ),
    ).toBe(true);
  });

  it("does not count speak or finished calls", () => {
    expect(
      selectToolRunning(session([toolCall("a", "mcp__paseo__speak", "running")]), "agent"),
    ).toBe(false);
    expect(selectToolRunning(session([toolCall("a", "Bash", "completed")]), "agent")).toBe(false);
    expect(selectToolRunning(session([toolCall("a", "Bash", "canceled")]), "agent")).toBe(false);
  });

  it("stops at the user's last message", () => {
    expect(
      selectToolRunning(session([toolCall("a", "Bash", "running"), userMessage("u")]), "agent"),
    ).toBe(false);
  });

  it("is false for an unknown agent", () => {
    expect(selectToolRunning(undefined, "agent")).toBe(false);
    expect(selectToolRunning(session([]), "other")).toBe(false);
  });
});
