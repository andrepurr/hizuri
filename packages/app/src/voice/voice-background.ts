/**
 * Keeps voice mode alive while the app is hidden. Only Android needs it
 * (`voice-background.android.ts`); iOS keeps its audio session through the background audio
 * mode, and the web cannot run hidden.
 */
/** Why the microphone is not reaching the host while voice mode is on. */
export type VoiceMicOffReason = "connection" | "voice-mode" | "capture";

export interface VoiceBackground {
  /** Before capture: one-time questions background voice depends on. */
  prepare(): Promise<void>;
  /** After capture started: hold the app in the foreground state. */
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Tell the user, with sound, that what they say is not reaching the host. */
  showMicOff?(reason: VoiceMicOffReason): Promise<void>;
  /** Audio reaches the host again, or voice mode ended. */
  clearMicOff?(): Promise<void>;
}

export function createVoiceBackground(): VoiceBackground {
  return {
    prepare: async () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
  };
}
