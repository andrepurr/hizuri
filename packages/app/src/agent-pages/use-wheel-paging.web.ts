import { type RefObject, useEffect, useRef } from "react";
import type { View } from "react-native";
import { INITIAL_WHEEL_PAGING, stepWheelPaging } from "./wheel-paging";

/** A sideways two-finger trackpad swipe over the pages moves one page (wheel-paging.ts). */
export function useWheelPaging(
  viewport: RefObject<View | null>,
  onStep: (step: -1 | 1) => void,
  enabled: boolean,
): void {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const node = viewport.current as unknown as HTMLElement | null;
    if (!enabled || !node || typeof node.addEventListener !== "function") return undefined;
    let state = INITIAL_WHEEL_PAGING;
    const handleWheel = (event: WheelEvent) => {
      // A table, a code block or Show's tab row that scrolls sideways keeps its own wheel.
      if (scrollsSideways(event.target, node)) return;
      const result = stepWheelPaging(state, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        now: event.timeStamp,
      });
      state = result.state;
      if (result.step !== 0) onStepRef.current(result.step);
    };
    node.addEventListener("wheel", handleWheel, { passive: true });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [enabled, viewport]);
}

function scrollsSideways(target: EventTarget | null, root: HTMLElement): boolean {
  for (
    let element = target instanceof HTMLElement ? target : null;
    element && element !== root;
    element = element.parentElement
  ) {
    if (element.scrollWidth <= element.clientWidth + 1) continue;
    const overflowX = getComputedStyle(element).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") return true;
  }
  return false;
}
