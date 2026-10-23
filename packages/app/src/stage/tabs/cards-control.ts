import { useCallback, useMemo, useState } from "react";
import { withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { tick } from "./parts";
import type { TabTrack } from "./track";

const SPRING = { stiffness: 220, damping: 26, mass: 1 } as const;

export interface CardsControl {
  /** The stack is mounted (open, opening, closing or following a pull-up). */
  shown: boolean;
  open: () => void;
  close: () => void;
  /** Mounts the stack for a pull-up or a pinch that drives `track.recede` itself. */
  mount: () => void;
}

/** Opens and closes the stack of cards; `track.recede` is its progress. */
export function useCardsControl(track: TabTrack): CardsControl {
  const [shown, setShown] = useState(false);
  const { recede } = track;
  const mount = useCallback(() => setShown(true), []);
  const open = useCallback(() => {
    setShown(true);
    tick();
    recede.value = withSpring(1, SPRING);
  }, [recede]);
  const close = useCallback(() => {
    recede.value = withSpring(0, SPRING, (finished) => {
      if (finished) scheduleOnRN(setShown, false);
    });
  }, [recede]);
  return useMemo(() => ({ shown, open, close, mount }), [close, mount, open, shown]);
}
