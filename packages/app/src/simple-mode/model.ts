import type { AgentPage } from "@/agent-pages/model";
import { byActivity, isUserFacingAgent, type FirstOpenAgent } from "@/navigation/first-open";
import type { HostSectionSlug, SettingsSectionSlug } from "@/utils/host-routes";

// hizuri: the simple version shows Zuri — face, chat, Show — and settings, with a switch to the
// full version. The full version is the whole app. Simple hides, it never deletes: switching back
// restores all.

/** The app settings pages the simple version keeps. */
const SIMPLE_SETTINGS_SECTIONS: ReadonlySet<SettingsSectionSlug> = new Set([
  "general",
  "appearance",
  "chat",
  "about",
]);

/** The host settings pages the simple version keeps: what it is, how it is reached, pairing. */
const SIMPLE_HOST_SECTIONS: ReadonlySet<HostSectionSlug> = new Set([
  "host",
  "connections",
  "pair-device",
]);

export function isSettingsSectionShown(id: SettingsSectionSlug, simple: boolean): boolean {
  return !simple || SIMPLE_SETTINGS_SECTIONS.has(id);
}

export function isHostSectionShown(id: HostSectionSlug, simple: boolean): boolean {
  return !simple || SIMPLE_HOST_SECTIONS.has(id);
}

/**
 * Zuri, the one agent the simple version leads to: the one this device talks to in voice, else the
 * one the user talked to last. Archived agents, subagents and app-test agents never count.
 */
export function pickSimpleAgent(input: {
  voiceAgentId: string | null;
  agents: readonly FirstOpenAgent[] | null;
}): FirstOpenAgent | null {
  const candidates = (input.agents ?? []).filter(isUserFacingAgent);
  const voice = candidates.find((agent) => agent.id === input.voiceAgentId);
  return voice ?? [...candidates].sort(byActivity)[0] ?? null;
}

export interface AgentPageRequest {
  agentId: string;
  page: AgentPage;
  at: number;
}

/** A menu tap opens the assistant's chat first; the pages of that chat may mount a moment later. */
const PAGE_REQUEST_TTL_MS = 5000;

/** The page an agent's pager should move to for a request from outside, if any. */
export function takePageRequest(input: {
  request: AgentPageRequest | null;
  agentId: string;
  now: number;
}): AgentPage | null {
  const { request, agentId, now } = input;
  if (!request || request.agentId !== agentId || now - request.at > PAGE_REQUEST_TTL_MS) {
    return null;
  }
  return request.page;
}
