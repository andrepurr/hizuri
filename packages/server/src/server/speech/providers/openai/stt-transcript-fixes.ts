import { existsSync } from "node:fs";
import path from "node:path";
import type pino from "pino";

import {
  envFlag,
  envNumber,
  envPath,
  envPositive,
  localSpeechModelsDir,
} from "../../../voice-env.js";
import { createEnglishPass, type EnglishPass, type EnglishPassConfig } from "./english-pass.js";
import { createMixedEnglishFixer, type MixedEnglishFixer } from "./mixed-english.js";
import { createVocabFixer, type VocabFixer } from "./stt-vocab.js";

// Hizuri: user-tuned fixes for the OpenAI-compatible STT (made for a local STT of a language with
// another script). Every fix is optional, configured from env, and its data files live outside the
// repo.

export interface SttEnglishPassConfig extends EnglishPassConfig {
  /** How long a finished STT transcript waits for the English pass. */
  waitMs: number;
  /** An empty STT result may use Parakeet's text instead (PASEO_EMPTY_FALLBACK). */
  emptyFallback: boolean;
  /** How long an empty STT result waits for Parakeet. */
  emptyFallbackWaitMs: number;
  /** Parakeet's English must sound at least this much like the STT text (0..1). */
  minAlike: number;
  /**
   * Or the STT text has at least this share of Latin letters (0..1, 0 = off): an accented English
   * phrase comes out of such an STT half in Latin and too garbled to sound alike.
   */
  latinShare: number;
}

export interface SttTranscriptFixesConfig {
  /** English terms map (PASEO_STT_VOCAB_FILE, default `<paseoHome>/stt-vocab.json`). */
  vocabFile: string;
  /** Natively spelled English word map (PASEO_MIXED_ENGLISH_FILE); null when PASEO_MIXED_ENGLISH=0. */
  mixedEnglishFile: string | null;
  /** Whole-phrase English pass through Parakeet; null when PASEO_ENGLISH_PASS=0. */
  englishPass: SttEnglishPassConfig | null;
}

export function resolveSttTranscriptFixes(params: {
  paseoHome: string;
  env: NodeJS.ProcessEnv;
}): SttTranscriptFixesConfig {
  const { paseoHome, env } = params;
  return {
    vocabFile: envPath("PASEO_STT_VOCAB_FILE", path.join(paseoHome, "stt-vocab.json"), env),
    mixedEnglishFile: envFlag("PASEO_MIXED_ENGLISH", true, env)
      ? envPath("PASEO_MIXED_ENGLISH_FILE", path.join(paseoHome, "mixed-english.json"), env)
      : null,
    englishPass: envFlag("PASEO_ENGLISH_PASS", true, env)
      ? {
          modelDir: envPath(
            "PASEO_ENGLISH_PASS_MODEL",
            path.join(
              localSpeechModelsDir(paseoHome, env),
              "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8",
            ),
            env,
          ),
          threads: envPositive("PASEO_ENGLISH_PASS_THREADS", 2, env),
          waitMs: envNumber("PASEO_ENGLISH_PASS_WAIT_MS", 1500, env),
          emptyFallback: envFlag("PASEO_EMPTY_FALLBACK", true, env),
          emptyFallbackWaitMs: envNumber("PASEO_EMPTY_FALLBACK_WAIT_MS", 4000, env),
          // Real speech sits well above this line; noise heard as English well below it.
          minAlike: envNumber("PASEO_ENGLISH_PASS_MIN_ALIKE", 0.65, env),
          latinShare: envNumber("PASEO_ENGLISH_PASS_LATIN_SHARE", 0, env),
        }
      : null,
  };
}

export interface SttTranscriptFixers {
  /** English terms, then mixed English; logs `stt.mixed_english` and `stt.vocab_fixed`. */
  fixText(text: string, logger: pino.Logger): string;
  englishPass: EnglishPass | null;
  englishPassConfig: SttEnglishPassConfig | null;
}

/**
 * A term file that is not where the daemon looks turns its fixes off without an error, and they
 * stayed off unnoticed after the daemon home moved. Say so once at start.
 */
function reportMissingFixFiles(config: SttTranscriptFixesConfig, logger: pino.Logger): void {
  for (const file of [config.vocabFile, config.mixedEnglishFile]) {
    if (file && !existsSync(file)) {
      logger.warn({ file }, "stt.fix_file_missing");
    }
  }
}

export function createSttTranscriptFixers(
  config: SttTranscriptFixesConfig,
  logger: pino.Logger,
): SttTranscriptFixers {
  reportMissingFixFiles(config, logger);
  const vocab: VocabFixer = createVocabFixer(config.vocabFile);
  const mixed: MixedEnglishFixer | null = config.mixedEnglishFile
    ? createMixedEnglishFixer(config.mixedEnglishFile)
    : null;
  const englishPass = config.englishPass ? createEnglishPass(config.englishPass) : null;
  return {
    fixText(text, logger) {
      const fixed = vocab.fix(text);
      const mixedFix = mixed?.fix(fixed.text);
      if (mixedFix?.changed) {
        logger.info({ raw: fixed.text, text: mixedFix.text }, "stt.mixed_english");
      }
      const out = mixedFix?.changed ? mixedFix.text : fixed.text;
      if (out !== text) {
        logger.info({ raw: text, text: out }, "stt.vocab_fixed");
      }
      return out;
    },
    englishPass,
    englishPassConfig: englishPass ? config.englishPass : null,
  };
}
