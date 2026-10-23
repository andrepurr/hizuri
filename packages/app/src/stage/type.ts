import { useFonts } from "expo-font";

// The brand's type on the stage (docs/brand.md: Geist and Geist Mono, SIL OFL 1.1, licence in
// assets/fonts/Geist-OFL.txt): Geist for words, Geist Mono for every number. One family per
// weight, because Android picks a custom font's face by family name, not by fontWeight. The files
// ship inside the JS bundle's assets, so the fonts reach the phone with an OTA.

export const STAGE_FONT = {
  light: "Geist-Light",
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  monoLight: "GeistMono-Light",
  mono: "GeistMono-Regular",
} as const;

const FONT_FILES = {
  [STAGE_FONT.light]: require("../../assets/fonts/Geist-Light.ttf"),
  [STAGE_FONT.regular]: require("../../assets/fonts/Geist-Regular.ttf"),
  [STAGE_FONT.medium]: require("../../assets/fonts/Geist-Medium.ttf"),
  [STAGE_FONT.monoLight]: require("../../assets/fonts/GeistMono-Light.ttf"),
  [STAGE_FONT.mono]: require("../../assets/fonts/GeistMono-Regular.ttf"),
};

/** True once the stage fonts are in (or failed to load: text then falls back to the system). */
export function useStageFonts(): boolean {
  const [loaded, error] = useFonts(FONT_FILES);
  return loaded || error !== null;
}
