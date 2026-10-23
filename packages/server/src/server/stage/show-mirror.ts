import type { Logger } from "pino";
import type { Stage } from "@getpaseo/protocol/stage";
import type { ShowWidgetKind } from "../show-tools/vocabulary.js";
import { collectBlockIds, normalizeBlocks } from "./blocks.js";
import { StageError, tabIdFromTitle, type StageStore } from "./store.js";

// Hizuri: the show_* tools also write the stage, so the Show windows Zuri opens today become
// saved tabs — same windows, same widget ids — before the app reads the stage. A failure here
// is logged and never fails the show_* call: the app still draws Show from the timeline.
// COMPAT(showTimeline): added in hizuri stage v1; the show_* tools and this mirror go once no
// app draws Show from the timeline, after 2027-04-18.

export const SHOW_DEFAULT_WINDOW = "Show";
export const SHOW_LIMITS_WINDOW = "Limits";
export const SHOW_SCREEN_WINDOW = "Screen";

export interface ShowStageMirror {
  widget(kind: ShowWidgetKind, input: Record<string, unknown>, widgetId: string): Promise<void>;
  window(input: { window: string; action: "open" | "close" }): Promise<void>;
  limits(window: string | undefined, sources: unknown[]): Promise<void>;
  screen(): Promise<void>;
  page(page: "face" | "chat" | "show"): Promise<void>;
}

export function showTabId(window: string): string {
  return `show-${tabIdFromTitle(window)}`.slice(0, 48).replace(/-+$/, "");
}

/** The window "used last": the Show tab in front, else the one changed last. */
function activeShowWindow(stage: Stage): string | null {
  const shows = stage.tabs.filter((tab) => tab.id.startsWith("show-"));
  const front = shows.find((tab) => tab.id === stage.focus);
  if (front) return front.title;
  const latest = [...shows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest?.title ?? null;
}

export function createShowStageMirror(options: {
  store: StageStore;
  owner: string;
  logger: Logger;
}): ShowStageMirror {
  const { store, owner, logger } = options;
  const safely = async (what: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (error) {
      logger.warn({ err: error, agentId: owner, what }, "Show → stage mirror failed");
    }
  };
  const upsertBlock = async (window: string, block: Record<string, unknown>) => {
    const tabId = showTabId(window);
    const stage = await store.get(owner);
    const tab = stage.tabs.find((candidate) => candidate.id === tabId);
    if (!tab) {
      await store.open(owner, {
        tabId,
        title: window,
        blocks: normalizeBlocks([block]),
        createdBy: owner,
      });
      return;
    }
    const ids = new Set(collectBlockIds(tab.blocks));
    const id = String(block.id);
    if (ids.has(id)) {
      const others = new Set([...ids].filter((existing) => existing !== id));
      await store.update(owner, {
        tabId,
        replace: normalizeBlocks([block], { takenIds: others }),
        focus: true,
      });
    } else {
      await store.update(owner, {
        tabId,
        append: normalizeBlocks([block], { takenIds: ids }),
        focus: true,
      });
    }
  };
  return {
    widget: (kind, input, widgetId) =>
      safely(`show_${kind}`, async () => {
        const { window: rawWindow, id: _id, ...props } = input;
        const window =
          (typeof rawWindow === "string" && rawWindow.trim()) ||
          activeShowWindow(await store.get(owner)) ||
          SHOW_DEFAULT_WINDOW;
        await upsertBlock(window, { type: kind, id: widgetId.slice(0, 64), props, enter: "rise" });
      }),
    window: ({ window, action }) =>
      safely("show_window", async () => {
        const tabId = showTabId(window);
        if (action === "close") {
          await store.close(owner, { tabId, by: "agent" }).catch((error: unknown) => {
            if (!(error instanceof StageError && error.code === "not_found")) throw error;
          });
          return;
        }
        const stage = await store.get(owner);
        if (stage.tabs.some((tab) => tab.id === tabId)) await store.focus(owner, { tabId });
      }),
    limits: (window, sources) =>
      safely("show_limits", async () => {
        const title = window?.trim() || SHOW_LIMITS_WINDOW;
        const tabId = showTabId(title);
        const stage = await store.get(owner);
        const tab = stage.tabs.find((candidate) => candidate.id === tabId);
        const block = { type: "limits", id: "limits", bind: { sources: "/usage" }, enter: "rise" };
        if (tab && collectBlockIds(tab.blocks).includes("limits")) {
          await store.update(owner, { tabId, set: { "/usage": sources }, focus: true });
        } else if (tab) {
          await store.update(owner, {
            tabId,
            set: { "/usage": sources },
            append: normalizeBlocks([block], { takenIds: new Set(collectBlockIds(tab.blocks)) }),
            focus: true,
          });
        } else {
          await store.open(owner, {
            tabId,
            title,
            blocks: normalizeBlocks([block]),
            data: { usage: sources },
            createdBy: owner,
          });
        }
      }),
    screen: () =>
      safely("show_screen", async () => {
        await store.open(owner, {
          tabId: showTabId(SHOW_SCREEN_WINDOW),
          title: SHOW_SCREEN_WINDOW,
          blocks: normalizeBlocks([{ type: "web", id: "screen", props: { screen: true } }]),
          createdBy: owner,
        });
      }),
    page: (page) =>
      safely("show_page", async () => {
        if (page !== "show") {
          await store.focus(owner, { tabId: null, view: page });
          return;
        }
        const stage = await store.get(owner);
        const latest = [...stage.tabs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (latest) await store.focus(owner, { tabId: latest.id });
      }),
  };
}
