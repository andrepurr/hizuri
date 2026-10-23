import { createContext, type ReactNode, useContext } from "react";
import { withUnistyles } from "react-native-unistyles";
import { MARK_SPECTRUM } from "@/components/icons/hizuri-mark";
import type { ShowPalette } from "@/show/bridge";
import { showPaletteFromTheme } from "@/show/frame-sync";
import type { Theme } from "@/styles/theme";

// Blocks paint SVG strokes, gradients and Lottie layers, which take colours as props rather than
// styles. The theme reaches them through one context filled by withUnistyles (docs/unistyles.md:
// useUnistyles is banned), so a theme switch repaints every block.
//
// The stage is Zuri's surface, not interface chrome, so its colours come from the brand mark
// (docs/brand.md, Fluctuation — Spectrum): the surfaces and text follow the theme, and every tone
// sits on the mark's spectrum instead of the status traffic light. Success is the warm ring next
// to the core, a warning the orchid ring, a failure the rose ring, a note the violet one, and the
// neutral accent is the blue field.

export interface StagePalette extends ShowPalette {
  core: string;
  warm: string;
  rose: string;
  orchid: string;
  violet: string;
  field: string;
}

function onSpectrum(base: ShowPalette): StagePalette {
  return {
    ...base,
    ...MARK_SPECTRUM,
    success: MARK_SPECTRUM.warm,
    warning: MARK_SPECTRUM.orchid,
    danger: MARK_SPECTRUM.rose,
    merged: MARK_SPECTRUM.violet,
  };
}

const FALLBACK: StagePalette = onSpectrum({
  background: "#07080B",
  surface1: "#0E1117",
  surface2: "#151A22",
  foreground: "#fafafa",
  foregroundMuted: "#A3AAB8",
  border: "#1A1F28",
  accent: "#4373D5",
  accentBright: "#C9D6F7",
  success: MARK_SPECTRUM.warm,
  warning: MARK_SPECTRUM.orchid,
  danger: MARK_SPECTRUM.rose,
  merged: MARK_SPECTRUM.violet,
});

const PaletteContext = createContext<StagePalette>(FALLBACK);

function PaletteScope({ palette, children }: { palette?: StagePalette; children: ReactNode }) {
  return <PaletteContext.Provider value={palette ?? FALLBACK}>{children}</PaletteContext.Provider>;
}

const ThemedPaletteScope = withUnistyles(PaletteScope);

function stagePaletteFromTheme(theme: Theme): { palette: StagePalette } {
  return { palette: onSpectrum(showPaletteFromTheme(theme).palette) };
}

export function StagePaletteScope({ children }: { children: ReactNode }) {
  return <ThemedPaletteScope uniProps={stagePaletteFromTheme}>{children}</ThemedPaletteScope>;
}

export function useStagePalette(): StagePalette {
  return useContext(PaletteContext);
}

/** `#rrggbb` at an opacity; any other colour form passes through unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${color}${byte.toString(16).padStart(2, "0")}`;
}

export type StageTone = "accent" | "success" | "warning" | "danger" | "merged";

export function toneColor(palette: ShowPalette, tone: StageTone): string {
  return palette[tone];
}

/** The mark's rings from the core out to the field, the order colour spreads in. */
export function spectrumRings(palette: StagePalette): string[] {
  return [palette.warm, palette.rose, palette.orchid, palette.violet, palette.field];
}

/**
 * The colour of the n-th of `count` things along the spectrum: the first is the warm ring, the
 * last reaches the blue field, so a list reads from its warm head out to the field.
 */
export function spectrumAt(palette: StagePalette, index: number, count: number): string {
  const rings = spectrumRings(palette);
  if (count <= 1) return rings[0];
  const position = Math.round((index / (count - 1)) * (rings.length - 1));
  return rings[Math.min(rings.length - 1, Math.max(0, position))];
}

/** The colours chart series take, in order: the blue field first, then out from the core. */
export function seriesColors(palette: StagePalette): string[] {
  return [
    palette.accent,
    palette.warm,
    palette.violet,
    palette.rose,
    palette.orchid,
    palette.accentBright,
  ];
}
