import { describe, expect, test } from "vitest";

import { parseGuardianNoteText, readGuardianNoteItem } from "./guardian-note.js";

const LINE =
  "[hizuri-guardian] Zuri changed now.mjs and did not name it · rule: name-changed-files · fix: Name /home/dev/x/now.mjs in chat";

describe("guardian notes", () => {
  test("reads the mod's ui_log line into a plugin timeline item", () => {
    const item = readGuardianNoteItem({
      type: "system",
      subtype: "ui_log",
      plugin: "hizuri-guardian",
      text: LINE,
      uuid: "u-1",
      session_id: "s-1",
    });

    expect(item).toEqual({
      type: "plugin",
      id: "guardian-u-1",
      pluginId: "hizuri-guardian",
      kind: "guardian_note",
      version: 1,
      data: {
        note: "Zuri changed now.mjs and did not name it",
        rule: "name-changed-files",
        fix: "Name /home/dev/x/now.mjs in chat",
      },
    });
  });

  test("reads the same line from the hizuri plugin's own checker", () => {
    const item = readGuardianNoteItem({
      type: "system",
      subtype: "ui_log",
      plugin: "hizuri",
      text: LINE,
      uuid: "u-3",
    });

    expect(item?.pluginId).toBe("hizuri-guardian");
    expect(item?.data.rule).toBe("name-changed-files");
  });

  test("finds the note inside an informational message led by plugin names", () => {
    const item = readGuardianNoteItem({
      type: "system",
      subtype: "informational",
      content: `hizuri-guardian+cc-plugin-agents-md: ${LINE}`,
      level: "notice",
      uuid: "u-2",
    });

    expect(item?.data).toEqual({
      note: "Zuri changed now.mjs and did not name it",
      rule: "name-changed-files",
      fix: "Name /home/dev/x/now.mjs in chat",
    });
  });

  test("ignores other plugins' log lines and other system messages", () => {
    expect(
      readGuardianNoteItem({ type: "system", subtype: "ui_log", plugin: "other", text: LINE }),
    ).toBeNull();
    expect(
      readGuardianNoteItem({
        type: "system",
        subtype: "informational",
        content: "guardian-probe: turn seen",
      }),
    ).toBeNull();
    expect(readGuardianNoteItem({ type: "system", subtype: "status", status: null })).toBeNull();
  });

  test("keeps the note's id (g7) inside the note, so the card shows which note the agent answers", () => {
    expect(
      parseGuardianNoteText(
        "[hizuri-guardian] g7: Asked the user without a memory search · rule: memory-first · fix: Search memory now",
      ),
    ).toEqual({
      note: "g7: Asked the user without a memory search",
      rule: "memory-first",
      fix: "Search memory now",
    });
  });

  test("keeps a line without rule and fix as a plain note", () => {
    expect(parseGuardianNoteText("[hizuri-guardian] Something to look at")).toEqual({
      note: "Something to look at",
      rule: null,
      fix: null,
    });
  });
});
