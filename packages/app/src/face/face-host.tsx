import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { AppState, Pressable, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useAgentPageShown } from "@/agent-pages/agent-pages";
import { HizuriMark } from "@/components/icons/hizuri-mark";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { isWeb } from "@/constants/platform";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { FloatBridge, useFloatShown } from "@/float/float-bridge";
import { useSettings } from "@/hooks/use-settings";
import { useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { usePerching } from "@/stage/perch-store";
import { useSessionStore } from "@/stores/session-store";
import { useVoiceThinkHintStore } from "@/stores/voice-think-hint-store";
import type { Theme } from "@/styles/theme";
import type { FacePageAudio, FacePageMessage } from "./bridge";
import { useFaceOwner } from "./face-owner";
import { FaceFrame } from "./face-frame";
import type { FacePoster } from "./face-frame-shared";
import { FACE_LOAD_START, type FaceLoad, nextFaceLoad } from "./loading";
import { faceAvatarUrl } from "./model";
import { canDrawFace } from "./webgl";
import { useFaceActivity } from "./use-face-activity";
import { useFaceVoiceFeed } from "./use-face-voice-feed";

// Window 1 — Face. On a phone it is the first of the agent pages (agent-pages/),
// Zuri alone on the whole screen with nothing else on it: no buttons, no labels, no live words; the
// moving mouth is the sign that the assistant's voice is coming. On a wide layout there are no
// pages, and the assistant sits as a split above the chat while the user talks by voice.
//
// The daemon serves the page (features.face); the app feeds it the mouth frames of every voice
// chunk it plays (audio/voice-output.ts), so the lips follow the sound in the speaker exactly and
// no second audio stream exists. The face page loads once the user opens it or starts talking,
// stays loaded across swipes (on web: for a minute off screen), and draws nothing while it is off
// screen or the app is in the background. Until the assistant is drawn, one line says what is
// loading and how far (face/loading.ts); a browser without WebGL gets one sentence instead of a
// load that never ends. "Face in voice mode" in the chat settings turns the face off; the face page
// then shows the mark. The assistant's body language follows what it is doing (face/activity.ts):
// listening while the user speaks, thinking once the user's phrase reached it, working while its
// tools run.
//
// The page is covered by the panel's own background until it has painted something: the still of
// the assistant it saved last time (face.still) or its first live frame (face.ready). The WebView
// itself is never faded: Android draws a WebView under an animated opacity as a black box.

const ThemedFaceFrame = withUnistyles(FaceFrame);
const faceBackground = (theme: Theme) => ({ background: theme.colors.surface0 });

const FADE_MS = 420;
const MARK_SIZE = 72;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 420;
const HEIGHT_SHARE = 0.4;

const noopSubscribe = () => () => {};
/**
 * Web: a face off screen still holds the model, textures and WebGL context (Firefox: about
 * 0.7 GB of the tab, and every self-reload of the avatar page left more behind). After this long
 * off screen outside a voice conversation the page is dropped; coming back loads it again from
 * its IndexedDB copy in a few seconds. A phone keeps it: there the WebView takes seconds to start.
 */
const WEB_UNLOAD_HIDDEN_MS = 60_000;

/** True while this device holds a live voice conversation with this agent. */
export function useVoiceHere(serverId: string, agentId: string): boolean {
  const runtime = useVoiceRuntimeOptional();
  return useSyncExternalStore(runtime ? runtime.subscribe : noopSubscribe, () => {
    const snapshot = runtime?.getSnapshot();
    return (
      snapshot?.isVoiceMode === true &&
      snapshot.activeServerId === serverId &&
      snapshot.activeAgentId === agentId
    );
  });
}

/** The avatar page's URL when this host serves it over a direct connection, else null. */
export function useFaceUrl(serverId: string): string | null {
  const served = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.face === true,
  );
  const connection = useHostRuntimeSnapshot(serverId)?.activeConnection ?? null;
  if (!served) return null;
  const secure = isWeb && typeof location !== "undefined" && location.protocol === "https:";
  return faceAvatarUrl(connection, { secure });
}

export const FaceHost = memo(function FaceHost({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const url = useFaceUrl(serverId);
  const voiceHere = useVoiceHere(serverId, agentId);
  const active = useRetainedPanelActive();
  const enabled = useSettings((settings) => settings.faceInVoiceMode);
  // While the assistant perches on a block of the Show page, that window holds the only face page.
  const perching = usePerching();
  const [drawable] = useState(canDrawFace);
  if (!url || !voiceHere || !active || !enabled || perching || !drawable) return null;
  return (
    <FaceStage url={url} serverId={serverId} agentId={agentId} variant="split" paused={false} />
  );
});

/** True when this device can show the face for this host: served, direct, and switched on. */
export function useFaceAvailable(serverId: string): boolean {
  const url = useFaceUrl(serverId);
  const enabled = useSettings((settings) => settings.faceInVoiceMode);
  return url !== null && enabled;
}

/**
 * Whether the face page should hold the avatar page: from the user's first look or a voice start
 * until a session ends while the user is elsewhere, and on web only for a minute off screen.
 */
function useFaceWanted(shown: boolean, voiceHere: boolean): boolean {
  const [wanted, setWanted] = useState(shown || voiceHere);
  const hadVoiceRef = useRef(voiceHere);
  useEffect(() => {
    const sessionEnded = hadVoiceRef.current && !voiceHere;
    hadVoiceRef.current = voiceHere;
    if (shown || voiceHere) setWanted(true);
    else if (sessionEnded) setWanted(false);
  }, [shown, voiceHere]);
  useEffect(() => {
    if (!isWeb || shown || voiceHere || !wanted) return undefined;
    const timer = setTimeout(() => setWanted(false), WEB_UNLOAD_HIDDEN_MS);
    return () => clearTimeout(timer);
  }, [shown, voiceHere, wanted]);
  return wanted;
}

/**
 * WebGL, tested once the face is wanted and not at mount: LibreWolf asks for WebGL the moment a
 * page tries it. Null until tested; `probe` tests again after the user allowed it.
 */
function useFaceDrawable(wanted: boolean): { drawable: boolean | null; probe: () => void } {
  const [drawable, setDrawable] = useState<boolean | null>(null);
  const probe = useCallback(() => setDrawable(canDrawFace()), []);
  useEffect(() => {
    if (wanted && drawable === null) probe();
  }, [drawable, probe, wanted]);
  return { drawable, probe };
}

/**
 * The face page: the assistant's face on the whole page. It loads once the page is shown or a voice
 * session starts, then stays loaded (paused off screen) until a session ends while the user is
 * elsewhere. Without WebGL it says so in one sentence. Without a face (relay connection, an older
 * host, the setting off) the page holds the mark.
 */
export const FacePage = memo(function FacePage({
  serverId,
  agentId,
}: {
  serverId: string;
  agentId: string;
}) {
  const shown = useAgentPageShown("face");
  const url = useFaceUrl(serverId);
  const voiceHere = useVoiceHere(serverId, agentId);
  const active = useRetainedPanelActive();
  const enabled = useSettings((settings) => settings.faceInVoiceMode);
  const wanted = useFaceWanted(shown, voiceHere);
  // While the assistant floats over other apps or perches on a block of the Show page, that window
  // holds the only face page: two would load the model twice.
  const floating = useFloatShown();
  const perching = usePerching();
  // hizuri: one avatar at a time (face-owner.ts) — the agent the user talks with, else the page in
  // front; a second agent's page shows the mark and holds no WebView.
  const owns = useFaceOwner(
    `${serverId}/${agentId}`,
    url !== null && enabled,
    voiceHere,
    shown && active,
  );
  const loaded = (wanted || shown || voiceHere) && !floating && !perching && owns;
  const { drawable, probe } = useFaceDrawable(loaded);
  // The page's URL while the face is served, switched on and its agent tab is in front.
  const liveUrl = enabled && active ? url : null;
  if (liveUrl && loaded && drawable === false) {
    return (
      <View style={styles.page} testID="face-page">
        <FaceNoWebgl onRetry={probe} />
      </View>
    );
  }
  return (
    <View style={styles.page} testID="face-page">
      {liveUrl ? <FloatBridge serverId={serverId} agentId={agentId} url={liveUrl} /> : null}
      {liveUrl && loaded && drawable ? (
        <FaceStage
          url={liveUrl}
          serverId={serverId}
          agentId={agentId}
          variant="page"
          paused={!shown}
        />
      ) : (
        <View style={styles.markStage} testID="face-mark">
          {/* Unseen while it floats (hizuri is in the background): a breathing mark would
              keep the UI thread drawing every frame, screen off included. */}
          <HizuriMark size={MARK_SIZE} animated={shown && active && !floating} />
        </View>
      )}
    </View>
  );
});

const FaceStage = memo(function FaceStage({
  url,
  serverId,
  agentId,
  variant,
  paused,
}: {
  url: string;
  serverId: string;
  agentId: string;
  variant: "split" | "page";
  /** Off screen: the page keeps its model and stops drawing. */
  paused: boolean;
}) {
  const posterRef = useRef<FacePoster | null>(null);
  const readyRef = useRef(false);
  const audioRef = useRef<FacePageAudio | null>(null);
  const [load, setLoad] = useState<FaceLoad>(FACE_LOAD_START);
  const ready = load.step === "ready";
  const [painted, setPainted] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const splitHeight = Math.round(
    Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, windowHeight * HEIGHT_SHARE)),
  );

  useFaceVoiceFeed({ serverId, agentId, posterRef, readyRef, audioRef });

  const handlePageMessage = useCallback((message: FacePageMessage) => {
    setLoad((current) => nextFaceLoad(current, message));
    if (message.type === "face.still") setPainted(true);
    if (message.type === "face.ready") {
      readyRef.current = true;
      audioRef.current = message.audio ?? null;
      setPainted(true);
    }
    if (message.type === "face.error") console.warn("[face] page error:", message.message);
  }, []);

  const activity = useFaceActivity(serverId, agentId);
  const thinkSeconds = useVoiceThinkHintStore((state) => state.byServer[serverId]);
  useEffect(() => {
    if (!ready) return;
    posterRef.current?.post({
      type: "face.activity",
      activity,
      ...(activity === "thinking" && thinkSeconds ? { thinkSeconds } : {}),
    });
  }, [activity, ready, thinkSeconds]);

  // No drawing in the background or off screen: the WebView's GPU work shares the process with
  // the assistant's voice.
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);
  const drawing = appActive && !paused;
  const drawingRef = useRef(true);
  useEffect(() => {
    if (!ready || drawingRef.current === drawing) return;
    drawingRef.current = drawing;
    posterRef.current?.post({ type: drawing ? "face.resume" : "face.pause" });
  }, [drawing, ready]);

  const reduceMotion = useReducedMotion();
  const covered = useSharedValue(1);
  useEffect(() => {
    covered.value = withTiming(painted ? 0 : 1, { duration: reduceMotion ? 0 : FADE_MS });
  }, [painted, reduceMotion, covered]);
  const coverStyle = useAnimatedStyle(() => ({ opacity: covered.value }));

  return (
    <View
      style={variant === "split" ? [styles.split, { height: splitHeight }] : styles.page}
      // The face takes no touches (host mode has no tap overlay), so a swipe over it moves the
      // pages; on web an iframe would otherwise keep every touch to itself.
      pointerEvents={variant === "page" ? "none" : "auto"}
      testID={variant === "split" ? "face-split" : "face-stage"}
    >
      <ThemedFaceFrame
        url={url}
        uniProps={faceBackground}
        posterRef={posterRef}
        onPageMessage={handlePageMessage}
        testID="face-frame"
      />
      <Animated.View pointerEvents="none" style={[styles.cover, coverStyle]} testID="face-cover" />
      {ready ? null : <FaceLoadingLine load={load} />}
    </View>
  );
});

/**
 * What is loading and how far, in the middle of the face page while the assistant is not drawn yet.
 */
function FaceLoadingLine({ load }: { load: FaceLoad }) {
  const { t } = useTranslation();
  let text = t("face.loading.starting");
  let share = 0;
  if (load.step === "downloading") {
    share = load.share;
    text = t("face.loading.downloading", { percent: Math.round(load.share * 100) });
  } else if (load.step === "preparing") {
    share = 1;
    text = t("face.loading.preparing");
  } else if (load.step === "failed") {
    text = t("face.loading.failed", { message: load.message });
  }
  return (
    <View style={styles.loading} pointerEvents="none" testID="face-loading">
      <Text style={styles.loadingText} numberOfLines={2}>
        {text}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${Math.round(share * 100)}%` }]} />
      </View>
    </View>
  );
}

/** This browser draws no WebGL, so the face cannot load: one sentence and a retry, no spinner. */
function FaceNoWebgl({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.noWebgl} testID="face-no-webgl">
      <HizuriMark size={MARK_SIZE} animated={false} />
      <Text style={styles.noWebglText}>{t("face.loading.noWebgl")}</Text>
      <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
        <Text style={styles.retryText}>{t("face.loading.retry")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  split: {
    flexShrink: 0,
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    overflow: "hidden",
  },
  page: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  markStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.surface0,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  progressTrack: {
    width: 240,
    height: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
  },
  progressBar: {
    height: 3,
    backgroundColor: theme.colors.accent,
  },
  noWebgl: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[4],
    paddingHorizontal: theme.spacing[6],
  },
  noWebglText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    maxWidth: 420,
  },
  retry: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  retryText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
