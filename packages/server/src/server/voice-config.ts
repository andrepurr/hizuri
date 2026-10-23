const VOICE_PROMPT_BLOCK_START = "<paseo_voice_mode>";
const VOICE_PROMPT_BLOCK_END = "</paseo_voice_mode>";

const VOICE_AGENT_SYSTEM_INSTRUCTION = [
  "Paseo voice mode is now on.",
  "You are the Paseo voice assistant.",
  "The user cannot see your chat messages or tool calls.",
  "Always use the speak tool for all user-facing communication.",
  "A fast front may already have acknowledged the phrase aloud; then do not acknowledge it again: speak results and real questions only.",
  "For long-running work, use speak to provide progress updates before and during execution.",
  "Treat the user input as transcribed speech.",
  "When the user mentions a task, follow your own rules on whether to ask before acting.",
  "If the transcription seems incomplete, cut off, ambiguous, or may contain a non-obvious mistake or misspelling, ask a clarifying question via speak before taking action.",
  "Use concise plain language suitable for speech output.",
].join(" ");

const VOICE_AGENT_DISABLED_INSTRUCTION = [
  "Paseo voice mode is now off.",
  "Ignore any earlier Paseo voice mode instructions in this thread.",
].join(" ");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeVoicePromptBlockRegex(): RegExp {
  return new RegExp(
    `${escapeRegExp(VOICE_PROMPT_BLOCK_START)}[\\s\\S]*?${escapeRegExp(VOICE_PROMPT_BLOCK_END)}`,
    "g",
  );
}

export function stripVoiceModeSystemPrompt(existing?: string): string | undefined {
  const trimmed = existing?.trim();
  if (!trimmed) {
    return undefined;
  }
  const stripped = trimmed.replace(makeVoicePromptBlockRegex(), "").trim();
  return stripped.length > 0 ? stripped : undefined;
}

export function buildVoiceModeSystemPrompt(existing: string | undefined, enabled: boolean): string {
  const basePrompt = stripVoiceModeSystemPrompt(existing);
  const voiceInstruction = enabled
    ? VOICE_AGENT_SYSTEM_INSTRUCTION
    : VOICE_AGENT_DISABLED_INSTRUCTION;
  const voiceBlock = [VOICE_PROMPT_BLOCK_START, voiceInstruction, VOICE_PROMPT_BLOCK_END].join(
    "\n",
  );

  return [basePrompt, voiceBlock]
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    .join("\n\n");
}

/** Hizuri (phrase graph): the phrase id Zuri signs for, and where it stands in the user's order. */
export interface SpokenInputMeta {
  id: string;
  /** Every phrase id in a monologue sent as one message. */
  parts?: string[];
  /** It reached the assistant after `saidBefore`, which the user started saying later. */
  late?: boolean;
  saidBefore?: string;
  /**
   * Hizuri (drafts): the recogniser's accurate text of a phrase that reached the assistant before
   * as a quick draft. An empty id = no phrase graph.
   */
  correction?: boolean;
  /** Hizuri: a part carries a short-phrase note (session/voice/short-phrase.ts). */
  short?: boolean;
}

function wrapSpokenCorrection(text: string, id: string): string {
  const which = id ? id : "the user's previous phrase";
  return `<spoken-input${id ? ` id="${id}"` : ""} correction="true">\n${text}\n</spoken-input>\n<instruction>The speech recogniser's accurate text of ${which}, which reached you before as a quick draft. If it changes what the user meant, act on this text; if not, carry on and do not answer it again.${id ? ` ${id} needs no second sign.` : ""}</instruction>`;
}

/**
 * How the assistant closes a phrase. Speaking never closes one by itself: a reply that says "on it"
 * used to close a task nobody wrote down.
 */
function signInstruction(id: string): string {
  return `Sign for ${id} with mark_phrases: answered when it asks something (and put ${id} in speak's replyTo), task or correction with the task's id in the note, recorded, thinking, or not-for-me.`;
}

/** The first words of the instruction on a typed message: the app shows it without a voice mark. */
export const TYPED_INPUT_INSTRUCTION = "The user typed this message in the chat.";

/**
 * Hizuri (phrase graph): a message the user typed gets a phrase id like a spoken one, in the same
 * envelope, so the assistant signs for it and nothing the user types goes untracked.
 */
export function wrapTypedInput(text: string, id: string): string {
  return `<spoken-input id="${id}">\n${text}\n</spoken-input>\n<instruction>${TYPED_INPUT_INSTRUCTION} ${signInstruction(id)}</instruction>`;
}

export function wrapSpokenInput(text: string, meta?: SpokenInputMeta): string {
  if (meta?.correction) {
    return wrapSpokenCorrection(text, meta.id);
  }
  const attrs = meta
    ? [
        ` id="${meta.id}"`,
        meta.parts && meta.parts.length > 1 ? ` parts="${meta.parts.join(" ")}"` : "",
        meta.late && meta.saidBefore ? ` late="true" said-before="${meta.saidBefore}"` : "",
      ].join("")
    : "";
  const late =
    meta?.late && meta.saidBefore
      ? ` The user said this before ${meta.saidBefore}, which reached you first.`
      : "";
  const sign = meta ? ` ${signInstruction(meta.id)}` : "";
  const callName = process.env.PASEO_USER_CALL_NAME?.trim();
  const short = meta?.short
    ? ` A part marked [short phrase …] is too short for the voice print to tell whether the user said it: if it fits the conversation, it is the user's; if it clearly does not, ignore it silently and sign it not-for-me with mark_phrases; if unsure, ask in the user's language whether it was them${callName ? ` (call them ${callName})` : ""}.`
    : "";
  return `<spoken-input${attrs}>\n${text}\n</spoken-input>\n<instruction>This message was spoken by the user. Respond using the speak tool only, not normal messages, because the user may not be looking at the chat.${late}${sign}${short}</instruction>`;
}

export function buildVoiceAgentMcpServerConfig(params: {
  command: string;
  baseArgs: string[];
  socketPath: string;
  env?: Record<string, string>;
}): {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
} {
  return {
    type: "stdio",
    command: params.command,
    args: [...params.baseArgs, "--socket", params.socketPath],
    ...(params.env ? { env: params.env } : {}),
  };
}
