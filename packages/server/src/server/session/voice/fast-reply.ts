// Hizuri: the fast brain. People start answering at once and think while they talk; Zuri (the
// agent) needs 8-15 s before it speaks. A small local model answers in about a second with one
// short spoken reaction that shows it heard what the user said, while the agent thinks the full
// answer. Off unless PASEO_VOICE_FAST_REPLY_URL points at an OpenAI-compatible chat server
// (llama-server). The agent is told what was already said, so it does not repeat it.

import type pino from "pino";

import { envPositive } from "../../voice-env.js";
import { en } from "../../voice-language/en.js";
import { anyOf } from "../../voice-language/languages.js";
import { assistantName } from "../../voice-language/assistant-name.js";
import type { VoiceLanguage } from "../../voice-language/types.js";

export interface FastReplyConfig {
  /** OpenAI-compatible base URL ending in /v1. */
  baseUrl: string;
  model: string;
  /** No reaction after this long: the agent's answer is close anyway. */
  timeoutMs: number;
}

export interface FastReplyInput {
  /** The user's words, the whole monologue. */
  said: string;
  /** What Zuri said last, for context. */
  lastReply?: string | null;
  /** Rotates the acknowledgement words so the assistant does not say the same line every time. */
  turn?: number;
  /** The language the user speaks: the examples and the spoken line are in it. */
  language?: VoiceLanguage;
}

// The model only labels what the user said; the spoken line is built here, so the fast brain can
// never state a fact, promise a result or claim work it has not done (road test: a free-form reply
// said "I tested it, of course" to "did you test it?").
/**
 * The labelling prompt and its examples. PASEO_USER_NAME is who talks, PASEO_OTHER_PEOPLE the names
 * of the people around the user (comma-separated, as said); both come from the user's profile.
 */
export function fastReplyMessages(
  env: NodeJS.ProcessEnv = process.env,
  language: VoiceLanguage = en,
): { role: "system" | "user" | "assistant"; content: string }[] {
  const user = env.PASEO_USER_NAME?.trim() || "the user";
  const others = (env.PASEO_OTHER_PEOPLE ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const system = [
    `Label what ${user} just said to ${assistantName(undefined, env)}, their voice assistant. Output exactly one of:`,
    `SKIP - noise, a cut-off fragment, or words said to another person${others.length ? ` (the user names them: ${others.join(", ")})` : ""};`,
    "HERE - the user only calls the assistant or checks that it hears them;",
    "REPEAT - the user asks the assistant to repeat;",
    "a topic - 1 to 5 words from the user's own words, nominative case, lowercase, no verbs if possible.",
    "Output only the label.",
  ].join("\n");
  const examples = language.fastReplyExamples(others[0], assistantName(language, env));
  return [
    { role: "system", content: system },
    ...examples.flatMap(([said, label]) => [
      { role: "user" as const, content: said },
      { role: "assistant" as const, content: label },
    ]),
  ];
}

const MAX_TOPIC_WORDS = 5;
const FIRST_PERSON = new RegExp(`(^|\\s)${anyOf((language) => language.firstPerson)}(\\s|$)`, "iu");

export function fastReplyConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): FastReplyConfig | null {
  const baseUrl = env.PASEO_VOICE_FAST_REPLY_URL?.trim();
  if (!baseUrl) {
    return null;
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: env.PASEO_VOICE_FAST_REPLY_MODEL?.trim() || "fast-reply",
    timeoutMs: envPositive("PASEO_VOICE_FAST_REPLY_TIMEOUT_MS", 2500, env),
  };
}

/** The spoken line for the model's label, or null for SKIP, junk or anything off-format. */
export function composeFastReply(
  rawLabel: string,
  turn = 0,
  language: VoiceLanguage = en,
): string | null {
  const label = rawLabel
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim()
    .split("\n")[0]
    ?.replace(/^["«»“”'\s-]+|["«»“”'.!?\s]+$/g, "")
    .trim();
  if (!label || /^skip/i.test(label)) {
    return null;
  }
  if (/^here$/i.test(label)) {
    return language.fastReplyHere;
  }
  if (/^repeat$/i.test(label)) {
    return language.fastReplyRepeat;
  }
  const topic = label.replace(language.topicPrefix, "");
  const words = topic.split(/\s+/).filter(Boolean).length;
  // A topic is a bare phrase: a sentence ("I tested it, of course") is the model talking.
  const sentence = /[,.!?;:]/.test(topic) || FIRST_PERSON.test(topic);
  if (!/\p{L}/u.test(topic) || /^[A-Z_]+$/.test(topic) || sentence || words > MAX_TOPIC_WORDS) {
    return null;
  }
  const acks = language.fastReplyAcks;
  const tails = language.fastReplyTails;
  const ack = acks[turn % acks.length];
  const tail = tails[Math.floor(turn / acks.length) % tails.length];
  return `${ack}: ${topic.toLowerCase()} — ${tail}`;
}

export async function fastReply(
  config: FastReplyConfig,
  input: FastReplyInput,
  logger: pino.Logger,
): Promise<string | null> {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 24,
        messages: [
          ...fastReplyMessages(process.env, input.language),
          // Only the user's last words: prompt processing on four efficiency cores runs ~25
          // tokens/s.
          { role: "user", content: input.said.slice(-200) },
        ],
      }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "voice.fast_reply_failed");
      return null;
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const label = body.choices?.[0]?.message?.content ?? "";
    const reply = composeFastReply(label, input.turn ?? 0, input.language);
    logger.info({ label, reply, ms: Date.now() - startedAt }, "voice.fast_reply");
    return reply;
  } catch (error) {
    logger.warn({ err: String(error), ms: Date.now() - startedAt }, "voice.fast_reply_failed");
    return null;
  }
}
