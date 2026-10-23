import type pino from "pino";

export interface TurnDetectionSession {
  /**
   * Required PCM16LE sample rate for `appendPcm16()`.
   * Callers are responsible for resampling before appending.
   */
  requiredSampleRate: number;

  connect(): Promise<void>;
  appendPcm16(pcm16le: Buffer): void;
  flush(): void;
  reset(): void;
  close(): void;

  on(event: "speech_started", handler: () => void): unknown;
  on(event: "speech_stopped", handler: () => void): unknown;
  /** Hizuri: voice that never opened a phrase (too little of it for the start rule). */
  on(event: "speech_dropped", handler: (dropped: DroppedSpeech) => void): unknown;
  on(event: "error", handler: (err: unknown) => void): unknown;
  /**
   * Hizuri: one VAD window (or a run of equal windows). `detected` = speech above the VAD
   * threshold; `loud` = loud enough to be the user's voice rather than echo residue.
   */
  on(event: "frame", handler: TurnDetectionFrameHandler): unknown;
}

/** Hizuri: an attempt that never became a phrase. */
export interface DroppedSpeech {
  /** Voiced time of the attempt. */
  voicedMs: number;
  /** Of it, voice loud enough to be the user's (PASEO_BARGE_HOLD_MIN_RMS). */
  loudMs: number;
  /** From its first to its last voiced window. */
  spanMs: number;
}

export type TurnDetectionFrameHandler = (detected: boolean, frameMs: number, loud: boolean) => void;

export interface TurnDetectionProvider {
  id: "openai" | "local" | (string & {});
  createSession(params: { logger: pino.Logger }): TurnDetectionSession;
}
