import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  StyleSheet as RNStyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useBlockMobilePanelOpenGestures } from "@/mobile-panels/provider";
import { usePanelStore } from "@/stores/panel-store";
import {
  AGENT_PAGE_COUNT,
  type AgentPage,
  agentPageAt,
  agentPageIndex,
  dragAgentPagePosition,
  pagerTakesBack,
  resolveAgentPageSwipeEnd,
  resolveAgentPageSwipeIntent,
} from "./model";
import { AgentPageTabs, useAgentPageTabsShown } from "./agent-page-tabs";
import { useWheelPaging } from "./use-wheel-paging";

// The three pages of an agent chat on a phone (agent-pages/model.ts). All three stay mounted
// side by side on one track, so a swipe never reloads the chat, the face or the voice session;
// only the track moves. One normalized position (in pages) drives it, as in mobile-panels: the
// finger writes it on the UI thread, and React learns the page only when a swipe ends or a page
// is asked for. The track uses React Native static styles: Unistyles and Reanimated patching the
// same node has crashed Fabric (docs/mobile-panels.md).

const SETTLE_MS = 260;
const SETTLE_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

interface AgentPagesValue {
  /** The page the pager is on or moving to. */
  page: AgentPage;
  /** The page fully on screen; null while the track moves. */
  settledPage: AgentPage | null;
  requestPage: (page: AgentPage) => void;
  /** Set while a page needs horizontal drags for itself (a screen the user took over). */
  swipeBlocked: SharedValue<boolean>;
  /** Set on the UI thread while a finger is down on a control that owns its drag (Show's tab
   * switchers): the page swipe fails for that touch, even if the control gives up mid-touch. */
  touchHeld: SharedValue<boolean>;
}

const AgentPagesContext = createContext<AgentPagesValue | null>(null);

/** The pager around this page, or null on a wide layout, where there are no pages. */
export function useAgentPages(): AgentPagesValue | null {
  return useContext(AgentPagesContext);
}

/** True while `page` is the page fully on screen. Without a pager every page counts as shown. */
export function useAgentPageShown(page: AgentPage): boolean {
  const pages = useContext(AgentPagesContext);
  return pages ? pages.settledPage === page : true;
}

/** Keeps horizontal drags for the calling page while `blocked`. */
export function useBlockAgentPageSwipes(blocked: boolean): void {
  const pages = useContext(AgentPagesContext);
  const swipeBlocked = pages?.swipeBlocked;
  useEffect(() => {
    if (!swipeBlocked || !blocked) return undefined;
    swipeBlocked.value = true;
    return () => {
      swipeBlocked.value = false;
    };
  }, [blocked, swipeBlocked]);
}

/** The pager's touch-down hold, or null on a wide layout. */
export function useAgentPagesTouchHold(): SharedValue<boolean> | null {
  return useContext(AgentPagesContext)?.touchHeld ?? null;
}

export interface AgentPagesProps {
  /** The page to show. A swipe reports its page through onPageChange. */
  page: AgentPage;
  onPageChange: (page: AgentPage) => void;
  face: ReactNode;
  chat: ReactNode;
  show: ReactNode;
}

export function AgentPages({ page, onPageChange, face, chat, show }: AgentPagesProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [width, setWidth] = useState(windowWidth);
  const widthValue = useSharedValue(windowWidth);
  const [settledPage, setSettledPage] = useState<AgentPage | null>(page);
  const initialIndex = useRef(agentPageIndex(page)).current;
  const position = useSharedValue(initialIndex);
  const targetIndex = useSharedValue(initialIndex);
  const startIndex = useSharedValue(initialIndex);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const swipeBlocked = useSharedValue(false);
  const touchHeld = useSharedValue(false);
  // Read once at touch-down: a switcher that gives up mid-touch must not hand its drag over.
  const touchStartHeld = useSharedValue(false);
  const reduceMotion = useReducedMotion();
  const active = useRetainedPanelActive();
  // The agent list or the explorer slid over the pages: Back belongs to that panel.
  const coveredByPanel = usePanelStore((state) => state.mobilePanel.target !== "agent");
  const index = agentPageIndex(page);
  const tabsShown = useAgentPageTabsShown();

  const settle = useCallback((settledIndex: number) => {
    setSettledPage(agentPageAt(settledIndex));
  }, []);
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  const commitSwipe = useCallback((nextIndex: number) => {
    const next = agentPageAt(nextIndex);
    setSettledPage((current) => (current === next ? current : null));
    onPageChangeRef.current(next);
  }, []);

  // A page asked for from outside slides in; a page a swipe already moves to is left alone.
  useEffect(() => {
    if (targetIndex.value === index) return;
    targetIndex.value = index;
    setSettledPage(null);
    position.value = withTiming(
      index,
      { duration: reduceMotion ? 0 : SETTLE_MS, easing: SETTLE_EASING },
      (finished) => {
        if (finished) scheduleOnRN(settle, index);
      },
    );
  }, [index, position, reduceMotion, settle, targetIndex]);

  const requestPage = useCallback((next: AgentPage) => onPageChangeRef.current(next), []);

  const viewportRef = useRef<View>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  const stepPage = useCallback((step: -1 | 1) => {
    const next = indexRef.current + step;
    if (next >= 0 && next < AGENT_PAGE_COUNT) onPageChangeRef.current(agentPageAt(next));
  }, []);
  useWheelPaging(viewportRef, stepPage, active);

  // The keyboard belongs to the chat's composer: it goes when the chat leaves the screen.
  useEffect(() => {
    if (page !== "chat") Keyboard.dismiss();
  }, [page]);

  // Android back returns to the chat first, as closing a sheet would.
  useEffect(() => {
    if (Platform.OS !== "android" || !pagerTakesBack({ active, page, coveredByPanel }))
      return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      requestPage("chat");
      return true;
    });
    return () => subscription.remove();
  }, [active, coveredByPanel, page, requestPage]);

  // A swipe toward a page that exists is ours; past the ends it opens the panel behind the edge.
  useBlockMobilePanelOpenGestures(active && index > 0, "agent-list");
  useBlockMobilePanelOpenGestures(active && index < AGENT_PAGE_COUNT - 1, "file-explorer");

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(active)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (touch) {
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
          }
          touchStartHeld.value = touchHeld.value;
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (
            !touch ||
            event.numberOfTouches !== 1 ||
            swipeBlocked.value ||
            touchHeld.value ||
            touchStartHeld.value
          ) {
            stateManager.fail();
            return;
          }
          const intent = resolveAgentPageSwipeIntent({
            deltaX: touch.absoluteX - touchStartX.value,
            deltaY: touch.absoluteY - touchStartY.value,
            index: targetIndex.value,
          });
          if (intent === "fail") stateManager.fail();
          else if (intent === "activate") stateManager.activate();
        })
        .onStart(() => {
          cancelAnimation(position);
          startIndex.value = targetIndex.value;
        })
        .onUpdate((event) => {
          position.value = dragAgentPagePosition({
            startIndex: startIndex.value,
            dragPages: -event.translationX / Math.max(1, widthValue.value),
          });
        })
        .onEnd((event, success) => {
          const next = success
            ? resolveAgentPageSwipeEnd({
                startIndex: startIndex.value,
                position: position.value,
                velocityX: event.velocityX,
              })
            : startIndex.value;
          targetIndex.value = next;
          position.value = withTiming(
            next,
            { duration: SETTLE_MS, easing: SETTLE_EASING },
            (finished) => {
              if (finished) scheduleOnRN(settle, next);
            },
          );
          scheduleOnRN(commitSwipe, next);
        }),
    [
      active,
      commitSwipe,
      position,
      settle,
      startIndex,
      swipeBlocked,
      targetIndex,
      touchHeld,
      touchStartHeld,
      touchStartX,
      touchStartY,
      widthValue,
    ],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = Math.round(event.nativeEvent.layout.width);
      if (next <= 0) return;
      widthValue.value = next;
      setWidth((current) => (current === next ? current : next));
    },
    [widthValue],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.value * widthValue.value }],
  }));
  const pageStyle = useMemo(() => [styles.page, { width }], [width]);
  const trackSize = useMemo(() => ({ width: width * AGENT_PAGE_COUNT }), [width]);

  const value = useMemo(
    (): AgentPagesValue => ({ page, settledPage, requestPage, swipeBlocked, touchHeld }),
    [page, settledPage, requestPage, swipeBlocked, touchHeld],
  );

  return (
    <AgentPagesContext.Provider value={value}>
      {tabsShown ? <AgentPageTabs page={page} onSelect={requestPage} /> : null}
      <GestureDetector gesture={gesture} touchAction="pan-y">
        <View ref={viewportRef} style={styles.viewport} onLayout={handleLayout} collapsable={false}>
          <Animated.View style={[styles.track, trackSize, trackStyle]} testID="agent-pages">
            <PageSlot page="face" current={page} style={pageStyle}>
              {face}
            </PageSlot>
            <PageSlot page="chat" current={page} style={pageStyle}>
              {chat}
            </PageSlot>
            <PageSlot page="show" current={page} style={pageStyle}>
              {show}
            </PageSlot>
          </Animated.View>
        </View>
      </GestureDetector>
    </AgentPagesContext.Provider>
  );
}

function PageSlot({
  page,
  current,
  style,
  children,
}: {
  page: AgentPage;
  current: AgentPage;
  style: object;
  children: ReactNode;
}) {
  const hidden = page !== current;
  return (
    <View
      style={style}
      testID={`agent-page-${page}`}
      aria-hidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      {children}
    </View>
  );
}

const styles = RNStyleSheet.create({
  viewport: {
    flex: 1,
    overflow: "hidden",
  },
  track: {
    flex: 1,
    flexDirection: "row",
  },
  page: {
    height: "100%",
    overflow: "hidden",
  },
});
