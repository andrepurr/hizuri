export interface AudioEngineCallbacks {
  onCaptureData(pcm: Uint8Array): void;
  onVolumeLevel(level: number): void;
  onInterruption?(): void;
  onCaptureAvailabilityChange?(available: boolean): void;
  onError?(error: Error): void;
}

export interface AudioPlaybackSource {
  arrayBuffer(): Promise<ArrayBuffer>;
  size: number;
  type: string;
}

export interface AudioEngine {
  initialize(): Promise<void>;
  destroy(): Promise<void>;

  startCapture(): Promise<void>;
  stopCapture(): Promise<void>;
  toggleMute(): boolean;
  isMuted(): boolean;

  play(audio: AudioPlaybackSource, signal?: AbortSignal): Promise<number>;
  stop(): void;
  clearQueue(): void;
  isPlaying(): boolean;
  /**
   * Resolves once the sound already handed to the output has played. Engines that settle
   * `play()` ahead of the sound's end (native voice, see audio/pcm) implement it.
   */
  waitForOutputDrain?(): Promise<void>;
  /**
   * Where replies play now, as the platform reports it: "speaker" or "headphones"; undefined when
   * unknown. The host sends it with every mic chunk and picks what may cut a reply by it.
   */
  outputRoute?(): OutputRoute | undefined;
}

export type OutputRoute = "speaker" | "headphones";

// Android output device types (expo-two-way-audio VoiceRoutePolicy.kt `describe()`): the phone's
// own speaker and earpiece play into the room; every other output plays at the user's ears.
const ROOM_OUTPUTS = new Set(["speaker", "earpiece", "ble_speaker"]);

/** The route from a native route line, e.g. `route=communication out=bt_sco("X") in=default`. */
export function outputRouteOf(description: string): OutputRoute | undefined {
  const type = description.match(/\bout=([a-z0-9_]+)/)?.[1];
  if (!type || type === "default") {
    return undefined;
  }
  return ROOM_OUTPUTS.has(type) ? "speaker" : "headphones";
}

export interface AudioEngineOptions {
  traceLabel?: string;
  captureMode?: "conversation" | "dictation";
}
