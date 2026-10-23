import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { type LayoutChangeEvent, StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useStagePalette, withAlpha } from "../palette";
import { RAIL_WIDTH, railCancelled, railDotY, railHeldCenter, railIndexAt } from "./model";
import { Glass, tabColor, tick, WARM_CORE, WARM_GLOW } from "./parts";
import { holdOutside, useOutsideHold } from "./touch-hold";
import type { TabTrack } from "./track";
import { STAGE_FONT } from "../type";

// Option 3, the Dot rail: a quiet column of coloured dots on the right edge, one per tab. Hold it
// and slide up or down: the dots spread around the one under the thumb, it turns into the warm
// core, a label names the tab and the tab changes under it. Slide off to the left and let go to cancel. Tap a dot to jump to
// it. Every move is vertical, and both full-screen pans give up on vertical drags.

const SPACING_IDLE = 26;
const SPACING_HELD = 42;
const SPRING = { stiffness: 320, damping: 26, mass: 1 } as const;

/** The dots spread under the thumb, but never past the rail. */
function fitSpacing(span: number, wanted: number, count: number): number {
  "worklet";
  return Math.min(wanted, span / Math.max(1, count));
}

function RailDot({
  track,
  index,
  count,
  color,
  centerY,
  spacing,
  spread,
}: {
  track: TabTrack;
  index: number;
  count: number;
  color: string;
  centerY: SharedValue<number>;
  spacing: SharedValue<number>;
  spread: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(track.position.value - index));
    const y = railDotY({ index, centerY: centerY.value, spacing: spacing.value, count });
    const size = 8 + 4 * spread.value + 6 * near;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      opacity: 0.55 + 0.45 * Math.max(near, spread.value),
      transform: [{ translateY: y - size / 2 }],
    };
  });
  const core = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - Math.abs(track.position.value - index) * 2),
  }));
  return (
    <Animated.View style={[styles.dot, { backgroundColor: color, shadowColor: color }, style]}>
      <Animated.View style={[styles.core, core]} />
    </Animated.View>
  );
}

export function TabRail({
  track,
  tabs,
  visibleId,
  tabTitle,
  top,
  bottomInset,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  visibleId: string | null;
  tabTitle: (title: string) => string;
  /** The rail starts below this, clear of the header. */
  top: number;
  bottomInset: number;
}) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const hold = useOutsideHold();
  const count = tabs.length;
  const height = useSharedValue(0);
  const centerY = useSharedValue(0);
  const spread = useSharedValue(0);
  const startIndex = useSharedValue(0);
  const heldCenter = useSharedValue(0);
  const downY = useSharedValue(0);
  const started = useSharedValue(false);
  const pickedIndex = useSharedValue(0);
  const cancelled = useSharedValue(false);
  const thumbY = useSharedValue(0);
  const [label, setLabel] = useState<{ index: number; cancelled: boolean } | null>(null);

  const spacing = useSharedValue(SPACING_IDLE);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      height.value = next;
      centerY.value = next / 2;
      spacing.value = fitSpacing(next, SPACING_IDLE, count);
    },
    [centerY, count, height, spacing],
  );

  const gesture = useMemo(() => {
    const restIndexAt = (y: number) => {
      "worklet";
      return railIndexAt({
        y,
        centerY: height.value / 2,
        spacing: fitSpacing(height.value, SPACING_IDLE, count),
        count,
      });
    };
    return Gesture.Pan()
      .minDistance(0)
      .onTouchesDown((event) => {
        downY.value = event.changedTouches[0]?.y ?? 0;
        started.value = false;
        holdOutside(hold, true);
      })
      .onTouchesUp(() => {
        // A tap without a single move never starts a pan (it activates on the next event),
        // so the lift picks the dot it landed on.
        if (started.value) return;
        const index = restIndexAt(downY.value);
        if (index === track.target.value) return;
        scheduleOnRN(tick);
        track.settle(index, 0);
      })
      .onStart((event) => {
        started.value = true;
        startIndex.value = track.target.value;
        cancelled.value = false;
        // The touch picks the dot it lands on, as the dots sit at rest; then they spread around it.
        const index = restIndexAt(event.y);
        const heldSpacing = fitSpacing(height.value, SPACING_HELD, count);
        heldCenter.value = railHeldCenter({
          y: event.y,
          index,
          spacing: heldSpacing,
          count,
          height: height.value,
        });
        spread.value = withSpring(1, SPRING);
        spacing.value = withSpring(heldSpacing, SPRING);
        centerY.value = withSpring(heldCenter.value, SPRING);
        pickedIndex.value = index;
        thumbY.value = event.y;
        if (index !== startIndex.value) {
          scheduleOnRN(tick);
          track.settle(index, 0);
        }
        scheduleOnRN(setLabel, { index, cancelled: false });
      })
      .onUpdate((event) => {
        thumbY.value = event.y;
        const off = railCancelled({ dx: event.translationX });
        if (off !== cancelled.value) {
          cancelled.value = off;
          scheduleOnRN(setLabel, { index: pickedIndex.value, cancelled: off });
        }
        if (off) return;
        const index = railIndexAt({
          y: event.y,
          centerY: heldCenter.value,
          spacing: fitSpacing(height.value, SPACING_HELD, count),
          count,
        });
        if (index === pickedIndex.value) return;
        pickedIndex.value = index;
        scheduleOnRN(tick);
        track.settle(index, 0);
        scheduleOnRN(setLabel, { index, cancelled: false });
      })
      .onEnd(() => {
        if (cancelled.value && track.target.value !== startIndex.value) {
          track.settle(startIndex.value, 0);
        }
      })
      .onFinalize(() => {
        holdOutside(hold, false);
        spread.value = withSpring(0, SPRING);
        spacing.value = withSpring(fitSpacing(height.value, SPACING_IDLE, count), SPRING);
        centerY.value = withSpring(height.value / 2, SPRING);
        scheduleOnRN(setLabel, null);
      });
  }, [
    cancelled,
    centerY,
    count,
    downY,
    heldCenter,
    height,
    hold,
    pickedIndex,
    spacing,
    spread,
    startIndex,
    started,
    thumbY,
    track,
  ]);

  const labelStyle = useAnimatedStyle(() => ({
    opacity: spread.value,
    transform: [{ translateY: thumbY.value - 30 }, { translateX: (1 - spread.value) * 24 }],
  }));

  const zoneStyle = useMemo(
    () => [styles.zone, { top: top + 40, bottom: 40 + bottomInset }],
    [bottomInset, top],
  );
  if (count === 0) return null;
  const labelTab = label ? tabs[label.index] : undefined;
  return (
    <View style={zoneStyle} pointerEvents="box-none">
      <Animated.View style={[styles.label, labelStyle]} pointerEvents="none">
        {label && labelTab ? (
          <Glass style={styles.labelGlass}>
            {label.cancelled ? (
              <Text style={[styles.labelTitle, { color: palette.foregroundMuted }]}>
                {t("show.tabs.releaseToCancel")}
              </Text>
            ) : (
              <>
                <Text style={[styles.labelTitle, { color: palette.foreground }]} numberOfLines={1}>
                  {tabTitle(labelTab.title)}
                </Text>
                <Text style={[styles.labelCount, { color: withAlpha(WARM_GLOW, 0.9) }]}>
                  {`${String(label.index + 1).padStart(2, "0")} / ${String(count).padStart(2, "0")}`}
                </Text>
              </>
            )}
          </Glass>
        ) : null}
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.rail}
          onLayout={onLayout}
          accessibilityRole="adjustable"
          accessibilityLabel={t("show.tabs.position", {
            index: tabs.findIndex((tab) => tab.id === visibleId) + 1,
            count,
          })}
          testID="stage-rail"
        >
          {tabs.map((tab, index) => (
            <RailDot
              key={tab.id}
              track={track}
              index={index}
              count={count}
              color={tabColor(tab)}
              centerY={centerY}
              spacing={spacing}
              spread={spread}
            />
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = RNStyleSheet.create({
  zone: {
    position: "absolute",
    right: 0,
    left: 0,
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: RAIL_WIDTH,
    alignItems: "center",
  },
  dot: {
    position: "absolute",
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  core: {
    width: "62%",
    height: "62%",
    borderRadius: 999,
    backgroundColor: WARM_CORE,
    shadowColor: WARM_GLOW,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  label: {
    position: "absolute",
    top: 0,
    right: RAIL_WIDTH + 6,
    maxWidth: 240,
  },
  labelGlass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
  },
  labelTitle: {
    fontSize: 15,
    fontFamily: STAGE_FONT.medium,
    flexShrink: 1,
  },
  labelCount: {
    fontSize: 12,
    fontFamily: STAGE_FONT.mono,
  },
});
