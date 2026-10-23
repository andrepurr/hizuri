// Hizuri: Zuri's status line for the fast front (fast-front.ts). Code, not a model, turns the
// timeline (tool calls and task list) into one plain line, so the front can say what Zuri is doing
// without inventing it. The front says it in the user's language. First person: the front is Zuri,
// and a third-person line made it talk about Zuri by name.

import path from "node:path";

import type { AgentTimelineItem, ToolCallTimelineItem } from "../../agent/agent-sdk-types.js";

/** The assistant's own voice tools say nothing about its work. */
const VOICE_TOOLS = /(^|__)(speak|mark_phrases|voice_settings)$/;
const MAX_QUOTE = 60;

function quote(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return `“${clean.length > MAX_QUOTE ? `${clean.slice(0, MAX_QUOTE - 1)}…` : clean}”`;
}

function file(filePath: string): string {
  return path.basename(filePath);
}

/** What one tool call does, in a few words, in the assistant's own voice ("editing…"). */
export function describeToolCall(call: ToolCallTimelineItem): string {
  const detail = call.detail;
  switch (detail.type) {
    case "shell":
      return `running the command ${quote(detail.command)}`;
    case "read":
      return `reading ${file(detail.filePath)}`;
    case "edit":
    case "write":
      return `editing ${file(detail.filePath)}`;
    case "search":
      return detail.toolName === "web_search"
        ? `searching the web for ${quote(detail.query)}`
        : `searching the files for ${quote(detail.query)}`;
    case "fetch":
      return `reading the page ${hostOf(detail.url)}`;
    case "sub_agent":
      return `waiting for a helper agent${detail.description ? `: ${quote(detail.description)}` : ""}`;
    default: {
      const [, server, leaf] = /^mcp__([^_]+(?:[-_][^_]+)*)__(.+)$/.exec(call.name) ?? [];
      return server && leaf ? `working with ${server}: ${leaf}` : `working: ${call.name}`;
    }
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return quote(url);
  }
}

function isToolCall(item: AgentTimelineItem): item is ToolCallTimelineItem {
  return item.type === "tool_call";
}

export interface StatusLineOptions {
  /**
   * The assistant's task list from the timeline; off when the user's task board (front-facts.ts) says
   * what is in work. The Claude task list goes stale: a finished task can stay in_progress hours after
   * it is done, causing the front to say "one in progress" about it.
   */
  tasks?: boolean;
}

/**
 * One line: busy or free, the tool call now running (or the last one), and the task list.
 * `items` is the assistant's timeline, oldest first; only the tail is read.
 */
export function buildStatusLine(
  items: readonly AgentTimelineItem[],
  running: boolean,
  options: StatusLineOptions = {},
): string {
  const tail = items.slice(-80);
  const parts: string[] = [running ? "busy" : "free, waiting for you"];
  if (running) {
    const call = tail.filter(isToolCall).findLast((item) => !VOICE_TOOLS.test(item.name));
    if (call) {
      parts.push(`${call.status === "running" ? "now" : "just now"} ${describeToolCall(call)}`);
    }
  }
  const todo = options.tasks === false ? undefined : tail.findLast((item) => item.type === "todo");
  if (todo?.type === "todo" && todo.items.length > 0) {
    const done = todo.items.filter((task) => task.completed || task.status === "completed").length;
    const now = todo.items.find((task) => task.status === "in_progress");
    const next = todo.items.find((task) => !task.completed && task.status === "pending");
    const list = [`tasks: ${done} of ${todo.items.length} done`];
    if (now) {
      list.push(`in progress ${quote(now.activeForm ?? now.text)}`);
    }
    if (next) {
      list.push(`next ${quote(next.text)}`);
    }
    parts.push(list.join(", "));
  }
  return parts.join("; ");
}
