import {
  memo,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, Platform, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Eye, Menu, MousePointer2 } from "lucide-react-native";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  iconButtonChromeGlyphSize,
  mutedIconColorMapping,
} from "@/components/ui/icon-button-chrome";
import { useAgentPages, useBlockAgentPageSwipes } from "@/agent-pages/agent-pages";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { isTestAgent } from "@/navigation/first-open";
import { useSessionStore } from "@/stores/session-store";
import { ICON_SIZE } from "@/styles/theme";
import type { ShowRenderMessage, ShowStrings } from "./bridge";
import { ShowFrame } from "./frame";
import { showPaletteFromTheme } from "./frame-sync";
import {
  DEFAULT_WINDOW_TITLE,
  LIMITS_WINDOW_TITLE,
  SCREEN_WINDOW_TITLE,
  PLAYER_WINDOW_TITLE,
  LIVE_WINDOW_TITLE,
  deriveShowState,
  isFreshShowCall,
  resolveVisibleWindowId,
  screenStreamUrl,
  selectShowItems,
  type ShowState,
  type ShowWindow,
} from "./model";
import { ShowScreenFrame } from "./screen-frame";
import { StagePage, type StageScreenMode } from "@/stage/stage-page";
import { useStageSupported } from "@/stage/use-stage";

// The Show window (window 3): Zuri's stage. On a phone it is the third
// agent page (ShowPage, agent-pages/): it comes up by itself when Zuri calls a show_* tool, and the
// user swipes to it and back. On a wide layout it is an overlay over the chat (ShowHost) that
// leaves the composer and voice bar below it untouched. On screen it is only what Zuri shows plus
// one burger in the top corner; its menu holds Zuri's windows and “Back to chat”. A screen window
// (show_screen) streams the assistant's browser: watch-only until the user takes over from the same
// burger, and only while it is on screen, so a hidden stage costs no video.

const ThemedShowFrame = withUnistyles(ShowFrame);
const ThemedMenuIcon = withUnistyles(Menu);
const ThemedWatchIcon = withUnistyles(Eye);
const ThemedControlIcon = withUnistyles(MousePointer2);

const OPEN_MS = 340;
const CLOSE_MS = 220;
const BURGER_SIZE = 40;
const BURGER_INSET = 12;

type ScreenMode = "watch" | "control";

interface UserPick {
  windowId: string;
  afterCallId: string | null;
}

function useShowStrings(): { strings: ShowStrings; windowTitle: (window: ShowWindow) => string } {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const strings = useMemo(
    (): ShowStrings => ({
      locale: language,
      empty: t("show.page.empty"),
      loading: t("show.page.loading"),
      resetsAt: t("show.page.resetsAt", { time: "{time}" }),
      inTime: t("show.page.inTime", { time: "{time}" }),
      updated: t("show.page.updated", { time: "{time}" }),
      used: t("show.page.used"),
      noData: t("show.page.noData"),
      widgetError: t("show.page.widgetError"),
      units: { d: t("show.page.days"), h: t("show.page.hours"), m: t("show.page.minutes") },
      windowLabels: { five_hour: t("show.page.fiveHour"), weekly: t("show.page.weekly") },
    }),
    [language, t],
  );
  // The two windows the app names itself follow the app language; Zuri's titles stay as written.
  const windowTitle = useCallback(
    (window: ShowWindow) => {
      if (window.title === DEFAULT_WINDOW_TITLE) return t("show.defaultWindow");
      if (window.title === LIMITS_WINDOW_TITLE) return t("show.limitsWindow");
      if (window.title === SCREEN_WINDOW_TITLE) return t("show.screenWindow");
      return window.title;
    },
    [t],
  );
  return { strings, windowTitle };
}

const noopSubscribe = () => () => {};

/**
 * Show belongs to the agent this device is in a session with; with no session, to any agent but
 * a throwaway test one. A test agent on the same host (app tests drive one) never reaches the user.
 */
export function useShowAllowed(serverId: string, agentId: string): boolean {
  const runtime = useVoiceRuntimeOptional();
  const subscribe = runtime ? runtime.subscribe : noopSubscribe;
  const sessionHere = useSyncExternalStore(subscribe, () =>
    runtime ? runtime.isSessionForAgent(serverId, agentId) : false,
  );
  const anySession = useSyncExternalStore(subscribe, () =>
    runtime ? runtime.getSnapshot().session !== null : false,
  );
  const testAgent = useSessionStore((state) => {
    const agent = state.sessions[serverId]?.agents.get(agentId);
    return agent ? isTestAgent(agent) : false;
  });
  return anySession ? sessionHere : !testAgent;
}

export const ShowHost = memo(function ShowHost({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const allowed = useShowAllowed(serverId, agentId);
  return allowed ? <ShowStage serverId={serverId} agentId={agentId} /> : null;
});

/**
 * What the stage draws: the assistant's windows, the one on stage, and the screen stream if it is
 * one.
 */
function useShowStageModel(serverId: string, agentId: string) {
  const showItems = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectShowItems(state.sessions[serverId], agentId),
    shallow,
  );
  const showState = useMemo(() => deriveShowState(showItems), [showItems]);
  const [userPick, setUserPick] = useState<UserPick | null>(null);
  const [screenMode, setScreenMode] = useState<ScreenMode>("watch");

  const visibleWindowId = resolveVisibleWindowId({ state: showState, userPick });
  const visibleIndex = showState.windows.findIndex((window) => window.id === visibleWindowId);
  const visibleWindow = visibleIndex >= 0 ? showState.windows[visibleIndex] : null;
  const screen = visibleWindow?.screen ?? null;
  const screenUrl = screen?.url ? screenStreamUrl(screen.url, screenMode === "control") : null;
  const render = useMemo(
    (): ShowRenderMessage => ({
      type: "show.render",
      window: visibleWindow,
      index: Math.max(0, visibleIndex),
    }),
    [visibleWindow, visibleIndex],
  );
  const lastCallId = showState.lastCall?.id ?? null;
  const pickWindow = useCallback(
    (windowId: string) => setUserPick({ windowId, afterCallId: lastCallId }),
    [lastCallId],
  );
  // Zuri showed something new: its latest window goes on stage, watch-only.
  const resetToLatest = useCallback(() => {
    setUserPick(null);
    setScreenMode("watch");
  }, []);
  return {
    showState,
    visibleWindowId,
    screen,
    screenUrl,
    render,
    screenMode,
    setScreenMode,
    pickWindow,
    resetToLatest,
  };
}

/** Runs `onFresh` once for each new show call this mount sees (isFreshShowCall). */
function useOnFreshShowCall(lastCall: ShowState["lastCall"], onFresh: () => void) {
  const seenCallIdRef = useRef<string | null>(null);
  const onFreshRef = useRef(onFresh);
  onFreshRef.current = onFresh;
  useEffect(() => {
    if (isFreshShowCall({ lastCall, seenCallId: seenCallIdRef.current, now: Date.now() })) {
      onFreshRef.current();
    }
    seenCallIdRef.current = lastCall?.id ?? null;
  }, [lastCall]);
}

function ShowScreenStage({ url }: { url: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.screenStage} testID="show-screen">
      {url ? (
        // A new key loads a fresh page: Selkies reads watch-only mode once at load.
        <ShowScreenFrame
          key={url}
          url={url}
          title={t("show.screenWindow")}
          testID="show-screen-frame"
        />
      ) : (
        <Text style={styles.screenConnecting}>{t("show.screenConnecting")}</Text>
      )}
    </View>
  );
}

const ShowStage = memo(function ShowStage({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const model = useShowStageModel(serverId, agentId);
  const { showState, screen, screenUrl, render, screenMode, setScreenMode } = model;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { strings, windowTitle } = useShowStrings();

  // Zuri showed something new: bring the stage up with its latest window.
  useOnFreshShowCall(showState.lastCall, () => {
    model.resetToLatest();
    setOpen(true);
    setMounted(true);
  });

  const hasWindows = showState.windows.length > 0;
  useEffect(() => {
    if (!hasWindows) setOpen(false);
  }, [hasWindows]);
  // Control is handed over for one look at the screen: closing the stage gives it back.
  useEffect(() => {
    if (!open) setScreenMode("watch");
  }, [open, setScreenMode]);

  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    const duration = open ? OPEN_MS : CLOSE_MS;
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : duration,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [open, progress, reduceMotion]);
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 28 }, { scale: 0.98 + progress.value * 0.02 }],
  }));

  const handleClose = useCallback(() => setOpen(false), []);
  // Android back closes the stage first, like a sheet, instead of leaving the chat.
  useEffect(() => {
    if (!open || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [open]);
  // Picking a window from the burger also brings the stage up when it is closed.
  const { pickWindow } = model;
  const selectWindow = useCallback(
    (windowId: string) => {
      pickWindow(windowId);
      setMounted(true);
      setOpen(true);
    },
    [pickWindow],
  );

  // The frame stays loaded when the last window closes, so the next show draws at once instead
  // of waiting for a fresh page.
  return (
    <>
      {mounted ? (
        <Animated.View
          testID="show-overlay"
          style={[styles.overlay, overlayStyle, open ? null : styles.inert]}
          aria-hidden={!open}
        >
          <View style={styles.stage}>
            <ThemedShowFrame
              uniProps={showPaletteFromTheme}
              strings={strings}
              render={render}
              testID="show-frame"
            />
            {screen && open ? <ShowScreenStage url={screenUrl} /> : null}
          </View>
        </Animated.View>
      ) : null}
      {hasWindows ? (
        <View style={styles.burgerRail}>
          <ShowWindowMenu
            windows={showState.windows}
            visibleWindowId={open ? model.visibleWindowId : null}
            windowTitle={windowTitle}
            onSelect={selectWindow}
            onClose={open ? handleClose : null}
            screenMode={screen && open ? screenMode : null}
            onScreenModeChange={setScreenMode}
          />
        </View>
      ) : null}
    </>
  );
});

/**
 * The Show page, the third agent page on a phone. Zuri's new show call brings the pager here;
 * “Back to chat” and closing the last window take it back. The windows load once the page has
 * been on; the screen stream runs only while the pager is on this page.
 */
export const ShowPage = memo(function ShowPage({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const allowed = useShowAllowed(serverId, agentId);
  // Until server_info arrives (a cold start offline) the stage page paints the cached stage.
  const stageSupported = useStageSupported(serverId) !== false;
  let content = <ShowPageEmpty />;
  if (allowed && stageSupported) {
    content = <ShowPageFromStage serverId={serverId} agentId={agentId} />;
  } else if (allowed) {
    // COMPAT(showTimeline): added in v0.11.4, remove after 2027-01-01. A host without the stage
    // draws Show from the assistant's show_* calls in the timeline.
    content = <ShowPageStage serverId={serverId} agentId={agentId} />;
  }
  return (
    <View style={styles.page} testID="show-page">
      {content}
    </View>
  );
});

/**
 * Show drawn from the stage the host keeps (stage/stage-page.tsx). Only the screen window still
 * reads the show_screen answer from the timeline: the stream URL is not part of the stage.
 */
const ShowPageFromStage = memo(function ShowPageFromStage({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const { t } = useTranslation();
  const showItems = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectShowItems(state.sessions[serverId], agentId),
    shallow,
  );
  const screenWindowUrl = useMemo(
    () => deriveShowState(showItems).windows.find((window) => window.screen)?.screen?.url ?? null,
    [showItems],
  );
  const [screenMode, setScreenMode] = useState<StageScreenMode>("watch");
  const screenUrl = screenWindowUrl
    ? screenStreamUrl(screenWindowUrl, screenMode === "control")
    : null;
  const renderScreen = useCallback(() => <ShowScreenStage url={screenUrl} />, [screenUrl]);
  const tabTitle = useCallback(
    (title: string) => {
      if (title === DEFAULT_WINDOW_TITLE) return t("show.defaultWindow");
      if (title === LIMITS_WINDOW_TITLE) return t("show.limitsWindow");
      if (title === SCREEN_WINDOW_TITLE) return t("show.screenWindow");
      if (title === PLAYER_WINDOW_TITLE) return t("showMedia.playerWindow");
      if (title === LIVE_WINDOW_TITLE) return t("show.liveWindow");
      return title;
    },
    [t],
  );
  return (
    <StagePage
      serverId={serverId}
      agentId={agentId}
      tabTitle={tabTitle}
      renderScreen={renderScreen}
      screenMode={screenMode}
      onScreenModeChange={setScreenMode}
    />
  );
});

function ShowPageEmpty() {
  const { t } = useTranslation();
  return (
    <View style={styles.pageEmpty} testID="show-page-empty">
      <Text style={styles.pageEmptyText}>{t("show.page.empty")}</Text>
    </View>
  );
}

const ShowPageStage = memo(function ShowPageStage({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const model = useShowStageModel(serverId, agentId);
  const { showState, screen, screenUrl, render, screenMode, setScreenMode } = model;
  const pages = useAgentPages();
  const requestPage = pages?.requestPage;
  const onPage = pages?.page === "show";
  const [mounted, setMounted] = useState(onPage);
  const { strings, windowTitle } = useShowStrings();

  useOnFreshShowCall(showState.lastCall, () => {
    model.resetToLatest();
    setMounted(true);
    requestPage?.("show");
  });
  useEffect(() => {
    if (onPage) setMounted(true);
  }, [onPage]);

  const hasWindows = showState.windows.length > 0;
  // Zuri closed its last window while the user looks at the page: back to the chat.
  const hadWindowsRef = useRef(hasWindows);
  useEffect(() => {
    if (hadWindowsRef.current && !hasWindows && onPage) requestPage?.("chat");
    hadWindowsRef.current = hasWindows;
  }, [hasWindows, onPage, requestPage]);
  // Control is handed over for one look at the screen: leaving the page gives it back.
  useEffect(() => {
    if (!onPage) setScreenMode("watch");
  }, [onPage, setScreenMode]);
  // While the user drives the assistant's browser, sideways drags are clicks and scrolls, not page
  // swipes.
  useBlockAgentPageSwipes(onPage && screen !== null && screenMode === "control");

  const backToChat = useCallback(() => requestPage?.("chat"), [requestPage]);
  const { pickWindow } = model;

  // The frame stays loaded when the last window closes (the WebView takes seconds to start on a
  // phone); “Nothing to show yet” covers it until the assistant shows something again.
  return (
    <>
      <View style={styles.stage}>
        {mounted ? (
          <ThemedShowFrame
            uniProps={showPaletteFromTheme}
            strings={strings}
            render={render}
            testID="show-frame"
          />
        ) : null}
        {screen && onPage ? <ShowScreenStage url={screenUrl} /> : null}
      </View>
      {hasWindows ? (
        <View style={styles.burgerRail}>
          <ShowWindowMenu
            windows={showState.windows}
            visibleWindowId={model.visibleWindowId}
            windowTitle={windowTitle}
            onSelect={pickWindow}
            onClose={backToChat}
            screenMode={screen && onPage ? screenMode : null}
            onScreenModeChange={setScreenMode}
          />
        </View>
      ) : (
        <View style={styles.emptyCover}>
          <ShowPageEmpty />
        </View>
      )}
    </>
  );
});

const watchIcon = <ThemedWatchIcon size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />;
const controlIcon = <ThemedControlIcon size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />;

function ScreenModeMenuItem({
  mode,
  current,
  leading,
  testID,
  onSelect,
  children,
}: {
  mode: ScreenMode;
  current: ScreenMode;
  leading: ReactElement;
  testID: string;
  onSelect: (mode: ScreenMode) => void;
  children: string;
}) {
  const handleSelect = useCallback(() => onSelect(mode), [onSelect, mode]);
  return (
    <DropdownMenuItem
      testID={testID}
      selected={mode === current}
      showSelectedCheck
      leading={leading}
      onSelect={handleSelect}
    >
      {children}
    </DropdownMenuItem>
  );
}

function ShowWindowMenu({
  windows,
  visibleWindowId,
  windowTitle,
  onSelect,
  onClose,
  screenMode,
  onScreenModeChange,
}: {
  windows: ShowWindow[];
  visibleWindowId: string | null;
  windowTitle: (window: ShowWindow) => string;
  onSelect: (windowId: string) => void;
  /** Set while the stage is up: the menu ends with “Back to chat”. */
  onClose: (() => void) | null;
  /** Set while the screen window is on stage: “Watch” and “Take over” sit above “Back to chat”. */
  screenMode: ScreenMode | null;
  onScreenModeChange: (mode: ScreenMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="show-windows-trigger"
        style={burgerStyle}
        accessibilityRole="button"
        accessibilityLabel={onClose ? t("show.windows") : t("show.open")}
      >
        <ThemedMenuIcon
          size={iconButtonChromeGlyphSize("large")}
          uniProps={mutedIconColorMapping}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={240} testID="show-windows-menu">
        {windows.map((window) => (
          <ShowWindowMenuItem
            key={window.id}
            window={window}
            selected={window.id === visibleWindowId}
            title={windowTitle(window)}
            onSelect={onSelect}
          />
        ))}
        {screenMode ? (
          <>
            <DropdownMenuSeparator />
            <ScreenModeMenuItem
              mode="watch"
              current={screenMode}
              leading={watchIcon}
              testID="show-screen-watch"
              onSelect={onScreenModeChange}
            >
              {t("show.screenWatch")}
            </ScreenModeMenuItem>
            <ScreenModeMenuItem
              mode="control"
              current={screenMode}
              leading={controlIcon}
              testID="show-screen-take-over"
              onSelect={onScreenModeChange}
            >
              {t("show.screenTakeOver")}
            </ScreenModeMenuItem>
          </>
        ) : null}
        {onClose ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem testID="show-close" onSelect={onClose}>
              {t("show.close")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShowWindowMenuItem({
  window,
  selected,
  title,
  onSelect,
}: {
  window: ShowWindow;
  selected: boolean;
  title: string;
  onSelect: (windowId: string) => void;
}) {
  const handleSelect = useCallback(() => onSelect(window.id), [onSelect, window.id]);
  return (
    <DropdownMenuItem
      testID={`show-window-${window.id}`}
      selected={selected}
      showSelectedCheck
      onSelect={handleSelect}
    >
      {title}
    </DropdownMenuItem>
  );
}

function burgerStyle({
  hovered,
  pressed,
  open,
}: {
  hovered: boolean;
  pressed: boolean;
  open: boolean;
}) {
  return [styles.burger, hovered || pressed || open ? styles.burgerActive : null];
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: theme.colors.surface0,
  },
  inert: {
    pointerEvents: "none",
  },
  emptyCover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface0,
  },
  page: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  pageEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
  },
  pageEmptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  // The stage starts below the burger's row, so the burger never covers what the assistant shows.
  stage: {
    flex: 1,
    minHeight: 0,
    marginTop: BURGER_INSET + BURGER_SIZE,
  },
  screenStage: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "stretch",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
  screenConnecting: {
    textAlign: "center",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  burgerRail: {
    position: "absolute",
    pointerEvents: "box-none",
    top: BURGER_INSET,
    right: BURGER_INSET,
    zIndex: 21,
  },
  burger: {
    width: BURGER_SIZE,
    height: BURGER_SIZE,
    borderRadius: BURGER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  burgerActive: {
    backgroundColor: theme.colors.surface3,
  },
}));
