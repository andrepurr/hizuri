import type { AgentPermissionRequest } from "./agent/agent-sdk-types.js";
import { getToolLeafName, isSpeakToolName } from "@getpaseo/protocol/tool-name-normalization";

/**
 * Voice assistant policy: allow the speak tool, its signature tool mark_phrases (phrase graph),
 * and Claude Code's ToolSearch, which only loads tool definitions. Claude Code defers MCP tools,
 * so speak cannot be called until ToolSearch has loaded it; without this the voice agent answered
 * only in text.
 */
export function isVoicePermissionAllowed(request: AgentPermissionRequest): boolean {
  if (request.kind !== "tool") {
    return false;
  }

  const normalizedName = request.name.trim().toLowerCase();
  if (!normalizedName) {
    return false;
  }

  return (
    isSpeakToolName(normalizedName) ||
    getToolLeafName(normalizedName) === "mark_phrases" ||
    normalizedName === "toolsearch"
  );
}
