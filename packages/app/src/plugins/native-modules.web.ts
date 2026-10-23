// Web: the same engines as native-modules.ts, minus Skia, which needs CanvasKit loaded before
// first use on web, and Lottie, whose web player (@lottiefiles/dotlottie-react) the app does not
// ship.
import * as Haptics from "expo-haptics";
import * as GestureHandler from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import * as Svg from "react-native-svg";
import * as Worklets from "react-native-worklets";

function loadLinearGradient(): unknown {
  const gradient: unknown = require("expo-linear-gradient");
  return gradient;
}

function loadBlur(): unknown {
  const blur: unknown = require("expo-blur");
  return blur;
}

function loadVideo(): unknown {
  const video: unknown = require("expo-video");
  return video;
}

export const pluginNativeModules: Record<string, () => unknown> = {
  "react-native-reanimated": () => Reanimated,
  "react-native-worklets": () => Worklets,
  "react-native-svg": () => Svg,
  "react-native-gesture-handler": () => GestureHandler,
  "expo-haptics": () => Haptics,
  "expo-linear-gradient": loadLinearGradient,
  "expo-blur": loadBlur,
  "expo-video": loadVideo,
};
