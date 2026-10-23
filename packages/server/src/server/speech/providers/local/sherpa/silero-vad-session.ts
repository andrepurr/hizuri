import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

import { envNonNegative, envNumber } from "../../../../voice-env.js";
import { pcm16leToFloat32 } from "../../../audio.js";
import type { DroppedSpeech, TurnDetectionSession } from "../../../turn-detection-provider.js";
import { loadSherpaOnnxNode } from "./sherpa-onnx-node-loader.js";
import {
  loadSmartTurnModel,
  resolveSmartTurnConfig,
  type SmartTurnConfig,
  type SmartTurnModel,
} from "./smart-turn.js";

const DEFAULT_SAMPLE_RATE = 16000;
const DEFAULT_BUFFER_SIZE_SECONDS = 60;
const DEFAULT_SILERO_THRESHOLD = 0.5;
const DEFAULT_WINDOW_SIZE = 512;

// Silero internal durations — kept low so isDetected() tracks actual sound.
// Our own state machine handles speech confirmation and end-of-speech detection.
const SILERO_MIN_SILENCE_DURATION = 0.2;
const SILERO_MIN_SPEECH_DURATION = 0.1;

// Our boundary detection thresholds (in milliseconds). Hizuri: 300 ms of voice with pauses up to
// 300 ms opens a phrase. Upstream wanted 800 ms of unbroken voice, so one-word answers ("Good.",
// "Right.") never opened one and "Listen," before a pause was cut; this way they open.
const DEFAULT_CONFIRM_MS = 300;
const DEFAULT_CONFIRM_GAP_MS = 300;
const DEFAULT_SILENCE_MS = 1000;

export interface SherpaVadHandle {
  acceptWaveform(samples: Float32Array): void;
  isDetected(): boolean;
  isEmpty(): boolean;
  flush(): void;
  reset(): void;
}

export interface SherpaCircularBufferHandle {
  push(samples: Float32Array): void;
  get(startIndex: number, n: number, enableExternalBuffer?: boolean): Float32Array;
  pop(n: number): void;
  size(): number;
  head(): number;
  reset(): void;
}

interface SherpaVadModule {
  Vad: new (config: Record<string, unknown>, bufferSizeInSeconds: number) => SherpaVadHandle;
  CircularBuffer: new (capacity: number) => SherpaCircularBufferHandle;
}

export function resolveBundledSileroVadModelPath(): string {
  return fileURLToPath(new URL("./assets/silero_vad.onnx", import.meta.url));
}

export interface SherpaSileroVadSessionConfig {
  modelPath?: string;
  sampleRate?: number;
  threshold?: number;
  windowSize?: number;
  bufferSizeInSeconds?: number;
  confirmMs?: number;
  /**
   * Hizuri: gaps this long inside the confirming phase keep it alive, and confirmMs then counts
   * voiced time only. 0 = any unvoiced window resets it (upstream).
   */
  confirmGapMs?: number;
  silenceMs?: number;
  /** Hizuri: a voiced window at least this loud (int16 rms) counts as the user's voice for barge-in. */
  loudMinRms?: number;
  /** Hizuri: phrase detection ignores sound quieter than this (int16 rms); 0 = off. */
  levelMinRms?: number;
  /** Hizuri: how long a loud-enough window keeps quieter windows counted as speech. */
  levelHangoverMs?: number;
  /** Hizuri: careful Smart Turn (smart-turn.ts); undefined = from env, null = off. */
  smartTurn?: SmartTurnConfig | null;
}

// Hizuri: VAD knobs from env (the live voice patches); an explicit config value wins.
// The barge-in hold counts only loud voice: a phone's echo canceller leaves the assistant's own
// voice in the mic at rms ~1, which Silero still calls speech (50 = -56 dBFS).
// PASEO_VAD_THRESHOLD: 0.4 (default 0.5) gives fewer empty results on
// whispers when paired with Smart Turn, but lets more of the assistant's own voice through.
export function resolveVadEnvConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    threshold: envNumber("PASEO_VAD_THRESHOLD", DEFAULT_SILERO_THRESHOLD, env),
    confirmMs: envNumber("PASEO_VAD_CONFIRM_MS", DEFAULT_CONFIRM_MS, env),
    // 0 = the voice must be unbroken (upstream, with PASEO_VAD_CONFIRM_MS=800).
    confirmGapMs: envNonNegative("PASEO_VAD_CONFIRM_GAP_MS", DEFAULT_CONFIRM_GAP_MS, env),
    silenceMs: envNumber("PASEO_VAD_SILENCE_MS", DEFAULT_SILENCE_MS, env),
    loudMinRms: envNumber("PASEO_BARGE_HOLD_MIN_RMS", 50, env),
    levelMinRms: envNonNegative("PASEO_VAD_MIN_RMS", 0, env),
    levelHangoverMs: envNumber("PASEO_VAD_LEVEL_HANGOVER_MS", 300, env),
  };
}

function windowRms(window: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < window.length; i++) {
    sumSquares += window[i] * window[i];
  }
  return Math.sqrt(sumSquares / Math.max(1, window.length)) * 32768;
}

type VadPhase =
  | { state: "idle" }
  // Hizuri: loudMs = voiced time loud enough to be the user's (reported when it never opens).
  | {
      state: "confirming";
      startedAt: number;
      voicedMs: number;
      loudMs: number;
      lastVoicedAt: number;
    }
  | { state: "speaking" }
  // Hizuri: smartTurnChecked = this pause already had its one Smart Turn check.
  | { state: "ending"; startedAt: number; smartTurnChecked: boolean };

interface VadLogger {
  debug: (...args: unknown[]) => void;
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
}

interface TimedWindow {
  /** VAD time at the end of the window, ms. */
  t: number;
  samples: Float32Array;
}

export class SherpaSileroVadSession extends EventEmitter implements TurnDetectionSession {
  public readonly requiredSampleRate: number;

  private readonly vad: SherpaVadHandle;
  private readonly inputBuffer: SherpaCircularBufferHandle;
  private readonly windowSize: number;
  private readonly msPerWindow: number;
  // Hizuri: an explicit value from the config; the rest is read from the env on every use.
  private readonly fixed: SherpaSileroVadSessionConfig;
  private connected = false;
  private phase: VadPhase = { state: "idle" };
  private windowTimestamp = 0;
  // Hizuri: last window at or above levelMinRms (VAD time, ms).
  private lastLevelAt = -Infinity;
  // Hizuri: careful Smart Turn: its config, the loaded model, recent windows, phrase start.
  private readonly smartTurn: SmartTurnConfig | null;
  private smartTurnModel: SmartTurnModel | null = null;
  private recentWindows: TimedWindow[] = [];
  private detectionStartedAt = 0;
  private readonly logger: VadLogger;

  constructor(params: {
    logger: VadLogger;
    config?: SherpaSileroVadSessionConfig;
    /** Hizuri: test seam; replaces the native Silero VAD and its input buffer. */
    native?: { vad: SherpaVadHandle; inputBuffer: SherpaCircularBufferHandle };
    /** Hizuri: test seam; a ready Smart Turn model. */
    smartTurnModel?: SmartTurnModel;
  }) {
    super();
    this.logger = params.logger;
    const config = params.config ?? {};
    this.requiredSampleRate = config.sampleRate ?? DEFAULT_SAMPLE_RATE;
    this.windowSize = config.windowSize ?? DEFAULT_WINDOW_SIZE;
    this.msPerWindow = (this.windowSize / this.requiredSampleRate) * 1000;
    this.fixed = config;
    // The native detector takes its threshold once: a change applies to the next session.
    const threshold = config.threshold ?? resolveVadEnvConfig().threshold;
    this.smartTurn = config.smartTurn === undefined ? resolveSmartTurnConfig() : config.smartTurn;
    this.initSmartTurn(params.smartTurnModel);

    this.logger.debug(
      {
        threshold,
        sileroMinSilenceDuration: SILERO_MIN_SILENCE_DURATION,
        sileroMinSpeechDuration: SILERO_MIN_SPEECH_DURATION,
        confirmMs: this.confirmMs,
        confirmGapMs: this.confirmGapMs,
        silenceMs: this.silenceMs,
        loudMinRms: this.loudMinRms,
        levelMinRms: this.levelMinRms,
        windowSize: this.windowSize,
        msPerWindow: this.msPerWindow,
        sampleRate: this.requiredSampleRate,
        smartTurn: this.smartTurn,
      },
      "[VAD] Initializing Silero VAD session",
    );

    if (params.native) {
      this.vad = params.native.vad;
      this.inputBuffer = params.native.inputBuffer;
      return;
    }
    const sherpa = loadSherpaOnnxNode() as unknown as SherpaVadModule;
    this.vad = new sherpa.Vad(
      {
        sileroVad: {
          model: config.modelPath ?? resolveBundledSileroVadModelPath(),
          threshold,
          minSilenceDuration: SILERO_MIN_SILENCE_DURATION,
          minSpeechDuration: SILERO_MIN_SPEECH_DURATION,
          windowSize: this.windowSize,
        },
        sampleRate: this.requiredSampleRate,
        numThreads: 1,
        provider: "cpu",
        debug: 0,
      },
      config.bufferSizeInSeconds ?? DEFAULT_BUFFER_SIZE_SECONDS,
    );
    this.inputBuffer = new sherpa.CircularBuffer(
      (config.bufferSizeInSeconds ?? DEFAULT_BUFFER_SIZE_SECONDS) * this.requiredSampleRate,
    );
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  // Hizuri: the timing and level knobs follow voice-settings.json mid-session.
  private get confirmMs(): number {
    return this.fixed.confirmMs ?? resolveVadEnvConfig().confirmMs;
  }

  private get confirmGapMs(): number {
    return this.fixed.confirmGapMs ?? resolveVadEnvConfig().confirmGapMs;
  }

  private get silenceMs(): number {
    return this.fixed.silenceMs ?? resolveVadEnvConfig().silenceMs;
  }

  private get loudMinRms(): number {
    return this.fixed.loudMinRms ?? resolveVadEnvConfig().loudMinRms;
  }

  private get levelMinRms(): number {
    return this.fixed.levelMinRms ?? resolveVadEnvConfig().levelMinRms;
  }

  private get levelHangoverMs(): number {
    return this.fixed.levelHangoverMs ?? resolveVadEnvConfig().levelHangoverMs;
  }

  private initSmartTurn(injected: SmartTurnModel | undefined): void {
    if (!this.smartTurn) {
      return;
    }
    if (injected) {
      this.smartTurnModel = injected;
      return;
    }
    void this.loadSmartTurn(this.smartTurn.modelPath);
  }

  private async loadSmartTurn(modelPath: string): Promise<void> {
    try {
      this.smartTurnModel = await loadSmartTurnModel(modelPath);
    } catch (error) {
      // Missing onnxruntime-node or model file: the silence rule alone decides.
      this.logger.warn?.(
        { err: error instanceof Error ? error.message : String(error), modelPath },
        "[VAD] Smart Turn unavailable",
      );
    }
  }

  /** Hizuri: keep ~8 s of windows for the Smart Turn check. */
  private rememberWindow(window: Float32Array): void {
    if (!this.smartTurn) {
      return;
    }
    this.recentWindows.push({ t: this.windowTimestamp, samples: Float32Array.from(window) });
    const keepFrom = this.windowTimestamp - 8000 - this.msPerWindow;
    while (this.recentWindows.length > 0 && this.recentWindows[0].t < keepFrom) {
      this.recentWindows.shift();
    }
  }

  /**
   * Hizuri: one Smart Turn check per pause, once it reaches afterMs: the phrase closes at once
   * when the model says "finished" with p >= threshold; otherwise the silence rule decides.
   */
  private maybeCheckSmartTurn(
    phase: Extract<VadPhase, { state: "ending" }>,
    elapsed: number,
  ): void {
    const config = this.smartTurn;
    const model = this.smartTurnModel;
    if (!config || !model || phase.smartTurnChecked || elapsed < config.afterMs) {
      return;
    }
    phase.smartTurnChecked = true;
    const from = this.detectionStartedAt - this.msPerWindow - config.preMs;
    const windows = this.recentWindows.filter((w) => w.t > from);
    const audio = new Float32Array(windows.length * this.windowSize);
    windows.forEach((w, i) => audio.set(w.samples, i * this.windowSize));
    void this.runSmartTurn({ model, config, phase, audio, pauseMs: elapsed });
  }

  private async runSmartTurn(check: {
    model: SmartTurnModel;
    config: SmartTurnConfig;
    phase: VadPhase;
    audio: Float32Array;
    pauseMs: number;
  }): Promise<void> {
    const askedAt = Date.now();
    try {
      const p = await check.model.predict(check.audio);
      const closes = this.phase === check.phase && p >= check.config.threshold;
      this.logger.info?.(
        { p: Number(p.toFixed(3)), tookMs: Date.now() - askedAt, pauseMs: check.pauseMs, closes },
        "[VAD] smart turn",
      );
      if (closes) {
        this.phase = { state: "idle" };
        this.emit("speech_stopped");
      }
    } catch (error) {
      this.logger.warn?.(
        { err: error instanceof Error ? error.message : String(error) },
        "[VAD] Smart Turn check failed",
      );
    }
  }

  appendPcm16(pcm16le: Buffer): void {
    if (!this.connected) {
      this.emit("error", new Error("Turn detection session not connected"));
      return;
    }
    if (pcm16le.length === 0) {
      return;
    }

    try {
      const samples = pcm16leToFloat32(pcm16le, 1);
      this.inputBuffer.push(samples);
      let windowsProcessed = 0;
      while (this.inputBuffer.size() > this.windowSize) {
        const window = this.inputBuffer.get(this.inputBuffer.head(), this.windowSize, false);
        this.inputBuffer.pop(this.windowSize);
        this.vad.acceptWaveform(window);
        this.windowTimestamp += this.msPerWindow;
        windowsProcessed++;
        this.rememberWindow(window);
        this.stepStateMachine(windowRms(window));
      }
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  flush(): void {
    if (!this.connected) {
      return;
    }

    try {
      this.logger.debug({ phase: this.phase.state }, "[VAD] Flushing remaining audio");
      this.vad.flush();
      this.stepStateMachine();
      if (this.phase.state === "speaking" || this.phase.state === "ending") {
        this.logger.debug("[VAD] Forcing speech_stopped after flush");
        this.phase = { state: "idle" };
        this.emit("speech_stopped");
      } else if (this.phase.state === "confirming") {
        this.logger.debug("[VAD] Discarding unconfirmed speech on flush");
        this.dropAttempt(this.phase);
      }
    } catch (error) {
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
    }
  }

  reset(): void {
    try {
      this.vad.reset();
      this.inputBuffer.reset();
    } catch {
      // ignore native cleanup failures
    } finally {
      this.phase = { state: "idle" };
      this.lastLevelAt = -Infinity;
      this.recentWindows = [];
    }
  }

  close(): void {
    this.reset();
    this.connected = false;
    this.windowTimestamp = 0;
  }

  /** Confirming a phrase start: confirmMs of voice, gaps up to confirmGapMs tolerated. */
  private stepConfirming(
    phase: Extract<VadPhase, { state: "confirming" }>,
    detected: boolean,
    loud: boolean,
    now: number,
  ): void {
    if (!detected) {
      if (now - phase.lastVoicedAt <= this.confirmGapMs) {
        return;
      }
      this.logger.debug(
        { elapsed: now - phase.startedAt, voicedMs: phase.voicedMs, confirmMs: this.confirmMs },
        "[VAD] confirming → idle (detection dropped before confirmation)",
      );
      this.dropAttempt(phase);
      return;
    }
    phase.voicedMs += this.msPerWindow;
    phase.loudMs += loud ? this.msPerWindow : 0;
    phase.lastVoicedAt = now;
    if (phase.voicedMs >= this.confirmMs) {
      this.logger.debug(
        { elapsed: now - phase.startedAt, voicedMs: phase.voicedMs, confirmMs: this.confirmMs },
        "[VAD] confirming → speaking (speech confirmed)",
      );
      this.phase = { state: "speaking" };
      this.emit("speech_started");
    }
  }

  /** Hizuri: voice that never opened a phrase is reported, so it is not lost silently. */
  private dropAttempt(phase: Extract<VadPhase, { state: "confirming" }>): void {
    this.phase = { state: "idle" };
    const dropped: DroppedSpeech = {
      // voicedMs leaves out the attempt's first window (the upstream confirm timing).
      voicedMs: phase.voicedMs + this.msPerWindow,
      loudMs: phase.loudMs,
      spanMs: phase.lastVoicedAt - phase.startedAt + this.msPerWindow,
    };
    this.emit("speech_dropped", dropped);
  }

  private stepStateMachine(rms = Infinity): void {
    const rawDetected = this.vad.isDetected();
    const now = this.windowTimestamp;
    const loud = rms >= this.loudMinRms;
    // Hizuri: every window goes out as a "frame" for the barge-in hold, with a "loud" bit.
    this.emit("frame", rawDetected, this.msPerWindow, rawDetected && loud);
    if (rms >= this.levelMinRms) {
      this.lastLevelAt = now;
    }
    // Hizuri: optional level gate (PASEO_VAD_MIN_RMS) for phrase detection itself.
    const detected =
      rawDetected && (this.levelMinRms <= 0 || now - this.lastLevelAt <= this.levelHangoverMs);

    switch (this.phase.state) {
      case "idle": {
        if (detected) {
          this.logger.debug({ now }, "[VAD] idle → confirming (detection started)");
          this.phase = {
            state: "confirming",
            startedAt: now,
            voicedMs: 0,
            loudMs: loud ? this.msPerWindow : 0,
            lastVoicedAt: now,
          };
          this.detectionStartedAt = now;
        }
        break;
      }

      case "confirming": {
        this.stepConfirming(this.phase, detected, loud, now);
        break;
      }

      case "speaking": {
        if (!detected) {
          this.logger.debug({ now }, "[VAD] speaking → ending (silence started)");
          this.phase = { state: "ending", startedAt: now, smartTurnChecked: false };
        }
        break;
      }

      case "ending": {
        if (detected) {
          this.logger.debug(
            { elapsed: now - this.phase.startedAt },
            "[VAD] ending → speaking (speech resumed)",
          );
          this.phase = { state: "speaking" };
          break;
        }
        const elapsed = now - this.phase.startedAt;
        this.maybeCheckSmartTurn(this.phase, elapsed);
        if (elapsed >= this.silenceMs) {
          this.logger.debug(
            { elapsed, silenceMs: this.silenceMs },
            "[VAD] ending → idle (speech stopped)",
          );
          this.phase = { state: "idle" };
          this.emit("speech_stopped");
        }
        break;
      }
    }
  }
}
