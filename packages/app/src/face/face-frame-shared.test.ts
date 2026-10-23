import { describe, expect, it } from "vitest";
import { faceReloadDelayMs } from "./face-frame-shared";

describe("faceReloadDelayMs", () => {
  it("tries again after 2 s, then twice as long each time, never over 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(faceReloadDelayMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });
});
