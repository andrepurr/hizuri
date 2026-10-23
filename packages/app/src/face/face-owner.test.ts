import { beforeEach, describe, expect, it } from "vitest";
import { claimFace, releaseFace, resetFaceOwner, useFaceOwnerStore } from "./face-owner";

describe("face owner (one avatar at a time)", () => {
  beforeEach(() => {
    resetFaceOwner();
  });

  it("keeps the face with the agent the user talks with, not the page in front", () => {
    claimFace("server/zuri", { voice: true, shown: false });
    claimFace("server/kaya", { voice: false, shown: true });
    expect(useFaceOwnerStore.getState().owner).toBe("server/zuri");
  });

  it("gives the face to the page in front when nobody talks", () => {
    claimFace("server/zuri", { voice: false, shown: false });
    claimFace("server/kaya", { voice: false, shown: true });
    expect(useFaceOwnerStore.getState().owner).toBe("server/kaya");
  });

  it("hands the face to the next claimant when the current holder goes", () => {
    claimFace("server/zuri", { voice: true, shown: false });
    claimFace("server/kaya", { voice: false, shown: true });
    releaseFace("server/zuri");
    expect(useFaceOwnerStore.getState().owner).toBe("server/kaya");
  });

  it("follows the voice session when it moves", () => {
    claimFace("server/zuri", { voice: false, shown: true });
    claimFace("server/kaya", { voice: true, shown: false });
    claimFace("server/kaya", { voice: false, shown: false });
    claimFace("server/zuri", { voice: true, shown: false });
    expect(useFaceOwnerStore.getState().owner).toBe("server/zuri");
  });

  it("keeps the face where it is when nobody talks and no page is in front", () => {
    claimFace("server/zuri", { voice: false, shown: false });
    claimFace("server/kaya", { voice: false, shown: true });
    claimFace("server/kaya", { voice: false, shown: false });
    expect(useFaceOwnerStore.getState().owner).toBe("server/kaya");
  });

  it("holds no face when every page is gone", () => {
    claimFace("server/zuri", { voice: true, shown: true });
    releaseFace("server/zuri");
    expect(useFaceOwnerStore.getState().owner).toBeNull();
  });
});
