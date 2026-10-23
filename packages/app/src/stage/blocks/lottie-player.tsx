import LottieView from "lottie-react-native";
import { useMemo } from "react";
import { StyleSheet } from "react-native-unistyles";
import { type LottieName, lottieAnimation, lottieLoops } from "../lottie-library";
import { useStagePalette } from "../palette";

// Native Lottie (lottie-react-native). The built-in animations are built in code from the theme
// (stage/lottie-library.ts), so they take the user's colours and need no asset files; Zuri may also
// give an https link to a Lottie JSON.

export interface LottiePlayerProps {
  name: LottieName | null;
  url: string | null;
  size: number;
  /** Loop; defaults to what the animation is for (only “loading” loops). */
  loop?: boolean;
  /** Changing it plays the animation again from the start. */
  playKey?: string | number;
  onFinish?: () => void;
  testID?: string;
}

export function LottiePlayer({
  name,
  url,
  size,
  loop,
  playKey,
  onFinish,
  testID,
}: LottiePlayerProps) {
  const palette = useStagePalette();
  const source = useMemo(() => {
    if (name) return lottieAnimation(name, palette);
    return url ? { uri: url } : null;
  }, [name, url, palette]);
  const sizeStyle = useMemo(() => ({ width: size, height: size }), [size]);
  if (!source) return null;
  return (
    <LottieView
      key={playKey}
      testID={testID}
      source={source}
      autoPlay
      loop={loop ?? (name ? lottieLoops(name) : false)}
      style={[styles.player, sizeStyle]}
      resizeMode="contain"
      onAnimationFinish={onFinish}
    />
  );
}

const styles = StyleSheet.create({
  player: {
    alignSelf: "center",
  },
});
