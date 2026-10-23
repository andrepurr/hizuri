import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet as RNStyleSheet, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import type { StageSlide, StageTab } from "@getpaseo/protocol/stage";
import { useAgentPages, useBlockAgentPageSwipes } from "@/agent-pages/agent-pages";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useSettings } from "@/hooks/use-settings";
import { useHostFeature } from "@/runtime/host-features";
import { useShowMedia } from "@/show-media/use-show-media";
import { StageAurora } from "./aurora";
import {
  StageBlockContext,
  type StageBlockContextValue,
  type StoreSecret,
} from "./blocks/block-context";
import { BlockList } from "./blocks/block-view";
import { CanvasFill } from "./blocks/canvas";
import { fillBlockFor } from "./blocks/fill";
import { StagePlayer } from "./blocks/player";
import { playerTabOf } from "./blocks/player-spec";
import { useStageMediaOrigin } from "./blocks/use-stage-media-origin";
import { LiveSceneView } from "./live-scene";
import { canvasPanes, isScreenTab, liveSceneOf, resolveVisibleTab, tabBlocks } from "./model";
import { tabEntrance, tabExiting } from "./motion";
import { StagePaletteScope } from "./palette";
import { PERCH_SCROLL_THROTTLE_MS, PerchArea, type PerchInfo, usePerchViewport } from "./perch";
import { visiblePerch } from "./perch-model";
import { type CardsAction, TabCards } from "./tabs/cards";
import { useCardsControl } from "./tabs/cards-control";
import { type SwitcherInsets, switcherInsets, tabKind } from "./tabs/model";
import { switcherHasCards, TabSwitcherChrome, TabSwitcherContent } from "./tabs/switcher";
import { TabTrackView, type TabTrack, useTabTrack, useTrackSlotStyle } from "./tabs/track";
import { useStage } from "./use-stage";

// The Show page drawn from Zuri's stage: one canvas, the tab in front drawn natively block by block
// over a slowly drifting aurora, with nothing above it. The assistant's tabs lie side by side on a
// track (tabs/track.tsx); the user moves along it with the switcher picked in Settings
// (tabs/switcher.tsx: Capsule, Deck, Dot rail or Swipe inside). The switcher is the only control:
// its cards hold close tab (each card's ×), hide Zuri from the card, the screen mode and back to
// chat. A stage change that brings a tab forward also brings the pager here. With no connection the
// page paints the cached stage. The live tab "Now" (visual front) draws its scene with
// LiveSceneView and never moves the pager. The player tab (show_media) is a layer of its own that
// lives as long as the tab: the film goes on while the user looks at another tab, the chat or the
// face, and Zuri steers it with media_control. Zuri perches on a block of a scrolling tab
// (stage_perch, perch.tsx); the user hides it from the menu.

/** Where the canvas starts: the agent pages already keep the status bar clear. */
const CANVAS_TOP = 0;
const FOLLOW_DELAY_MS = 120;
const ANIMATE_FIRST_MS = 1500;

export type StageScreenMode = "watch" | "control";

export interface StagePageProps {
  serverId: string;
  agentId: string;
  /** Stage window titles the app names itself follow the app language. */
  tabTitle: (title: string) => string;
  /** Draws the assistant's browser stream when the screen tab is in front. */
  renderScreen: () => ReactNode;
  screenMode: StageScreenMode;
  onScreenModeChange: (mode: StageScreenMode) => void;
}

/**
 * When Zuri adds a block at the end of the tab in front, the page glides down to it: the assistant
 * shows a new thing and the user sees it without scrolling. Changes in place leave the scroll
 * alone.
 */
function useFollowNewBlock(lastId: string | null) {
  const scrollRef = useRef<ScrollView>(null);
  const lastRef = useRef(lastId);
  useEffect(() => {
    if (lastId === lastRef.current) return;
    lastRef.current = lastId;
    // After the new block has laid out, so the end is where it lands.
    const timer = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      FOLLOW_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [lastId]);
  return scrollRef;
}

function TabContent({
  tab,
  active,
  mediaOrigin,
  sendAction,
  storeSecret,
  perch,
  slide,
  insets,
}: {
  tab: StageTab;
  active: boolean;
  mediaOrigin: string | null;
  sendAction: (input: { tabId: string; blockId: string; value?: string }) => void;
  storeSecret: StoreSecret | null;
  perch: PerchInfo | null;
  /** Zuri's last flip of this tab's live page. */
  slide: StageSlide | null;
  /** Room for the switcher, so it never covers the content at rest. */
  insets: SwitcherInsets;
}) {
  const [animate, setAnimate] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setAnimate(false), ANIMATE_FIRST_MS);
    return () => clearTimeout(timer);
  }, []);
  const blocks = useMemo(() => tabBlocks(tab), [tab]);
  const scene = useMemo(() => liveSceneOf(tab), [tab]);
  const scrollRef = useFollowNewBlock(blocks.at(-1)?.id ?? null);
  const viewport = usePerchViewport(scrollRef);
  const tabId = tab.id;
  const context = useMemo(
    (): StageBlockContextValue => ({
      active,
      animate,
      sendAction: (blockId, value) => sendAction({ tabId, blockId, value }),
      mediaOrigin,
      slide,
      storeSecret,
    }),
    [active, animate, mediaOrigin, sendAction, slide, storeSecret, tabId],
  );
  const fillInsets = useMemo(
    () => ({ marginBottom: insets.bottom, marginRight: insets.right }),
    [insets],
  );
  const scrollInsets = useMemo(
    () => ({ paddingBottom: insets.bottom + 24, paddingRight: 16 + insets.right }),
    [insets],
  );
  const panes = useMemo(() => canvasPanes(blocks), [blocks]);
  if (panes) {
    return (
      <StageBlockContext.Provider value={context}>
        <View style={[styles.fill, fillInsets]}>
          <CanvasFill panes={panes} />
        </View>
      </StageBlockContext.Provider>
    );
  }
  const Fill = fillBlockFor(blocks);
  if (Fill) {
    return (
      <StageBlockContext.Provider value={context}>
        <View style={[styles.fill, fillInsets]}>
          <Fill block={blocks[0]} />
        </View>
      </StageBlockContext.Provider>
    );
  }
  return (
    <StageBlockContext.Provider value={context}>
      {scene ? (
        <LiveSceneView scene={scene} tab={tab} />
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, scrollInsets]}
          showsVerticalScrollIndicator={false}
          onScroll={viewport.onScroll}
          onLayout={viewport.onLayout}
          scrollEventThrottle={PERCH_SCROLL_THROTTLE_MS}
        >
          <PerchArea
            info={perch}
            blocks={blocks}
            active={active}
            viewport={viewport}
            headerHeight={CANVAS_TOP}
          >
            <BlockList blocks={blocks} />
          </PerchArea>
        </ScrollView>
      )}
    </StageBlockContext.Provider>
  );
}

function tabEntranceOf(tab: StageTab) {
  return tabEntrance(tab.enter);
}

function tabExitingOf(tab: StageTab) {
  return tabExiting(tab.enter === "zoom-from-face" ? "fold-into-face" : "fly-out");
}

function useFrontTab(input: { front: { tabId: string; seq: number } | null; onFront: () => void }) {
  const { front, onFront } = input;
  const onFrontRef = useRef(onFront);
  onFrontRef.current = onFront;
  const seq = front?.seq ?? 0;
  useEffect(() => {
    if (seq > 0) onFrontRef.current();
  }, [seq]);
}

/**
 * What the burger held besides closing a tab, now in the cards: the screen mode while the
 * assistant's screen is in front, hide Zuri while perched, back to the chat.
 */
function useCardsActions(input: {
  screenMode: StageScreenMode | null;
  onScreenModeChange: (mode: StageScreenMode) => void;
  onHidePerch: (() => void) | null;
  onBackToChat: (() => void) | null;
}): CardsAction[] {
  const { t } = useTranslation();
  const { screenMode, onScreenModeChange, onHidePerch, onBackToChat } = input;
  return useMemo(() => {
    const actions: CardsAction[] = [];
    if (screenMode) {
      actions.push(
        {
          id: "show-screen-watch",
          label: t("show.screenWatch"),
          selected: screenMode === "watch",
          onPress: () => onScreenModeChange("watch"),
        },
        {
          id: "show-screen-take-over",
          label: t("show.screenTakeOver"),
          selected: screenMode === "control",
          onPress: () => onScreenModeChange("control"),
        },
      );
    }
    if (onHidePerch) {
      actions.push({ id: "show-hide-perch", label: t("show.hidePerch"), onPress: onHidePerch });
    }
    if (onBackToChat) {
      actions.push({ id: "show-close", label: t("show.close"), onPress: onBackToChat });
    }
    return actions;
  }, [onBackToChat, onHidePerch, onScreenModeChange, screenMode, t]);
}

/**
 * The Show page is the pager's page (every page counts on a wide layout) and its agent tab is in
 * front: a hidden agent tab stays mounted (up to three per pane), and its Show page then draws
 * nothing.
 */
function useShowPageOnScreen(): boolean {
  const pages = useAgentPages();
  const panelActive = useRetainedPanelActive();
  return (pages ? pages.page === "show" : true) && panelActive;
}

export const StagePage = memo(function StagePage(props: StagePageProps) {
  const { serverId, agentId, tabTitle, renderScreen, screenMode, onScreenModeChange } = props;
  const { t } = useTranslation();
  const view = useStage({ serverId, agentId, enabled: true });
  const { stage, front, closeTab, reportFocus, sendAction, hidePerch, storeSecret } = view;
  const pages = useAgentPages();
  const requestPage = pages?.requestPage;
  const onPage = useShowPageOnScreen();
  const [pick, setPick] = useState<string | null>(null);
  const tabs = useMemo(() => stage?.tabs ?? [], [stage]);
  const visible = resolveVisibleTab({ tabs, focus: stage?.focus ?? null, pick });
  const visibleId = visible?.id ?? null;
  const screenInFront = visible ? isScreenTab(visible) : false;
  const mediaOrigin = useStageMediaOrigin(serverId);
  const perch = visiblePerch(stage, visibleId);
  const slides = useMemo(() => stage?.main.slides, [stage]);
  const perchInfo = useMemo(
    () => (perch ? { serverId, agentId, perch } : null),
    [serverId, agentId, perch],
  );

  // A stage change brought a tab forward: it goes on stage and the pager comes here.
  useFrontTab({
    front,
    onFront: () => {
      setPick(null);
      onScreenModeChange("watch");
      requestPage?.("show");
    },
  });

  // The last tab closed while the user looks at the page: back to the chat.
  const hasTabs = tabs.length > 0;
  const hadTabsRef = useRef(hasTabs);
  useEffect(() => {
    if (hadTabsRef.current && !hasTabs && onPage) requestPage?.("chat");
    hadTabsRef.current = hasTabs;
  }, [hasTabs, onPage, requestPage]);

  // Zuri sees what the user has in front (stage.report_focus); off the page the user looks at the
  // chat.
  const reportedFocus = onPage ? visibleId : null;
  useEffect(() => {
    reportFocus(reportedFocus);
  }, [reportedFocus, reportFocus]);

  useEffect(() => {
    if (!onPage) onScreenModeChange("watch");
  }, [onPage, onScreenModeChange]);
  useBlockAgentPageSwipes(onPage && screenInFront && screenMode === "control");

  // The switcher the user picked moves along the track; a drag that settles makes its tab the pick.
  const switcher = useSettings((settings) => settings.showTabSwitcher);
  const safeArea = useSafeAreaInsets();
  const bottomInset = safeArea.bottom;
  const insets = useMemo(() => {
    const room = switcherInsets(switcher);
    return { bottom: room.bottom + bottomInset, right: room.right };
  }, [bottomInset, switcher]);
  const track = useTabTrack({ tabs, visibleId, onSettle: setPick });
  const cards = useCardsControl(track);
  const pickCard = useCallback(
    (tabId: string) => {
      setPick(tabId);
      cards.close();
    },
    [cards],
  );
  const hasCards = switcherHasCards(switcher);
  const cardsOpen = hasCards && cards.shown;
  const backToChat = useCallback(() => requestPage?.("chat"), [requestPage]);
  const cardsActions = useCardsActions({
    screenMode: screenInFront ? screenMode : null,
    onScreenModeChange,
    onHidePerch: perch ? hidePerch : null,
    onBackToChat: requestPage ? backToChat : null,
  });

  const renderTab = useCallback(
    (tab: StageTab, inFront: boolean) =>
      isScreenTab(tab) ? (
        <View style={[styles.screen, { marginBottom: insets.bottom }]}>
          {onPage && inFront ? renderScreen() : null}
        </View>
      ) : (
        <TabContent
          tab={tab}
          active={onPage && inFront}
          mediaOrigin={mediaOrigin}
          sendAction={sendAction}
          storeSecret={storeSecret}
          perch={inFront ? perchInfo : null}
          slide={slides?.[tab.id] ?? null}
          insets={insets}
        />
      ),
    [insets, mediaOrigin, onPage, perchInfo, renderScreen, sendAction, slides, storeSecret],
  );

  return (
    <StagePaletteScope>
      <View style={styles.page} testID="stage-page" onLayout={track.onLayout}>
        <StageAurora active={onPage} />
        {visible ? (
          <TabSwitcherContent
            switcher={switcher}
            track={track}
            cards={cards}
            visibleKind={tabKind(visible)}
          >
            <TabTrackView
              track={track}
              tabs={tabs}
              visibleId={visibleId}
              entering={tabEntranceOf}
              exiting={tabExitingOf}
              renderTab={renderTab}
            />
            <StagePlayerLayer
              serverId={serverId}
              agentId={agentId}
              tabs={tabs}
              visibleId={onPage ? visibleId : null}
              mediaOrigin={mediaOrigin}
              track={track}
              insets={insets}
            />
          </TabSwitcherContent>
        ) : (
          <View style={styles.empty} testID="show-page-empty">
            <Text style={styles.emptyText}>{t("show.page.empty")}</Text>
          </View>
        )}
        {cardsOpen ? (
          <TabCards
            track={track}
            tabs={tabs}
            visibleId={visibleId}
            tabTitle={tabTitle}
            top={CANVAS_TOP}
            bottom={insets.bottom}
            mediaOrigin={mediaOrigin}
            onPick={pickCard}
            onCloseTab={closeTab}
            actions={cardsActions}
            onDismiss={cards.close}
          />
        ) : null}
        {visible && onPage ? (
          <TabSwitcherChrome
            switcher={switcher}
            track={track}
            tabs={tabs}
            visibleId={visibleId}
            tabTitle={tabTitle}
            top={CANVAS_TOP}
            bottomInset={bottomInset}
            cards={cards}
          />
        ) : null}
      </View>
    </StagePaletteScope>
  );
});

/**
 * The player tab's player, mounted for as long as the tab lives: over the tab while it is in
 * front, parked off screen otherwise. Zuri's media calls run here too.
 */
function StagePlayerLayer({
  serverId,
  agentId,
  tabs,
  visibleId,
  mediaOrigin,
  track,
  insets,
}: {
  serverId: string;
  agentId: string;
  tabs: StageTab[];
  /** The tab in front, or null while the user is off the Show page. */
  visibleId: string | null;
  mediaOrigin: string | null;
  track: TabTrack;
  insets: SwitcherInsets;
}) {
  const player = useMemo(() => playerTabOf(tabs), [tabs]);
  const shown = player !== null && player.tab.id === visibleId;
  const playerIndex = player ? tabs.indexOf(player.tab) : -1;
  const visibleIndex = tabs.findIndex((tab) => tab.id === visibleId);
  // Next to the tab in front it rides the track with the tabs, so a drag brings it in.
  const near = playerIndex >= 0 && visibleIndex >= 0 && Math.abs(playerIndex - visibleIndex) <= 1;
  const slotStyle = useTrackSlotStyle(track, playerIndex);
  // COMPAT(showMedia): a host without the media tools sends no media calls.
  const enabled = useHostFeature(serverId, "showMedia");
  const { attachPlayer } = useShowMedia({ serverId, agentId, enabled, hasPlayer: player !== null });
  if (!player) return null;
  return (
    <Animated.View
      style={
        near
          ? [playerStyles.slot, { bottom: insets.bottom, right: insets.right }, slotStyle]
          : playerStyles.parked
      }
      pointerEvents={shown ? "auto" : "none"}
      testID="stage-player-layer"
    >
      <StagePlayer
        key={player.spec.playId}
        spec={player.spec}
        tabUpdatedAt={player.tab.updatedAt}
        shown={shown}
        mediaOrigin={mediaOrigin}
        onAttach={attachPlayer}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: CANVAS_TOP + theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[12],
  },
  screen: {
    flex: 1,
    marginTop: CANVAS_TOP,
  },
  fill: {
    flex: 1,
    marginTop: CANVAS_TOP,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));

// The player layer is animated (it rides the tab track), so its styles are React Native's own
// (docs/mobile-panels.md: no Unistyles on animated nodes).
const playerStyles = RNStyleSheet.create({
  slot: {
    position: "absolute",
    top: CANVAS_TOP,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  // Off screen but laid out at a player's size: the film and YouTube's page keep playing.
  parked: {
    position: "absolute",
    top: 0,
    left: -10000,
    width: 360,
    height: 240,
  },
});
