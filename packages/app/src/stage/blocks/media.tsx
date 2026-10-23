import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pause, Play, Volume2, VolumeX } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { isLottieName } from "../lottie-library";
import type { StageBlockNode } from "../model";
import { useStageBlockContext } from "./block-context";
import { LottiePlayer } from "./lottie-player";
import { STAGE_FONT } from "../type";
import { BlockTitle, Panel, arr, rec, str } from "./primitives";
import { resolveStageMediaUrl, STAGE_MEDIA_PREFIX } from "./stage-media";
import { useImageAnimation } from "./use-image-animation";
import { ZoomablePicture } from "./zoom";

// Moving pictures: a video clip (muted, looping, playing only while its tab is on screen), an
// audio track with one play button, Lottie animations, and pictures that fade in. A picture or a
// video alone in its tab (show_file) fills the tab: the picture zooms, the video gets a sound
// button. Files from show_file are cached on the phone, so they play again offline.

const ThemedPlay = withUnistyles(Play);
const ThemedPause = withUnistyles(Pause);
const ThemedSoundOn = withUnistyles(Volume2);
const ThemedSoundOff = withUnistyles(VolumeX);
const iconColor = (theme: { colors: { accentForeground: string } }) => ({
  color: theme.colors.accentForeground,
});

const VIDEO_RETRY_MS = 5000;
const LOTTIE_SIZES = { small: 72, medium: 120, large: 180 } as const;

/** The daemon's own files are kept in the player's disk cache, so they play offline. */
function useMediaSource(url: string) {
  return useMemo(() => ({ uri: url, useCaching: url.includes(STAGE_MEDIA_PREFIX) }), [url]);
}

/** A block's file as the app loads it: an https link, or show_file's path on the daemon. */
function useMediaUrl(value: unknown): string | null {
  const { mediaOrigin } = useStageBlockContext();
  return resolveStageMediaUrl(str(value, 2000), mediaOrigin ?? null);
}

/**
 * A muted looping clip with no player chrome: it plays while its tab is on screen and a tap pauses
 * it. The picture mounts once the clip is ready (a dark frame with a play glyph until then), so a
 * clip that cannot load never shows the native player's error chrome. While on screen, a clip that
 * failed (no network) reloads every few seconds; the player is read directly, since its error can
 * fire before a listener attaches. Alone in its tab (`fill`) the whole clip fits and a button
 * turns the sound on.
 */
function VideoClip({ url, title, fill = false }: { url: string; title: string; fill?: boolean }) {
  const { active } = useStageBlockContext();
  const [muted, setMuted] = useState(true);
  const setup = useCallback((player: { loop: boolean; muted: boolean }) => {
    player.loop = true;
    player.muted = true;
  }, []);
  const source = useMediaSource(url);
  const player = useVideoPlayer(source, setup);
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const [ready, setReady] = useState(player.status === "readyToPlay");
  const [paused, setPaused] = useState(false);
  const shouldPlay = active && !paused;
  const shouldPlayRef = useRef(shouldPlay);
  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
    if (shouldPlay) player.play();
    else player.pause();
  }, [shouldPlay, player]);
  useEffect(() => {
    const markReady = (status: string) => {
      if (status === "readyToPlay") setReady(true);
    };
    markReady(player.status);
    const subscription = player.addListener("statusChange", ({ status }) => markReady(status));
    const reload = async () => {
      try {
        await player.replaceAsync(source);
        if (shouldPlayRef.current) player.play();
      } catch {
        // Still offline: the next tick tries again.
      }
    };
    const timer = setInterval(() => {
      markReady(player.status);
      if (player.status === "error" && shouldPlayRef.current) void reload();
    }, VIDEO_RETRY_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [player, source]);
  const toggle = useCallback(() => setPaused((value) => !value), []);
  const toggleSound = useCallback(() => {
    player.muted = !muted;
    setMuted(!muted);
  }, [muted, player]);
  return (
    <Pressable
      style={fill ? styles.videoFillFrame : styles.videoFrame}
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {ready ? (
        <VideoView
          player={player}
          style={styles.video}
          contentFit={fill ? "contain" : "cover"}
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      ) : null}
      {ready && isPlaying ? null : (
        <View style={styles.videoOverlay} pointerEvents="none">
          <View style={styles.audioButton}>
            <ThemedPlay size={20} uniProps={iconColor} />
          </View>
        </View>
      )}
      {fill ? (
        <Pressable
          style={styles.soundButton}
          onPress={toggleSound}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Sound on" : "Sound off"}
          testID="stage-video-sound"
        >
          {muted ? (
            <ThemedSoundOff size={20} uniProps={iconColor} />
          ) : (
            <ThemedSoundOn size={20} uniProps={iconColor} />
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function AudioTrack({ url, title }: { url: string; title: string }) {
  const { active } = useStageBlockContext();
  const player = useVideoPlayer(useMediaSource(url));
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);
  const toggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);
  return (
    <View style={styles.audio}>
      <Pressable
        style={styles.audioButton}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        {isPlaying ? (
          <ThemedPause size={20} uniProps={iconColor} />
        ) : (
          <ThemedPlay size={20} uniProps={iconColor} />
        )}
      </Pressable>
      <Text style={styles.audioTitle} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

export function MediaBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const url = useMediaUrl(props.url);
  const title = str(props.title, 160);
  if (!url) return null;
  return (
    <Panel testID={`stage-block-${block.id}`}>
      {props.kind === "audio" ? (
        <AudioTrack url={url} title={title || "Audio"} />
      ) : (
        <>
          <BlockTitle text={title} />
          <VideoClip url={url} title={title || "Video"} />
        </>
      )}
    </Panel>
  );
}

export function LottieBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const name = isLottieName(props.name) ? props.name : null;
  const url = str(props.url, 2000);
  const sizeName = str(props.size, 10);
  const size = LOTTIE_SIZES[sizeName as keyof typeof LOTTIE_SIZES] ?? LOTTIE_SIZES.medium;
  const caption = str(props.caption, 160);
  // Zuri re-sending the block (another win) plays it again.
  const playKey = JSON.stringify(props);
  return (
    <View style={styles.lottie} testID={`stage-block-${block.id}`}>
      <LottiePlayer
        name={name}
        url={url.startsWith("https://") ? url : null}
        size={size}
        loop={typeof props.loop === "boolean" ? props.loop : undefined}
        playKey={playKey}
      />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

function Picture({
  url,
  caption,
  fit,
}: {
  url: string;
  caption: string;
  fit: "cover" | "contain";
}) {
  const { active } = useStageBlockContext();
  const imageRef = useImageAnimation(active);
  return (
    <View style={styles.picture}>
      <Image
        ref={imageRef}
        source={url}
        style={styles.image}
        contentFit={fit}
        transition={350}
        autoplay={active}
      />
      {caption ? <Text style={styles.pictureCaption}>{caption}</Text> : null}
    </View>
  );
}

export function ImageBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const { mediaOrigin } = useStageBlockContext();
  const fit = props.fit === "contain" ? "contain" : "cover";
  const images = arr(props.images).map(rec);
  return (
    <Panel testID={`stage-block-${block.id}`}>
      {images.map((image) => {
        const raw = str(image.url, 400_000);
        const url = raw.startsWith("data:image/")
          ? raw
          : resolveStageMediaUrl(raw, mediaOrigin ?? null);
        if (!url) return null;
        return (
          <Picture key={raw.slice(0, 200)} url={url} caption={str(image.caption, 200)} fit={fit} />
        );
      })}
    </Panel>
  );
}

/** One picture alone in its tab: it fills the tab and zooms. */
export function PictureFill({ block }: { block: StageBlockNode }) {
  const image = rec(arr(block.props.images)[0]);
  const { mediaOrigin } = useStageBlockContext();
  const raw = str(image.url, 400_000);
  const url = raw.startsWith("data:image/") ? raw : resolveStageMediaUrl(raw, mediaOrigin ?? null);
  if (!url) return null;
  return (
    <ZoomablePicture
      uri={url}
      caption={str(image.caption, 200)}
      testID={`stage-block-${block.id}`}
    />
  );
}

/** A video alone in its tab: the whole clip fits the tab; the title and sound button sit at the bottom so nothing covers its top. */
export function VideoFill({ block }: { block: StageBlockNode }) {
  const url = useMediaUrl(block.props.url);
  const title = str(block.props.title, 160);
  if (!url) return null;
  return (
    <View style={styles.videoFill} testID={`stage-block-${block.id}`}>
      <VideoClip url={url} title={title || "Video"} fill />
      {title ? <Text style={styles.videoCaption}>{title}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  videoFrame: {
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
    backgroundColor: "#000000",
    aspectRatio: 16 / 9,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  videoFill: {
    flex: 1,
    backgroundColor: "#000000",
  },
  videoFillFrame: {
    flex: 1,
  },
  videoCaption: {
    position: "absolute",
    left: theme.spacing[4],
    right: 64,
    bottom: theme.spacing[3],
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
  },
  soundButton: {
    position: "absolute",
    bottom: theme.spacing[3],
    right: theme.spacing[3],
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  audio: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  audioButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
  },
  audioTitle: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  lottie: {
    alignItems: "center",
    paddingVertical: theme.spacing[2],
  },
  caption: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.lg,
    textAlign: "center",
    marginTop: theme.spacing[1],
  },
  picture: {
    marginBottom: theme.spacing[2],
  },
  image: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: theme.borderRadius.xl,
  },
  pictureCaption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
}));
