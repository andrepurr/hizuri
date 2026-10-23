import type pino from "pino";

import {
  controlWords,
  latinShare,
  looksEnglish,
  markEnglishTranscript,
  soundsAlike,
} from "./english-pass.js";
import type { SttTranscriptFixers } from "./stt-transcript-fixes.js";

// Hizuri: what happens to a recognised phrase after the main STT, shared by the batch (REST) and the
// streaming (a module from the user's setup) providers: the whole-phrase English pass through Parakeet, and its
// fallback when the STT heard nothing.

async function waitAtMost<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise.catch(() => null), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Starts the English pass on a phrase's audio; null when the pass is off. */
export function startEnglishPass(params: {
  fixers: SttTranscriptFixers | null;
  audio: Buffer;
  sampleRate: number;
  logger: pino.Logger;
}): Promise<string | null> | null {
  const englishPass = params.fixers?.englishPass ?? null;
  if (!englishPass) {
    return null;
  }
  return englishPass.transcribe(params.audio, params.sampleRate).catch((err: unknown) => {
    params.logger.warn({ err: String(err) }, "stt.english_pass_failed");
    return null;
  });
}

export interface FinishedTranscript {
  text: string;
  language?: string;
}

/**
 * The STT text after the English pass: Parakeet's text replaces it when the phrase is clearly
 * English and sounds like what the STT heard (or the STT wrote enough of it in Latin, when
 * `latinShare` is set), or when the STT heard nothing at all.
 */
export async function finishTranscript(params: {
  fixers: SttTranscriptFixers | null;
  englishPromise: Promise<string | null> | null;
  text: string;
  language: string | undefined;
  requestedLanguage: string | undefined;
  audioSeconds: number;
  startedAt: number;
  logger: pino.Logger;
}): Promise<FinishedTranscript> {
  const { englishPromise, logger, startedAt } = params;
  const config = params.fixers?.englishPassConfig ?? null;
  let text = params.text;
  let language = params.language;
  if (!englishPromise || !config) {
    return { text, ...(language ? { language } : {}) };
  }
  const english = await waitAtMost(englishPromise, config.waitMs);
  if (!String(text ?? "").trim()) {
    // Hizuri: the STT heard nothing in a phrase the VAD called speech; use Parakeet's text instead
    // of dropping the phrase (PASEO_EMPTY_FALLBACK=0 turns this off).
    const fallback = config.emptyFallback
      ? (english ?? (await waitAtMost(englishPromise, config.emptyFallbackWaitMs)))
      : null;
    if (fallback && (fallback.match(/\p{L}/gu) ?? []).length >= 2) {
      logger.info(
        { text: fallback, seconds: +params.audioSeconds.toFixed(1), ms: Date.now() - startedAt },
        "stt.empty_fallback",
      );
      text = fallback;
      language = /(?=\p{L})\P{Script=Latin}/u.test(fallback) ? params.requestedLanguage : "en";
    }
  } else if (
    english &&
    looksEnglish(english) &&
    !controlWords().test(text) &&
    (soundsAlike(english, text) >= config.minAlike ||
      (config.latinShare > 0 && latinShare(text) >= config.latinShare))
  ) {
    logger.info(
      {
        raw: text,
        text: english,
        alike: soundsAlike(english, text),
        latin: latinShare(text),
        ms: Date.now() - startedAt,
      },
      "stt.english_pass",
    );
    text = english;
    language = "en";
    markEnglishTranscript(english);
  }
  return { text, ...(language ? { language } : {}) };
}
