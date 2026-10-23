import { envFlag } from "../../voice-env.js";
import type { EchoFilter, PhraseSpan } from "./echo-filter.js";

// Hizuri: what may cut the assistant depends on where its voice plays, and the phone
// says so. The app sends its output route with every mic chunk (voice_audio_chunk.outputRoute,
// from the Android route it chose, VoiceRoutePolicy.kt). Headphones: any real phrase of the user's
// cuts the assistant (the room still decides with other voices nearby). Loudspeaker: the
// assistant's own voice comes back through the user's mic as loud as the user's or louder, so until
// the echo is taken out of the mic audio, only a stop word, the drop word or the assistant's name
// cuts it there. No route (web, an older app): as before.
//
// The assistant's echo in a live transcript is judged by letters against the lines it was saying
// while the user spoke (EchoFilter.heardMatch), not by shared words. The shared-word check (half
// the words in any reply of the last 2 minutes) also matched the user's short answers made of
// common words. The letter check lets fewer of the
// user's phrases fail to stop the assistant and fewer echoes cut it, in headphones and on the speaker.

export type OutputRoute = "speaker" | "headphones" | "unknown";

/** The wire value (any string from any app version) as a route. */
export function outputRouteOf(wire: string | undefined): OutputRoute {
  return wire === "speaker" || wire === "headphones" ? wire : "unknown";
}

/**
 * On this route only a stop word, the drop word or the assistant's name may cut it, whatever the
 * room: the loudspeaker, until PASEO_BARGE_SPEAKER_ANY_PHRASE says the echo is gone from the mic.
 */
export function stopWordsOnlyOn(route: OutputRoute): boolean {
  return route === "speaker" && !envFlag("PASEO_BARGE_SPEAKER_ANY_PHRASE", false);
}

// A live transcript is the assistant's echo when it is one stretch of its lines letter by letter.
// The assistant's echo scores near 1.0 (the recogniser garbles a few letters); the user's words
// heard over the assistant score much lower.
const MIN_ECHO_SIMILARITY = 0.75;
// The user's words inside the assistant's echo: three or more in a row that are not the assistant's
// keep the transcript the user's.
const MAX_FOREIGN_RUN = 2;

/**
 * The live transcript `text`, heard over `span`, is the assistant's own voice coming back: a short
 * garbled piece of the reply playing now, or one stretch of the lines it was saying letter by
 * letter with at most two words of something else in a row. PASEO_BARGE_ECHO_LETTERS=0 goes back to
 * the shared-word check.
 */
export function isAssistantEcho(
  filter: EchoFilter,
  text: string,
  span: PhraseSpan,
  now = Date.now(),
): boolean {
  if (filter.isPlayingReplyFragment(text)) {
    return true;
  }
  if (!envFlag("PASEO_BARGE_ECHO_LETTERS", true)) {
    return filter.isEcho(text, span.startedAt, {}, now);
  }
  const heard = filter.heardMatch(text, span, now);
  return (
    heard !== null && heard.similarity >= MIN_ECHO_SIMILARITY && heard.foreignRun <= MAX_FOREIGN_RUN
  );
}
