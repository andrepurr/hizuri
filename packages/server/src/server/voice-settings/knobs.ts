// Hizuri: the voice knobs voice-settings.json may set (store.ts), with what each one does. Every
// knob is still read where it is used, through voice-env.ts, with its own fallback; `default` here
// is what the tool shows and must match that fallback. A knob that is read once at daemon start
// (STT and TTS providers, models, URLs) is not listed: the file cannot change it.
// Every knob has a data scope (data-scopes/scopes.ts): a tuning knob is `setup`, so a setup
// exported for others carries it; free text that may name people is `personal`.

import { defaultBargeStopPattern } from "../voice-language/languages.js";
import { MODE_CUTS, MODE_STARTS, modeKnob, VOICE_MODES } from "../session/voice/voice-mode.js";
import type { DataScope } from "../data-scopes/scopes.js";

export type VoiceKnobGroup = "interrupt" | "phrase" | "filter" | "mic" | "speech" | "modules";

/**
 * When a change reaches the voice: `now` = the next audio frame, phrase or chunk; `next-reply` =
 * the assistant's next reply; `next-voice-session` = the next time voice mode is turned on.
 */
export type VoiceKnobApplies = "now" | "next-reply" | "next-voice-session";

interface KnobBase {
  key: string;
  group: VoiceKnobGroup;
  meaning: string;
  applies: VoiceKnobApplies;
  scope: DataScope;
}

export type VoiceKnob =
  | (KnobBase & { kind: "flag"; default: boolean })
  | (KnobBase & { kind: "number"; default: number; min: number; max: number })
  | (KnobBase & { kind: "choice"; default: string; choices: readonly string[] })
  | (KnobBase & { kind: "regex"; default: string });

function flag(
  key: string,
  group: VoiceKnobGroup,
  fallback: boolean,
  meaning: string,
  applies: VoiceKnobApplies = "now",
): VoiceKnob {
  return { key, group, kind: "flag", default: fallback, meaning, applies, scope: "setup" };
}

function num(
  key: string,
  group: VoiceKnobGroup,
  fallback: number,
  range: [number, number],
  meaning: string,
  applies: VoiceKnobApplies = "now",
): VoiceKnob {
  return {
    key,
    group,
    kind: "number",
    default: fallback,
    min: range[0],
    max: range[1],
    meaning,
    applies,
    scope: "setup",
  };
}

const MS_MAX = 600_000;

/**
 * Two knobs per voice mode (voice-mode.ts): what cuts the assistant there and when it may start.
 */
function modeKnobs(): VoiceKnob[] {
  return VOICE_MODES.flatMap((row): VoiceKnob[] => {
    const where = `${row.route === "speaker" ? "On the loudspeaker" : "In headphones"}, room ${row.room}`;
    const rowCuts =
      row.cuts === "echo-free"
        ? "any-phrase once the assistant's echo is cancelled, else stop-words"
        : row.cuts;
    const cuts =
      row.room === "noisy"
        ? `stop-words while PASEO_ROOM_NOISY_STOP_WORDS is on, else ${rowCuts}`
        : rowCuts;
    return [
      {
        key: modeKnob(row.route, row.room, "cuts"),
        group: "interrupt",
        kind: "choice",
        default: "auto",
        choices: ["auto", ...MODE_CUTS],
        meaning: `${where}: what cuts the assistant while it talks (with PASEO_VOICE_MODES). auto = ${cuts}.`,
        applies: "now",
        scope: "setup",
      },
      {
        key: modeKnob(row.route, row.room, "start"),
        group: "interrupt",
        kind: "choice",
        default: "auto",
        choices: ["auto", ...MODE_STARTS],
        meaning: `${where}: when the assistant's waiting reply may start (with PASEO_VOICE_MODES). auto = ${row.start}.`,
        applies: "now",
        scope: "setup",
      },
    ];
  });
}

export const VOICE_KNOBS: readonly VoiceKnob[] = [
  // Speech out first: volume is the knob asked for most.
  num(
    "PASEO_TTS_GAIN_DB",
    "speech",
    0,
    [-30, 18],
    "The assistant's voice volume in dB: +3 louder, -3 quieter, 0 as synthesized; loud peaks are softened, not clipped.",
  ),
  num(
    "PASEO_TTS_SPEED",
    "speech",
    1,
    [0.7, 1.4],
    "The assistant's speaking rate: 1.1 = 10% faster, 0.9 = slower; the pitch stays.",
  ),
  num(
    "PASEO_TTS_PACE_LEAD_MS",
    "speech",
    400,
    [50, 5000],
    "How far playback runs ahead of the phone: smaller = the assistant stops sooner when cut, larger = fewer network hitches.",
    "next-reply",
  ),
  num(
    "PASEO_TTS_PACE_MIN_MS",
    "speech",
    300,
    [50, 5000],
    "Shortest audio chunk sent to the phone.",
  ),
  num(
    "PASEO_TTS_PACE_TARGET_MS",
    "speech",
    700,
    [100, 5000],
    "Usual audio chunk length (cut at pauses between words).",
  ),
  num("PASEO_TTS_PACE_MAX_MS", "speech", 1200, [200, 10_000], "Longest audio chunk."),
  num(
    "PASEO_TTS_REPLAY_AFTER_MS",
    "speech",
    1200,
    [100, 30_000],
    "A pause of the assistant's reply this long replays the interrupted sentence when it goes on.",
    "next-reply",
  ),
  num(
    "PASEO_TTS_SENTENCE_GAP_MS",
    "speech",
    400,
    [50, 5000],
    "Silence that counts as a sentence border for that replay.",
    "next-reply",
  ),
  num(
    "PASEO_TTS_RETURN_EARLY_MS",
    "speech",
    1500,
    [0, 30_000],
    "The assistant's speak call returns this long before the reply ends, so its next words come sooner.",
  ),
  flag(
    "PASEO_VOICE_FLOOR_GATE",
    "interrupt",
    true,
    "The assistant's reply starts only in the user's pause: while the user's phrase is open it waits, synthesized, and a newer reply replaces it.",
  ),
  num(
    "PASEO_VOICE_FLOOR_QUIET_MS",
    "interrupt",
    1500,
    [0, 10_000],
    "Floor gate with room turns off: the user's silence after a phrase before the assistant's reply may start.",
  ),
  flag(
    "PASEO_VOICE_ROOM_TURNS",
    "interrupt",
    true,
    "The room decides turns: alone, the user's real words cut the assistant and its reply waits until the user's thought has gone to it (noise never counts when noisy); with other voices nearby only stop words cut the assistant and nothing holds it. 0 = stop-words-only knob and fixed quiet time.",
  ),
  num(
    "PASEO_VOICE_BACKCHANNEL_MS",
    "interrupt",
    1600,
    [0, 10_000],
    "Room turns: a phrase shorter than this (with the speech detector's closing silence) is a backchannel (“uh-huh”): it never holds the assistant's reply.",
  ),
  num(
    "PASEO_VOICE_FLOOR_MAX_WAIT_MS",
    "interrupt",
    60_000,
    [0, MS_MAX],
    "Floor gate: longest wait for the user's pause outside a hold, then the reply plays in the next gap (0 = no limit).",
  ),
  flag(
    "PASEO_VOICE_HOLD",
    "interrupt",
    true,
    "“Wait”, “let me finish” or dictation holds every reply of the assistant's until the user asks it something, gives an order, says they are done, or stays silent.",
  ),
  num(
    "PASEO_VOICE_HOLD_SILENCE_MS",
    "interrupt",
    20_000,
    [1000, MS_MAX],
    "Hold: the user's silence that ends it (evalgent: wait 20-30 s after “hold on”).",
  ),
  num(
    "PASEO_TTS_DETACH_HOLD_MS",
    "speech",
    8000,
    [0, MS_MAX],
    "A reply paused this long lets the assistant's speak call return (0 = never).",
  ),
  flag(
    "PASEO_TTS_STREAM",
    "speech",
    true,
    "Synthesize a reply part by part, so the first words come after the first sentence.",
  ),
  num(
    "PASEO_TTS_STREAM_FIRST_CHARS",
    "speech",
    70,
    [10, 1000],
    "Size of the first synthesized part, characters.",
  ),
  num("PASEO_TTS_STREAM_MIN_CHARS", "speech", 60, [10, 1000], "Smallest later part, characters."),
  num("PASEO_TTS_STREAM_MAX_CHARS", "speech", 300, [20, 4000], "Largest later part, characters."),
  flag(
    "PASEO_TTS_QUEUE",
    "speech",
    true,
    "Speech queue: each speak call is one job; 0 = a reply synthesized whole, then played.",
  ),
  flag(
    "PASEO_TTS_SINGLE_SEGMENT",
    "speech",
    false,
    "Without the queue: one TTS segment per reply.",
  ),
  flag(
    "PASEO_VOICE_KEEP_PROMPT",
    "speech",
    true,
    "The agent keeps its voice prompt when a session ends, so the next start needs no reload.",
  ),
  flag("PASEO_SHOW_SAVED_AUDIO", "speech", false, "Show “Saved input audio” lines in the chat."),

  // Interruptions: what may cut the assistant off while it talks.
  flag(
    "PASEO_BARGE_STOP_WORDS_ONLY",
    "interrupt",
    true,
    "While the assistant talks, only a stop word, the drop word or its name cuts it off; 0 = any real words do.",
  ),
  flag(
    "PASEO_BARGE_SPEAKER_ANY_PHRASE",
    "interrupt",
    false,
    "When the phone plays the assistant on its loudspeaker, any real phrase cuts it too; 0 = only a stop word, the drop word or its name does there until its echo is removed from the mic. In headphones any real phrase cuts it either way.",
  ),
  flag(
    "PASEO_VOICE_MODES",
    "interrupt",
    false,
    "One table picks what cuts the assistant and when it may start, from where the phone plays it (loudspeaker or headphones) and the room (quiet, noisy, other voices); each value is a PASEO_MODE_* knob. 0 = the route rule and the room rule apart, as before.",
  ),
  ...modeKnobs(),
  flag(
    "PASEO_BARGE_ECHO_LETTERS",
    "filter",
    true,
    "Live text is the assistant's echo only when it is one stretch of the lines it was saying, letter by letter; 0 = the older check (half its words in any reply of the last 2 minutes), which also took the user's short answers for the assistant's echo.",
  ),
  flag(
    "PASEO_BARGE_HOLD",
    "interrupt",
    false,
    "Barge-in check: the user's voice during the assistant's reply is transcribed at once and may stop it.",
  ),
  {
    key: "PASEO_FAST_FRONT",
    group: "speech",
    kind: "choice",
    default: "off",
    choices: ["off", "shadow", "on"],
    meaning:
      "Fast front (Claude Haiku): on = it answers the user's phrase at once with one short line in the assistant's voice; shadow = only logs what it would say.",
    applies: "now",
    scope: "setup",
  },
  flag(
    "PASEO_FAST_FRONT_FACTS",
    "speech",
    true,
    "Fast front knows the assistant's work: the helper agents running now and its live page, so it answers “what's up”, “how many agents”, “what's done” itself.",
  ),
  {
    key: "PASEO_VISUAL_FRONT",
    group: "speech",
    kind: "choice",
    default: "off",
    choices: ["off", "shadow", "on"],
    meaning:
      "Visual front (Claude Haiku): on = every phrase of the user's and every reply of the assistant's draws a scene in the Show tab “Now”; shadow = only logs the scene and its latency.",
    applies: "now",
    scope: "setup",
  },
  {
    key: "PASEO_BARGE_MODE",
    group: "interrupt",
    kind: "choice",
    default: "stop",
    choices: ["stop", "hold"],
    meaning: "stop = an interruption cuts the rest of the reply; hold = it pauses and resumes.",
    applies: "now",
    scope: "setup",
  },
  num(
    "PASEO_BARGE_HOLD_START_MS",
    "interrupt",
    1500,
    [50, 10_000],
    "Hold mode: the user's loud voice this long pauses the assistant's reply.",
  ),
  num(
    "PASEO_BARGE_HOLD_VERIFY_MS",
    "interrupt",
    1000,
    [50, 10_000],
    "The user's voice this long before the quick check of the user's words starts.",
  ),
  num(
    "PASEO_BARGE_HOLD_RELEASE_MS",
    "interrupt",
    600,
    [50, 30_000],
    "Hold mode: the user's silence this long resumes a paused reply.",
  ),
  num(
    "PASEO_BARGE_HOLD_MAX_MS",
    "interrupt",
    60_000,
    [1000, MS_MAX],
    "Longest pause of a reply before it goes on by itself.",
  ),
  num(
    "PASEO_BARGE_HOLD_STICKY_MAX_MS",
    "interrupt",
    60_000,
    [1000, MS_MAX],
    "After a stop word the assistant stays quiet until a continue word or this long.",
  ),
  num("PASEO_BARGE_HOLD_MAX_PER_REPLY", "interrupt", 6, [1, 100], "Most pauses in one reply."),
  num(
    "PASEO_BARGE_HOLD_MIN_RMS",
    "interrupt",
    50,
    [0, 5000],
    "Only voice this loud (int16 rms; 50 = -56 dBFS) counts as the user talking over the assistant; raise it if its own echo cuts it.",
  ),
  num(
    "PASEO_BARGE_HOLD_STT_TIMEOUT_MS",
    "interrupt",
    3000,
    [100, 30_000],
    "Longest wait for the quick check's transcript.",
  ),
  {
    key: "PASEO_BARGE_HOLD_VOICE_CHECK",
    group: "interrupt",
    kind: "choice",
    default: "off",
    choices: ["off", "log", "1"],
    meaning:
      "Voice-print check of the barge-in: log = only log scores, 1 = veto a voice closer to the assistant's.",
    applies: "now",
    scope: "setup",
  },
  num(
    "PASEO_BARGE_HOLD_VOICE_MARGIN",
    "interrupt",
    0.15,
    [0, 1],
    "How much closer to the assistant's voice than to the user's a sound must be for that veto.",
  ),
  num(
    "PASEO_BARGE_OWNER_MIN",
    "interrupt",
    0.14,
    [-1, 1],
    "Words whose voice-print score is below this never cut the assistant (not the user's voice); its name skips it.",
  ),
  flag(
    "PASEO_BARGE_PARTIAL",
    "interrupt",
    true,
    "Live partial text may stop the assistant before the user's phrase ends.",
  ),
  num(
    "PASEO_BARGE_PARTIAL_MIN_WORDS",
    "interrupt",
    2,
    [1, 20],
    "Words a partial needs before it may stop the assistant.",
  ),
  {
    key: "PASEO_BARGE_STOP_RE",
    group: "interrupt",
    kind: "regex",
    default: defaultBargeStopPattern(),
    meaning:
      "While the assistant works, a phrase matching this cuts the reply playing (stop mode).",
    applies: "now",
    // Free text the user edits: it may hold names (the assistant's, the people's around the user).
    scope: "personal",
  },
  flag(
    "PASEO_STICKY_DROP_ON_SPEECH",
    "interrupt",
    true,
    "A real phrase after a stop word drops the paused rest of the assistant's reply.",
  ),
  flag(
    "PASEO_VOICE_BARGE_IN_ON_VAD",
    "interrupt",
    false,
    "Any detected speech interrupts the assistant at once (upstream behaviour).",
  ),
  flag(
    "PASEO_VOICE_BUSY_STEER",
    "interrupt",
    false,
    "A phrase while the assistant works is steered into its turn instead of cancelling it.",
  ),
  flag(
    "PASEO_VOICE_COMPACT_HOLD",
    "interrupt",
    true,
    "While the assistant compacts its memory, the user's phrases wait and reach it as one message when it ends; nothing cuts the compaction, and the fast front says the assistant is compacting.",
  ),
  num(
    "PASEO_VOICE_COMPACT_HOLD_MAX_MS",
    "interrupt",
    600_000,
    [10_000, MS_MAX],
    "Longest wait for a compaction to end before the held phrases go anyway.",
  ),
  flag(
    "PASEO_VOICE_FOREIGN_QUEUE",
    "interrupt",
    true,
    "While the assistant works, a phrase the voice print calls another voice waits and reaches it with the next delivery instead of cutting its turn.",
  ),
  num(
    "PASEO_VOICE_FOREIGN_STEER_SCORE",
    "interrupt",
    0.15,
    [-1, 1],
    "Such a phrase still goes to the assistant at once when its voice-print score is above this; stop words and its name always do.",
  ),

  // Phrase detection and turn timing: when the user's phrase starts, ends and reaches the
  // assistant.
  num(
    "PASEO_VAD_SILENCE_MS",
    "phrase",
    1000,
    [100, 10_000],
    "The user's silence this long ends a phrase.",
  ),
  num("PASEO_VAD_CONFIRM_MS", "phrase", 300, [32, 5000], "Voice this long opens a phrase."),
  num(
    "PASEO_VAD_CONFIRM_GAP_MS",
    "phrase",
    300,
    [0, 5000],
    "Pauses this long inside an opening phrase are tolerated (0 = unbroken voice).",
  ),
  num(
    "PASEO_VAD_THRESHOLD",
    "phrase",
    0.5,
    [0.05, 0.99],
    "Speech detector threshold: lower catches whispers, and more of the assistant's own echo.",
    "next-voice-session",
  ),
  num(
    "PASEO_VAD_MIN_RMS",
    "phrase",
    0,
    [0, 5000],
    "Sound quieter than this (int16 rms) never opens a phrase (0 = off).",
  ),
  num(
    "PASEO_VAD_LEVEL_HANGOVER_MS",
    "phrase",
    300,
    [0, 5000],
    "After a loud enough window, quieter windows count as speech this long.",
  ),
  num(
    "PASEO_MIC_GAP_END_MS",
    "phrase",
    900,
    [0, 10_000],
    "No microphone audio this long ends a phrase (the user muted the mic; 0 = off).",
  ),
  num(
    "PASEO_VOICE_MONOLOGUE_GAP_MS",
    "phrase",
    1200,
    [0, 30_000],
    "After the user's last phrase is transcribed, the assistant waits this long for more before it goes to it.",
  ),
  num(
    "PASEO_VOICE_MONOLOGUE_MAX_WAIT_MS",
    "phrase",
    20_000,
    [1000, 120_000],
    "Longest wait for a phrase's transcript before the monologue goes anyway.",
  ),
  {
    key: "PASEO_FAST_FRONT_STREAM",
    group: "phrase",
    kind: "choice",
    default: "off",
    choices: ["off", "on"],
    meaning:
      "The user's live words go to the fast front as they speak; with the front on, it decides when the user's thought is finished and goes to the assistant (no silence gap, no wait for the model); with shadow, it only logs.",
    applies: "now",
    scope: "setup",
  },
  num(
    "PASEO_FAST_FRONT_STREAM_HOLD_MS",
    "phrase",
    5000,
    [0, 60_000],
    "Stream: when the front judges the user's thought unfinished, it waits this long for more words before it goes to the assistant anyway.",
  ),
  num(
    "PASEO_FAST_FRONT_STREAM_MAX_WAIT_MS",
    "phrase",
    5000,
    [500, 30_000],
    "Stream: longest wait for the front's verdict after the user stopped before the user's thought goes anyway.",
  ),
  num(
    "PASEO_FAST_FRONT_STREAM_MIN_WORDS",
    "phrase",
    2,
    [1, 20],
    "Stream: the user's live words are asked about once there are at least this many.",
  ),
  flag(
    "PASEO_FAST_FRONT_CUT",
    "interrupt",
    false,
    "The fast front may cut the assistant's reply to acknowledge a new item the user said (“noted: …”); the assistant then re-plans.",
  ),
  flag(
    "PASEO_VOICE_SITUATION",
    "phrase",
    false,
    "Every message to the assistant ends with a situation tag: noise nearby (room level), other voices nearby; always on while the stream is on.",
  ),
  num(
    "PASEO_CHUNK_MS",
    "phrase",
    30_000,
    [0, MS_MAX],
    "A long monologue ends at the next pause after this long.",
  ),
  num(
    "PASEO_CHUNK_PAUSE_MS",
    "phrase",
    250,
    [0, 10_000],
    "The pause that ends such a long monologue.",
  ),
  num(
    "PASEO_CHUNK_MAX_MS",
    "phrase",
    45_000,
    [0, MS_MAX],
    "A monologue ends this long after it began, pause or not.",
  ),
  num(
    "PASEO_STT_PRE_ROLL_MS",
    "phrase",
    1500,
    [0, 5000],
    "Audio from before the phrase opened that goes to the recogniser (the user's first word).",
  ),
  num(
    "PASEO_STT_SECOND_PASS_TAIL_MS",
    "phrase",
    300,
    [0, 5000],
    "An empty phrase is heard once more, with this much audio past its end (0 = off).",
  ),
  num(
    "PASEO_VOICE_FAST_REPLY_TIMEOUT_MS",
    "phrase",
    2500,
    [100, 30_000],
    "Longest wait for the quick acknowledgement model.",
  ),
  num(
    "PASEO_VOICE_HEARD_MARGIN_MS",
    "phrase",
    2000,
    [0, 30_000],
    "A cut reply counts as heard up to this long before the user's speech or the cut.",
  ),

  // Filters: whose phrase it is, and what is the assistant's own echo.
  num(
    "PASEO_SPEAKER_THRESHOLD",
    "filter",
    0.35,
    [-1, 1],
    "Voice-print score a phrase needs to count as the user's; set here, it wins over the speaker/threshold file.",
  ),
  flag(
    "PASEO_SPEAKER_GATE_ADVISORY",
    "filter",
    false,
    "The voice print only reports; every phrase is delivered.",
  ),
  num(
    "PASEO_SHORT_PHRASE_MS",
    "filter",
    3000,
    [0, 10_000],
    "Phrases shorter than this skip the voice print and reach the assistant with a note (0 = off).",
  ),
  num(
    "PASEO_SHORT_PHRASE_QUIET_DB",
    "filter",
    -45,
    [-90, 0],
    "A room floor quieter than this (dBFS) reads as quiet in that note.",
  ),
  num(
    "PASEO_ECHO_RECENT_MS",
    "filter",
    0,
    [0, MS_MAX],
    "> 0: the echo check compares with everything the assistant said in this window, not only the reply playing.",
  ),
  num(
    "PASEO_ECHO_DROP_SCORE",
    "filter",
    -1,
    [-1, 1],
    "A phrase that is the assistant's line word for word and scores below this is dropped as its echo (-1 = off).",
  ),

  // Microphone gain before the detector and the recogniser.
  flag("PASEO_MIC_AGC", "mic", true, "Automatic microphone gain for the user's voice."),
  flag(
    "PASEO_ECHO_CANCEL",
    "mic",
    false,
    "Take the assistant's own voice out of the mic audio on the host (the engine below, with its reply moved to where its echo is measured as the reference) before the detector, the recogniser and the voice print.",
  ),
  {
    key: "PASEO_ECHO_CANCEL_ENGINE",
    group: "mic",
    kind: "choice",
    default: "speex",
    choices: ["speex", "aec3"],
    meaning:
      "Which echo canceller PASEO_ECHO_CANCEL runs: speex (speexdsp as WASM; keeps more of the user's voice while the assistant talks) or aec3 (WebRTC AEC3 through LiveKit's bindings; removes more of its echo).",
    applies: "now",
    scope: "setup",
  },
  flag(
    "PASEO_RAW_RECORD_REPLY",
    "mic",
    false,
    "Next to every raw mic recording, also save the assistant's reply as the phone played it, on the mic's clock (<name>_reply.wav), to measure echo cancelling offline.",
  ),
  num(
    "PASEO_MIC_AGC_TARGET_DB",
    "mic",
    -20,
    [-60, 0],
    "Level the user's voice is brought to, dBFS.",
  ),
  num("PASEO_MIC_AGC_MAX_GAIN_DB", "mic", 20, [0, 40], "Most gain the microphone gets, dB."),
  flag(
    "PASEO_MODULES",
    "modules",
    false,
    "The module kernel (modules/kernel.ts): the versions, shadows and settings in the file's `modules` section take effect, a switch waits for the end of the user's phrase, and a version that throws or is slow is switched back. 0 = every module runs its built-in version.",
  ),
  num(
    "PASEO_MODULES_MAX_MS",
    "modules",
    5,
    [0.5, 1000],
    "Longest one decision of a loaded module version may take, ms; slower once and it is switched back to the last good version (a shadow is dropped).",
  ),
];

const KNOBS_BY_KEY = new Map(VOICE_KNOBS.map((knob) => [knob.key, knob]));

/** Short names for the tool: "volume" is PASEO_TTS_GAIN_DB. */
const ALIASES: Record<string, string> = {
  VOLUME: "PASEO_TTS_GAIN_DB",
  GAIN: "PASEO_TTS_GAIN_DB",
  SPEED: "PASEO_TTS_SPEED",
};

/** The knob for a key: exact env name, without the PASEO_ prefix, any case, or an alias. */
export function findVoiceKnob(name: string): VoiceKnob | null {
  const upper = name
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  const key = ALIASES[upper] ?? (upper.startsWith("PASEO_") ? upper : `PASEO_${upper}`);
  return KNOBS_BY_KEY.get(key) ?? null;
}

export type KnobValueCheck = { ok: true; value: string } | { ok: false; reason: string };

function regexError(source: string): string | null {
  try {
    RegExp(source, "iu");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "invalid regex";
  }
}

/** A value from the file or the tool as the env string its reader expects, or why it is wrong. */
export function checkVoiceKnobValue(knob: VoiceKnob, value: unknown): KnobValueCheck {
  switch (knob.kind) {
    case "flag": {
      const text = String(value).trim().toLowerCase();
      if (value === true || ["1", "true", "on", "yes"].includes(text)) {
        return { ok: true, value: "1" };
      }
      if (value === false || ["0", "false", "off", "no"].includes(text)) {
        return { ok: true, value: "0" };
      }
      return { ok: false, reason: "expected on/off (true, false, 1 or 0)" };
    }
    case "number": {
      const blank = typeof value === "string" && value.trim() === "";
      const n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
      if (blank || !Number.isFinite(n)) {
        return { ok: false, reason: "expected a number" };
      }
      if (n < knob.min || n > knob.max) {
        return { ok: false, reason: `out of range ${knob.min}…${knob.max}` };
      }
      return { ok: true, value: String(n) };
    }
    case "choice": {
      const text = String(value).trim().toLowerCase();
      return knob.choices.includes(text)
        ? { ok: true, value: text }
        : { ok: false, reason: `expected one of ${knob.choices.join(", ")}` };
    }
    case "regex": {
      if (typeof value !== "string") {
        return { ok: false, reason: "expected a regular expression as a string" };
      }
      const error = regexError(value);
      return error ? { ok: false, reason: error } : { ok: true, value };
    }
  }
}

/** The knob's default as an env string. */
export function voiceKnobDefault(knob: VoiceKnob): string {
  if (knob.kind === "flag") {
    return knob.default ? "1" : "0";
  }
  return String(knob.default);
}
