import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, AppRegistry, AppState } from "react-native";
import type { VoiceBackground, VoiceMicOffReason } from "./voice-background";

export type { VoiceBackground, VoiceMicOffReason } from "./voice-background";

// Must match KEEP_ALIVE_TASK in ExpoTwoWayAudioModule.kt.
const KEEP_ALIVE_TASK = "ZuriVoiceKeepAlive";
const NOTIFICATION_ASKED_KEY = "@zuri:voice-notification-permission-asked";
const BATTERY_ASKED_KEY = "@zuri:voice-battery-exemption-asked";
const NOTIFICATION_TITLE = "hizuri";
const NOTIFICATION_TEXT = "hizuri is listening";
const MIC_OFF_TITLE = "hizuri can't hear you";
const MIC_OFF_TEXT: Record<VoiceMicOffReason, string> = {
  connection: "No connection to the host. What you say now is lost; hizuri keeps reconnecting.",
  "voice-mode":
    "The host has not turned voice mode back on yet. What you say now is lost; hizuri keeps retrying.",
  capture:
    "Android took the microphone away. What you say now is lost; hizuri keeps trying to get it back.",
};

interface NativeVoiceBackground {
  startVoiceForegroundService(title: string, text: string): Promise<boolean>;
  stopVoiceForegroundService(): void;
  requestNotificationPermissionAsync(): Promise<{ granted: boolean }>;
  isIgnoringBatteryOptimizations(): boolean;
  requestIgnoreBatteryOptimizations(): boolean;
  // Optional: absent when the JS bundle was built against an older module build.
  showVoiceAlert?(title: string, text: string): boolean;
  clearVoiceAlert?(): void;
}

function askToExemptFromBatteryOptimisation(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Keep hizuri listening",
      "Let hizuri run without battery limits, so voice keeps working with the screen off.",
      [
        { text: "Not now", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Resolves once the app is back in front after a system dialog, or at once if none opened. */
function waitUntilAppReturns(): Promise<void> {
  return new Promise((resolve) => {
    let left = false;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        left = true;
        return;
      }
      if (left) {
        subscription.remove();
        resolve();
      }
    });
    // JS timers stop while the dialog covers the app, so this only fires if nothing opened.
    setTimeout(() => {
      if (!left) {
        subscription.remove();
        resolve();
      }
    }, 1_500);
  });
}

let finishKeepAliveTask: (() => void) | null = null;

// React Native pauses JS timers while the activity is paused unless a headless task runs. The
// native module starts this task with the foreground service; it lasts until voice mode stops.
AppRegistry.registerHeadlessTask(
  KEEP_ALIVE_TASK,
  () => () =>
    new Promise<void>((resolve) => {
      finishKeepAliveTask?.();
      finishKeepAliveTask = resolve;
    }),
);

export function createVoiceBackground(): VoiceBackground {
  const native: NativeVoiceBackground = require("@getpaseo/expo-two-way-audio");

  return {
    async prepare() {
      // Both questions come once, on the first voice-mode start, before the mic opens.
      if (!(await AsyncStorage.getItem(NOTIFICATION_ASKED_KEY))) {
        await AsyncStorage.setItem(NOTIFICATION_ASKED_KEY, "1");
        // Without it Android 13+ hides the ongoing "hizuri is listening" notification.
        await native.requestNotificationPermissionAsync().catch((error: unknown) => {
          console.warn("[VoiceBackground] Notification permission request failed", error);
        });
      }

      if (!(await AsyncStorage.getItem(BATTERY_ASKED_KEY))) {
        await AsyncStorage.setItem(BATTERY_ASKED_KEY, "1");
        // Doze cuts a backgrounded app's network even with a foreground service running.
        if (
          !native.isIgnoringBatteryOptimizations() &&
          (await askToExemptFromBatteryOptimisation())
        ) {
          if (native.requestIgnoreBatteryOptimizations()) {
            await waitUntilAppReturns();
          }
        }
      }
    },

    async start() {
      const started = await native.startVoiceForegroundService(
        NOTIFICATION_TITLE,
        NOTIFICATION_TEXT,
      );
      if (!started) {
        console.warn("[VoiceBackground] Android refused the voice foreground service");
      }
    },

    async stop() {
      native.stopVoiceForegroundService();
      finishKeepAliveTask?.();
      finishKeepAliveTask = null;
    },

    async showMicOff(reason) {
      if (!native.showVoiceAlert?.(MIC_OFF_TITLE, MIC_OFF_TEXT[reason])) {
        console.warn("[VoiceBackground] Could not post the microphone alert");
      }
    },

    async clearMicOff() {
      native.clearVoiceAlert?.();
    },
  };
}
