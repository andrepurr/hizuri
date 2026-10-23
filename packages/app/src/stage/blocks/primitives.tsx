import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Text, type TextStyle, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { leadingMark } from "../emoji";
import { formatCount, parseCount } from "../model";
import { type StageTone, toneColor, useStagePalette, withAlpha } from "../palette";
import { STAGE_FONT } from "../type";
import { SpectrumDot } from "./dots";
import { stageIcon } from "./marks";

// Unistyles styles never reach LinearGradient on web (docs/unistyles.md): the wrapper View owns
// the layout and the gradient fills it.
const GRADIENT_FILL = { flex: 1 } as const;

// The pieces every block is drawn from: a quiet panel on the field (a hairline border, and a wash
// of its tone's spectrum colour only when it has a tone), numbers in Geist Mono that count to
// their new value, titles that carry their tone as a dot, the marker that leads a row, and the
// short pulse a block gives when Zuri changes it in place.

const GRADIENT_START = { x: 0, y: 0 } as const;
const GRADIENT_END = { x: 0.9, y: 0.7 } as const;
const COUNT_MS = 1100;

interface PanelProps {
  tone?: StageTone | null;
  /** Stronger tint, for a headline card. */
  strong?: boolean;
  glow?: boolean;
  /** Changes when the content changes: the panel gives one soft pulse. */
  pulseKey?: string;
  children: ReactNode;
  testID?: string;
}

export function Panel({
  tone,
  strong = false,
  glow = false,
  pulseKey,
  children,
  testID,
}: PanelProps) {
  const palette = useStagePalette();
  const color = tone ? toneColor(palette, tone) : null;
  const colors = useMemo(
    () =>
      color
        ? ([
            withAlpha(color, strong ? 0.16 : 0.09),
            withAlpha(color, 0),
            withAlpha(color, 0),
          ] as const)
        : null,
    [color, strong],
  );
  const scale = usePulse(pulseKey);
  const frameStyle = useMemo(
    () => ({
      borderColor: color && strong ? withAlpha(color, 0.32) : palette.border,
      backgroundColor: withAlpha(palette.surface1, 0.86),
      shadowColor: palette.warm,
    }),
    [color, strong, palette.border, palette.surface1, palette.warm],
  );
  return (
    <Animated.View
      testID={testID}
      style={[styles.panel, frameStyle, glow ? styles.glow : null, scale]}
    >
      {colors ? (
        <View style={styles.gradient} pointerEvents="none">
          <LinearGradient
            colors={colors}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={GRADIENT_FILL}
          />
        </View>
      ) : null}
      {children}
    </Animated.View>
  );
}

/** One soft scale pulse whenever `key` changes after the first paint. */
export function usePulse(key: string | undefined) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    if (reduceMotion) return;
    scale.value = withSequence(
      withTiming(1.025, { duration: 140 }),
      withSpring(1, { damping: 12, stiffness: 180 }),
    );
  }, [key, reduceMotion, scale]);
  return useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A number that counts to its new value: “€4,210” counts from the old amount (or from zero on
 * first paint) and keeps its currency, separators and unit. Text without a number stays as is.
 */
export function useCountText(text: string, fromZero: boolean): string {
  const reduceMotion = useReducedMotion();
  const format = useMemo(() => parseCount(text), [text]);
  const target = format?.value ?? null;
  const shownRef = useRef<number | null>(fromZero && !reduceMotion ? 0 : target);
  const [shown, setShown] = useState<number | null>(shownRef.current);
  useEffect(() => {
    if (target === null) return;
    const from = shownRef.current ?? target;
    if (reduceMotion || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / COUNT_MS);
      const value = from + (target - from) * easeOut(t);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduceMotion]);
  if (!format || shown === null) return text;
  return formatCount(format, shown);
}

export function CountText({
  text,
  fromZero = true,
  style,
}: {
  text: string;
  fromZero?: boolean;
  style: TextStyle | (TextStyle | null)[];
}) {
  const shown = useCountText(text, fromZero);
  return (
    <Text style={style} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
      {shown}
    </Text>
  );
}

/** A block's title; a status emoji in front of it becomes a dot in the tone it meant. */
export function BlockTitle({ text, tone }: { text: string; tone?: StageTone | null }) {
  const palette = useStagePalette();
  const mark = leadingMark(text);
  const dotTone = tone ?? mark.tone;
  if (!mark.text) return null;
  return (
    <View style={styles.titleRow}>
      {dotTone ? <SpectrumDot color={toneColor(palette, dotTone)} /> : null}
      <Text style={styles.title} numberOfLines={2}>
        {mark.text}
      </Text>
    </View>
  );
}

/**
 * What leads a row: the Lucide icon it names, thin, in `color`; else a dot of the field in the
 * tone its emoji meant, or in `color`.
 */
export function RowMarker({ icon, color }: { icon: string; color: string }) {
  const palette = useStagePalette();
  const Icon = stageIcon(icon);
  const mark = leadingMark(icon);
  const style = useMemo(() => ({ borderColor: withAlpha(color, 0.28) }), [color]);
  if (Icon) {
    return (
      <View style={[styles.marker, style]}>
        <Icon size={15} color={color} strokeWidth={1.5} />
      </View>
    );
  }
  const markColor = mark.tone ? toneColor(palette, mark.tone) : color;
  return (
    <View style={styles.markerDot}>
      <SpectrumDot color={markColor} size={7} />
    </View>
  );
}

export function MutedLine({ text }: { text: string }) {
  if (!text) return null;
  return <Text style={styles.muted}>{text}</Text>;
}

export function str(value: unknown, max = 400): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function rec(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function Spacer() {
  return <View style={styles.spacer} />;
}

export const styles = StyleSheet.create((theme) => ({
  panel: {
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: 1,
    padding: theme.spacing[4],
    overflow: "hidden",
  },
  glow: {
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.lg,
    letterSpacing: -0.1,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 17,
    marginTop: theme.spacing[3],
  },
  marker: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  markerDot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  spacer: {
    height: theme.spacing[2],
  },
}));
