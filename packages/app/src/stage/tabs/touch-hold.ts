import { useEffect, useMemo } from "react";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useAgentPagesTouchHold } from "@/agent-pages/agent-pages";
import { useMobilePanelOpenTouchHold } from "@/mobile-panels/provider";

// Show sits on the last of the three agent pages, under two full-screen pans: the page swipe and
// the swipe that opens the files. Both take any mostly-sideways drag after 15 dp, so a switcher's
// own drag must claim the touch before the first move. Its gesture calls holdOutside(…, true) in
// onTouchesDown, on the UI thread, and holdOutside(…, false) when the touch ends; both pans fail
// at once while the hold is set (agent-pages.tsx, mobile-panels/gestures.ts). They also read it
// once at their own touch-down, which comes after the switcher's (children first): a switcher pan
// that fails mid-touch releases the hold, and the flick must still not open Files.

export interface OutsideHold {
  pages: SharedValue<boolean>;
  panels: SharedValue<boolean>;
}

export function holdOutside(hold: OutsideHold, held: boolean): void {
  "worklet";
  hold.pages.value = held;
  hold.panels.value = held;
}

/** The two holds; on a wide layout (no pages, no panels) they hold nothing. */
export function useOutsideHold(): OutsideHold {
  const fallback = useSharedValue(false);
  const pages = useAgentPagesTouchHold() ?? fallback;
  const panels = useMobilePanelOpenTouchHold() ?? fallback;
  const hold = useMemo(() => ({ pages, panels }), [pages, panels]);
  // A switcher that goes away mid-touch (the setting changed) never leaves the pages held.
  useEffect(
    () => () => {
      hold.pages.value = false;
      hold.panels.value = false;
    },
    [hold],
  );
  return hold;
}
