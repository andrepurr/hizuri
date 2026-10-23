import { LayoutGrid } from "lucide-react-native";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet as RNStyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useStagePalette } from "../palette";
import type { CardsControl } from "./cards-control";
import {
  CAPSULE_BOTTOM,
  CAPSULE_HEIGHT,
  dragTabPosition,
  fingerDragTabs,
  settleTab,
} from "./model";
import { ColorDot, Glass, PageDots, tabColor, tick } from "./parts";
import { holdOutside, useOutsideHold } from "./touch-hold";
import type { TabTrack } from "./track";
import { STAGE_FONT } from "../type";

// Option 1, the Capsule: a frosted pill near the bottom holds the tab titles. Swipe the pill and
// the tabs slide 1:1 under the thumb while the track shrinks a little, like a deck in the hand;
// let go and a spring settles on the nearest tab. Tap the pill for all tabs as cards. The pill is
// the only place that switches tabs, so the page swipe keeps working everywhere else.
//
// The title lane sits between the grid icon and the count, clipped on both sides: the next
// tab's title peeks in the lane while the user holds the pill, and never runs under “2/5”.

const MAX_WIDTH = 360;
const GRID_SLOT = 48;
const COUNT_SLOT = 56;
/** Track movement per finger movement across the screen. */
const DRAG_GAIN = 1.15;
const HELD_SPRING = { stiffness: 320, damping: 26, mass: 1 } as const;

function LaneTitle({
  track,
  index,
  laneWidth,
  title,
  color,
}: {
  track: TabTrack;
  index: number;
  laneWidth: number;
  title: string;
  color: string;
}) {
  const palette = useStagePalette();
  const style = useAnimatedStyle(() => {
    const d = index - track.position.value;
    const near = Math.min(1, Math.abs(d));
    // The neighbours show only while the pill is held: at rest a long title would run into the
    // next one ("Test videoPlans for", seen on the emulator).
    const shown = 1 - Math.min(1, Math.abs(d) * 2) * (1 - track.held.value);
    return {
      opacity: Math.max(0, 1 - Math.abs(d) * 0.85) * shown,
      transform: [{ translateX: d * laneWidth * 0.62 }, { scale: 1 - 0.12 * near }],
    };
  });
  return (
    <Animated.View style={[styles.title, style]}>
      <ColorDot color={color} />
      <Text style={[styles.titleText, { color: palette.foreground }]} numberOfLines={1}>
        {title}
      </Text>
    </Animated.View>
  );
}

export function TabCapsule({
  track,
  tabs,
  tabTitle,
  bottomInset,
  cards,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  tabTitle: (title: string) => string;
  bottomInset: number;
  cards: CardsControl;
}) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(MAX_WIDTH, windowWidth - 40);
  const laneWidth = width - GRID_SLOT - COUNT_SLOT;
  const hold = useOutsideHold();
  const startIndex = useSharedValue(0);
  const downX = useSharedValue(0);
  const [shownIndex, setShownIndex] = useState(0);

  // The count follows the track, not React: it reads “3/5” as soon as the third tab is nearer.
  useAnimatedReaction(
    () => Math.round(track.position.value),
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setShownIndex, next);
    },
    [track],
  );

  const { open: openCards, close: closeCards, shown: cardsShown } = cards;
  const gesture = useMemo(() => {
    const swipe = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-16, 16])
      .onTouchesDown((event) => {
        downX.value = event.changedTouches[0]?.absoluteX ?? 0;
        holdOutside(hold, true);
        track.held.value = withSpring(1, HELD_SPRING);
      })
      .onStart(() => {
        startIndex.value = track.target.value;
      })
      .onUpdate((event) => {
        track.position.value = dragTabPosition({
          startIndex: startIndex.value,
          dragTabs: fingerDragTabs({
            downX: downX.value,
            x: event.absoluteX,
            width: track.width.value,
            gain: DRAG_GAIN,
          }),
          count: track.count.value,
        });
      })
      .onEnd((event) => {
        // The release can land in the same frame as the last moves: read where the finger left.
        track.position.value = dragTabPosition({
          startIndex: startIndex.value,
          dragTabs: fingerDragTabs({
            downX: downX.value,
            x: event.absoluteX,
            width: track.width.value,
            gain: DRAG_GAIN,
          }),
          count: track.count.value,
        });
        const velocity = (-event.velocityX / Math.max(1, track.width.value)) * DRAG_GAIN;
        const next = settleTab({
          startIndex: startIndex.value,
          position: track.position.value,
          velocity,
          count: track.count.value,
        });
        if (next !== startIndex.value) scheduleOnRN(tick);
        track.settle(next, velocity);
      })
      .onFinalize(() => {
        holdOutside(hold, false);
        track.held.value = withSpring(0, HELD_SPRING);
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(cardsShown ? closeCards : openCards);
      });
    return Gesture.Race(swipe, tap);
  }, [cardsShown, closeCards, downX, hold, openCards, startIndex, track]);

  const count = tabs.length;
  const capsuleStyle = useMemo(
    () => [styles.capsule, { width, marginLeft: -width / 2, bottom: CAPSULE_BOTTOM + bottomInset }],
    [bottomInset, width],
  );
  if (count === 0) return null;
  const label = t("show.tabs.position", { index: shownIndex + 1, count });
  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          style={capsuleStyle}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityHint={t("show.tabs.capsuleHint")}
          testID="stage-capsule"
        >
          <Glass style={styles.glass}>
            <View style={styles.grid}>
              <LayoutGrid size={18} color={palette.foregroundMuted} />
            </View>
            <View style={[styles.lane, { width: laneWidth }]}>
              {tabs.map((tab, index) => (
                <LaneTitle
                  key={tab.id}
                  track={track}
                  index={index}
                  laneWidth={laneWidth}
                  title={tabTitle(tab.title)}
                  color={tabColor(tab)}
                />
              ))}
            </View>
            <View style={styles.count}>
              <Text style={[styles.countText, { color: palette.foregroundMuted }]}>
                {`${Math.min(count, shownIndex + 1)}/${count}`}
              </Text>
            </View>
          </Glass>
        </View>
      </GestureDetector>
      <PageDots track={track} tabs={tabs} style={[styles.dots, { bottom: 10 + bottomInset }]} />
    </>
  );
}

const styles = RNStyleSheet.create({
  capsule: {
    position: "absolute",
    left: "50%",
    height: CAPSULE_HEIGHT,
    borderRadius: CAPSULE_HEIGHT / 2,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  glass: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: CAPSULE_HEIGHT / 2,
  },
  grid: {
    width: GRID_SLOT,
    height: CAPSULE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 6,
  },
  lane: {
    height: CAPSULE_HEIGHT,
    overflow: "hidden",
  },
  title: {
    ...RNStyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 6,
  },
  titleText: {
    fontSize: 16,
    fontFamily: STAGE_FONT.medium,
    flexShrink: 1,
  },
  count: {
    width: COUNT_SLOT,
    height: CAPSULE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingRight: 8,
  },
  countText: {
    fontSize: 12,
    fontFamily: STAGE_FONT.mono,
  },
  dots: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
