import type { PaseoToolContext, PaseoToolEntry } from "./catalog.js";

/**
 * Hizuri's own Paseo MCP tools (Show, the stage, media, the tool hub, the vault, voice), in the
 * same shape as Paseo's catalog: a fixed verb-first label and the context shown after it.
 */

function first(...keys: string[]): PaseoToolContext {
  return (input) =>
    keys
      .map((key) => input[key])
      .find((value) => typeof value === "string" && value.trim().length > 0);
}

export const HIZURI_TOOL_CATALOG = {
  // Show
  show_stat: { label: "Show stat", context: first("title", "label") },
  show_progress: { label: "Show progress", context: first("title", "label") },
  show_card: { label: "Show card", context: first("title") },
  show_table: { label: "Show table", context: first("title") },
  show_chart: { label: "Show chart", context: first("title") },
  show_window: { label: "Show window", context: first("title", "url") },
  show_page: { label: "Show page", context: first("title", "url") },
  show_limits: { label: "Show limits" },
  show_screen: { label: "Show screen", context: first("url") },
  show_file: { label: "Show file", context: first("path", "title") },
  show_media: { label: "Play media", context: first("title", "url", "query") },
  media_control: { label: "Control media", context: first("action") },
  get_usage: { label: "Read usage" },
  // Stage
  stage_open: { label: "Open stage tab", context: first("title", "kind") },
  stage_update: { label: "Update stage tab", context: first("title", "tabId") },
  stage_close: { label: "Close stage tab", context: first("tabId") },
  stage_focus: { label: "Focus stage tab", context: first("tabId") },
  stage_list: { label: "List stage tabs" },
  stage_blocks: { label: "Read stage blocks", context: first("tabId") },
  stage_perch: { label: "Perch stage tab", context: first("tabId") },
  stage_restore: { label: "Restore stage tab", context: first("tabId") },
  stage_settings: { label: "Change stage settings" },
  // Tool hub
  hub_find: { label: "Find tools", context: first("query", "task") },
  hub_add: { label: "Install tool", context: first("name", "id") },
  hub_call: { label: "Call tool", context: first("tool", "name") },
  hub_review: { label: "Review tool", context: first("tool", "name") },
  hub_reviews: { label: "Read tool reviews", context: first("tool", "name") },
  // Vault
  secret_request: { label: "Ask for secret", context: first("name", "title") },
  secret_use: { label: "Use secret", context: first("name") },
  secret_list: { label: "List secrets" },
  secret_forget: { label: "Forget secret", context: first("name") },
  // Voice and model
  voice_settings: { label: "Change voice settings" },
  set_my_model: { label: "Switch model", context: first("model", "provider") },
} satisfies Record<string, PaseoToolEntry>;
