/**
 * Hizuri: the user's live words in voice mode. The daemon sends the recogniser's text of the
 * segment the user is saying about once a second (`voice_live_transcript`, the whole segment so
 * far each time); a phrase with short pauses spans several segments, and the agent gets them as
 * one message.
 */

export interface LiveWordsSegment {
  segmentId: string;
  text: string;
  updatedAt: number;
}

export interface LiveWords {
  segments: LiveWordsSegment[];
}

export const EMPTY_LIVE_WORDS: LiveWords = { segments: [] };

/**
 * Parts of one phrase follow each other within the daemon's monologue gap (1.2 s) plus the
 * recogniser's lag; a segment that starts later than this after the last one is a new phrase, so
 * the words of a phrase that never reached the chat (dropped, not for the assistant) do not linger.
 */
export const LIVE_WORDS_PHRASE_GAP_MS = 3_000;

/** Words that neither reached the chat nor changed for this long fade away. */
export const LIVE_WORDS_IDLE_MS = 12_000;

export function hearLiveWords(
  state: LiveWords,
  input: { segmentId: string; text: string; now: number },
): LiveWords {
  const text = input.text.trim();
  if (!text) return state;
  const index = state.segments.findIndex((segment) => segment.segmentId === input.segmentId);
  const segment = { segmentId: input.segmentId, text, updatedAt: input.now };
  if (index >= 0) {
    if (state.segments[index]!.text === text) return state;
    const segments = [...state.segments];
    segments[index] = segment;
    return { segments };
  }
  const last = state.segments.at(-1);
  const continuesPhrase =
    last !== undefined && input.now - last.updatedAt <= LIVE_WORDS_PHRASE_GAP_MS;
  return { segments: continuesPhrase ? [...state.segments, segment] : [segment] };
}

/**
 * The user's phrase reached the chat at `at`: the segments heard by then went with it. A segment
 * still changing after that is the next phrase and stays.
 */
export function landLiveWords(
  state: LiveWords,
  at: number,
): { state: LiveWords; landedText: string } {
  const landed = state.segments.filter((segment) => segment.updatedAt <= at);
  if (landed.length === 0) return { state, landedText: "" };
  return {
    state: { segments: state.segments.filter((segment) => segment.updatedAt > at) },
    landedText: joinLiveWords(landed),
  };
}

export function liveWordsText(state: LiveWords): string {
  return joinLiveWords(state.segments);
}

export function liveWordsUpdatedAt(state: LiveWords): number | null {
  return state.segments.at(-1)?.updatedAt ?? null;
}

function joinLiveWords(segments: readonly LiveWordsSegment[]): string {
  return segments.map((segment) => segment.text).join(" ");
}

/** The card shows the end of a long phrase: the words the user is saying now. */
export function tailOfLiveWords(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(text.length - maxLength);
  const wordStart = cut.indexOf(" ");
  return `…${wordStart >= 0 ? cut.slice(wordStart + 1) : cut}`;
}
