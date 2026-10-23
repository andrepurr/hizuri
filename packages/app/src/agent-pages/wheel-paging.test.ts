import { describe, expect, it } from "vitest";
import { INITIAL_WHEEL_PAGING, stepWheelPaging, type WheelPagingState } from "./wheel-paging";

function run(events: { dx: number; dy?: number; at: number }[]): number[] {
  let state: WheelPagingState = INITIAL_WHEEL_PAGING;
  const steps: number[] = [];
  for (const event of events) {
    const result = stepWheelPaging(state, {
      deltaX: event.dx,
      deltaY: event.dy ?? 0,
      now: event.at,
    });
    state = result.state;
    if (result.step !== 0) steps.push(result.step);
  }
  return steps;
}

describe("stepWheelPaging", () => {
  it("pages forward once a sideways two-finger swipe goes far enough", () => {
    expect(
      run([
        { dx: 20, at: 0 },
        { dx: 20, at: 16 },
      ]),
    ).toEqual([]);
    expect(
      run([
        { dx: 20, at: 0 },
        { dx: 20, at: 16 },
        { dx: 20, at: 32 },
      ]),
    ).toEqual([1]);
  });

  it("pages back on a swipe the other way", () => {
    expect(
      run([
        { dx: -40, at: 0 },
        { dx: -40, at: 16 },
      ]),
    ).toEqual([-1]);
  });

  it("moves one page per swipe, however long its momentum runs", () => {
    const swipe = Array.from({ length: 40 }, (_, i) => ({ dx: 30, at: i * 16 }));
    expect(run(swipe)).toEqual([1]);
  });

  it("pages again after the wheel rested", () => {
    expect(
      run([
        { dx: 80, at: 0 },
        { dx: 30, at: 100 },
        { dx: 80, at: 500 },
      ]),
    ).toEqual([1, 1]);
  });

  it("leaves vertical scrolling to the chat", () => {
    expect(
      run([
        { dx: 30, dy: 60, at: 0 },
        { dx: 30, dy: 60, at: 16 },
        { dx: 30, dy: 60, at: 32 },
      ]),
    ).toEqual([]);
  });
});
