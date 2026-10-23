// These entries are supplied by the host and remain external in author bundles.
export const PLUGIN_CLIENT_ONLY_SDK_SPECIFIERS = [
  "@getpaseo/plugin/client",
  "@getpaseo/plugin/client/ui",
  // COMPAT(pluginReactNativeEntrypoint): added in v0.13.0, remove after 2027-04-20
  "@getpaseo/plugin/client/react-native",
] as const;

const PLUGIN_SERVER_ONLY_SDK_SPECIFIERS = [
  "@getpaseo/plugin/server",
  "@getpaseo/plugin/server/provider",
  "@getpaseo/plugin/server/usage",
  "@getpaseo/plugin/server/acp",
] as const;

export const PLUGIN_SDK_SPECIFIERS = [
  "@getpaseo/plugin",
  ...PLUGIN_SERVER_ONLY_SDK_SPECIFIERS,
  ...PLUGIN_CLIENT_ONLY_SDK_SPECIFIERS,
] as const;

export function isPluginClientOnlySdkSpecifier(name: string): boolean {
  return (PLUGIN_CLIENT_ONLY_SDK_SPECIFIERS as readonly string[]).includes(name);
}

export function isPluginServerOnlySdkSpecifier(name: string): boolean {
  return (PLUGIN_SERVER_ONLY_SDK_SPECIFIERS as readonly string[]).includes(name);
}

// The app's native engines, handed to client bundles by the app's plugin evaluator
// (packages/app/src/plugins/native-modules.ts). Kept external like the SDK, so a block pack uses
// the app's own Reanimated, Skia and SVG instead of bundling a second copy.
export const PLUGIN_CLIENT_NATIVE_MODULES = [
  "react-native-reanimated",
  "react-native-worklets",
  "react-native-svg",
  "@shopify/react-native-skia",
  "lottie-react-native",
  "expo-linear-gradient",
  "expo-blur",
  "expo-video",
  "react-native-gesture-handler",
  "expo-haptics",
] as const;

export function isPluginClientNativeModule(specifier: string): boolean {
  return PLUGIN_CLIENT_NATIVE_MODULES.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
}
