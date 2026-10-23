import type { TimelineItemTransform } from "@/plugins/timeline/model";
import { projectPluginTimelineItems } from "@/plugins/timeline/projection";
import {
  prepareToolCallHistory,
  projectToolCallDetailLevel,
  type PreparedToolCallHistory,
  type ToolCallDetailLevel,
} from "@/tool-calls/detail-level/projection";
import type { StreamItem, UserMessageItem } from "@/types/stream";

interface PresentationInput {
  tail: StreamItem[];
  head: StreamItem[];
  transform: TimelineItemTransform | undefined;
  level: ToolCallDetailLevel;
  isTurnActive: boolean;
}

/** Find and scrolling address a plugin row by the source it replaces. */
export function getStreamItemMessageId(item: StreamItem): string {
  if (item.kind === "plugin") return item.sourceId ?? item.id;
  return item.id;
}

// The daemon's voice envelope (packages/server/src/server/voice-config.ts `wrapSpokenInput`):
// optional attributes (id, parts, late, said-before, correction), the user's words, then the
// instruction for the agent.
const SPOKEN_INPUT_ENVELOPE =
  /^\s*<spoken-input((?:\s+[a-z-]+="[^"]*")*)\s*>([\s\S]*?)<\/spoken-input>(?:\s*<instruction>([\s\S]*?)<\/instruction>)?\s*$/;
const SPOKEN_INPUT_INSTRUCTIONS = [
  "This message was spoken by the user.",
  "The speech recogniser's accurate text of",
];
// A typed message in the same envelope (server `wrapTypedInput`): its id only, no voice mark.
const TYPED_INPUT_INSTRUCTION = "The user typed this message in the chat.";

// After each short part of a monologue, on the same line (server `shortPhraseNote`).
const SHORT_PHRASE_NOTE = /\s*\[short phrase [^\]]*— judge by context\]/g;

/**
 * The daemon appends notes for the agent after the user's words, each a bracketed paragraph (“[The
 * user interrupted you while you were saying: …]”, “[Your quick voice already said aloud: …]”).
 * Speech transcripts carry no blank lines, so a trailing `\n\n[…]` is always such a note.
 */
function stripAgentNotes(words: string): string {
  let text = words.replace(SHORT_PHRASE_NOTE, "").trim();
  for (;;) {
    const start = text.lastIndexOf("\n\n[");
    if (start < 0 || !text.endsWith("]")) return text;
    text = text.slice(0, start).trimEnd();
  }
}

function parseSpokenInput(
  text: string,
): (Pick<UserMessageItem, "text"> & Partial<Pick<UserMessageItem, "spoken">>) | null {
  const envelope = SPOKEN_INPUT_ENVELOPE.exec(text);
  if (!envelope) return null;
  const [, attributes = "", words = "", instruction] = envelope;
  // Leave quoted examples and unrelated XML untouched: the instruction must be one the daemon
  // writes, unless the tag carries the daemon's phrase id.
  const isDaemonInstruction =
    instruction === undefined ||
    /\sid="[^"]*"/.test(attributes) ||
    SPOKEN_INPUT_INSTRUCTIONS.some((prefix) => instruction.trimStart().startsWith(prefix));
  if (!isDaemonInstruction) return null;
  if (instruction?.trimStart().startsWith(TYPED_INPUT_INSTRUCTION)) {
    return { text: words.trim() };
  }
  return {
    text: stripAgentNotes(words),
    spoken: /\scorrection="true"/.test(attributes) ? "correction" : "phrase",
  };
}

/** The text is the user's speech in the daemon's voice envelope (a typed message is not). */
export function isSpokenInput(text: string): boolean {
  return parseSpokenInput(text)?.spoken !== undefined;
}

/** Source messages reach plugins before display projection. */
export function createStreamPresentation() {
  const userMessageCache = new WeakMap<UserMessageItem, UserMessageItem>();

  function presentUserMessage(item: UserMessageItem): UserMessageItem {
    const cached = userMessageCache.get(item);
    if (cached) return cached;

    // Hizuri: the user sees only their words, marked as speech; the agent still got the whole text.
    const spokenInput = parseSpokenInput(item.text);
    const projected = spokenInput ? { ...item, ...spokenInput } : item;
    userMessageCache.set(item, projected);
    return projected;
  }

  let historySource: StreamItem[] | undefined;
  let historyTransform: TimelineItemTransform | undefined;
  let historyRows: StreamItem[] = [];
  let preparedTail: StreamItem[] | undefined;
  let preparedLevel: ToolCallDetailLevel | undefined;
  let preparedHistory: PreparedToolCallHistory | null = null;

  function presentRows(item: StreamItem): StreamItem[] {
    return [item.kind === "user_message" ? presentUserMessage(item) : item];
  }

  return (input: PresentationInput) => {
    // Retained history is not reprojected or regrouped on each live text update.
    if (historySource !== input.tail || historyTransform !== input.transform) {
      historyRows = projectPluginTimelineItems(input.tail, input.transform).flatMap<StreamItem>(
        (item) => presentRows(item),
      );
      historySource = input.tail;
      historyTransform = input.transform;
    }
    const head: StreamItem[] = [];
    for (const item of projectPluginTimelineItems(input.head, input.transform, "streaming")) {
      const blocks = presentRows(item);
      head.push(...blocks);
    }
    if (preparedTail !== historyRows || preparedLevel !== input.level) {
      preparedHistory = prepareToolCallHistory(input.level, historyRows);
      preparedTail = historyRows;
      preparedLevel = input.level;
    }
    return projectToolCallDetailLevel({
      level: input.level,
      tail: historyRows,
      head,
      preparedHistory,
      isTurnActive: input.isTurnActive,
    });
  };
}
