import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { StageBlockNode } from "../model";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import { type StageTone, toneColor, useStagePalette, withAlpha } from "../palette";
import { STAGE_FONT } from "../type";
import { DotRule } from "./dots";
import { LottiePlayer } from "./lottie-player";
import { BlockTitle, CountText, MutedLine, Panel, num, rec, str } from "./primitives";
import { ProgressRing } from "./ring";

// Unistyles styles never reach LinearGradient on web (docs/unistyles.md): the wrapper View owns
// the layout and the gradient fills it.
const GRADIENT_FILL = { flex: 1 } as const;

// The four Show widgets Zuri already calls (show_stat, show_progress, show_card) drawn natively:
// numbers in Geist Mono count to their value over a dotted rule that draws itself on, bars and
// rings sweep from the blue field into their tone with the warm core riding the bar's edge, a
// finished bar or ring celebrates once.

const GRADIENT_START = { x: 0, y: 0.5 } as const;
const GRADIENT_END = { x: 1, y: 0.5 } as const;
const BAR_MS = 900;

export const CARD_TONES: Record<string, StageTone> = {
  info: "accent",
  success: "success",
  warning: "warning",
  error: "danger",
};

function useReachedFull(percent: number): number {
  // Counts the times the value arrived at 100 after being below it: each one plays once.
  const [wins, setWins] = useState(0);
  const belowRef = useRef(percent < 100);
  useEffect(() => {
    if (percent >= 100 && belowRef.current) setWins((value) => value + 1);
    belowRef.current = percent < 100;
  }, [percent]);
  return wins;
}

export function StatBlock({ block }: { block: StageBlockNode }) {
  const palette = useStagePalette();
  const { props } = block;
  const value = str(props.value, 40);
  const delta = rec(props.delta);
  const deltaText = str(delta.value, 40);
  const deltaTone: StageTone = delta.good === true ? "success" : "danger";
  const deltaColor = toneColor(palette, deltaTone);
  const deltaStyle = useMemo(() => ({ color: deltaColor }), [deltaColor]);
  const Arrow = delta.direction === "down" ? TrendingDown : TrendingUp;
  return (
    <Panel pulseKey={value} glow={block.emphasis === "glow"} testID={`stage-block-${block.id}`}>
      <Text style={styles.statLabel} numberOfLines={2}>
        {str(props.label, 80)}
      </Text>
      <CountText text={value} style={styles.statValue} />
      <DotRule draw={block.emphasis !== "pulse-once"} delay={200} />
      {deltaText ? (
        <View style={styles.delta}>
          <Arrow size={14} color={deltaColor} strokeWidth={1.5} />
          <Text style={[styles.deltaText, deltaStyle]}>{deltaText}</Text>
        </View>
      ) : null}
      <MutedLine text={str(props.footer, 200)} />
    </Panel>
  );
}

export function Bar({ percent, tone }: { percent: number; tone: StageTone }) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const fill = useSharedValue(0);
  const breath = useSharedValue(0);
  useEffect(() => {
    fill.value = reduceMotion
      ? percent
      : withTiming(percent, { duration: BAR_MS, easing: Easing.out(Easing.cubic) });
  }, [percent, fill, reduceMotion]);
  const running = percent > 0 && percent < 100 && !reduceMotion;
  useEffect(() => {
    if (!running) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [running, breath]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * breath.value,
    transform: [{ scale: 1 + 0.25 * breath.value }],
  }));
  const color = toneColor(palette, tone);
  const colors = useMemo(
    () => [palette.field, tone === "accent" ? palette.violet : color] as const,
    [color, tone, palette.field, palette.violet],
  );
  const trackStyle = useMemo(
    () => ({ backgroundColor: withAlpha(palette.foregroundMuted, 0.12) }),
    [palette.foregroundMuted],
  );
  const coreColor = useMemo(
    () => ({
      backgroundColor: palette.core,
      shadowColor: tone === "accent" ? palette.warm : color,
    }),
    [palette.core, palette.warm, tone, color],
  );
  return (
    <View style={styles.barBox}>
      <View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.fill, fillStyle]}>
          <View style={styles.fillGradient} pointerEvents="none">
            <LinearGradient
              colors={colors}
              start={GRADIENT_START}
              end={GRADIENT_END}
              style={GRADIENT_FILL}
            />
          </View>
        </Animated.View>
      </View>
      <Animated.View style={[styles.coreRail, fillStyle]} pointerEvents="none">
        <Animated.View style={[styles.core, coreColor, coreStyle]} />
      </Animated.View>
    </View>
  );
}

const CELEBRATION_EXIT = FadeOut.duration(320);

/** The win burst over a ring that reached 100: plays once, then fades so the “100%” shows. */
function Celebration({ wins }: { wins: number }) {
  const [finished, setFinished] = useState(0);
  const onFinish = useCallback(() => setFinished(wins), [wins]);
  if (wins === 0 || finished === wins) return null;
  return (
    <Animated.View style={styles.celebrate} pointerEvents="none" exiting={CELEBRATION_EXIT}>
      <LottiePlayer
        name="win"
        url={null}
        size={150}
        playKey={wins}
        loop={false}
        onFinish={onFinish}
      />
    </Animated.View>
  );
}

export function ProgressBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const percent = Math.min(100, Math.max(0, num(props.percent) ?? 0));
  const wins = useReachedFull(percent);
  const label = str(props.label, 80);
  const detail = str(props.detail, 200);
  const tone: StageTone = percent >= 100 ? "success" : "accent";
  const percentText = `${Math.round(percent)}%`;
  if (props.style === "ring") {
    return (
      <Panel tone={tone} glow={block.emphasis === "glow"} testID={`stage-block-${block.id}`}>
        <ProgressRing percent={percent} size={112} strokeWidth={11} tone={tone}>
          <CountText text={percentText} style={styles.ringValue} />
        </ProgressRing>
        <Celebration wins={wins} />
        <Text style={styles.ringLabel} numberOfLines={2}>
          {label}
        </Text>
        {detail ? <Text style={styles.ringDetail}>{detail}</Text> : null}
      </Panel>
    );
  }
  return (
    <Panel tone={tone} testID={`stage-block-${block.id}`}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={2}>
          {label}
        </Text>
        {wins > 0 ? (
          <LottiePlayer name="success" url={null} size={28} playKey={wins} loop={false} />
        ) : null}
        <CountText text={percentText} style={styles.barValue} />
      </View>
      <Bar percent={percent} tone={tone} />
      <MutedLine text={detail} />
    </Panel>
  );
}

export function CardBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const tone = CARD_TONES[str(props.kind, 20)] ?? null;
  const body = str(props.body, 4000);
  return (
    <Panel
      tone={tone}
      pulseKey={body}
      glow={block.emphasis === "glow"}
      testID={`stage-block-${block.id}`}
    >
      <BlockTitle text={str(props.title, 120)} tone={tone} />
      {body ? <Text style={styles.cardBody}>{body}</Text> : null}
      <MutedLine text={str(props.footer, 200)} />
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  statLabel: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
  },
  statValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: 34,
    letterSpacing: -1,
    marginTop: theme.spacing[2],
    fontVariant: ["tabular-nums"],
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  deltaText: {
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  barBox: {
    marginTop: theme.spacing[3],
    height: 14,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
  },
  fillGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coreRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  core: {
    width: 10,
    height: 10,
    marginRight: -5,
    borderRadius: theme.borderRadius.full,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  barHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  barLabel: {
    flex: 1,
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
  barValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.lg,
    fontVariant: ["tabular-nums"],
  },
  ringValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: 26,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  ringLabel: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    textAlign: "center",
    marginTop: theme.spacing[3],
  },
  ringDetail: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
    marginTop: theme.spacing[1],
  },
  celebrate: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  cardBody: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.content,
    lineHeight: 23,
  },
}));
