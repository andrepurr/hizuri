import { describe, expect, it } from "vitest";
import { FLOAT_WINDOW, canWander, chooseWalk, idleDelayMs } from "./float-behavior";

const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const room = 400 - FLOAT_WINDOW.widthDp;

describe("chooseWalk", () => {
  it("walks the side the dice pick when there is room", () => {
    const walk = chooseWalk({ x: 100, screenWidth: 400, onFloor: true }, sequence(0.9, 1, 0));
    expect(walk).toEqual({ direction: 1, distanceDp: room - 100, motion: "femwalk" });
  });

  it("turns away from the edge it stands at", () => {
    const atRight = chooseWalk(
      { x: room, screenWidth: 400, onFloor: true },
      sequence(0.9, 0, 0.99),
    );
    expect(atRight?.direction).toBe(-1);
    expect(atRight?.distanceDp).toBe(40);
    expect(atRight?.motion).toBe("prance");
    const atLeft = chooseWalk({ x: 0, screenWidth: 400, onFloor: true }, sequence(0.1, 0.5, 0.3));
    expect(atLeft?.direction).toBe(1);
  });

  it("never walks past an edge", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const walk = chooseWalk({ x: 60, screenWidth: 400, onFloor: true }, sequence(r, r, r));
      expect(walk).not.toBeNull();
      const end = 60 + (walk?.direction ?? 0) * (walk?.distanceDp ?? 0);
      expect(end).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(room);
    }
  });

  it("stays put on a screen too narrow to walk", () => {
    expect(
      chooseWalk({ x: 0, screenWidth: FLOAT_WINDOW.widthDp + 30, onFloor: true }, sequence(0.5)),
    ).toBeNull();
  });
});

describe("canWander", () => {
  const position = { x: 0, screenWidth: 400, onFloor: true };

  it("wanders only idle, on the floor, screen on, menu closed", () => {
    expect(canWander({ activity: "idle", menuOpen: false, screenOn: true, position })).toBe(true);
    expect(canWander({ activity: "speaking", menuOpen: false, screenOn: true, position })).toBe(
      false,
    );
    expect(canWander({ activity: "idle", menuOpen: true, screenOn: true, position })).toBe(false);
    expect(canWander({ activity: "idle", menuOpen: false, screenOn: false, position })).toBe(false);
    expect(
      canWander({
        activity: "idle",
        menuOpen: false,
        screenOn: true,
        position: { ...position, onFloor: false },
      }),
    ).toBe(false);
    expect(canWander({ activity: "idle", menuOpen: false, screenOn: true, position: null })).toBe(
      false,
    );
  });
});

describe("idleDelayMs", () => {
  it("waits 9 to 23 seconds", () => {
    expect(idleDelayMs(() => 0)).toBe(9_000);
    expect(idleDelayMs(() => 0.999)).toBeLessThan(23_000);
  });
});
