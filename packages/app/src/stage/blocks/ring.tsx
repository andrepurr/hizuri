import { type ReactNode, useEffect, useId, useMemo } from "react";
import { View } from "react-native";
import {
  createAnimatedComponent,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import Svg, { Circle, Defs, G, LinearGradient, Stop } from "react-native-svg";
import { type StageTone, toneColor, useStagePalette, withAlpha } from "../palette";

// A gauge ring: an arc that sweeps to its value and glides when Zuri moves it in place. Its colour
// runs from the blue field at the start to its tone at the end, where the value is.
// The arc is a dashed circle; strokeDasharray stays a number array (Reanimated's CSS-for-SVG flag
// in babel.config.js rejects strings).

const AnimatedCircle = createAnimatedComponent(Circle);
const SWEEP_MS = 1100;

export function ProgressRing({
  percent,
  size,
  strokeWidth,
  tone = "accent",
  children,
}: {
  percent: number;
  size: number;
  strokeWidth: number;
  tone?: StageTone;
  children?: ReactNode;
}) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const gradientId = `ring${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  useEffect(() => {
    const target = Math.min(100, Math.max(0, percent)) / 100;
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) });
  }, [percent, progress, reduceMotion]);
  const arcProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));
  const dash = useMemo(() => [circumference, circumference], [circumference]);
  const color = toneColor(palette, tone);
  const end = tone === "accent" ? palette.violet : color;
  const half = size / 2;
  const boxStyle = useMemo(() => ({ width: size, height: size }), [size]);
  return (
    <View style={[styles.box, boxStyle]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.field} />
            <Stop offset="1" stopColor={end} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={half}
          cy={half}
          r={radius}
          stroke={withAlpha(palette.foregroundMuted, 0.12)}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <G rotation={-90} originX={half} originY={half}>
          <AnimatedCircle
            cx={half}
            cy={half}
            r={radius}
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={dash}
            fill="none"
            animatedProps={arcProps}
          />
        </G>
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignSelf: "center",
  },
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
