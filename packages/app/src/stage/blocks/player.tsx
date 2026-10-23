import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoSource } from "expo-video";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Linking,
  // oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { MediaCommand } from "@/show-media/model";
import type { MediaPlayerHandle } from "@/show-media/player-handle";
import { youtubeAppUrl } from "@/show-media/youtube-bridge";
import { YoutubeLanePlayer } from "@/show-media/youtube-player";
import type { YoutubePageEvent } from "@/show-media/youtube-bridge";
import { loadPlayerPosition, savePlayerPosition } from "./player-position";
import { playerStart, resolvePlayerUrl, toYoutubePlan, type PlayerSpec } from "./player-spec";

// The player tab's player (show_media). The stage page keeps it mounted while the tab exists, so a
// film goes on while the user looks at another tab, the chat or the face: shown, it fills the tab;
// hidden, it is parked off screen. Films and music play in the app's own player (expo-video,
// ExoPlayer on Android): native controls, full screen, picture-in-picture when leaving the app,
// background play and lock-screen controls. YouTube plays in its IFrame player on the daemon's
// page. Zuri steers both through the handle (media_control).

const ThemedPlay = withUnistyles(Play);
const ThemedPause = withUnistyles(Pause);
const ThemedBack = withUnistyles(RotateCcw);
const ThemedForward = withUnistyles(RotateCw);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const accentIcon = (theme: { colors: { accentForeground: string } }) => ({
  color: theme.colors.accentForeground,
});
const mutedIcon = (theme: { colors: { foreground: string } }) => ({
  color: theme.colors.foreground,
});
const spinnerColor = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});

const FULLSCREEN_OPTIONS = { enable: true } as const;
const SKIP_SECONDS = 15;
const SAVE_EVERY_SECONDS = 5;
/** "Previous" restarts the item first when past this point, like a music player. */
const RESTART_BEFORE_PREVIOUS_SECONDS = 5;

export interface StagePlayerProps {
  spec: PlayerSpec;
  /** The player tab's updatedAt: tells Zuri's fresh call from a tab that came back later. */
  tabUpdatedAt: string;
  /** The player tab is in front on the Show page. */
  shown: boolean;
  mediaOrigin: string | null;
  onAttach: (handle: MediaPlayerHandle | null) => void;
}

/** Key it by `spec.playId`: a new show_media call starts a new player. */
export function StagePlayer(props: StagePlayerProps) {
  const { spec, tabUpdatedAt } = props;
  const [start, setStart] = useState<{ position: number; autoplay: boolean } | null>(null);
  const firstRef = useRef({ spec, tabUpdatedAt });
  useEffect(() => {
    let live = true;
    const first = firstRef.current;
    const begin = async () => {
      const saved = await loadPlayerPosition(first.spec.playId);
      if (!live) return;
      setStart(
        playerStart({ spec: first.spec, tabUpdatedAt: first.tabUpdatedAt, saved, now: Date.now() }),
      );
    };
    void begin();
    return () => {
      live = false;
    };
  }, []);
  if (!start) {
    return (
      <View style={styles.message}>
        <ThemedLoadingSpinner size="large" uniProps={spinnerColor} />
      </View>
    );
  }
  if (props.spec.kind === "youtube") return <YoutubeTabPlayer {...props} start={start} />;
  return <NativeTabPlayer {...props} start={start} />;
}

type StartedProps = StagePlayerProps & { start: { position: number; autoplay: boolean } };

function toSource(uri: string, spec: PlayerSpec, origin: string | null): VideoSource | null {
  const resolved = resolvePlayerUrl(uri, origin);
  if (!resolved) return null;
  return {
    uri: resolved,
    contentType: spec.contentType,
    metadata: { title: spec.title ?? undefined, artist: "hizuri" },
  };
}

function applyToPlayer(input: {
  player: VideoPlayer;
  command: MediaCommand;
  step: (delta: number) => void;
}): void {
  const { player, command } = input;
  switch (command.action) {
    case "play":
      player.play();
      return;
    case "pause":
    case "stop":
      player.pause();
      return;
    case "next":
      input.step(1);
      return;
    case "previous":
      if (player.currentTime > RESTART_BEFORE_PREVIOUS_SECONDS) {
        player.currentTime = 0;
      } else {
        input.step(-1);
      }
      return;
    case "seek":
      if (command.position !== null) {
        player.currentTime = command.position;
      } else {
        player.seekBy(command.offset ?? 0);
      }
      return;
    case "volume":
      player.volume = command.volume / 100;
      player.muted = command.volume === 0;
      return;
  }
}

/** Reads the player without throwing once it has been released (unmount order is not ours). */
function currentTimeOf(player: VideoPlayer): number | null {
  try {
    return player.currentTime;
  } catch {
    return null;
  }
}

function NativeTabPlayer(props: StartedProps) {
  const { t } = useTranslation();
  const { spec, mediaOrigin } = props;
  const source = useMemo(() => toSource(spec.url, spec, mediaOrigin), [spec, mediaOrigin]);
  // No player before the source is known: on a cold start the daemon's origin comes a moment
  // later, and a player released that fast is still registered by expo-video's playback service
  // once its binding lands, leaving a dead media session that takes the media buttons.
  if (!source) {
    return (
      <View style={styles.message} testID="stage-player-video">
        <Text style={styles.messageText}>{t("showMedia.needsDirectConnection")}</Text>
      </View>
    );
  }
  return <NativeSourcePlayer {...props} source={source} />;
}

function NativeSourcePlayer({
  spec,
  start,
  shown,
  mediaOrigin,
  onAttach,
  source,
}: StartedProps & { source: VideoSource }) {
  const { t } = useTranslation();
  const items = useMemo(() => [spec.url, ...spec.queue], [spec]);
  const indexRef = useRef(0);
  const startRef = useRef(start);
  const player = useVideoPlayer(source, (created) => {
    created.staysActiveInBackground = true;
    created.showNowPlayingNotification = true;
    created.keepScreenOnWhilePlaying = true;
    created.timeUpdateEventInterval = 1;
    if (startRef.current.position > 0) created.currentTime = startRef.current.position;
    if (startRef.current.autoplay) created.play();
  });
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { status, error } = useEvent(player, "statusChange", { status: player.status });
  const [hasVideo, setHasVideo] = useState(spec.kind === "video");
  const [time, setTime] = useState({ current: start.position, duration: 0 });
  const savedAtRef = useRef(start.position);
  const playId = spec.playId;

  // Music (or a film with no picture) must not shrink into a picture-in-picture window.
  useEventListener(player, "sourceLoad", (loaded) => {
    setHasVideo(loaded.availableVideoTracks.length > 0);
  });
  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    setTime({ current: currentTime, duration: player.duration });
    if (Math.abs(currentTime - savedAtRef.current) >= SAVE_EVERY_SECONDS) {
      savedAtRef.current = currentTime;
      savePlayerPosition(playId, currentTime);
    }
  });
  useEventListener(player, "playToEnd", () => savePlayerPosition(playId, 0));
  useEffect(() => {
    if (isPlaying) return;
    const position = currentTimeOf(player);
    if (position !== null) savePlayerPosition(playId, position);
  }, [isPlaying, player, playId]);
  useEffect(
    () => () => {
      const position = currentTimeOf(player);
      if (position !== null) savePlayerPosition(playId, position);
    },
    [player, playId],
  );

  useEffect(() => {
    const step = (delta: number) => {
      const next = indexRef.current + delta;
      const uri = items[next];
      const nextSource = uri ? toSource(uri, spec, mediaOrigin) : null;
      if (!nextSource) return;
      indexRef.current = next;
      void player.replaceAsync(nextSource).then(() => player.play());
    };
    onAttach({ apply: (command) => applyToPlayer({ player, command, step }) });
    return () => onAttach(null);
  }, [items, mediaOrigin, onAttach, player, spec]);

  return (
    <View style={styles.root} testID="stage-player-video">
      {hasVideo ? (
        <VideoView
          style={styles.video}
          player={player}
          nativeControls={shown}
          contentFit="contain"
          fullscreenOptions={FULLSCREEN_OPTIONS}
          allowsPictureInPicture
          startsPictureInPictureAutomatically={isPlaying}
        />
      ) : (
        <AudioControls
          player={player}
          title={spec.title ?? t("showMedia.audio")}
          playing={isPlaying}
          current={time.current}
          duration={time.duration}
        />
      )}
      {status === "error" ? (
        <View style={styles.errorBar} pointerEvents="none">
          <Text style={styles.errorText} numberOfLines={2} testID="stage-player-error">
            {t("showMedia.cannotPlay", { reason: error?.message ?? "" })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** Music has no picture: its title, where it is, and the three buttons a thumb needs. */
function AudioControls({
  player,
  title,
  playing,
  current,
  duration,
}: {
  player: VideoPlayer;
  title: string;
  playing: boolean;
  current: number;
  duration: number;
}) {
  const { t } = useTranslation();
  const [barWidth, setBarWidth] = useState(0);
  const toggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  const measure = useCallback(
    (event: LayoutChangeEvent) => setBarWidth(event.nativeEvent.layout.width),
    [],
  );
  const back = useCallback(() => player.seekBy(-SKIP_SECONDS), [player]);
  const forward = useCallback(() => player.seekBy(SKIP_SECONDS), [player]);
  const seek = useCallback(
    (event: GestureResponderEvent) => {
      if (barWidth <= 0 || duration <= 0) return;
      player.currentTime = (event.nativeEvent.locationX / barWidth) * duration;
    },
    [barWidth, duration, player],
  );
  const progress = duration > 0 ? Math.min(1, current / duration) : 0;
  const progressStyle = useMemo(() => ({ width: `${progress * 100}%` as const }), [progress]);
  return (
    <View style={styles.audio} testID="stage-player-audio">
      <Text style={styles.audioTitle} numberOfLines={3}>
        {title}
      </Text>
      <Pressable
        style={styles.track}
        onPress={seek}
        onLayout={measure}
        accessibilityRole="adjustable"
        accessibilityLabel={title}
      >
        <View style={styles.trackLine}>
          <View style={[styles.trackFill, progressStyle]} />
        </View>
      </Pressable>
      <View style={styles.times}>
        <Text style={styles.time}>{clock(current)}</Text>
        <Text style={styles.time}>{duration > 0 ? clock(duration) : ""}</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable
          style={styles.skipButton}
          onPress={back}
          accessibilityRole="button"
          accessibilityLabel={t("showMedia.back15")}
          testID="stage-player-back"
        >
          <ThemedBack size={22} uniProps={mutedIcon} />
        </Pressable>
        <Pressable
          style={styles.playButton}
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? t("showMedia.pause") : t("showMedia.play")}
          testID="stage-player-toggle"
        >
          {playing ? (
            <ThemedPause size={26} uniProps={accentIcon} />
          ) : (
            <ThemedPlay size={26} uniProps={accentIcon} />
          )}
        </Pressable>
        <Pressable
          style={styles.skipButton}
          onPress={forward}
          accessibilityRole="button"
          accessibilityLabel={t("showMedia.forward15")}
          testID="stage-player-forward"
        >
          <ThemedForward size={22} uniProps={mutedIcon} />
        </Pressable>
      </View>
    </View>
  );
}

function YoutubeTabPlayer({ spec, start, mediaOrigin, onAttach }: StartedProps) {
  const { t } = useTranslation();
  const plan = useMemo(
    () => ({ ...toYoutubePlan(spec), startAt: start.position > 0 ? start.position : null }),
    [spec, start.position],
  );
  const lanePlayerRef = useRef<MediaPlayerHandle>(null);
  const [failed, setFailed] = useState(false);
  const openedRef = useRef(false);
  const playId = spec.playId;
  const openInApp = useCallback(() => void Linking.openURL(youtubeAppUrl(plan)), [plan]);

  useEffect(() => {
    onAttach({ apply: (command) => lanePlayerRef.current?.apply(command) });
    return () => onAttach(null);
  }, [onAttach]);

  const handleEvent = useCallback(
    (event: YoutubePageEvent) => {
      if (event.type === "media.time") savePlayerPosition(playId, event.seconds);
      if (event.type !== "media.error") return;
      setFailed(true);
      // Zuri just asked for it and YouTube refuses it here: the YouTube app plays it, once.
      if (start.autoplay && !openedRef.current) {
        openedRef.current = true;
        openInApp();
      }
    },
    [openInApp, playId, start.autoplay],
  );

  if (!mediaOrigin || failed) {
    return (
      <View style={styles.message} testID="stage-player-youtube">
        <Alert
          variant="info"
          title={spec.title ?? t("showMedia.youtube")}
          description={
            mediaOrigin ? t("showMedia.onlyInYoutube") : t("showMedia.needsDirectConnection")
          }
        >
          <Button
            variant="outline"
            size="sm"
            onPress={openInApp}
            testID="stage-player-open-youtube"
          >
            {t("showMedia.openInYoutube")}
          </Button>
        </Alert>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="stage-player-youtube">
      <YoutubeLanePlayer
        ref={lanePlayerRef}
        plan={plan}
        baseUrl={mediaOrigin}
        autoplay={start.autoplay}
        onEvent={handleEvent}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.palette.black,
  },
  video: {
    flex: 1,
  },
  message: {
    flex: 1,
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  messageText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  errorBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  audio: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[4],
    backgroundColor: theme.colors.surface0,
  },
  audioTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    textAlign: "center",
  },
  track: {
    height: 44,
    justifyContent: "center",
  },
  trackLine: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  trackFill: {
    height: 4,
    backgroundColor: theme.colors.accent,
  },
  times: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -theme.spacing[3],
  },
  time: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[6],
  },
  skipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
}));
