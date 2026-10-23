// Hizuri: a tap on the voice the app itself plays, for Zuri's face (face/face-host.tsx). The audio
// engines publish each raw PCM chunk the moment it starts and every stop, so the mouth follows the
// exact sound in the speaker: no second audio stream, no echo, and no clock to align.

export interface VoiceOutputChunk {
  /** 16-bit little-endian mono PCM, as handed to the speaker. */
  pcm: Uint8Array;
  sampleRate: number;
  /** `Date.now()` when the output starts on the chunk: after the chunks queued before it. */
  startedAt: number;
  /** How long the output takes to make it audible, as far as the platform reports it. */
  latencyMs: number;
  /**
   * `Date.now()` when the chunk becomes audible, measured from the player's playback position
   * (Android AudioTrack timestamps). When set it replaces `startedAt + latencyMs`.
   */
  audibleAt?: number;
}

export type VoiceOutputEvent = { type: "chunk"; chunk: VoiceOutputChunk } | { type: "stop" };

type Listener = (event: VoiceOutputEvent) => void;

const listeners = new Set<Listener>();

export function subscribeVoiceOutput(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasVoiceOutputListeners(): boolean {
  return listeners.size > 0;
}

export function publishVoiceOutput(event: VoiceOutputEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.warn("[voice-output] listener failed", error);
    }
  }
}
