// A browser on a laptop has no finger to swipe the agent pages with: a sideways two-finger swipe
// on the trackpad (a horizontal wheel) pages instead, one page per swipe. The trackpad keeps
// sending wheel events while the swipe's momentum runs out, so a page step locks the wheel until
// it rests.

/** How far a swipe goes before it pages, in wheel pixels. */
const WHEEL_PAGE_DISTANCE = 50;
/** A pause this long ends a swipe and its momentum. */
const WHEEL_REST_MS = 250;

export interface WheelPagingState {
  accumulated: number;
  locked: boolean;
  lastAt: number;
}

export const INITIAL_WHEEL_PAGING: WheelPagingState = {
  accumulated: 0,
  locked: false,
  lastAt: Number.NEGATIVE_INFINITY,
};

/** One wheel event: the next state and the page step it makes (1 forward, -1 back, 0 none). */
export function stepWheelPaging(
  state: WheelPagingState,
  event: { deltaX: number; deltaY: number; now: number },
): { state: WheelPagingState; step: -1 | 0 | 1 } {
  const rested = event.now - state.lastAt > WHEEL_REST_MS;
  const base = rested ? { accumulated: 0, locked: false } : state;
  if (base.locked || Math.abs(event.deltaY) >= Math.abs(event.deltaX)) {
    return { state: { ...base, lastAt: event.now }, step: 0 };
  }
  const accumulated = base.accumulated + event.deltaX;
  if (Math.abs(accumulated) < WHEEL_PAGE_DISTANCE) {
    return { state: { accumulated, locked: false, lastAt: event.now }, step: 0 };
  }
  return {
    state: { accumulated: 0, locked: true, lastAt: event.now },
    step: accumulated > 0 ? 1 : -1,
  };
}
