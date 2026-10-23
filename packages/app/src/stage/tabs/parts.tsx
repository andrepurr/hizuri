import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { type ReactNode, useMemo } from "react";
import { type StyleProp, StyleSheet as RNStyleSheet, View, type ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle } from "react-native-reanimated";
import type { StageTab } from "@getpaseo/protocol/stage";
import { MARK_SPECTRUM } from "@/components/icons/hizuri-mark";
import { isNative } from "@/constants/platform";
import { useStagePalette, withAlpha } from "../palette";
import type { TabTrack } from "./track";

// Pieces the four switchers share: each tab's colour, the frosted glass, the page dots and the
// haptic tick.

/**
 * The brand's spectrum, from the field's blue to the warm core (components/icons/hizuri-mark.tsx,
 * docs/brand.md). A tab keeps its colour for its life: it comes from the tab's id, not its place.
 */
export const SPECTRUM = [
  MARK_SPECTRUM.field,
  MARK_SPECTRUM.violet,
  MARK_SPECTRUM.orchid,
  MARK_SPECTRUM.warm,
  MARK_SPECTRUM.rose,
] as const;
export const WARM_CORE = MARK_SPECTRUM.core;
export const WARM_GLOW = MARK_SPECTRUM.warm;

export function tabColor(tab: StageTab): string {
  let hash = 0;
  for (let index = 0; index < tab.id.length; index += 1) {
    hash = (hash * 31 + tab.id.charCodeAt(index)) | 0;
  }
  return SPECTRUM[Math.abs(hash) % SPECTRUM.length]!;
}

/** A light tick under the thumb when the tab in front changes. */
export function tick(): void {
  if (!isNative) return;
  void Haptics.selectionAsync().catch(() => {});
}

/** Frosted glass, as the Show header: blur, a tint of the page and a hairline. */
export function Glass({ style, children }: { style: StyleProp<ViewStyle>; children?: ReactNode }) {
  const palette = useStagePalette();
  const tint = useMemo(
    () => [
      styles.fill,
      {
        backgroundColor: withAlpha(palette.background, 0.62),
        borderColor: withAlpha(palette.foreground, 0.1),
      },
      styles.hairline,
    ],
    [palette],
  );
  return (
    <View style={[styles.glass, style]}>
      <BlurView
        intensity={40}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={styles.fill}
      />
      <View style={tint} pointerEvents="none" />
      {children}
    </View>
  );
}

function PageDot({
  track,
  index,
  color,
  idle,
}: {
  track: TabTrack;
  index: number;
  color: string;
  idle: string;
}) {
  const style = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(track.position.value - index));
    return {
      width: 5 + 13 * near,
      backgroundColor: interpolateColor(near, [0.35, 0.65], [idle, color]),
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

/** One dot per tab; the one in front stretches into its colour as the track moves. */
export function PageDots({
  track,
  tabs,
  style,
}: {
  track: TabTrack;
  tabs: readonly StageTab[];
  style: StyleProp<ViewStyle>;
}) {
  const palette = useStagePalette();
  const idle = withAlpha(palette.foreground, 0.28);
  // Past a dozen tabs the dots stop telling them apart.
  if (tabs.length < 2 || tabs.length > 12) return null;
  return (
    <View style={[styles.dots, style]} pointerEvents="none">
      {tabs.map((tab, index) => (
        <PageDot key={tab.id} track={track} index={index} color={tabColor(tab)} idle={idle} />
      ))}
    </View>
  );
}

/** A tab's colour dot with its glow. */
export function ColorDot({ color, size = 8 }: { color: string; size?: number }) {
  const style = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      shadowColor: color,
      shadowOpacity: 0.9,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 0 },
    }),
    [color, size],
  );
  return <View style={style} />;
}

const styles = RNStyleSheet.create({
  glass: {
    overflow: "hidden",
  },
  fill: {
    ...RNStyleSheet.absoluteFill,
  },
  hairline: {
    borderWidth: 1,
    borderRadius: 999,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
});
