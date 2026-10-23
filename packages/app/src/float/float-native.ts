import { type EventSubscription, requireOptionalNativeModule } from "expo-modules-core";

// The native side of floating Zuri (modules/hizuri-float, Android only; null elsewhere and in
// binaries built before it).

export type FloatEventType =
  | "started"
  | "shown"
  | "hidden"
  | "stopped"
  | "position"
  | "foreground"
  | "foregroundRefused"
  | "error"
  | "tap"
  | "longPress"
  | "dragStart"
  | "release"
  | "fall"
  | "landed"
  | "walkStart"
  | "walkEnd"
  | "screenOff"
  | "screenOn";

export interface FloatEvent {
  type: FloatEventType;
  /**
   * The assistant's window top-left corner and the screen width, in dp; on every event about its
   * window.
   */
  x?: number;
  y?: number;
  screenWidth?: number;
  onFloor?: boolean;
  atLeft?: boolean;
  atRight?: boolean;
  /** stopped: `notification` (its Hide button) or `task-removed` (swiped from Recents). */
  reason?: string;
  foreground?: boolean;
  message?: string;
  /** walkEnd: false when the walk was cut short (the user grabbed the assistant). */
  finished?: boolean;
}

interface HizuriFloatModule {
  canDrawOverlays(): boolean;
  openOverlaySettings(): boolean;
  start(
    widthDp: number,
    heightDp: number,
    foreground: boolean,
    title: string,
    text: string,
  ): boolean;
  stop(): void;
  isRunning(): boolean;
  isShown(): boolean;
  show(widthDp: number, heightDp: number): boolean;
  hide(): void;
  setForeground(on: boolean): void;
  walk(direction: number, distanceDp: number, speedDp: number): void;
  stopWalk(): void;
  requestPosition(): void;
  openApp(): boolean;
  addListener(eventName: "onFloatEvent", listener: (event: FloatEvent) => void): EventSubscription;
}

export const floatNative = requireOptionalNativeModule<HizuriFloatModule>("HizuriFloat");
