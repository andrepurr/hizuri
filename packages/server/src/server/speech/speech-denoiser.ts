import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type pino from "pino";

import { envNonNegative, envPath, localSpeechModelsDir } from "../voice-env.js";

// Hizuri: speech enhancement (noise suppression) of a phrase's audio, PASEO_STT_DENOISE (off by
// default). Every denoiser lowers the STT's word recall
// (DPDFNet and GTCRN in full most, mixed back least), while DPDFNet in full lifts the voice print's
// score of the user's phrases and keeps noise low. So by default it only gives the voice
// print a second look at a phrase it rejected (voice-turn-controller.ts);
// PASEO_STT_DENOISE_TARGET=all also cleans what goes to the recogniser.
//
// The denoiser runs in its own node process: sherpa's offline denoisers are synchronous (seconds
// for a long phrase), and DPDFNet needs sherpa-onnx-node 1.13+, whose libraries must not meet the
// daemon's own sherpa in one process. PASEO_STT_DENOISE_SHERPA_DIR points at a node_modules dir with
// that newer sherpa; unset = the daemon's own (GTCRN only up to 1.12).
//
// PASEO_STT_DENOISE: `gtcrn` | `dpdfnet` | unset/0 (off). PASEO_STT_DENOISE_MODEL: the .onnx file
// (default `<local speech models>/speech-enhancement/{gtcrn_simple,dpdfnet_baseline}.onnx`).
// PASEO_STT_DENOISE_LIMIT_DB: at most this much noise removed (0 = all).

export type DenoiseTarget = "voiceprint" | "all";

export interface SpeechDenoiser {
  readonly model: "gtcrn" | "dpdfnet";
  readonly target: DenoiseTarget;
  /** 16 kHz mono PCM16 in, the same length out, noise suppressed. */
  denoise(pcm16k: Buffer): Promise<Buffer>;
}

export interface SpeechDenoiserConfig {
  model: "gtcrn" | "dpdfnet";
  modelPath: string;
  limitDb: number;
  target: DenoiseTarget;
  sherpaDir: string | null;
}

const DEFAULT_MODEL_FILES = {
  gtcrn: "gtcrn_simple.onnx",
  dpdfnet: "dpdfnet_baseline.onnx",
} as const;
const REQUEST_TIMEOUT_MS = 60_000;

export function resolveSpeechDenoiserConfig(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): SpeechDenoiserConfig | null {
  const setting = env.PASEO_STT_DENOISE?.trim().toLowerCase();
  if (setting !== "gtcrn" && setting !== "dpdfnet") {
    return null;
  }
  const modelPath = envPath(
    "PASEO_STT_DENOISE_MODEL",
    path.join(
      localSpeechModelsDir(paseoHome, env),
      "speech-enhancement",
      DEFAULT_MODEL_FILES[setting],
    ),
    env,
  );
  const sherpaDir = env.PASEO_STT_DENOISE_SHERPA_DIR?.trim();
  return {
    model: setting,
    modelPath,
    limitDb: envNonNegative("PASEO_STT_DENOISE_LIMIT_DB", 0, env),
    target: env.PASEO_STT_DENOISE_TARGET?.trim().toLowerCase() === "all" ? "all" : "voiceprint",
    sherpaDir: sherpaDir ? path.resolve(sherpaDir) : null,
  };
}

// The child process: one denoiser, requests in order over IPC. Samples travel as int16 arrays.
const CHILD_SOURCE = `
const config = JSON.parse(process.env.PASEO_DENOISE_CHILD_CONFIG);
const sherpa = require(config.sherpaModule);
const model = config.model === "dpdfnet"
  ? { dpdfnet: { model: config.modelPath, attenuationLimitDb: config.limitDb } }
  : { gtcrn: { model: config.modelPath } };
const denoiser = new sherpa.OfflineSpeechDenoiser({ model: { ...model, numThreads: 1, debug: 0 } });
const mix = config.model === "gtcrn" && config.limitDb > 0 ? Math.pow(10, -config.limitDb / 20) : 0;
process.on("message", (msg) => {
  try {
    const input = new Int16Array(msg.pcm.buffer, msg.pcm.byteOffset, msg.pcm.byteLength / 2);
    const samples = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) samples[i] = input[i] / 32768;
    const out = denoiser.run({ samples, sampleRate: 16000 }).samples;
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const y = i < out.length ? out[i] : 0;
      const v = (1 - mix) * y + mix * samples[i];
      pcm[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
    }
    process.send({ id: msg.id, pcm: Buffer.from(pcm.buffer) });
  } catch (error) {
    process.send({ id: msg.id, error: String(error && error.message || error) });
  }
});
process.send({ ready: true });
`;

interface ChildReply {
  id?: number;
  ready?: boolean;
  /** Advanced serialization delivers a Buffer as a plain Uint8Array. */
  pcm?: Uint8Array;
  error?: string;
}

/** The node_modules dir that holds the sherpa-onnx-node the child loads. */
function sherpaNodeModules(sherpaDir: string | null): string {
  if (sherpaDir) {
    return sherpaDir;
  }
  const main = createRequire(import.meta.url).resolve("sherpa-onnx-node");
  return path.dirname(path.dirname(main));
}

const byConfig = new Map<string, SpeechDenoiser | null>();

/** One denoiser (one child process) per config and daemon. */
export function getSpeechDenoiser(
  config: SpeechDenoiserConfig,
  logger: pino.Logger,
): SpeechDenoiser | null {
  const key = JSON.stringify(config);
  if (!byConfig.has(key)) {
    byConfig.set(key, createSpeechDenoiser(config, logger));
  }
  return byConfig.get(key) ?? null;
}

/** Null when the model file is missing. Requests run one at a time in a child process. */
export function createSpeechDenoiser(
  config: SpeechDenoiserConfig,
  logger: pino.Logger,
): SpeechDenoiser | null {
  if (!existsSync(config.modelPath)) {
    logger.warn({ model: config.modelPath }, "stt.denoise_model_missing");
    return null;
  }
  const nodeModules = sherpaNodeModules(config.sherpaDir);
  const sherpaModule = path.join(nodeModules, "sherpa-onnx-node");
  let child: ChildProcess | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve(pcm: Buffer): void; reject(error: Error): void; timer: NodeJS.Timeout }
  >();

  function failAll(error: Error): void {
    for (const [id, request] of pending) {
      clearTimeout(request.timer);
      request.reject(error);
      pending.delete(id);
    }
  }

  function start(): Promise<void> {
    const libDir = path.join(nodeModules, `sherpa-onnx-${process.platform}-${process.arch}`);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PASEO_DENOISE_CHILD_CONFIG: JSON.stringify({ ...config, sherpaModule }),
    };
    if (existsSync(libDir)) {
      // Its own sherpa libraries first, so a newer sherpa never loads the daemon's older ones.
      env.LD_LIBRARY_PATH = [libDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
    }
    const spawned = spawn(process.execPath, ["-e", CHILD_SOURCE], {
      env,
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",
    });
    child = spawned;
    let stderr = "";
    spawned.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    spawned.on("exit", (code) => {
      child = null;
      ready = null;
      failAll(new Error(`denoiser exited (${code}): ${stderr.trim().split("\n").pop() ?? ""}`));
    });
    return new Promise<void>((resolve, reject) => {
      spawned.on("message", (reply: ChildReply) => {
        if (reply.ready) {
          logger.info({ model: config.model, target: config.target }, "stt.denoise_ready");
          resolve();
          return;
        }
        const request = reply.id !== undefined ? pending.get(reply.id) : undefined;
        if (!request || reply.id === undefined) {
          return;
        }
        pending.delete(reply.id);
        clearTimeout(request.timer);
        if (reply.error || !reply.pcm) {
          request.reject(new Error(reply.error ?? "no audio from the denoiser"));
          return;
        }
        request.resolve(Buffer.from(reply.pcm.buffer, reply.pcm.byteOffset, reply.pcm.byteLength));
      });
      spawned.on("exit", () => reject(new Error(`denoiser did not start: ${stderr.trim()}`)));
    });
  }

  return {
    model: config.model,
    target: config.target,
    async denoise(pcm16k) {
      if (pcm16k.length < 2) {
        return pcm16k;
      }
      ready ??= start();
      await ready;
      const id = nextId++;
      return new Promise<Buffer>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`denoiser gave nothing in ${REQUEST_TIMEOUT_MS} ms`));
        }, REQUEST_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        child?.send({ id, pcm: pcm16k });
      });
    },
  };
}
