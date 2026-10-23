import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { isSpokenInput } from "@/agent-stream/presentation";
import { useVoiceOptional } from "@/contexts/voice-context";
import { useRevealedText } from "@/hooks/use-revealed-text";
import { useSessionStore } from "@/stores/session-store";
import { selectLiveWords, useVoiceLiveWordsStore } from "@/stores/voice-live-words-store";
import type { StreamItem } from "@/types/stream";
import {
  LIVE_WORDS_IDLE_MS,
  liveWordsText,
  liveWordsUpdatedAt,
  tailOfLiveWords,
} from "@/voice/live-words";

/** About four lines on a phone; the card shows the end of a longer phrase. */
const LIVE_WORDS_MAX_LENGTH = 160;
const APPEAR_MS = 220;
const FLY_MS = 520;

interface VoiceLiveWordsProps {
  serverId: string;
  agentId: string;
}

/**
 * Hizuri: the user's words type here, at the top of the chat, while the user speaks in voice mode,
 * and stay until the phrase reaches the chat; then they fly down into it. The words are the sign
 * that the assistant hears the user: no words, not heard. They never cover the assistant's face: on
 * a phone they live on the chat page only, on a wide layout below the face split.
 */
export function VoiceLiveWords({ serverId, agentId }: VoiceLiveWordsProps) {
  const voice = useVoiceOptional();
  if (!voice?.isVoiceModeForAgent(serverId, agentId)) return null;
  return <VoiceLiveWordsCard serverId={serverId} agentId={agentId} />;
}

function VoiceLiveWordsCard({ serverId, agentId }: VoiceLiveWordsProps) {
  const { t } = useTranslation();
  // COMPAT(voiceLiveTranscript): added in hizuri 2026-10-17, remove after 2027-04-17.
  const isSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.voiceLiveTranscript === true,
  );
  const words = useVoiceLiveWordsStore(selectLiveWords(serverId));
  const text = tailOfLiveWords(liveWordsText(words), LIVE_WORDS_MAX_LENGTH);
  const updatedAt = liveWordsUpdatedAt(words);
  const revealed = useRevealedText(text, "streaming");
  const latestSpokenId = useSessionStore((state) => {
    const session = state.sessions[serverId];
    return session ? latestSpokenUserMessageId(session, agentId) : null;
  });
  const reducedMotion = useReducedMotion();
  const [flying, setFlying] = useState<{ key: number; text: string } | null>(null);

  // The user's phrase reached the chat: its words fly into it.
  const previousSpokenIdRef = useRef(latestSpokenId);
  useEffect(() => {
    if (previousSpokenIdRef.current === latestSpokenId) return;
    previousSpokenIdRef.current = latestSpokenId;
    if (!latestSpokenId) return;
    const landed = useVoiceLiveWordsStore.getState().land(serverId);
    if (landed && !reducedMotion) {
      setFlying({ key: Date.now(), text: tailOfLiveWords(landed, LIVE_WORDS_MAX_LENGTH) });
    }
  }, [latestSpokenId, reducedMotion, serverId]);

  // Words that never reached the chat (dropped, not for the assistant) fade after a while.
  useEffect(() => {
    if (updatedAt === null) return undefined;
    const timer = setTimeout(
      () => useVoiceLiveWordsStore.getState().clear(serverId),
      Math.max(0, updatedAt + LIVE_WORDS_IDLE_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [serverId, updatedAt]);

  useEffect(() => () => useVoiceLiveWordsStore.getState().clear(serverId), [serverId]);

  const handleFlown = useCallback(() => setFlying(null), []);

  return (
    <View style={styles.container} pointerEvents="none" testID="voice-live-words">
      {!isSupported ? (
        <Text style={styles.updateHost}>{t("realtimeVoice.live.updateHost")}</Text>
      ) : null}
      {revealed ? <LiveWordsBubble text={revealed} animateIn={!reducedMotion} /> : null}
      {flying ? <FlyingWords key={flying.key} text={flying.text} onDone={handleFlown} /> : null}
    </View>
  );
}

function LiveWordsBubble({ text, animateIn }: { text: string; animateIn: boolean }) {
  const progress = useSharedValue(animateIn ? 0 : 1);
  useEffect(() => {
    progress.value = withTiming(1, { duration: APPEAR_MS, easing: Easing.out(Easing.cubic) });
  }, [progress]);
  const appearStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -8 }],
  }));
  return (
    <Animated.View style={[styles.bubble, appearStyle]} testID="voice-live-words-text">
      <Text style={styles.text} accessibilityLiveRegion="polite">
        {text}
      </Text>
    </Animated.View>
  );
}

/** The finished phrase leaving the card: down towards the chat, smaller, fading. */
function FlyingWords({ text, onDone }: { text: string; onDone: () => void }) {
  const { height } = useWindowDimensions();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(
      1,
      { duration: FLY_MS, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      },
    );
  }, [onDone, progress]);
  const distance = height * 0.45;
  const flyStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * progress.value,
    transform: [{ translateY: progress.value * distance }, { scale: 1 - progress.value * 0.12 }],
  }));
  return (
    <Animated.View
      style={[styles.bubble, styles.flying, flyStyle]}
      testID="voice-live-words-flying"
    >
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

function latestSpokenUserMessageId(
  session: {
    agentStreamHead: Map<string, StreamItem[]>;
    agentStreamTail: Map<string, StreamItem[]>;
  },
  agentId: string,
): string | null {
  for (const items of [
    session.agentStreamHead.get(agentId),
    session.agentStreamTail.get(agentId),
  ]) {
    if (!items) continue;
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index]!;
      if (item.kind !== "user_message") continue;
      return isSpokenInput(item.text) ? item.id : null;
    }
  }
  return null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    top: theme.spacing[3],
    left: theme.spacing[3],
    right: theme.spacing[3],
    alignItems: "flex-end",
    gap: theme.spacing[2],
    zIndex: 30,
  },
  bubble: {
    maxWidth: theme.contentMaxWidth,
    backgroundColor: theme.colors.surface3,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    // It floats over the chat, like a toast.
    ...theme.shadow.md,
  },
  flying: {
    position: "absolute",
    top: 0,
    right: 0,
  },
  text: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    lineHeight: Math.round(theme.fontSize.xl * 1.35),
  },
  updateHost: {
    alignSelf: "center",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    overflow: "hidden",
  },
}));
