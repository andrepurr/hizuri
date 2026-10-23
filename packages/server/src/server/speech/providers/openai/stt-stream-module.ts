import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type pino from "pino";
import { WebSocket } from "ws";

import { foldLetters } from "../../../voice-language/languages.js";
import {
  PhraseTranscriptionError,
  sameTranscriptWords,
  type SpeechToTextProvider,
  type TranscriptionResult,
} from "../../speech-provider.js";
import { finishTranscript, startEnglishPass } from "./finish-transcript.js";
import type { SttTranscriptFixers } from "./stt-transcript-fixes.js";

// Hizuri: a streaming recogniser plugged in from the user's setup folder. The repo's STT sends each
// phrase as one recording (REST). A server that streams partial text while the user speaks has its
// own protocol, so its client lives next to that server's setup, outside the repo:
// `$HIZURI_HOME/setup/modules/<name>.ts` (HIZURI_HOME defaults to ~/.hizuri; `.js` and `.mjs` work
// too), named by PASEO_VOICE_STT_STREAM_MODULE (default `stt-stream`) and loaded when
// PASEO_VOICE_STT_STREAM is set and not 0. The module exports `createStreamingStt` (SttStreamModule).
// It resolves no imports beyond Node's own: what it needs from the daemon comes in `host`.

/** The REST provider behind a stream (OpenAISTT): whole recordings, transcript fixes, fallback. */
export interface StreamBatchProvider extends SpeechToTextProvider {
  readonly fixers: SttTranscriptFixers | null;
  transcribePcm16(params: {
    pcm16: Buffer;
    sampleRate: number;
    language: string;
    logger: pino.Logger;
    /** Give up on this request after this long (default: the client's own timeout). */
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<TranscriptionResult>;
}

/** What the daemon lends a streaming module. */
export interface SttStreamHost {
  WebSocket: typeof WebSocket;
  PhraseTranscriptionError: typeof PhraseTranscriptionError;
  sameTranscriptWords: typeof sameTranscriptWords;
  foldLetters: typeof foldLetters;
  finishTranscript: typeof finishTranscript;
  startEnglishPass: typeof startEnglishPass;
}

export interface SttStreamModule {
  /** The streaming provider over `batch`; null when the module's own settings turn it off. */
  createStreamingStt(params: {
    env: NodeJS.ProcessEnv;
    sttBaseUrl: string | undefined;
    batch: StreamBatchProvider;
    logger: pino.Logger;
    host: SttStreamHost;
  }): SpeechToTextProvider | null;
}

export interface SttStreamModuleConfig {
  /** Absolute path of the module file. */
  modulePath: string;
}

/** Wraps the batch provider in the loaded module's stream (or returns null to keep the batch). */
export type SttStreamFactory = (
  batch: StreamBatchProvider,
  sttBaseUrl: string | undefined,
) => SpeechToTextProvider | null;

const MODULE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const EXTENSIONS = [".ts", ".mjs", ".js"];

function expandHome(file: string): string {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

export function createSttStreamHost(): SttStreamHost {
  return {
    WebSocket,
    PhraseTranscriptionError,
    sameTranscriptWords,
    foldLetters,
    finishTranscript,
    startEnglishPass,
  };
}

/**
 * The module file named by the settings; undefined when streaming is off. A name that is not a
 * plain module name or has no file is an error, so a typo never silently means "no streaming".
 */
export function resolveSttStreamModule(env: NodeJS.ProcessEnv): SttStreamModuleConfig | undefined {
  const setting = env.PASEO_VOICE_STT_STREAM?.trim();
  if (!setting || setting === "0" || setting.toLowerCase() === "false") {
    return undefined;
  }
  const name = env.PASEO_VOICE_STT_STREAM_MODULE?.trim() || "stt-stream";
  if (!MODULE_NAME.test(name)) {
    throw new Error(`PASEO_VOICE_STT_STREAM_MODULE: "${name}" is not a module name`);
  }
  const dir = path.resolve(expandHome(env.HIZURI_HOME?.trim() || "~/.hizuri"), "setup", "modules");
  const modulePath = EXTENSIONS.map((ext) => path.join(dir, name + ext)).find((file) =>
    existsSync(file),
  );
  if (!modulePath) {
    throw new Error(
      `PASEO_VOICE_STT_STREAM is set but no module ${name}{${EXTENSIONS.join(",")}} is in ${dir}`,
    );
  }
  return { modulePath };
}

/** Imports the module once; the factory then builds a stream over each new batch provider. */
export async function loadSttStreamModule(params: {
  config: SttStreamModuleConfig | undefined;
  env?: NodeJS.ProcessEnv;
  logger: pino.Logger;
}): Promise<SttStreamFactory | null> {
  const { config, logger } = params;
  if (!config) {
    return null;
  }
  const loaded = (await import(pathToFileURL(config.modulePath).href)) as Partial<SttStreamModule>;
  if (typeof loaded.createStreamingStt !== "function") {
    throw new Error(`${config.modulePath} does not export createStreamingStt`);
  }
  const create = loaded.createStreamingStt;
  const env = params.env ?? process.env;
  const host = createSttStreamHost();
  logger.info({ module: config.modulePath }, "STT streaming module loaded");
  return (batch, sttBaseUrl) => create({ env, sttBaseUrl, batch, logger, host });
}
