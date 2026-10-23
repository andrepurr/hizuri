import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Theme } from "@/styles/theme";
import {
  parseShowPageMessage,
  type ShowHostMessage,
  type ShowPalette,
  type ShowRenderMessage,
  type ShowStrings,
  type ShowThemeMessage,
} from "./bridge";

export interface ShowFrameProps {
  palette?: ShowPalette;
  strings: ShowStrings;
  render: ShowRenderMessage;
  testID?: string;
}

export function showPaletteFromTheme(theme: Theme): { palette: ShowPalette } {
  const colors = theme.colors;
  return {
    palette: {
      background: colors.surface0,
      surface1: colors.surface1,
      surface2: colors.surface2,
      foreground: colors.foreground,
      foregroundMuted: colors.foregroundMuted,
      border: colors.border,
      accent: colors.accent,
      accentBright: colors.accentBright,
      success: colors.statusSuccess,
      warning: colors.statusWarning,
      danger: colors.statusDanger,
      merged: colors.statusMerged,
    },
  };
}

/**
 * Keeps the page in step with the host: waits for `show.ready`, then sends the theme and the
 * current window, and afterwards only what changed. A page reload sends `show.ready` again and
 * gets everything anew. The palette is compared by value because the theme mapping may hand
 * over a fresh object on every render, and a re-sent theme rebuilds the page without animation.
 */
export function useShowFrameSync(input: {
  post: (message: ShowHostMessage) => void;
  palette: ShowPalette | undefined;
  strings: ShowStrings;
  render: ShowRenderMessage;
}): (raw: unknown) => void {
  const { post, palette, strings, render } = input;
  const themeKey = JSON.stringify({ palette: palette ?? null, strings });
  const theme = useMemo((): ShowThemeMessage | null => {
    const value = JSON.parse(themeKey) as { palette: ShowPalette | null; strings: ShowStrings };
    return value.palette
      ? { type: "show.theme", palette: value.palette, strings: value.strings }
      : null;
  }, [themeKey]);
  const readyRef = useRef(false);
  const sentThemeRef = useRef<ShowThemeMessage | null>(null);
  const sentRenderRef = useRef<ShowRenderMessage | null>(null);

  const flush = useCallback(() => {
    if (!readyRef.current || !theme) return;
    if (sentThemeRef.current !== theme) {
      post(theme);
      sentThemeRef.current = theme;
    }
    if (sentRenderRef.current !== render) {
      post(render);
      sentRenderRef.current = render;
    }
  }, [post, theme, render]);

  useEffect(flush, [flush]);

  return useCallback(
    (raw: unknown) => {
      const message = parseShowPageMessage(raw);
      if (!message) return;
      if (message.type === "show.ready") {
        readyRef.current = true;
        sentThemeRef.current = null;
        sentRenderRef.current = null;
        flush();
        return;
      }
      console.warn("[show] page error", message.message);
    },
    [flush],
  );
}
