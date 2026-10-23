import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { useVoiceOptional } from "@/contexts/voice-context";
import { isFloatRunning } from "@/float/float-store";
import { appLogBuffer } from "@/diagnostics/app-log-uploader";

/** Android keeps the app alive for days, so launch-time checks alone are rare. */
const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * hizuri over-the-air JS updates (self-hosted: the daemon serves them, zuri-updates.ts). expo-updates checks on
 * every launch by itself. On top of that this checks when the app comes back to the
 * foreground, and applies a downloaded update the next time the app goes to the background,
 * unless voice mode is running. Renders nothing.
 */
export function ZuriUpdates() {
  const { isUpdatePending } = Updates.useUpdates();
  const voice = useVoiceOptional();
  const isVoiceMode = voice?.isVoiceMode ?? false;
  const pendingRef = useRef(isUpdatePending);
  const voiceModeRef = useRef(isVoiceMode);
  const lastCheckRef = useRef(Date.now());

  useEffect(() => {
    pendingRef.current = isUpdatePending;
    if (isUpdatePending) {
      appLogBuffer.record({ level: "info", tag: "updates", message: "update downloaded" });
    }
  }, [isUpdatePending]);

  useEffect(() => {
    voiceModeRef.current = isVoiceMode;
  }, [isVoiceMode]);

  useEffect(() => {
    appLogBuffer.record({
      level: "info",
      tag: "updates",
      message: `enabled=${Updates.isEnabled} runtimeVersion=${Updates.runtimeVersion ?? "none"} updateId=${Updates.updateId ?? "embedded"} embeddedLaunch=${Updates.isEmbeddedLaunch}`,
    });
    if (!Updates.isEnabled) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      // Floating Zuri's window is a surface of this JS: a reload would take it away.
      if (
        state === "background" &&
        pendingRef.current &&
        !voiceModeRef.current &&
        !isFloatRunning()
      ) {
        appLogBuffer.record({ level: "info", tag: "updates", message: "applying update" });
        void Updates.reloadAsync().catch((error: unknown) => {
          console.warn("[ZuriUpdates] reload failed", error);
        });
        return;
      }
      if (state !== "active" || pendingRef.current) {
        return;
      }
      const now = Date.now();
      if (now - lastCheckRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
        return;
      }
      lastCheckRef.current = now;
      void (async () => {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      })().catch((error: unknown) => {
        console.warn("[ZuriUpdates] update check failed", error);
      });
    });
    return () => subscription.remove();
  }, []);

  return null;
}
