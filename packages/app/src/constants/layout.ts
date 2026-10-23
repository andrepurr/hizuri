import { useUnistyles } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { usePhoneLayoutStore } from "@/stores/phone-layout-store";

export const FOOTER_HEIGHT = 75;

// Shared header inner height (excluding safe area insets and border)
// Used by both agent header (ScreenHeader) and explorer sidebar header
// This ensures both headers have the same visual height
export const HEADER_INNER_HEIGHT = 36;
export const HEADER_INNER_HEIGHT_MOBILE = 56;
export const WORKSPACE_SECONDARY_HEADER_HEIGHT = 36;
export const HEADER_TOP_PADDING_MOBILE = 8;

export const COMPACT_FORM_FACTOR_WIDTH = 500;

// Settings uses the canonical desktop list + detail layout. Its sidebar and
// detail target must fit together before it can share width with app navigation.
export const SETTINGS_DESKTOP_SIDEBAR_WIDTH = 320;
export const SETTINGS_DESKTOP_DETAIL_MIN_WIDTH = 400;
export const SETTINGS_DESKTOP_SPLIT_MIN_WIDTH =
  SETTINGS_DESKTOP_SIDEBAR_WIDTH + SETTINGS_DESKTOP_DETAIL_MIN_WIDTH;

// Desktop app constants for macOS traffic light buttons
// These buttons (close/minimize/maximize) overlay the top-left corner
export const DESKTOP_TRAFFIC_LIGHT_WIDTH = 78;
export const DESKTOP_TRAFFIC_LIGHT_HEIGHT = 45;

// Custom desktop window controls (minimize/maximize/close) — top-right
export const DESKTOP_WINDOW_CONTROLS_HEIGHT = HEADER_INNER_HEIGHT;

export {
  getIsElectron as getIsElectronRuntime,
  getIsElectronMac as getIsElectronRuntimeMac,
} from "./platform";

/** Below 600 points, sidebars overlay the workspace. Medium and wider layouts dock them. */
export function isCompactBreakpoint(breakpoint: string | undefined): boolean {
  return breakpoint === "xs" || breakpoint === "sm";
}

/**
 * Reactive hook — re-renders the component when the breakpoint changes.
 * Always use this instead of reading UnistylesRuntime.breakpoint directly.
 */
export function useIsCompactFormFactor(): boolean {
  const { rt } = useUnistyles();
  const phoneLayout = usePhoneLayoutStore((state) => state.phoneLayout);
  return isCompactLayout({ breakpoint: rt.breakpoint, phoneLayout });
}

/**
 * True only when the window itself is phone-sized, whatever the phone-layout setting says. Use it
 * for what depends on the real width, not on the layout: a laptop browser in the phone layout
 * still has a laptop's room and a long chat to keep out of the DOM.
 */
export function useIsPhoneSizedWindow(): boolean {
  const { rt } = useUnistyles();
  return isCompactLayout({ breakpoint: rt.breakpoint, phoneLayout: false });
}

/**
 * The phone layout: a phone-sized window always, a wide one too while "Phone layout on wide
 * screens" is on (hizuri's default, so the browser matches the phone version).
 * Stylesheet breakpoints still follow the real width, so spacing grows with the window.
 */
export function isCompactLayout(input: {
  breakpoint: string | undefined;
  phoneLayout: boolean;
}): boolean {
  return input.phoneLayout || isCompactBreakpoint(input.breakpoint);
}

// SplitContainer relies on dnd-kit and DOM-backed accessibility helpers.
// Keep that capability distinct from desktop-width layout so touch tablets
// can use the desktop shell without entering web-only code paths.
export function supportsDesktopPaneSplits(): boolean {
  return isWeb;
}
