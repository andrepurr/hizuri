import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet as RNStyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  type EntryOrExitLayoutType,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { TAB_ENTRANCE_EASING, type TabEntrance } from "../motion";

// Zuri's tabs side by side on one track, as the agent pages are (agent-pages.tsx): one position in
// tabs, written by a switcher's finger on the UI thread, drives every slot. Only the tab in front
// and its two neighbours are mounted, so a drag always has the next tab ready under the thumb
// and a web page three tabs away costs nothing. React learns the tab when a drag settles. Slot
// nodes take React Native static styles plus animated styles only (docs/mobile-panels.md: no
// Unistyles on animated nodes).

/** Room between two tabs while the capsule holds the track. */
const HELD_GAP = 18;
/** How much the track shrinks while the capsule holds it, like a deck in the hand. */
const HELD_SCALE = 0.075;
const SPRING = { stiffness: 240, damping: 28, mass: 1 } as const;

export interface TabTrack {
  /** The tab in front, fractional while moving. */
  position: SharedValue<number>;
  /** The tab the track rests on or springs to. */
  target: SharedValue<number>;
  /** 0..1: the capsule holds the track (smaller, rounded, gaps between tabs). */
  held: SharedValue<number>;
  /** 0..1: swipe inside bends the track into a cover-flow row. */
  flow: SharedValue<number>;
  /** 0..1: the deck of cards is over the track, which steps back. */
  recede: SharedValue<number>;
  width: SharedValue<number>;
  count: SharedValue<number>;
  /** Springs the track to `index` and tells React which tab is in front. */
  settle: (index: number, velocity: number) => void;
  reduceMotion: boolean;
}

/**
 * The track for these tabs. A tab brought forward from outside (Zuri, the deck, the rail) springs
 * in when it is a neighbour; a tab further away appears in place with its own entrance.
 */
export function useTabTrack(input: {
  tabs: readonly StageTab[];
  visibleId: string | null;
  onSettle: (tabId: string) => void;
}): TabTrack & { onLayout: (event: LayoutChangeEvent) => void } {
  const { tabs, visibleId, onSettle } = input;
  const { width: windowWidth } = useWindowDimensions();
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === visibleId),
  );
  const reduceMotion = useReducedMotion();
  const position = useSharedValue(index);
  const target = useSharedValue(index);
  const held = useSharedValue(0);
  const flow = useSharedValue(0);
  const recede = useSharedValue(0);
  const width = useSharedValue(windowWidth);
  const count = useSharedValue(tabs.length);

  useEffect(() => {
    count.value = tabs.length;
  }, [count, tabs.length]);

  const lastRef = useRef({ visibleId, tabs });
  useEffect(() => {
    const last = lastRef.current;
    lastRef.current = { visibleId, tabs };
    if (target.value === index) return;
    target.value = index;
    // A neighbour that was already mounted slides in. Anything else (tabs added or closed
    // around the one in front, a new tab, a tab far away) is put in place at once; a tab that
    // arrives unmounted plays its own entrance (TabTrackView).
    const lastIndex = last.tabs.findIndex((tab) => tab.id === last.visibleId);
    const wasNeighbour =
      last.visibleId !== visibleId &&
      (last.tabs[lastIndex - 1]?.id === visibleId || last.tabs[lastIndex + 1]?.id === visibleId);
    position.value = wasNeighbour && !reduceMotion ? withSpring(index, SPRING) : index;
  }, [index, position, reduceMotion, tabs, target, visibleId]);

  // Frames stop while the app is in the background, so a spring started then can stall part-way:
  // whenever the app goes away or comes back, the track rests on its tab at once.
  const active = useAppActivelyVisible();
  const activeRef = useRef(active);
  useEffect(() => {
    if (activeRef.current === active) return;
    activeRef.current = active;
    position.value = target.value;
  }, [active, position, target]);

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  const commit = useCallback((next: number) => {
    const tab = tabsRef.current[next];
    if (tab) onSettleRef.current(tab.id);
  }, []);

  const settle = useCallback(
    (next: number, velocity: number) => {
      "worklet";
      const moved = target.value !== next;
      target.value = next;
      position.value = reduceMotion
        ? withTiming(next, { duration: 0 })
        : withSpring(next, { ...SPRING, velocity });
      if (moved) scheduleOnRN(commit, next);
    },
    [commit, position, reduceMotion, target],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = Math.round(event.nativeEvent.layout.width);
      if (next > 0) width.value = next;
    },
    [width],
  );

  return useMemo(
    () => ({ position, target, held, flow, recede, width, count, settle, reduceMotion, onLayout }),
    [count, flow, held, onLayout, position, recede, reduceMotion, settle, target, width],
  );
}

/** Where slot `index` sits on the track right now: shared by the tabs and the player layer. */
export function useTrackSlotStyle(track: TabTrack, index: number) {
  const { position, held, flow, recede, width } = track;
  return useAnimatedStyle(() => {
    const d = index - position.value;
    const near = Math.min(1, Math.abs(d));
    const h = held.value;
    const f = flow.value;
    const r = recede.value;
    const x = d * (width.value + HELD_GAP * h) * (1 - 0.3 * f);
    const scale = (1 - HELD_SCALE * h) * (1 - 0.14 * f * near) * (1 - 0.08 * r);
    const turn = Math.max(-38, Math.min(38, -d * 38)) * f;
    return {
      opacity: (1 - 0.42 * f * near) * (1 - 0.65 * r),
      borderRadius: Math.max(30 * h, 26 * f * near, 24 * r),
      transform: [{ perspective: 1200 }, { translateX: x }, { rotateY: `${turn}deg` }, { scale }],
    };
  });
}

/**
 * The outer node stays over the whole page while only the inner one slides, so it must never be
 * a touch target: the next tab's outer node lies on top of the tab in front, and as a target it
 * took every touch there, so the tab in front could not scroll or be tapped. A neighbour's content
 * takes no touches either, even when a drag leaves it on screen.
 */
function TrackSlot({
  track,
  index,
  inFront,
  entrance,
  active,
  exiting,
  testID,
  children,
}: {
  track: TabTrack;
  index: number;
  inFront: boolean;
  entrance: TabEntrance | null;
  active: boolean;
  exiting: EntryOrExitLayoutType | undefined;
  testID: string;
  children: ReactNode;
}) {
  const slotStyle = useTrackSlotStyle(track, index);
  const enterStyle = useEntrance(entrance, active);
  return (
    <Animated.View
      style={[styles.fill, enterStyle]}
      pointerEvents="box-none"
      exiting={exiting}
      testID={testID}
    >
      <Animated.View style={[styles.slot, slotStyle]} pointerEvents={inFront ? "auto" : "none"}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A slot's entrance, played once from where it mounted, on a value rather than an `entering` layout
 * animation: one mounted while the app was in the background froze at its first frame and the tab
 * stayed 70 dp to the right, the slide's start.
 * Whenever the app goes away or comes back, the slot jumps to rest.
 */
function useEntrance(entrance: TabEntrance | null, active: boolean) {
  const [from] = useState(entrance);
  const progress = useSharedValue(from ? 0 : 1);
  useEffect(() => {
    if (from) {
      progress.value = withTiming(1, { duration: from.duration, easing: TAB_ENTRANCE_EASING });
    }
  }, [from, progress]);
  const activeRef = useRef(active);
  useEffect(() => {
    if (activeRef.current === active) return;
    activeRef.current = active;
    progress.value = 1;
  }, [active, progress]);
  return useAnimatedStyle(() => {
    if (!from) return {};
    const rest = 1 - progress.value;
    return {
      opacity: progress.value,
      transform: [
        { translateX: from.x * rest },
        { translateY: from.y * rest },
        { scale: 1 - (1 - from.scale) * rest },
      ],
    };
  });
}

/**
 * The tab in front and its neighbours. The entrance and `exiting` belong to the tab in front only:
 * a tab that arrives in front unmounted plays its entrance (not while the app is in the
 * background), the one that leaves from the front (closed, or replaced by a tab far away) plays
 * its exit; neighbours come and go silently.
 */
export function TabTrackView({
  track,
  tabs,
  visibleId,
  entering,
  exiting,
  renderTab,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  visibleId: string | null;
  entering: (tab: StageTab) => TabEntrance;
  exiting: (tab: StageTab) => EntryOrExitLayoutType;
  renderTab: (tab: StageTab, inFront: boolean) => ReactNode;
}) {
  const index = tabs.findIndex((tab) => tab.id === visibleId);
  const active = useAppActivelyVisible();
  const mountedRef = useRef(new Set<string>());
  const shown = useMemo(
    () => (index < 0 ? [] : tabs.slice(Math.max(0, index - 1), index + 2)),
    [index, tabs],
  );
  const wasMounted = mountedRef.current;
  useEffect(() => {
    mountedRef.current = new Set(shown.map((tab) => tab.id));
  }, [shown]);
  return (
    <>
      {shown.map((tab) => {
        const inFront = tab.id === visibleId;
        return (
          <TrackSlot
            key={tab.id}
            track={track}
            index={tabs.indexOf(tab)}
            inFront={inFront}
            entrance={
              inFront && active && !track.reduceMotion && !wasMounted.has(tab.id)
                ? entering(tab)
                : null
            }
            active={active}
            exiting={inFront ? exiting(tab) : undefined}
            testID={`stage-tab-view-${tab.id}`}
          >
            {renderTab(tab, inFront)}
          </TrackSlot>
        );
      })}
    </>
  );
}

const styles = RNStyleSheet.create({
  fill: {
    ...RNStyleSheet.absoluteFill,
  },
  slot: {
    flex: 1,
    overflow: "hidden",
  },
});
