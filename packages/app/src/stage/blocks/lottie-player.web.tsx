import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { LottiePlayerProps } from "./lottie-player";

// The web build carries no Lottie player: a still glyph stands in for the built-in animations.

const GLYPHS = { success: "✓", loading: "…", win: "★", error: "✕" } as const;

export function LottiePlayer({ name, size, testID }: LottiePlayerProps) {
  const sizeStyle = useMemo(() => ({ width: size, height: size }), [size]);
  const glyphStyle = useMemo(() => ({ fontSize: size * 0.45 }), [size]);
  if (!name) return null;
  return (
    <View testID={testID} style={[styles.box, sizeStyle]}>
      <Text style={[styles.glyph, glyphStyle]}>{GLYPHS[name]}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    color: theme.colors.accent,
  },
}));
