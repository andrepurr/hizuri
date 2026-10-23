import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  Points,
  RadialGradient,
  vec,
} from "@shopify/react-native-skia";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { backdropDots } from "./backdrop";
import { useStagePalette, withAlpha } from "./palette";

// The stage's backdrop is the brand's field (docs/brand.md, Fluctuation): a still near-black
// field of dots in the field blue, brightest at the top where the tab begins, fading out below.
// One soft glow of the field blue and a fainter warm one drift slowly over it, the only motion,
// and only while the Show page is on screen (Skia, values on the UI thread); a hidden stage costs
// nothing. The dots themselves never move: the field is still until the assistant's voice bends it.

const DRIFT_MS = 16_000;

export function StageAurora({ active }: { active: boolean }) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!active || reduceMotion) {
      cancelAnimation(phase);
      return;
    }
    phase.value = withRepeat(
      withTiming(1, { duration: DRIFT_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(phase);
  }, [active, reduceMotion, phase]);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);
  const { width, height } = size;
  const points = useMemo(
    () => backdropDots(width, height).map(([x, y]) => vec(x, y)),
    [width, height],
  );
  const ax = useDerivedValue(() => width * (0.2 + 0.3 * phase.value));
  const ay = useDerivedValue(() => height * (0.1 + 0.08 * phase.value));
  const bx = useDerivedValue(() => width * (0.85 - 0.25 * phase.value));
  const by = useDerivedValue(() => height * (0.5 + 0.1 * phase.value));
  const radius = Math.max(width, 1) * 0.55;
  const fade = useMemo(
    () => [
      withAlpha(palette.field, 0.42),
      withAlpha(palette.field, 0.14),
      withAlpha(palette.field, 0.05),
    ],
    [palette.field],
  );
  return (
    <View style={styles.fill} onLayout={onLayout} pointerEvents="none">
      {width > 0 ? (
        <Canvas style={styles.fill}>
          <Group>
            <Circle cx={ax} cy={ay} r={radius} color={withAlpha(palette.field, 0.2)}>
              <BlurMask blur={80} />
            </Circle>
            <Circle cx={bx} cy={by} r={radius * 0.6} color={withAlpha(palette.warm, 0.05)}>
              <BlurMask blur={90} />
            </Circle>
          </Group>
          <Points points={points} mode="points" strokeWidth={2} strokeCap="round">
            <RadialGradient
              c={vec(width * 0.5, 0)}
              r={Math.max(height * 0.9, 1)}
              colors={fade}
              positions={FADE_STOPS}
            />
          </Points>
        </Canvas>
      ) : null}
    </View>
  );
}

const FADE_STOPS = [0, 0.55, 1];

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
