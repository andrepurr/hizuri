import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useTranslation } from "react-i18next";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { useFaceActivity } from "@/face/use-face-activity";
import { useAppSettings, useSettings } from "@/hooks/use-settings";
import { FLOAT_WINDOW } from "./float-behavior";
import { floatNative } from "./float-native";
import { useFloatStore } from "./float-store";

// Floating Zuri's controller in the app's own tree (where the voice and the settings live), mounted
// by the open agent chat's face page. While “Zuri over other apps” is on and allowed: the float
// service runs; its window shows whenever hizuri itself is not on screen and goes away the moment
// the user opens hizuri. The service holds its own notification only while no voice session keeps
// the app alive. The assistant's activity is published for its window (float-store.ts).

const noopSubscribe = () => () => {};

export function FloatBridge(props: { serverId: string; agentId: string; url: string }) {
  if (!floatNative) return null;
  return <FloatBridgeNative {...props} />;
}

function FloatBridgeNative({
  serverId,
  agentId,
  url,
}: {
  serverId: string;
  agentId: string;
  url: string;
}) {
  const native = floatNative;
  const { t } = useTranslation();
  const enabled = useSettings((settings) => settings.floatOverApps);
  const { updateSettings } = useAppSettings();
  const activity = useFaceActivity(serverId, agentId);
  const runtime = useVoiceRuntimeOptional();
  const voiceMode = useSyncExternalStore(
    runtime ? runtime.subscribe : noopSubscribe,
    () => runtime?.getSnapshot().isVoiceMode === true,
  );
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;
  // Bumped when the user comes back to the app and the service is not running although it should:
  // the permission was granted meanwhile, or it was stopped from outside (swiped away).
  const [restarts, setRestarts] = useState(0);

  useEffect(() => {
    useFloatStore.setState({ target: { serverId, agentId, url } });
  }, [serverId, agentId, url]);
  useEffect(() => () => useFloatStore.setState({ target: null }), []);
  useEffect(() => {
    useFloatStore.setState({ activity });
  }, [activity]);

  useEffect(() => {
    if (!native || !enabled) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && !native.isRunning()) setRestarts((count) => count + 1);
    });
    return () => subscription.remove();
  }, [enabled, native]);

  useEffect(() => {
    if (!native || !enabled) return;
    if (!native.canDrawOverlays()) {
      console.warn("[float] no permission to draw over other apps");
      return;
    }
    const started = native.start(
      FLOAT_WINDOW.widthDp,
      FLOAT_WINDOW.heightDp,
      !voiceModeRef.current,
      "hizuri",
      t("face.float.notification"),
    );
    useFloatStore.setState({ running: started });
    if (!started) return;
    const place = (state: string) => {
      if (state === "active") native.hide();
      else native.show(FLOAT_WINDOW.widthDp, FLOAT_WINDOW.heightDp);
    };
    if (AppState.currentState !== "active") place(AppState.currentState);
    const subscription = AppState.addEventListener("change", place);
    return () => {
      subscription.remove();
      native.stop();
      useFloatStore.setState({ running: false, shown: false, menuOpen: false });
    };
  }, [enabled, native, restarts, t]);

  useEffect(() => {
    if (native && enabled) native.setForeground(!voiceMode);
  }, [enabled, native, voiceMode]);

  useEffect(() => {
    if (!native) return;
    const subscription = native.addListener("onFloatEvent", (event) => {
      if (event.type === "shown") useFloatStore.setState({ shown: true });
      else if (event.type === "hidden") useFloatStore.setState({ shown: false, menuOpen: false });
      else if (event.type === "stopped") {
        useFloatStore.setState({ running: false, shown: false, menuOpen: false });
        // The notification's Hide button turns floating off, like its own Hide.
        if (event.reason === "notification") void updateSettings({ floatOverApps: false });
      } else if (event.type === "foregroundRefused" || event.type === "error") {
        console.warn(`[float] ${event.type}: ${event.message ?? ""}`);
      }
    });
    return () => subscription.remove();
  }, [native, updateSettings]);

  const hideRequests = useFloatStore((state) => state.hideRequests);
  const seenHideRequestsRef = useRef(hideRequests);
  useEffect(() => {
    if (hideRequests === seenHideRequestsRef.current) return;
    seenHideRequestsRef.current = hideRequests;
    void updateSettings({ floatOverApps: false });
  }, [hideRequests, updateSettings]);

  return null;
}

/** True while its window is up: the app's own face page lets go of its WebView meanwhile. */
export function useFloatShown(): boolean {
  return useFloatStore((state) => state.shown);
}
