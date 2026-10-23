import { LinearGradient } from "expo-linear-gradient";
import { useId, useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Svg, { Circle, Defs, Mask, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { BACKDROP_SPACING } from "./backdrop";
import { useStagePalette, withAlpha } from "./palette";

// Unistyles styles never reach LinearGradient on web (docs/unistyles.md): the wrapper View owns
// the layout and the gradient fills it.
const GRADIENT_FILL = { flex: 1 } as const;

// The web build has no Skia: the same still field of dots as an SVG pattern, brightest at the
// top and fading out below, under a still wash of the field blue.

const START = { x: 0.3, y: 0 } as const;
const END = { x: 0.7, y: 1 } as const;
const HALF = BACKDROP_SPACING / 2;

export function StageAurora(_props: { active: boolean }) {
  const palette = useStagePalette();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const colors = useMemo(
    () =>
      [
        withAlpha(palette.field, 0.16),
        withAlpha(palette.field, 0.04),
        withAlpha(palette.field, 0),
      ] as const,
    [palette.field],
  );
  return (
    <View style={styles.fill} pointerEvents="none">
      <View style={styles.fill} pointerEvents="none">
        <LinearGradient colors={colors} start={START} end={END} style={GRADIENT_FILL} />
      </View>
      <Svg width="100%" height="100%" style={styles.fill}>
        <Defs>
          <Pattern
            id={`dots${id}`}
            x={0}
            y={0}
            width={BACKDROP_SPACING}
            height={BACKDROP_SPACING}
            patternUnits="userSpaceOnUse"
          >
            <Circle cx={HALF} cy={HALF} r={1} fill={palette.field} />
          </Pattern>
          <RadialGradient id={`fade${id}`} cx="50%" cy="0%" r="95%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.42} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0.05} />
          </RadialGradient>
          <Mask id={`mask${id}`}>
            <Rect width="100%" height="100%" fill={`url(#fade${id})`} />
          </Mask>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#dots${id})`} mask={`url(#mask${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
