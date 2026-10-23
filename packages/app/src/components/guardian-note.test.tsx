import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuardianNote, readGuardianNoteData } from "./guardian-note";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 1: 4, 2: 8, 3: 12 },
    borderRadius: { md: 6 },
    fontFamily: { ui: "system-ui", mono: "monospace" },
    fontSize: { code: 12, sm: 12, base: 14 },
    colors: { foreground: "#fff", foregroundMuted: "#aaa", palette: { amber: { 500: "#f59e0b" } } },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles: (component: unknown) => component,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

const ITEM = {
  pluginId: "hizuri-guardian",
  itemKind: "guardian_note",
  data: {
    note: "Zuri changed now.mjs and did not name it",
    rule: "name-changed-files",
    fix: "Name /home/dev/x/now.mjs in chat",
  },
};

let root: Root | null = null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("navigator", dom.window.navigator);
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("guardian note", () => {
  it("reads only hizuri-guardian notes", () => {
    expect(readGuardianNoteData(ITEM)).toEqual(ITEM.data);
    expect(readGuardianNoteData({ ...ITEM, pluginId: "review" })).toBeNull();
    expect(readGuardianNoteData({ ...ITEM, data: { rule: "x" } })).toBeNull();
    expect(
      readGuardianNoteData({ ...ITEM, data: { note: "Look", rule: null, fix: null } }),
    ).toEqual({ note: "Look", rule: null, fix: null });
  });

  it("shows the note, what to do and the rule", () => {
    const note = readGuardianNoteData(ITEM);
    if (!note) throw new Error("no note");
    act(() => root?.render(<GuardianNote note={note} />));
    const text = document.body.textContent ?? "";
    expect(text).toContain("message.guardian.header");
    expect(text).toContain("Zuri changed now.mjs and did not name it");
    expect(text).toContain("message.guardian.fix Name /home/dev/x/now.mjs in chat");
    expect(text).toContain("message.guardian.rule name-changed-files");
  });
});
