import { describe, expect, it } from "vitest";
import { isTestAgent, resolveFirstOpenTarget, type FirstOpenAgent } from "./first-open";

const SERVER = "srv_1";

function agent(id: string, overrides: Partial<FirstOpenAgent> = {}): FirstOpenAgent {
  return {
    id,
    workspaceId: `ws-${id}`,
    title: id,
    labels: {},
    lastUserMessageAt: new Date("2026-10-17T22:00:00Z"),
    lastActivityAt: new Date("2026-10-17T22:00:00Z"),
    archivedAt: null,
    parentAgentId: null,
    ...overrides,
  };
}

const ZURI = agent("zuri", { lastUserMessageAt: new Date("2026-10-17T22:52:04Z") });
// A throwaway test agent was active a minute after Zuri.
const TEST = agent("test", {
  title: "TEST voice-typing (throwaway)",
  lastUserMessageAt: new Date("2026-10-17T22:53:06Z"),
});

const base = {
  serverId: SERVER,
  localSession: null,
  hostVoiceSessions: { kind: "unavailable" } as const,
  agents: [ZURI, TEST],
  hasRestorableWorkspace: false,
  gaveUp: false,
};

describe("resolveFirstOpenTarget (Hizuri first open)", () => {
  it("waits for this device's saved session before deciding", () => {
    expect(resolveFirstOpenTarget({ ...base, localSession: undefined })).toEqual({ kind: "wait" });
  });

  it("opens this device's own session at once, without adopting anything", () => {
    expect(
      resolveFirstOpenTarget({
        ...base,
        localSession: { serverId: SERVER, agentId: "zuri", mode: "voice" },
        hostVoiceSessions: { kind: "loading" },
        agents: null,
      }),
    ).toEqual({ kind: "agent", agentId: "zuri", workspaceId: null, adopt: null });
  });

  it("a fresh device takes the host's parked voice session in voice", () => {
    expect(
      resolveFirstOpenTarget({
        ...base,
        hostVoiceSessions: { kind: "ready", sessions: [{ agentId: "zuri", held: false }] },
      }),
    ).toEqual({
      kind: "agent",
      agentId: "zuri",
      workspaceId: "ws-zuri",
      adopt: { serverId: SERVER, agentId: "zuri", mode: "voice" },
    });
  });

  it("a voice another device holds opens here in text, so it is not taken away", () => {
    const decision = resolveFirstOpenTarget({
      ...base,
      hostVoiceSessions: { kind: "ready", sessions: [{ agentId: "zuri", held: true }] },
    });
    expect(decision).toMatchObject({ kind: "agent", adopt: { mode: "text" } });
  });

  it("the voice session wins over the remembered workspace, and a test agent's never wins", () => {
    const decision = resolveFirstOpenTarget({
      ...base,
      hasRestorableWorkspace: true,
      hostVoiceSessions: {
        kind: "ready",
        sessions: [
          { agentId: "test", held: true },
          { agentId: "zuri", held: false },
        ],
      },
    });
    expect(decision).toMatchObject({ kind: "agent", agentId: "zuri" });
  });

  it("waits for the host's answer, then for its agents, until the wait runs out", () => {
    expect(resolveFirstOpenTarget({ ...base, hostVoiceSessions: { kind: "loading" } })).toEqual({
      kind: "wait",
    });
    expect(
      resolveFirstOpenTarget({
        ...base,
        agents: null,
        hostVoiceSessions: { kind: "ready", sessions: [{ agentId: "zuri", held: false }] },
      }),
    ).toEqual({ kind: "wait" });
    expect(
      resolveFirstOpenTarget({
        ...base,
        agents: null,
        hostVoiceSessions: { kind: "loading" },
        gaveUp: true,
      }),
    ).toEqual({ kind: "default" });
  });

  it("without a voice session it keeps the remembered workspace restore", () => {
    expect(resolveFirstOpenTarget({ ...base, hasRestorableWorkspace: true })).toEqual({
      kind: "default",
    });
  });

  it("with nothing remembered it opens the most recently active agent, skipping test, archived and child agents", () => {
    const archived = agent("old", {
      archivedAt: new Date(),
      lastUserMessageAt: new Date("2026-10-17T23:00:00Z"),
    });
    const child = agent("child", {
      parentAgentId: "zuri",
      lastUserMessageAt: new Date("2026-10-17T23:00:00Z"),
    });
    const labelled = agent("labelled", {
      labels: { purpose: "app-test" },
      lastUserMessageAt: new Date("2026-10-17T23:00:00Z"),
    });
    expect(
      resolveFirstOpenTarget({ ...base, agents: [ZURI, TEST, archived, child, labelled] }),
    ).toEqual({ kind: "agent", agentId: "zuri", workspaceId: "ws-zuri", adopt: null });
  });

  it("with no agent at all it falls back to the project list", () => {
    expect(resolveFirstOpenTarget({ ...base, agents: [TEST] })).toEqual({ kind: "default" });
  });
});

describe("isTestAgent", () => {
  it("knows the app-test label and the TEST title convention", () => {
    expect(isTestAgent({ title: "TEST session-controls (throwaway)", labels: {} })).toBe(true);
    expect(isTestAgent({ title: "Zuri", labels: { purpose: "app-test" } })).toBe(true);
    expect(isTestAgent({ title: "Test the build", labels: {} })).toBe(false);
    expect(isTestAgent({ title: null, labels: {} })).toBe(false);
  });
});
