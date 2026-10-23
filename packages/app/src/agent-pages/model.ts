import { showToolName } from "@/show/model";
import type { StreamItem } from "@/types/stream";

// The phone layout of an agent chat in simple mode: three pages side by side,
// swiped with a finger. Face is Zuri alone, full screen; chat is the clean chat with the voice bar;
// show is the assistant's Show window. The daemon's show_page tool moves the app between them: the
// app reads the call from the timeline, like every other show_* call.

export const AGENT_PAGES = ["face", "chat", "show"] as const;
export type AgentPage = (typeof AGENT_PAGES)[number];

export const AGENT_PAGE_COUNT = AGENT_PAGES.length;

export function agentPageIndex(page: AgentPage): number {
  return AGENT_PAGES.indexOf(page);
}

export function agentPageAt(index: number): AgentPage {
  return AGENT_PAGES[Math.max(0, Math.min(AGENT_PAGE_COUNT - 1, Math.round(index)))]!;
}

function isAgentPage(value: unknown): value is AgentPage {
  return typeof value === "string" && (AGENT_PAGES as readonly string[]).includes(value);
}

export type AgentPageSwipeIntent = "activate" | "fail" | "wait";

/**
 * Whether a one-finger drag pages. Vertical drags stay with the chat's scroll. A drag past the
 * first or the last page fails at once, so the swipe goes on to the panel behind that edge (the
 * agent list on the left, the file explorer on the right; mobile-panels/gestures.ts).
 */
export function resolveAgentPageSwipeIntent(input: {
  deltaX: number;
  deltaY: number;
  index: number;
}): AgentPageSwipeIntent {
  "worklet";
  const absDeltaX = Math.abs(input.deltaX);
  const absDeltaY = Math.abs(input.deltaY);
  if (absDeltaY > 10 && absDeltaY > absDeltaX) return "fail";
  if (input.deltaX >= 10 && input.index <= 0) return "fail";
  if (input.deltaX <= -10 && input.index >= AGENT_PAGE_COUNT - 1) return "fail";
  if (absDeltaX >= 15 && absDeltaX > absDeltaY) return "activate";
  return "wait";
}

/**
 * The page a released swipe settles on, from the page it started at: the neighbour past a third
 * of the width or on a flick, else back. Never more than one page per swipe.
 */
export function resolveAgentPageSwipeEnd(input: {
  startIndex: number;
  position: number;
  velocityX: number;
}): number {
  "worklet";
  const moved = input.position - input.startIndex;
  let step = 0;
  if (moved > 1 / 3 || input.velocityX < -500) step = 1;
  if (moved < -1 / 3 || input.velocityX > 500) step = -1;
  if (step === 1 && moved < 0) step = 0;
  if (step === -1 && moved > 0) step = 0;
  return Math.max(0, Math.min(AGENT_PAGE_COUNT - 1, input.startIndex + step));
}

/** The position under a finger: free between the pages, a little resistance past the ends. */
/**
 * Android back goes to the chat from the face or Show, but only while the pages are on screen:
 * with the agent list or the explorer slid over them, Back belongs to that panel.
 */
export function pagerTakesBack(input: {
  active: boolean;
  page: AgentPage;
  coveredByPanel: boolean;
}): boolean {
  return input.active && input.page !== "chat" && !input.coveredByPanel;
}

export function dragAgentPagePosition(input: { startIndex: number; dragPages: number }): number {
  "worklet";
  const raw = input.startIndex + input.dragPages;
  const last = AGENT_PAGE_COUNT - 1;
  if (raw < 0) return raw / 4;
  if (raw > last) return last + (raw - last) / 4;
  return raw;
}

export interface AgentPageCall {
  id: string;
  page: AgentPage;
  at: number;
}

/**
 * The assistant's latest show_page call that names a page; rejected or stopped calls move nothing.
 */
export function latestAgentPageCall(items: readonly StreamItem[]): AgentPageCall | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (item.kind !== "tool_call" || item.payload.source !== "agent") continue;
    const data = item.payload.data;
    if (showToolName(data.name) !== "show_page") continue;
    if (data.status === "failed" || data.status === "canceled") continue;
    const input = data.detail.type === "unknown" ? data.detail.input : null;
    const page =
      typeof input === "object" && input !== null ? (input as { page?: unknown }).page : null;
    if (!isAgentPage(page)) continue;
    return { id: data.callId, page, at: item.timestamp.getTime() };
  }
  return null;
}
