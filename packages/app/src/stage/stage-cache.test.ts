import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stage } from "@getpaseo/protocol/stage";
import { MAX_CACHED_STAGE_CHARS, loadCachedStage, saveCachedStage } from "./stage-cache";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

function stageOf(html: string): Stage {
  return {
    v: 1,
    agentId: "agent-1",
    revision: 1,
    tabs: [{ id: "page", title: "Page", blocks: [{ type: "web", id: "file", props: { html } }] }],
    closed: [],
  } as unknown as Stage;
}

describe("stage cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a stage of normal size", async () => {
    await saveCachedStage("srv", stageOf("<p>hi</p>"));
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
  });

  it("drops a stage too big for Android to read back instead of writing it", async () => {
    await saveCachedStage("srv", stageOf("x".repeat(MAX_CACHED_STAGE_CHARS)));
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("hizuri-stage:v1:srv:agent-1");
  });

  it("drops a row that fails to read", async () => {
    vi.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error("Row too big"));
    await expect(loadCachedStage("srv", "agent-1")).rejects.toThrow("Row too big");
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("hizuri-stage:v1:srv:agent-1");
  });
});
