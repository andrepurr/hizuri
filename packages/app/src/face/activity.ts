import { isSpeakToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { StreamItem } from "@/types/stream";

// What Zuri is doing besides moving its lips, for the face page's body language (face.activity):
// listening while the user speaks, thinking once the user's phrase reached it, working while its
// tools run. The page shows speaking from the sound itself (face.voice), so "speaking" here only
// keeps the other states off while the assistant's voice plays.

export type FaceActivity = "idle" | "listening" | "thinking" | "working" | "speaking";

export interface FaceActivityInput {
  /** The user's speech is detected now (or was a moment ago: short pauses inside a phrase). */
  hearing: boolean;
  /** The assistant's voice is playing. */
  speaking: boolean;
  /**
   * The assistant's turn is open, or the voice runtime waits for its answer to the user's phrase.
   */
  answering: boolean;
  /** One of the assistant's tool calls other than speak is running. */
  toolRunning: boolean;
}

/** The user wins over the assistant: when the user talks the assistant listens, even mid-task. */
export function faceActivity(input: FaceActivityInput): FaceActivity {
  if (input.hearing) return "listening";
  if (input.speaking) return "speaking";
  if (input.answering) return input.toolRunning ? "working" : "thinking";
  return "idle";
}

/** How far back from the end of the assistant's stream a running tool call is looked for. */
const RUNNING_TOOL_SCAN = 60;

/**
 * True while one of the assistant's tool calls other than speak is running: Bash, edits, reads,
 * agents. Only the recent tail is scanned, and only until the user's last message: the calls of an
 * earlier turn are never "running" any more.
 */
export function selectToolRunning(
  session: { agentStreamTail: Map<string, StreamItem[]> } | undefined,
  agentId: string,
): boolean {
  const items = session?.agentStreamTail.get(agentId);
  if (!items) return false;
  const stop = Math.max(0, items.length - RUNNING_TOOL_SCAN);
  for (let index = items.length - 1; index >= stop; index -= 1) {
    const item = items[index];
    if (item.kind === "user_message") return false;
    if (item.kind !== "tool_call") continue;
    const { payload } = item;
    if (payload.source === "orchestrator") {
      if (payload.data.status === "executing") return true;
      continue;
    }
    if (payload.data.status === "running" && !isSpeakToolName(payload.data.name)) return true;
  }
  return false;
}
