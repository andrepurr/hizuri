import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, FadeOut, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useAgentPages } from "@/agent-pages/agent-pages";
import { useStagePalette } from "../palette";
import { dragTabPosition, fingerDragTabs, insideTouchZone, settleTab } from "./model";
import { Glass, PageDots, SPECTRUM, tick } from "./parts";
import { holdOutside, useOutsideHold } from "./touch-hold";
import type { TabTrack } from "./track";
import { STAGE_FONT } from "../type";

// Option 4, Swipe inside: drag anywhere on the tab and the tabs move as a cover-flow row. Whose a
// drag is depends on where it starts (model.ts insideTouchZone): from the left edge it turns the
// page to the chat, from the right edge it opens the files, anywhere else it moves the tabs. A
// pinch, a zoomed picture or the screen in the user's hands holds the pages still (swipeBlocked),
// and then this gives way too. A thin spectrum line on the left edge shows where the page turns:
// solid bands, since the 2 px rounded gradient took an emulator's software renderer down.

const ACTIVATE_DX = 12;
const FAIL_DY = 10;
const FLOW_SPRING = { stiffness: 260, damping: 26, mass: 1 } as const;
const TOAST_MS = 2200;
/** Past the first tab this far, the toast says where the page turns. */
const TOAST_AT = -0.12;

export function InsideSwipe({ track, children }: { track: TabTrack; children: ReactNode }) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const hold = useOutsideHold();
  const fallback = useSharedValue(false);
  const swipeBlocked = useAgentPages()?.swipeBlocked ?? fallback;
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startIndex = useSharedValue(0);
  const toastShown = useSharedValue(false);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(false), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const showToast = useCallback(() => setToast(true), []);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || swipeBlocked.value) {
            stateManager.fail();
            return;
          }
          const zone = insideTouchZone({ x: touch.absoluteX, width: track.width.value });
          if (zone !== "tabs") {
            stateManager.fail();
            return;
          }
          startX.value = touch.absoluteX;
          startY.value = touch.absoluteY;
          holdOutside(hold, true);
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1 || swipeBlocked.value) {
            stateManager.fail();
            return;
          }
          const dx = Math.abs(touch.absoluteX - startX.value);
          const dy = Math.abs(touch.absoluteY - startY.value);
          if (dy > FAIL_DY && dy > dx) stateManager.fail();
          else if (dx >= ACTIVATE_DX) stateManager.activate();
        })
        .onTouchesUp(() => {
          holdOutside(hold, false);
        })
        .onTouchesCancelled(() => {
          holdOutside(hold, false);
        })
        .onStart(() => {
          startIndex.value = track.target.value;
          track.flow.value = withSpring(1, FLOW_SPRING);
        })
        .onUpdate((event) => {
          const position = dragTabPosition({
            startIndex: startIndex.value,
            dragTabs: fingerDragTabs({
              downX: startX.value,
              x: event.absoluteX,
              width: track.width.value,
              gain: 1,
            }),
            count: track.count.value,
          });
          track.position.value = position;
          if (position < TOAST_AT && !toastShown.value) {
            toastShown.value = true;
            scheduleOnRN(showToast);
          }
        })
        .onEnd((event) => {
          track.position.value = dragTabPosition({
            startIndex: startIndex.value,
            dragTabs: fingerDragTabs({
              downX: startX.value,
              x: event.absoluteX,
              width: track.width.value,
              gain: 1,
            }),
            count: track.count.value,
          });
          const velocity = -event.velocityX / Math.max(1, track.width.value);
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
          track.flow.value = withSpring(0, FLOW_SPRING);
        }),
    [hold, showToast, startIndex, startX, startY, swipeBlocked, toastShown, track],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} collapsable={false}>
        {children}
        <View style={styles.edge} pointerEvents="none">
          {SPECTRUM.map((color) => (
            <View key={color} style={[styles.edgeBand, { backgroundColor: color }]} />
          ))}
        </View>
        {toast ? (
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(260)}
            style={styles.toast}
            pointerEvents="none"
          >
            <Glass style={styles.toastGlass}>
              <Text style={[styles.toastText, { color: palette.foreground }]}>
                {t("show.tabs.insideEdgeHint")}
              </Text>
            </Glass>
          </Animated.View>
        ) : null}
      </View>
    </GestureDetector>
  );
}

/** The dots under the row: where the user is among the tabs. */
export function InsideDots({
  track,
  tabs,
  bottomInset,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  bottomInset: number;
}) {
  const style = useMemo(() => [styles.dots, { bottom: 12 + bottomInset }], [bottomInset]);
  return <PageDots track={track} tabs={tabs} style={style} />;
}

const styles = RNStyleSheet.create({
  fill: {
    flex: 1,
  },
  edge: {
    position: "absolute",
    left: 0,
    top: "22%",
    bottom: "22%",
    width: 2,
    opacity: 0.55,
  },
  edgeBand: {
    flex: 1,
  },
  toast: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "45%",
    alignItems: "center",
  },
  toastGlass: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    justifyContent: "center",
  },
  toastText: {
    fontSize: 14,
    fontFamily: STAGE_FONT.regular,
  },
  dots: {
    position: "absolute",
    left: 0,
    right: 0,
  },
});
