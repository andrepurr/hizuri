import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Keyboard, Mic, MicOff, Plus } from "lucide-react-native";
import { CONTROL_HEIGHTS } from "@/components/ui/control-geometry";
import {
  MODE_SWITCH_ICON_SIZE,
  MODE_SWITCH_INSET,
  MODE_SWITCH_SIZE,
} from "@/composer/action-geometry";
import type { Theme } from "@/styles/theme";

const ThemedPlus = withUnistyles(Plus);
const ThemedKeyboard = withUnistyles(Keyboard);
const ThemedMic = withUnistyles(Mic);
const ThemedMicOff = withUnistyles(MicOff);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedIconColorMapping = (theme: Theme) => ({ color: theme.colors.palette.white });

interface RealtimeVoiceOverlayProps {
  isMuted: boolean;
  isSwitching: boolean;
  onToggleMute: () => void;
  /** “+”: pick a photo and send it to the agent without leaving voice. */
  onAttachPhoto?: () => void;
  /** Voice off, session kept; absent when the host cannot keep a session in text mode. */
  onSwitchToText?: () => void;
  /** Shown instead of mute while voice turns on or off ("Turning voice on..."). */
  statusText?: string | null;
}

/** The call-screen mute, the biggest button of the bar. Breakpoint map. */
const MUTE_BUTTON_SIZE = {
  xs: 60,
  md: CONTROL_HEIGHTS.field,
} as const;
// The call-screen mute glyph is larger than the interface icon ramp, like a phone's.
const MUTE_ICON_SIZE = 28;

/**
 * Hizuri: the voice bar is a phone-call screen: “+” on the left, a big mute in the middle, the
 * switch to typing on the right. The user's live words above the chat are the sign that they are
 * heard, so there is no level meter; “End session” lives in the screen's header menu.
 *
 * The bar sits at the bottom of the composer's frame, and its switch to typing has the typing
 * bar's switch to voice size and inset (`composer/action-geometry.ts`): one toggle, one spot.
 */
export function RealtimeVoiceOverlay({
  isMuted,
  isSwitching,
  onToggleMute,
  onAttachPhoto,
  onSwitchToText,
  statusText,
}: RealtimeVoiceOverlayProps) {
  const { t } = useTranslation();
  const sideButtonStyle = useMemo(
    () => [styles.sideButton, isSwitching ? styles.buttonDisabled : undefined],
    [isSwitching],
  );
  const muteButtonStyle = useMemo(
    () => [styles.muteButton, isMuted ? styles.muteButtonMuted : undefined],
    [isMuted],
  );
  const muteState = useMemo(() => ({ checked: isMuted }), [isMuted]);
  return (
    <View style={styles.container} testID="voice-bar">
      {onAttachPhoto ? (
        <Pressable
          onPress={onAttachPhoto}
          disabled={isSwitching}
          accessibilityRole="button"
          accessibilityLabel={t("realtimeVoice.actions.attachPhoto")}
          testID="voice-attach-photo"
          style={sideButtonStyle}
        >
          <ThemedPlus
            size={MODE_SWITCH_ICON_SIZE}
            strokeWidth={2}
            uniProps={foregroundColorMapping}
          />
        </Pressable>
      ) : (
        <View style={styles.sideSpacer} />
      )}

      <View style={styles.middleSlot}>
        {statusText ? (
          <Text
            style={styles.statusText}
            numberOfLines={2}
            accessibilityLiveRegion="polite"
            testID="voice-status"
          >
            {statusText}
          </Text>
        ) : (
          <Pressable
            onPress={onToggleMute}
            disabled={isSwitching}
            accessibilityRole="button"
            accessibilityLabel={
              isMuted ? t("realtimeVoice.actions.unmute") : t("realtimeVoice.actions.mute")
            }
            accessibilityState={muteState}
            testID="voice-mute"
            style={muteButtonStyle}
          >
            {isMuted ? (
              <ThemedMicOff
                size={MUTE_ICON_SIZE}
                strokeWidth={2.25}
                uniProps={mutedIconColorMapping}
              />
            ) : (
              <ThemedMic
                size={MUTE_ICON_SIZE}
                strokeWidth={2.25}
                uniProps={foregroundColorMapping}
              />
            )}
          </Pressable>
        )}
      </View>

      {onSwitchToText ? (
        <Pressable
          onPress={onSwitchToText}
          disabled={isSwitching}
          accessibilityRole="button"
          accessibilityLabel={t("realtimeVoice.actions.switchToText")}
          testID="voice-switch-to-text"
          style={sideButtonStyle}
        >
          <ThemedKeyboard
            size={MODE_SWITCH_ICON_SIZE}
            strokeWidth={2}
            uniProps={foregroundColorMapping}
          />
        </Pressable>
      ) : (
        <View style={styles.sideSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Bottom of the composer's frame; the vertical padding centres the mute on the toggle's line
  // while the toggle keeps its inset from the bottom border. No box: the call controls stand on
  // the open field; the transparent border keeps the toggle on the typing bar's spot.
  container: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginTop: "auto",
    borderRadius: theme.borderRadius["2xl"],
    paddingHorizontal: MODE_SWITCH_INSET,
    paddingVertical: {
      xs: MODE_SWITCH_INSET - (MUTE_BUTTON_SIZE.xs - MODE_SWITCH_SIZE.xs) / 2,
      md: MODE_SWITCH_INSET - (MUTE_BUTTON_SIZE.md - MODE_SWITCH_SIZE.md) / 2,
    },
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
  },
  // Rings on the open field, as in the brand's live-voice screen (round 3b): a darker filled
  // circle inside a lighter box read as a hole. The typing bar's toggle is the same
  // ring (composer modeSwitch).
  sideButton: {
    width: MODE_SWITCH_SIZE,
    height: MODE_SWITCH_SIZE,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.surface4,
  },
  sideSpacer: {
    width: MODE_SWITCH_SIZE,
    height: MODE_SWITCH_SIZE,
  },
  // Holds the mute or, while voice switches, the status text, at the mute's height either way.
  middleSlot: {
    flex: 1,
    height: MUTE_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  muteButton: {
    width: MUTE_BUTTON_SIZE,
    height: MUTE_BUTTON_SIZE,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface3,
  },
  muteButtonMuted: {
    backgroundColor: theme.colors.palette.red[600],
  },
  statusText: {
    textAlign: "center",
    marginHorizontal: theme.spacing[3],
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  buttonDisabled: {
    opacity: theme.opacity[50],
  },
}));
