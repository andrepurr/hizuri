import {
  LIVE_TAB_AUTHOR,
  LIVE_TAB_ID,
  LIVE_TAB_TITLE,
  type LiveScene,
  sceneBlocks,
} from "./live-scenes.js";
import { MAX_OPEN_TABS, type StageStore } from "./store.js";

// Hizuri (visual front): writes a scene into the live tab "Now". The tab never takes the stage
// focus, so the app never moves the user's pager for it, and it never pushes one of Zuri's tabs
// out. When the user closes it, it stays closed for a while.

/** After the user closes the live tab, the visual front leaves it closed this long. */
const CLOSED_BY_USER_MS = 15 * 60_000;

export interface LiveSceneDraw {
  agentId: string;
  scene: LiveScene;
  /**
   * When the user's phrase started this scene: the app shows the live tab over the assistant's tabs
   * older than it.
   */
  since: number;
}

/** Draws the scene; returns why it was not drawn, or null when it was. */
export async function drawLiveScene(
  store: StageStore,
  input: LiveSceneDraw,
): Promise<string | null> {
  const stage = await store.get(input.agentId);
  const open = stage.tabs.some((tab) => tab.id === LIVE_TAB_ID);
  if (!open) {
    const closed = stage.closed.find((entry) => entry.id === LIVE_TAB_ID);
    if (
      closed?.closedBy === "user" &&
      Date.now() - Date.parse(closed.closedAt) < CLOSED_BY_USER_MS
    ) {
      return "closed-by-user";
    }
    // Opening it would close the assistant's oldest tab.
    if (stage.tabs.length >= MAX_OPEN_TABS) return "stage-full";
  }
  await store.open(input.agentId, {
    tabId: LIVE_TAB_ID,
    title: LIVE_TAB_TITLE,
    icon: "sparkles",
    blocks: sceneBlocks(input.scene),
    data: { scene: input.scene, since: input.since },
    focus: false,
    enter: "fly-in",
    createdBy: LIVE_TAB_AUTHOR,
  });
  return null;
}
