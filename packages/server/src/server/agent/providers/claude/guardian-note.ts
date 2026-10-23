import { randomUUID } from "node:crypto";
import type { PluginTimelineItem } from "../../agent-sdk-types.js";

/**
 * Guardian notes: one-line rule flags from the `hizuri-guardian` Claude Code mod, a side checker
 * that reads Zuri's steps against its checklist. The mod posts each flag with `$.ui.log`, which the
 * Agent SDK delivers as a `system/ui_log` message naming the plugin; a mod that answers
 * `turn.complete` with text arrives as `system/informational` instead, its content led by the
 * names of every plugin hooked there ("hizuri-guardian+cc-plugin-agents-md: …"), so that form is
 * found by the note's marker. The app draws the note from a plugin timeline item, which the
 * protocol already carries and old clients are never sent (`pluginTimelineItems`).
 */
export const GUARDIAN_PLUGIN_ID = "hizuri-guardian";
// The same checker shipped inside the hizuri Claude Code plugin (`claude/` in the repo).
const GUARDIAN_SOURCES = new Set([GUARDIAN_PLUGIN_ID, "hizuri"]);
export const GUARDIAN_NOTE_KIND = "guardian_note";
const GUARDIAN_MARK = "[hizuri-guardian]";
const NOTE_MAX_CHARS = 2000;

export interface GuardianNote {
  note: string;
  rule: string | null;
  fix: string | null;
}

function readGuardianText(record: Record<string, unknown>): string | null {
  if (record.subtype === "ui_log") {
    return typeof record.plugin === "string" &&
      GUARDIAN_SOURCES.has(record.plugin) &&
      typeof record.text === "string"
      ? record.text
      : null;
  }
  if (record.subtype === "informational" && typeof record.content === "string") {
    const at = record.content.indexOf(GUARDIAN_MARK);
    return at >= 0 ? record.content.slice(at) : null;
  }
  return null;
}

/** "[hizuri-guardian] <note> · rule: <key> · fix: <action>", the mod's own line. */
export function parseGuardianNoteText(text: string): GuardianNote | null {
  const body = (text.startsWith(GUARDIAN_MARK) ? text.slice(GUARDIAN_MARK.length) : text)
    .trim()
    .slice(0, NOTE_MAX_CHARS);
  if (!body) return null;
  const match = /^(.*?)\s*·\s*rule:\s*([a-z0-9-]+)\s*·\s*fix:\s*(.+)$/is.exec(body);
  if (!match) return { note: body, rule: null, fix: null };
  return { note: match[1].trim(), rule: match[2], fix: match[3].trim() };
}

/** The timeline item for a guardian note in an SDK message, or null for every other message. */
export function readGuardianNoteItem(message: unknown): PluginTimelineItem | null {
  if (typeof message !== "object" || message === null) return null;
  const record = message as Record<string, unknown>;
  if (record.type !== "system") return null;
  const text = readGuardianText(record);
  const note = text === null ? null : parseGuardianNoteText(text);
  if (!note) return null;
  const uuid = typeof record.uuid === "string" && record.uuid ? record.uuid : randomUUID();
  return {
    type: "plugin",
    id: `guardian-${uuid}`,
    pluginId: GUARDIAN_PLUGIN_ID,
    kind: GUARDIAN_NOTE_KIND,
    version: 1,
    data: { note: note.note, rule: note.rule, fix: note.fix },
  };
}
