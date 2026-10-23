import { describe, expect, it } from "vitest";
import type { FirstOpenAgent } from "@/navigation/first-open";
import {
  isHostSectionShown,
  isSettingsSectionShown,
  pickSimpleAgent,
  takePageRequest,
} from "./model";

function agent(id: string, overrides: Partial<FirstOpenAgent> = {}): FirstOpenAgent {
  return {
    id,
    workspaceId: `wks-${id}`,
    title: id,
    labels: {},
    lastUserMessageAt: null,
    lastActivityAt: new Date("2026-10-19T08:00:00Z"),
    archivedAt: null,
    parentAgentId: null,
    ...overrides,
  };
}

describe("pickSimpleAgent", () => {
  it("picks the agent of this device's voice session", () => {
    const agents = [
      agent("zuri"),
      agent("other", { lastActivityAt: new Date("2026-10-19T09:00:00Z") }),
    ];
    expect(pickSimpleAgent({ voiceAgentId: "zuri", agents })?.id).toBe("zuri");
  });

  it("otherwise picks the agent the user talked to last", () => {
    const agents = [
      agent("old", { lastUserMessageAt: new Date("2026-10-18T08:00:00Z") }),
      agent("recent", { lastUserMessageAt: new Date("2026-10-19T08:30:00Z") }),
    ];
    expect(pickSimpleAgent({ voiceAgentId: null, agents })?.id).toBe("recent");
  });

  it("never picks an archived agent, a subagent or an app-test agent", () => {
    const later = new Date("2026-10-19T10:00:00Z");
    const agents = [
      agent("zuri"),
      agent("archived", { lastActivityAt: later, archivedAt: later }),
      agent("child", { lastActivityAt: later, parentAgentId: "zuri" }),
      agent("TEST probe", { lastActivityAt: later }),
    ];
    expect(pickSimpleAgent({ voiceAgentId: "archived", agents })?.id).toBe("zuri");
  });

  it("has no agent while the host has none or has not answered", () => {
    expect(pickSimpleAgent({ voiceAgentId: null, agents: [] })).toBeNull();
    expect(pickSimpleAgent({ voiceAgentId: "zuri", agents: null })).toBeNull();
  });
});

describe("settings in the simple version", () => {
  it("shows only the app sections a normal person needs", () => {
    const shown = ["general", "appearance", "chat", "about"] as const;
    for (const id of shown) expect(isSettingsSectionShown(id, true)).toBe(true);
    for (const id of ["sidebar", "terminal", "diagnostics", "shortcuts"] as const) {
      expect(isSettingsSectionShown(id, true)).toBe(false);
      expect(isSettingsSectionShown(id, false)).toBe(true);
    }
  });

  it("shows only the host's overview, connections and pairing", () => {
    for (const id of ["host", "connections", "pair-device"] as const) {
      expect(isHostSectionShown(id, true)).toBe(true);
    }
    for (const id of ["projects", "agents", "workspaces", "providers", "plugins"] as const) {
      expect(isHostSectionShown(id, true)).toBe(false);
      expect(isHostSectionShown(id, false)).toBe(true);
    }
  });
});

describe("takePageRequest", () => {
  const request = { agentId: "zuri", page: "face" as const, at: 1_000 };

  it("hands a fresh request to the agent it names", () => {
    expect(takePageRequest({ request, agentId: "zuri", now: 1_500 })).toBe("face");
  });

  it("ignores a request for another agent or one left from long ago", () => {
    expect(takePageRequest({ request, agentId: "other", now: 1_500 })).toBeNull();
    expect(takePageRequest({ request, agentId: "zuri", now: 60_000 })).toBeNull();
    expect(takePageRequest({ request: null, agentId: "zuri", now: 1_500 })).toBeNull();
  });
});
