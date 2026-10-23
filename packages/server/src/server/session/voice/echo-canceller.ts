// Hizuri (echo cancel): the assistant's own voice taken out of the user's mic audio on the host,
// with the assistant's reply as the canceller's reference (reply-reference.ts).
//
// Two engines, picked by PASEO_ECHO_CANCEL_ENGINE; both run on 10 ms frames, and a chunk that is
// not a whole number of frames leaves its tail for the next chunk (the cleaned audio lags the mic
// by under 10 ms):
//   speex  speexdsp's echo canceller with its residual echo suppressor, built to WASM
//          (native/speex-aec, embedded in speex-aec-wasm.ts): no native install anywhere. On
//          double-talk it keeps more of the user's words over the assistant than AEC3 does; it
//          leaves more of the assistant's echo, which the voice print and the letter check catch.
//   aec3   WebRTC's AEC3 (Chrome's, and LiveKit's audio processing module) through LiveKit's
//          prebuilt Node bindings `@livekit/rtc-ffi-bindings`; echo canceller and high-pass
//          filter only.
// Neither runs a noise suppressor or gain control: the phone's own canceller with its suppressor
// erased the user's voice while the assistant spoke and whispers with it,
// and the mic gain is ours.

import { createRequire } from "node:module";
import type pino from "pino";

import { envString } from "../../voice-env.js";
import { SPEEX_AEC_WASM_BASE64 } from "./speex-aec-wasm.js";

const RATE = 16_000;
const FRAME = RATE / 100;
const FRAME_BYTES = FRAME * 2;
/** Speex filter length: the assistant's echo may come back up to 0.5 s after its reference. */
const SPEEX_TAIL = RATE / 2;

export type EchoCancelEngine = "speex" | "aec3";

/** One engine: cancels `mic` (one 10 ms frame) against `ref` in place. */
interface FrameEngine {
  run(mic: Uint8Array, ref: Uint8Array): void;
  close(): void;
}

// --- AEC3 through LiveKit's FFI -------------------------------------------------------------

/** The part of `@livekit/rtc-ffi-bindings` used here. */
interface LivekitFfi {
  livekitInitialize(callback: (data: Uint8Array) => void, captureLogs: boolean, sdk: string): void;
  livekitFfiRequest(data: Uint8Array): Uint8Array;
  livekitRetrievePtr(data: Uint8Array): bigint;
  FfiHandle: new (handle: bigint) => { dispose(): void };
  FfiRequest: new (init: unknown) => { toBinary(): Uint8Array };
  FfiResponse: { fromBinary(data: Uint8Array): { message: { case?: string; value?: unknown } } };
}

let ffi: LivekitFfi | null | undefined;

function loadFfi(logger: pino.Logger): LivekitFfi | null {
  if (ffi !== undefined) {
    return ffi;
  }
  try {
    const require = createRequire(import.meta.url);
    const mod = require("@livekit/rtc-ffi-bindings") as LivekitFfi;
    // One FFI server per process; LiveKit's own Node SDK registers it the same way.
    const shared = globalThis as { _hizuriLivekitFfi?: boolean; _ffiClientInstance?: unknown };
    if (!shared._hizuriLivekitFfi && !shared._ffiClientInstance) {
      mod.livekitInitialize(() => {}, false, "hizuri-echo-cancel");
      shared._hizuriLivekitFfi = true;
    }
    ffi = mod;
  } catch (error) {
    logger.warn({ err: String(error) }, "echo_cancel.unavailable");
    ffi = null;
  }
  return ffi;
}

function request(lib: LivekitFfi, message: { case: string; value: object }): unknown {
  const bytes = lib.livekitFfiRequest(new lib.FfiRequest({ message }).toBinary());
  return lib.FfiResponse.fromBinary(bytes).message.value;
}

class Aec3Engine implements FrameEngine {
  private readonly handle: { dispose(): void };
  private readonly apm: bigint;
  private readonly micFrame = new Uint8Array(FRAME_BYTES);
  private readonly refFrame = new Uint8Array(FRAME_BYTES);
  private readonly micPtr: bigint;
  private readonly refPtr: bigint;

  constructor(private readonly lib: LivekitFfi) {
    const created = request(lib, {
      case: "newApm",
      value: {
        echoCancellerEnabled: true,
        highPassFilterEnabled: true,
        noiseSuppressionEnabled: false,
        gainControllerEnabled: false,
      },
    }) as { apm?: { handle?: { id?: bigint } } };
    const id = created.apm?.handle?.id;
    if (id === undefined) {
      throw new Error("LiveKit APM returned no handle");
    }
    this.apm = id;
    this.handle = new lib.FfiHandle(id);
    // The frames live as long as the engine, so their addresses stay valid.
    this.micPtr = lib.livekitRetrievePtr(this.micFrame);
    this.refPtr = lib.livekitRetrievePtr(this.refFrame);
  }

  run(mic: Uint8Array, ref: Uint8Array): void {
    this.refFrame.set(ref);
    this.micFrame.set(mic);
    this.call("apmProcessReverseStream", this.refPtr);
    this.call("apmProcessStream", this.micPtr);
    mic.set(this.micFrame);
  }

  close(): void {
    this.handle.dispose();
  }

  private call(kind: "apmProcessStream" | "apmProcessReverseStream", dataPtr: bigint): void {
    const result = request(this.lib, {
      case: kind,
      value: { apmHandle: this.apm, dataPtr, size: FRAME_BYTES, sampleRate: RATE, numChannels: 1 },
    }) as { error?: string };
    if (result.error) {
      throw new Error(`LiveKit APM ${kind}: ${result.error}`);
    }
  }
}

// --- speexdsp as WASM ------------------------------------------------------------------------

interface SpeexExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  aec_new(frame: number, tail: number, rate: number): number;
  aec_mic(state: number): number;
  aec_ref(state: number): number;
  aec_out(state: number): number;
  aec_run(state: number): void;
  aec_free(state: number): void;
}

let speexModule: WebAssembly.Module | null = null;

class SpeexEngine implements FrameEngine {
  private readonly wasm: SpeexExports;
  private readonly state: number;

  constructor(onMessage: (line: string) => void) {
    speexModule ??= new WebAssembly.Module(Buffer.from(SPEEX_AEC_WASM_BASE64, "base64"));
    // speexdsp prints through stdio only, when it resets a filter that went wrong. The C library
    // writes until fd_write reports every byte written, so fd_write must report them: a stub that
    // reported none kept aec_run writing forever, which froze the event loop.
    let line = "";
    const fdWrite = (_fd: number, iovs: number, iovsLen: number, written: number): number => {
      const memory = this.wasm.memory.buffer;
      const view = new DataView(memory);
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view.getUint32(iovs + i * 8, true);
        const len = view.getUint32(iovs + i * 8 + 4, true);
        line += Buffer.from(memory, ptr, len).toString("utf8");
        total += len;
      }
      view.setUint32(written, total, true);
      for (let end = line.indexOf("\n"); end >= 0; end = line.indexOf("\n")) {
        onMessage(line.slice(0, end));
        line = line.slice(end + 1);
      }
      return 0;
    };
    const wasi = { fd_close: () => 0, fd_seek: () => 0, fd_write: fdWrite };
    const instance = new WebAssembly.Instance(speexModule, { wasi_snapshot_preview1: wasi });
    this.wasm = instance.exports as unknown as SpeexExports;
    this.wasm._initialize();
    this.state = this.wasm.aec_new(FRAME, SPEEX_TAIL, RATE);
  }

  run(mic: Uint8Array, ref: Uint8Array): void {
    const heap = new Uint8Array(this.wasm.memory.buffer);
    heap.set(mic, this.wasm.aec_mic(this.state));
    heap.set(ref, this.wasm.aec_ref(this.state));
    this.wasm.aec_run(this.state);
    const out = this.wasm.aec_out(this.state);
    mic.set(new Uint8Array(this.wasm.memory.buffer, out, FRAME_BYTES));
  }

  close(): void {
    this.wasm.aec_free(this.state);
  }
}

// --- framing ---------------------------------------------------------------------------------

export interface EchoCancelStats {
  engine: EchoCancelEngine;
  frames: number;
  /** Frames with the assistant's reference playing. */
  echoFrames: number;
  /** Time spent inside the engine, ms. */
  busyMs: number;
}

/** PASEO_ECHO_CANCEL_ENGINE: speex (default) or aec3. */
export function echoCancelEngine(): EchoCancelEngine {
  return envString("PASEO_ECHO_CANCEL_ENGINE", "speex").trim() === "aec3" ? "aec3" : "speex";
}

export class EchoCanceller {
  private micTail = Buffer.alloc(0);
  private refTail = new Int16Array(0);
  private readonly micFrame = new Uint8Array(FRAME_BYTES);
  private readonly refFrame = new Uint8Array(FRAME_BYTES);
  readonly stats: EchoCancelStats;

  private constructor(
    private readonly engine: FrameEngine,
    name: EchoCancelEngine,
  ) {
    this.stats = { engine: name, frames: 0, echoFrames: 0, busyMs: 0 };
  }

  /** A canceller on `engine`, or null when that engine cannot run here (logged). */
  static create(logger: pino.Logger, engine: EchoCancelEngine = "aec3"): EchoCanceller | null {
    try {
      if (engine === "speex") {
        const onMessage = (message: string) =>
          logger.warn({ engine, message }, "echo_cancel.engine_message");
        return new EchoCanceller(new SpeexEngine(onMessage), engine);
      }
      const lib = loadFfi(logger);
      return lib ? new EchoCanceller(new Aec3Engine(lib), engine) : null;
    } catch (error) {
      logger.warn({ err: String(error), engine }, "echo_cancel.create_failed");
      return null;
    }
  }

  /**
   * 16 kHz PCM16 mono mic audio and the assistant's reference for the same samples -> the mic audio
   * without the assistant's echo. The output holds whole 10 ms frames; the rest waits for the next
   * chunk.
   */
  process(mic: Buffer, reference: Int16Array): Buffer {
    const micAll = this.micTail.length > 0 ? Buffer.concat([this.micTail, mic]) : mic;
    const refAll = this.refTail.length > 0 ? concatInt16(this.refTail, reference) : reference;
    const frames = Math.floor(micAll.length / FRAME_BYTES);
    const out = Buffer.alloc(frames * FRAME_BYTES);
    const startedAt = performance.now();
    for (let f = 0; f < frames; f++) {
      const ref = refAll.subarray(f * FRAME, (f + 1) * FRAME);
      this.refFrame.fill(0);
      this.refFrame.set(new Uint8Array(ref.buffer, ref.byteOffset, ref.byteLength));
      this.micFrame.set(micAll.subarray(f * FRAME_BYTES, (f + 1) * FRAME_BYTES));
      this.engine.run(this.micFrame, this.refFrame);
      out.set(this.micFrame, f * FRAME_BYTES);
      this.stats.frames += 1;
      if (ref.some((sample) => sample !== 0)) {
        this.stats.echoFrames += 1;
      }
    }
    this.stats.busyMs += performance.now() - startedAt;
    this.micTail = Buffer.from(micAll.subarray(frames * FRAME_BYTES));
    this.refTail = refAll.slice(frames * FRAME);
    return out;
  }

  close(): void {
    this.engine.close();
  }
}

function concatInt16(a: Int16Array, b: Int16Array): Int16Array {
  const out = new Int16Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}
