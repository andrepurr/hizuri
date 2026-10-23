import { Layers } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet as RNStyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useStagePalette } from "../palette";
import type { CardsControl } from "./cards-control";
import { CHIP_BOTTOM, CHIP_HEIGHT } from "./model";
import { ColorDot, Glass, tabColor } from "./parts";
import { holdOutside, useOutsideHold } from "./touch-hold";
import type { TabTrack } from "./track";
import { STAGE_FONT } from "../type";

// Option 2, the Deck: a small chip at the bottom names the tab in front. Tap it, pull it up or
// pinch a blocks tab: all tabs become a stack of cards (cards.tsx), and every switch is vertical
// or a tap. Nothing here moves sideways, so the page swipe and the files keep every sideways drag.

const MAX_WIDTH = 300;
/** How far up a pull opens the deck fully, as a share of the screen height. */
const PULL_SPAN = 0.45;
const OPEN_AT = 0.3;
const OPEN_VELOCITY = -500;
/** A pinch to this scale opens the deck fully. */
const PINCH_SPAN = 0.4;

function clamp01(value: number): number {
  "worklet";
  return Math.max(0, Math.min(1, value));
}

export function TabDeckChip({
  track,
  tabs,
  visibleId,
  tabTitle,
  bottomInset,
  cards,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  visibleId: string | null;
  tabTitle: (title: string) => string;
  bottomInset: number;
  cards: CardsControl;
}) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const hold = useOutsideHold();
  const { open, close, mount, shown } = cards;
  const recede = track.recede;
  const span = windowHeight * PULL_SPAN;
  // From where the finger touched: a pan that starts late on a slow frame loses its first stretch.
  const downY = useSharedValue(0);

  const gesture = useMemo(() => {
    const pull = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .failOffsetX([-20, 20])
      .onTouchesDown((event) => {
        downY.value = event.changedTouches[0]?.absoluteY ?? 0;
        holdOutside(hold, true);
      })
      .onStart(() => {
        scheduleOnRN(mount);
      })
      .onUpdate((event) => {
        recede.value = clamp01((downY.value - event.absoluteY) / span);
      })
      .onEnd((event) => {
        recede.value = clamp01((downY.value - event.absoluteY) / span);
        const opens = recede.value > OPEN_AT || event.velocityY < OPEN_VELOCITY;
        scheduleOnRN(opens ? open : close);
      })
      .onFinalize(() => {
        holdOutside(hold, false);
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onTouchesDown(() => {
        holdOutside(hold, true);
      })
      .onEnd((_event, success) => {
        if (success) scheduleOnRN(shown ? close : open);
      })
      .onFinalize(() => {
        holdOutside(hold, false);
      });
    return Gesture.Race(pull, tap);
  }, [close, downY, hold, mount, open, recede, shown, span]);

  const index = tabs.findIndex((tab) => tab.id === visibleId);
  const visible = tabs[index];
  const width = Math.min(MAX_WIDTH, windowWidth - 80);
  const chipStyle = useMemo(
    () => [styles.chip, { width, marginLeft: -width / 2, bottom: CHIP_BOTTOM + bottomInset }],
    [bottomInset, width],
  );
  if (!visible) return null;
  return (
    <GestureDetector gesture={gesture}>
      <View
        style={chipStyle}
        accessibilityRole="button"
        accessibilityLabel={t("show.tabs.allTabs", { count: tabs.length })}
        accessibilityHint={t("show.tabs.deckHint")}
        testID="stage-deck-chip"
      >
        <Glass style={styles.glass}>
          <Layers size={16} color={palette.foregroundMuted} />
          <ColorDot color={tabColor(visible)} />
          <Text style={[styles.title, { color: palette.foreground }]} numberOfLines={1}>
            {tabTitle(visible.title)}
          </Text>
          <Text style={[styles.count, { color: palette.foregroundMuted }]}>
            {`${index + 1}/${tabs.length}`}
          </Text>
        </Glass>
      </View>
    </GestureDetector>
  );
}

/**
 * Pinching a blocks tab in opens the deck, the cards following the fingers. Only on blocks tabs:
 * web pages and pictures keep their own pinch to zoom.
 */
export function DeckPinch({
  track,
  enabled,
  cards,
  children,
}: {
  track: TabTrack;
  enabled: boolean;
  cards: CardsControl;
  children: ReactNode;
}) {
  const { open, close, mount } = cards;
  const recede = track.recede;
  const gesture = useMemo(
    () =>
      Gesture.Pinch()
        .enabled(enabled)
        .onStart(() => {
          scheduleOnRN(mount);
        })
        .onUpdate((event) => {
          recede.value = clamp01((1 - event.scale) / PINCH_SPAN);
        })
        .onEnd(() => {
          scheduleOnRN(recede.value > OPEN_AT ? open : close);
        }),
    [close, enabled, mount, open, recede],
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = RNStyleSheet.create({
  fill: {
    flex: 1,
  },
  chip: {
    position: "absolute",
    left: "50%",
    height: CHIP_HEIGHT,
    borderRadius: CHIP_HEIGHT / 2,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  glass: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 16,
    borderRadius: CHIP_HEIGHT / 2,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: STAGE_FONT.medium,
  },
  count: {
    fontSize: 12,
    fontFamily: STAGE_FONT.mono,
  },
});
