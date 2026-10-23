import { LinearGradient } from "expo-linear-gradient";
import {
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  type LucideIcon,
  MonitorPlay,
  Play,
  Radio,
  Video,
  X,
} from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BackHandler,
  // oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, ScrollView } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { StageTab } from "@getpaseo/protocol/stage";
import { useBlockAgentPageSwipes } from "@/agent-pages/agent-pages";
import { useBlockMobilePanelOpenGestures } from "@/mobile-panels/provider";
import { StageBlockContext, type StageBlockContextValue } from "../blocks/block-context";
import { BlockList } from "../blocks/block-view";
import { tabBlocks } from "../model";
import { useStagePalette, withAlpha } from "../palette";
import { cardDismissed, type TabKind, tabKind } from "./model";
import { ColorDot, tabColor, tick } from "./parts";
import type { TabTrack } from "./track";
import { STAGE_FONT } from "../type";

// All of Zuri's tabs as a stack of cards (the Capsule's tap, the Deck's chip, pull-up or pinch).
// The track steps back while the cards rise; its `recede` value is the deck's progress, so a
// pull-up drags the cards with the thumb. Scroll the stack, tap a card to bring its tab forward,
// fling a card sideways to close the tab. While the stack is open, sideways drags are the cards'.
// Show has no top bar, so the few things the burger held (back to chat, hide Zuri, the screen
// mode) sit as small pills above the cards.

/** How much of each card shows above the next one. */
const CARD_STEP = 168;
const CARD_HEIGHT = 340;
const GLIMPSE_SCALE = 0.56;
const SPRING = { stiffness: 220, damping: 26, mass: 1 } as const;
/** A flung card leaves fast and does not swing back. */
const FLING = { stiffness: 260, damping: 30, mass: 1, overshootClamping: true } as const;
const AURA_START = { x: 0, y: 0 };
const AURA_END = { x: 0.7, y: 0.6 };

export interface CardsAction {
  /** Also its testID. */
  id: string;
  label: string;
  /** A choice that is on now (the screen mode). */
  selected?: boolean;
  onPress: () => void;
}

const KIND_ICONS: Record<Exclude<TabKind, "blocks">, LucideIcon> = {
  page: Globe,
  picture: ImageIcon,
  video: Video,
  player: Play,
  screen: MonitorPlay,
  live: Radio,
  canvas: LayoutDashboard,
};

const QUIET_CONTEXT: StageBlockContextValue = {
  active: false,
  animate: false,
  sendAction: () => {},
};

/** A blocks tab drawn small and still: the real blocks, no taps, no entrance. */
const BlocksGlimpse = memo(function BlocksGlimpse({
  tab,
  width,
  mediaOrigin,
}: {
  tab: StageTab;
  width: number;
  mediaOrigin: string | null;
}) {
  const blocks = useMemo(() => tabBlocks(tab).slice(0, 6), [tab]);
  const context = useMemo(() => ({ ...QUIET_CONTEXT, mediaOrigin }), [mediaOrigin]);
  const frame = useMemo(
    () => ({ width: width / GLIMPSE_SCALE, transform: [{ scale: GLIMPSE_SCALE }] }),
    [width],
  );
  return (
    <StageBlockContext.Provider value={context}>
      <View style={[styles.glimpse, frame]} pointerEvents="none">
        <BlockList blocks={blocks} />
      </View>
    </StageBlockContext.Provider>
  );
});

function KindGlimpse({ kind, color }: { kind: Exclude<TabKind, "blocks">; color: string }) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const Icon = KIND_ICONS[kind];
  return (
    <View style={styles.kind}>
      <Icon size={40} color={color} strokeWidth={1.5} />
      <Text style={[styles.kindLabel, { color: palette.foregroundMuted }]}>
        {t(`show.tabs.kind.${kind}`)}
      </Text>
    </View>
  );
}

function Card({
  tab,
  title,
  index,
  inFront,
  track,
  cardWidth,
  mediaOrigin,
  onPick,
  onClose,
}: {
  tab: StageTab;
  title: string;
  index: number;
  inFront: boolean;
  track: TabTrack;
  cardWidth: number;
  mediaOrigin: string | null;
  onPick: (tabId: string) => void;
  onClose: (tabId: string) => void;
}) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const color = tabColor(tab);
  const kind = tabKind(tab);
  const dx = useSharedValue(0);
  const tabId = tab.id;
  const close = useCallback(() => {
    tick();
    onClose(tabId);
  }, [onClose, tabId]);
  const pick = useCallback(() => onPick(tabId), [onPick, tabId]);
  const width = track.width;

  const fling = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          dx.value = event.translationX;
        })
        .onEnd((event) => {
          if (cardDismissed({ dx: event.translationX, vx: event.velocityX, width: width.value })) {
            const away = Math.sign(event.translationX || event.velocityX) * width.value * 1.3;
            dx.value = withSpring(away, { ...FLING, velocity: event.velocityX }, (finished) => {
              if (finished) scheduleOnRN(close);
            });
          } else {
            dx.value = withSpring(0, SPRING);
          }
        }),
    [close, dx, width],
  );

  const rise = useAnimatedStyle(() => {
    const p = track.recede.value;
    const off = Math.abs(dx.value) / Math.max(1, width.value);
    return {
      opacity: Math.min(1, p * 1.4) * (1 - 0.7 * Math.min(1, off)),
      transform: [
        { perspective: 1400 },
        { translateY: (1 - p) * (160 + 70 * index) },
        { translateX: dx.value },
        { rotateX: "-8deg" },
        { rotateZ: `${dx.value / 40}deg` },
        { scale: 0.94 + 0.06 * p },
      ],
    };
  });

  const cardStyle = useMemo(
    () => [
      styles.card,
      {
        width: cardWidth,
        backgroundColor: palette.surface1,
        borderColor: inFront ? withAlpha(color, 0.75) : palette.border,
      },
    ],
    [cardWidth, color, inFront, palette],
  );
  const aura = useMemo(() => [withAlpha(color, 0.32), withAlpha(color, 0)] as const, [color]);

  return (
    <Animated.View
      style={[styles.cardSlot, index > 0 && styles.overlap, rise]}
      layout={LinearTransition.springify().damping(20).stiffness(170)}
    >
      <GestureDetector gesture={fling}>
        <Pressable
          style={cardStyle}
          onPress={pick}
          accessibilityRole="button"
          accessibilityLabel={title}
          testID={`stage-card-${tab.id}`}
        >
          <LinearGradient colors={aura} start={AURA_START} end={AURA_END} style={styles.fill} />
          <View style={styles.cardBar}>
            <ColorDot color={color} size={10} />
            <Text style={[styles.cardTitle, { color: palette.foreground }]} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={close}
              hitSlop={8}
              style={[styles.cardClose, { backgroundColor: withAlpha(palette.foreground, 0.08) }]}
              accessibilityRole="button"
              accessibilityLabel={t("show.closeTab")}
              testID={`stage-card-close-${tab.id}`}
            >
              <X size={16} color={palette.foregroundMuted} />
            </Pressable>
          </View>
          <View style={styles.cardBody}>
            {kind === "blocks" ? (
              <BlocksGlimpse tab={tab} width={cardWidth - 28} mediaOrigin={mediaOrigin} />
            ) : (
              <KindGlimpse kind={kind} color={color} />
            )}
          </View>
        </Pressable>
      </GestureDetector>
    </Animated.View>
  );
}

function ActionPill({ action, onDone }: { action: CardsAction; onDone: () => void }) {
  const palette = useStagePalette();
  const { onPress } = action;
  const press = useCallback(() => {
    tick();
    onPress();
    onDone();
  }, [onDone, onPress]);
  const style = useMemo(
    () => [
      styles.action,
      {
        backgroundColor: withAlpha(palette.foreground, action.selected ? 0.16 : 0.07),
        borderColor: withAlpha(palette.foreground, action.selected ? 0.4 : 0.12),
      },
    ],
    [action.selected, palette],
  );
  const state = useMemo(() => ({ selected: action.selected === true }), [action.selected]);
  return (
    <Pressable
      style={style}
      onPress={press}
      accessibilityRole="button"
      accessibilityState={state}
      testID={action.id}
    >
      <Text style={[styles.actionLabel, { color: palette.foreground }]} numberOfLines={1}>
        {action.label}
      </Text>
    </Pressable>
  );
}

export function TabCards({
  track,
  tabs,
  visibleId,
  tabTitle,
  top,
  bottom,
  mediaOrigin,
  onPick,
  onCloseTab,
  actions,
  onDismiss,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  visibleId: string | null;
  tabTitle: (title: string) => string;
  /** Where the cards start: below the header, so nothing covers the top of a card. */
  top: number;
  /** Room kept free at the bottom for the switcher. */
  bottom: number;
  mediaOrigin: string | null;
  onPick: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  actions: readonly CardsAction[];
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const palette = useStagePalette();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 32, 520);

  useBlockAgentPageSwipes(true);
  useBlockMobilePanelOpenGestures(true, "both");
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [onDismiss]);

  const frontIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === visibleId),
  );
  // Opens with the tab in front in view; later changes leave the user's scroll alone.
  const [startOffset] = useState(() => ({ x: 0, y: Math.max(0, frontIndex * CARD_STEP - 40) }));

  const backdrop = useAnimatedStyle(() => ({ opacity: Math.min(1, track.recede.value) }));
  const containerStyle = useMemo(() => [styles.overlay, { top }], [top]);
  const contentStyle = useMemo(() => [styles.content, { paddingBottom: bottom + 24 }], [bottom]);

  return (
    <View style={containerStyle} testID="stage-cards">
      <Animated.View
        style={[styles.fill, { backgroundColor: withAlpha(palette.background, 0.72) }, backdrop]}
      >
        <Pressable
          style={styles.fill}
          onPress={onDismiss}
          accessibilityLabel={t("show.tabs.closeCards")}
        />
      </Animated.View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={contentStyle}
        contentOffset={startOffset}
        showsVerticalScrollIndicator={false}
      >
        {actions.length > 0 ? (
          <View style={styles.actions} testID="stage-cards-actions">
            {actions.map((action) => (
              <ActionPill key={action.id} action={action} onDone={onDismiss} />
            ))}
          </View>
        ) : null}
        <Text style={[styles.head, { color: palette.foregroundMuted }]}>
          {t("show.tabs.allTabs", { count: tabs.length })}
        </Text>
        {tabs.map((tab, index) => (
          <Card
            key={tab.id}
            tab={tab}
            title={tabTitle(tab.title)}
            index={index}
            inFront={tab.id === visibleId}
            track={track}
            cardWidth={cardWidth}
            mediaOrigin={mediaOrigin}
            onPick={onPick}
            onClose={onCloseTab}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = RNStyleSheet.create({
  fill: {
    ...RNStyleSheet.absoluteFill,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    alignItems: "center",
    paddingTop: 12,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  action: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 14,
    fontFamily: STAGE_FONT.medium,
  },
  head: {
    fontSize: 11,
    fontFamily: STAGE_FONT.regular,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  cardSlot: {
    height: CARD_HEIGHT,
  },
  overlap: {
    marginTop: CARD_STEP - CARD_HEIGHT,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  cardBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: STAGE_FONT.medium,
  },
  cardClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  glimpse: {
    transformOrigin: "0 0",
  },
  kind: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 40,
  },
  kindLabel: {
    fontSize: 12,
    fontFamily: STAGE_FONT.regular,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
