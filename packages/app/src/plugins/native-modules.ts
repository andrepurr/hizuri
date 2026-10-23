// The app's animation and graphics engines, handed to plugin client bundles so code the daemon
// compiles (the stage's block pack) draws with the same native parts as the app. The daemon keeps
// these names external when it compiles a client bundle: PLUGIN_CLIENT_NATIVE_MODULES in
// packages/server/src/server/plugins/plugin-sdk-specifiers.ts.
import * as Haptics from "expo-haptics";
import * as GestureHandler from "react-native-gesture-handler";
import * as Reanimated from "react-native-reanimated";
import * as Svg from "react-native-svg";
import * as Worklets from "react-native-worklets";

// Skia, Lottie, gradients, blur and video load on first use: nothing on the app's start path
// needs them.
function loadSkia(): unknown {
  const skia: unknown = require("@shopify/react-native-skia");
  return skia;
}

function loadLottie(): unknown {
  const lottie: unknown = require("lottie-react-native");
  return lottie;
}

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
  "@shopify/react-native-skia": loadSkia,
  "lottie-react-native": loadLottie,
  "expo-linear-gradient": loadLinearGradient,
  "expo-blur": loadBlur,
  "expo-video": loadVideo,
  "react-native-gesture-handler": () => GestureHandler,
  "expo-haptics": () => Haptics,
};
