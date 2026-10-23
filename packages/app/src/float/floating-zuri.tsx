import { memo, useCallback, useEffect, useRef, useState } from "react";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { EyeOff, Maximize2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { FaceHostMessage, FacePageAudio, FacePageMessage } from "@/face/bridge";
import { FaceFrame } from "@/face/face-frame";
import { FACE_TRANSPARENT, type FacePoster } from "@/face/face-frame-shared";
import { useFaceVoiceFeed } from "@/face/use-face-voice-feed";
import type { Theme } from "@/styles/theme";
import {
  canWander,
  chooseWalk,
  type FloatPosition,
  idleDelayMs,
  MENU_OPEN_MS,
  WALK_SPEED_DP,
} from "./float-behavior";
import { type FloatEvent, floatNative } from "./float-native";
import { type FloatTarget, useFloatStore } from "./float-store";

// Floating Zuri: the root of the assistant's window over other apps (modules/hizuri-float), a
// second React surface of the app. Its face page, transparent and full-body, fed the same mouth
// frames, moods and activity as the face page in the app. The window itself moves natively (drag,
// drop to the floor, walks); this component tells the page what the body does meanwhile and decides
// when it strolls. Touches: drag carries it, a tap pokes it, a long press opens its menu (Open
// hizuri, Hide).

const ThemedMaximize = withUnistyles(Maximize2);
const ThemedEyeOff = withUnistyles(EyeOff);
const iconColor = (theme: Theme) => ({ color: theme.colors.foreground });
const MENU_ICON_SIZE = 20;

export function FloatingZuri() {
  const target = useFloatStore((state) => state.target);
  if (!target) return null;
  return <FloatingStage key={`${target.serverId}:${target.agentId}`} target={target} />;
}

function toPosition(event: FloatEvent): FloatPosition | null {
  if (event.x === undefined || event.screenWidth === undefined) return null;
  return { x: event.x, screenWidth: event.screenWidth, onFloor: event.onFloor === true };
}

const FloatingStage = memo(function FloatingStage({ target }: { target: FloatTarget }) {
  const { serverId, agentId, url } = target;
  const posterRef = useRef<FacePoster | null>(null);
  const readyRef = useRef(false);
  const audioRef = useRef<FacePageAudio | null>(null);
  const [ready, setReady] = useState(false);
  const activity = useFloatStore((state) => state.activity);
  const menuOpen = useFloatStore((state) => state.menuOpen);
  useFaceVoiceFeed({ serverId, agentId, posterRef, readyRef, audioRef });

  const post = useCallback((message: FaceHostMessage) => {
    if (readyRef.current) posterRef.current?.post(message);
  }, []);

  useEffect(() => {
    if (ready) post({ type: "face.activity", activity });
  }, [activity, ready, post]);

  const handlePageMessage = useCallback((message: FacePageMessage) => {
    if (message.type === "face.ready") {
      readyRef.current = true;
      audioRef.current = message.audio ?? null;
      setReady(true);
    } else if (message.type === "face.error") {
      console.warn("[float] page error:", message.message);
    }
  }, []);

  // Strolls: a timer that, when it fires and the assistant may wander, starts one walk.
  const wanderRef = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    position: null as FloatPosition | null,
    walking: false,
    screenOn: true,
  });
  const activityRef = useRef(activity);
  activityRef.current = activity;

  // A stroll begun in a quiet gap (between two phrases) stops once the assistant talks, hears or
  // thinks.
  useEffect(() => {
    if (activity !== "idle" && wanderRef.current.walking) floatNative?.stopWalk();
  }, [activity]);

  const scheduleWander = useCallback(() => {
    const wander = wanderRef.current;
    if (wander.timer) clearTimeout(wander.timer);
    wander.timer = setTimeout(() => {
      wander.timer = null;
      const allowed =
        readyRef.current &&
        !wander.walking &&
        canWander({
          activity: activityRef.current,
          menuOpen: useFloatStore.getState().menuOpen,
          screenOn: wander.screenOn,
          position: wander.position,
        });
      const walk = allowed && wander.position ? chooseWalk(wander.position, Math.random) : null;
      if (!walk) {
        scheduleWander();
        return;
      }
      wander.walking = true;
      post({ type: "face.float", state: "walk", facing: walk.direction, motion: walk.motion });
      floatNative?.walk(walk.direction, walk.distanceDp, WALK_SPEED_DP);
    }, idleDelayMs(Math.random));
  }, [post]);

  const menuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeMenu = useCallback((afterMs: number) => {
    if (menuTimerRef.current) clearTimeout(menuTimerRef.current);
    menuTimerRef.current = setTimeout(() => {
      menuTimerRef.current = null;
      useFloatStore.setState({ menuOpen: false });
    }, afterMs);
  }, []);

  useEffect(() => {
    const native = floatNative;
    if (!native) return;
    const wander = wanderRef.current;
    const subscription = native.addListener("onFloatEvent", (event) => {
      const position = toPosition(event);
      if (position) wander.position = position;
      switch (event.type) {
        case "shown":
        case "position":
          scheduleWander();
          break;
        case "tap":
          if (useFloatStore.getState().menuOpen) {
            // A tap on a menu button acts first (its own press), then the menu closes.
            closeMenu(250);
          } else {
            post({ type: "face.react", kind: "tap" });
            scheduleWander();
          }
          break;
        case "longPress":
          useFloatStore.setState({ menuOpen: true });
          closeMenu(MENU_OPEN_MS);
          break;
        case "dragStart":
          wander.walking = false;
          if (wander.timer) clearTimeout(wander.timer);
          post({ type: "face.float", state: "held" });
          break;
        case "fall":
          post({ type: "face.float", state: "fall" });
          break;
        case "landed":
          post({ type: "face.float", state: "stand" });
          post({ type: "face.react", kind: "land" });
          scheduleWander();
          break;
        case "walkEnd":
          wander.walking = false;
          post({ type: "face.float", state: "stand" });
          scheduleWander();
          break;
        case "screenOff":
          wander.screenOn = false;
          post({ type: "face.pause" });
          break;
        case "screenOn":
          wander.screenOn = true;
          post({ type: "face.resume" });
          break;
        default:
          break;
      }
    });
    native.requestPosition();
    return () => {
      subscription.remove();
      if (wander.timer) clearTimeout(wander.timer);
      if (menuTimerRef.current) clearTimeout(menuTimerRef.current);
    };
  }, [closeMenu, post, scheduleWander]);

  const openApp = useCallback(() => {
    useFloatStore.setState({ menuOpen: false });
    floatNative?.openApp();
  }, []);
  const hide = useCallback(() => {
    useFloatStore.setState((state) => ({ menuOpen: false, hideRequests: state.hideRequests + 1 }));
  }, []);

  return (
    <View style={styles.root} testID="floating-zuri">
      <View style={styles.face} pointerEvents="none">
        <FaceFrame
          url={`${url}&float=1`}
          background={FACE_TRANSPARENT}
          posterRef={posterRef}
          onPageMessage={handlePageMessage}
          testID="floating-zuri-face"
        />
      </View>
      {menuOpen ? <FloatMenu onOpen={openApp} onHide={hide} /> : null}
    </View>
  );
});

function FloatMenu({ onOpen, onHide }: { onOpen: () => void; onHide: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.menu} testID="floating-zuri-menu">
      <Pressable
        style={styles.menuButton}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={t("face.float.open")}
        testID="floating-zuri-open"
      >
        <ThemedMaximize size={MENU_ICON_SIZE} uniProps={iconColor} />
      </Pressable>
      <Pressable
        style={styles.menuButton}
        onPress={onHide}
        accessibilityRole="button"
        accessibilityLabel={t("face.float.hide")}
        testID="floating-zuri-hide"
      >
        <ThemedEyeOff size={MENU_ICON_SIZE} uniProps={iconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: "transparent",
  },
  face: {
    ...StyleSheet.absoluteFillObject,
  },
  menu: {
    position: "absolute",
    top: theme.spacing[2],
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
