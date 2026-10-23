import type { ShowWindow } from "./model";

// Messages between the app and the Show page (show/page.ts). The page is our own trusted code,
// but it runs in a WebView or a sandboxed iframe and draws agent-authored props, so both sides
// accept only the message types listed here and ignore everything else.

export interface ShowPalette {
  background: string;
  surface1: string;
  surface2: string;
  foreground: string;
  foregroundMuted: string;
  border: string;
  accent: string;
  accentBright: string;
  success: string;
  warning: string;
  danger: string;
  merged: string;
}

export interface ShowStrings {
  locale: string;
  empty: string;
  loading: string;
  /** "Resets {time}" — the clock time of the reset. */
  resetsAt: string;
  /** "in {time}" — the countdown to it. */
  inTime: string;
  /** Contains `{time}`. */
  updated: string;
  used: string;
  noData: string;
  widgetError: string;
  units: { d: string; h: string; m: string };
  windowLabels: Record<string, string>;
}

export interface ShowThemeMessage {
  type: "show.theme";
  palette: ShowPalette;
  strings: ShowStrings;
}

export interface ShowRenderMessage {
  type: "show.render";
  window: ShowWindow | null;
  /** The window's place in the menu: a switch slides toward the higher index. */
  index: number;
}

export type ShowHostMessage = ShowThemeMessage | ShowRenderMessage;

export type ShowPageMessage = { type: "show.ready" } | { type: "show.error"; message: string };

/** Accepts only the page's own message types; anything else from the frame is dropped. */
export function parseShowPageMessage(raw: unknown): ShowPageMessage | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const message = value as { type?: unknown; message?: unknown };
  if (message.type === "show.ready") return { type: "show.ready" };
  if (message.type === "show.error") {
    return {
      type: "show.error",
      message: typeof message.message === "string" ? message.message.slice(0, 500) : "",
    };
  }
  return null;
}
