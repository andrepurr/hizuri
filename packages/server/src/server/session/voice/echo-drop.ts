import { STOP_ANYWHERE, nameWords, pauseWords } from "./barge-hold.js";
import type { HeardMatch } from "./echo-filter.js";
import { anyOf } from "../../voice-language/languages.js";

// Hizuri: on the phone's speaker the assistant's own lines and the fast front's come back through
// the mic; otherwise Zuri signs them “not-for-me (echo)” by hand. A phrase is dropped as the
// assistant's echo only when everything says so: the voice print far below the user's
// (PASEO_ECHO_DROP_SCORE), the assistant's words (the echo check), the whole phrase one stretch of
// the lines the assistant was saying, begun after the first of them was heard, its first and last
// words the assistant's. The user's words before, inside or after the assistant's echo keep the
// whole phrase. At 0.2 most echoes drop and the user's
// own phrases do not.

// The whole phrase against the assistant's lines heard while the user spoke: the assistant's echoes
// 0.8-1.0, the assistant's echo with the user's words inside 0.5-0.77.
const MIN_SIMILARITY = 0.8;
// The assistant's echo begins about a second after its line (0.8-1.3 s); a user reply can begin
// 0.12 s after.
const MIN_START_LAG_MS = 500;
// The user's words inside the assistant's echo: three or more in a row that are not the
// assistant's. The recogniser garbles at most two of the assistant's words in a row in all but one
// echo.
const MAX_FOREIGN_RUN = 2;
// A start or end the recogniser garbled ("Show" spelled in another script) is the assistant's when its
// last 12 letters are close; a garbled end also needs the phrase to have ended with the assistant's
// line: the assistant's echoes end 1.0-1.6 s after it, a short user command after it 2.4 s.
const MIN_END_SIMILARITY = 0.75;
const MAX_END_GAP_MS = 1800;
// The user's short answer at the end of the assistant's echo, unless the line ends in the same
// word.
const ANSWER_TAIL = new RegExp(
  `(?<!\\p{L})${anyOf((language) => language.answerWords)}[\\s\\p{P}]*$`,
  "iu",
);

export interface EchoDropInput {
  transcript: string;
  /** The voice print's score; undefined when it gave none. */
  score: number | undefined;
  /** PASEO_ECHO_DROP_SCORE: only a score below it is dropped; -1 = off. */
  maxScore: number;
  /** The echo check (EchoFilter.isPhraseEcho) matched the assistant's words. */
  echoLike: boolean;
  heard: HeardMatch | null;
}

export type EchoDropVerdict = { drop: true; reason: string } | { drop: false };

export function judgeEchoDrop(input: EchoDropInput): EchoDropVerdict {
  const { transcript, score, heard } = input;
  if (!input.echoLike || score === undefined || score >= input.maxScore || !heard) {
    return { drop: false };
  }
  if (
    STOP_ANYWHERE.test(transcript) ||
    pauseWords().test(transcript) ||
    nameWords().test(transcript)
  ) {
    return { drop: false };
  }
  if (
    heard.similarity < MIN_SIMILARITY ||
    heard.startLagMs < MIN_START_LAG_MS ||
    heard.foreignRun > MAX_FOREIGN_RUN
  ) {
    return { drop: false };
  }
  const headIsAssistant =
    heard.startsInAssistantWords || heard.headSimilarity >= MIN_END_SIMILARITY;
  if (!headIsAssistant) {
    return { drop: false };
  }
  const tailIsAssistant =
    heard.endsInAssistantWords ||
    (!ANSWER_TAIL.test(transcript) &&
      heard.tailSimilarity >= MIN_END_SIMILARITY &&
      heard.endGapMs <= MAX_END_GAP_MS);
  if (!tailIsAssistant) {
    return { drop: false };
  }
  return {
    drop: true,
    reason: `echo: voice ${round(score)}, assistant words ${round(heard.similarity)}`,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
