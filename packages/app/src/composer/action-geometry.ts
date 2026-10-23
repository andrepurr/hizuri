import { CONTROL_HEIGHTS } from "@/components/ui/control-geometry";
import { ICON_SIZE } from "@/styles/theme";

/**
 * The composer's action buttons: “+”, dictate, send or stop.
 *
 * A phone gets 44 pt touch targets around 32 pt circles, spread apart, because 28 px buttons
 * packed together were hit by mistake. Desktop keeps the tight 28 px toolbar.
 * Both are Unistyles breakpoint maps: use them inside `StyleSheet.create` only.
 */
export const COMPOSER_ACTION_HIT_SIZE = {
  xs: CONTROL_HEIGHTS.field,
  md: CONTROL_HEIGHTS.tight,
} as const;

export const COMPOSER_ACTION_CIRCLE_SIZE = {
  xs: CONTROL_HEIGHTS.compact,
  md: CONTROL_HEIGHTS.tight,
} as const;

/**
 * The voice ↔ typing toggle: one circle, the same size and the same bottom-right spot in the
 * typing bar and in the voice bar, so the two read as one toggle. On a phone
 * it is as big as the voice bar's side buttons, at call-screen size. Breakpoint map.
 */
export const MODE_SWITCH_SIZE = {
  xs: 48,
  md: CONTROL_HEIGHTS.compact,
} as const;

/**
 * From the bar's inner border to the toggle's circle, on the right and at the bottom. Both bars
 * share the composer's outer frame, so the same inset puts the toggle in the same spot.
 */
export const MODE_SWITCH_INSET = 12;

export const MODE_SWITCH_ICON_SIZE = ICON_SIZE.lg;
