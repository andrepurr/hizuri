import { requireOptionalNativeModule } from "expo-modules-core";
import { Linking } from "react-native";
import type { AppPlan, MediaCommand } from "./model";

// Lane 3: the user's phone apps. The local module modules/hizuri-media-control (Android only) aims
// links at the right app, starts music from a search, and steers other apps' media sessions.
// Where it is missing (web, iOS, an APK built before it) links still open through Linking and
// remote control reports itself unavailable.

interface ExternalMediaSession {
  packageName: string;
  state: "playing" | "paused" | "buffering" | "stopped" | "error" | "none";
  title: string | null;
  artist: string | null;
}

interface HizuriMediaControlModule {
  openInApp(url: string, packageName: string | null): boolean;
  playFromSearch(packageName: string, query: string): boolean;
  hasNotificationAccess(): boolean;
  openNotificationAccessSettings(): boolean;
  listSessions(): ExternalMediaSession[];
  control(packageName: string | null, action: string, value: number | null): boolean;
}

const nativeModule = requireOptionalNativeModule<HizuriMediaControlModule>("HizuriMediaControl");

export async function openMediaApp(plan: AppPlan): Promise<void> {
  if (nativeModule) {
    if (plan.playFromSearch && plan.query) {
      if (nativeModule.playFromSearch(plan.androidPackage, plan.query)) return;
    }
    if (nativeModule.openInApp(plan.url, plan.androidPackage)) return;
  }
  await Linking.openURL(plan.url);
}

export type ExternalControlResult = "sent" | "no-session" | "needs-access" | "unsupported";

/** Steers the media session of the app Zuri opened (or whatever plays) with one command. */
export function controlExternalMedia(input: {
  app: AppPlan | null;
  command: MediaCommand;
}): ExternalControlResult {
  if (!nativeModule) return "unsupported";
  if (!nativeModule.hasNotificationAccess()) return "needs-access";
  const packageName = input.app?.androidPackage ?? null;
  const { command } = input;
  let sent: boolean;
  switch (command.action) {
    case "seek":
      sent =
        command.position !== null
          ? nativeModule.control(packageName, "seekTo", command.position)
          : nativeModule.control(packageName, "seekBy", command.offset ?? 0);
      break;
    case "volume":
      sent = nativeModule.control(packageName, "volume", command.volume);
      break;
    default:
      sent = nativeModule.control(packageName, command.action, null);
  }
  return sent ? "sent" : "no-session";
}

export function openMediaAccessSettings(): void {
  nativeModule?.openNotificationAccessSettings();
}
