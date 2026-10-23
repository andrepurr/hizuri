import { create } from "zustand";
import type { FaceActivity } from "@/face/activity";

export interface FloatTarget {
  serverId: string;
  agentId: string;
  /** The avatar page (face/model.ts faceAvatarUrl). */
  url: string;
}

interface FloatState {
  /** Whose face floats: set by the open agent chat's FloatBridge. */
  target: FloatTarget | null;
  /**
   * The assistant's activity in that chat (face/activity.ts), computed in the app's tree where the
   * voice runs.
   */
  activity: FaceActivity;
  /** The float service runs (floating is on and allowed). */
  running: boolean;
  /** The floating window is on screen over another app. */
  shown: boolean;
  /** The long-press menu (Open hizuri, Hide) is open. */
  menuOpen: boolean;
  /** Bumped by the Hide button; the bridge turns floating off in the settings. */
  hideRequests: number;
}

/**
 * What floating Zuri shares between the app's own tree and its window. Its window is a second
 * React surface: it runs in the same JS but outside the app's providers, so it reads this store
 * and the global stores, never React context.
 */
export const useFloatStore = create<FloatState>()(() => ({
  target: null,
  activity: "idle",
  running: false,
  shown: false,
  menuOpen: false,
  hideRequests: 0,
}));

/** True while the float service runs: an OTA must not reload the JS under the floating window. */
export function isFloatRunning(): boolean {
  return useFloatStore.getState().running;
}
