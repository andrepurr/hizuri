import { create } from "zustand";
import type { AgentPage } from "@/agent-pages/model";
import type { AgentPageRequest } from "./model";

interface AgentPageState {
  /** A page asked for from outside the pager: the simple menu's Face, Chat and Show. */
  request: AgentPageRequest | null;
  /** The page an agent's pager shows right now, so the menu can mark it. */
  current: { agentId: string; page: AgentPage } | null;
  requestPage: (agentId: string, page: AgentPage) => void;
  clearRequest: () => void;
  setCurrent: (agentId: string, page: AgentPage) => void;
  clearCurrent: (agentId: string) => void;
}

/** hizuri: the bridge between the simple menu and an agent chat's three pages on a phone. */
export const useAgentPageStore = create<AgentPageState>()((set, get) => ({
  request: null,
  current: null,
  requestPage: (agentId, page) => set({ request: { agentId, page, at: Date.now() } }),
  clearRequest: () => {
    if (get().request) set({ request: null });
  },
  setCurrent: (agentId, page) => {
    const current = get().current;
    if (current?.agentId !== agentId || current.page !== page) set({ current: { agentId, page } });
  },
  clearCurrent: (agentId) => {
    if (get().current?.agentId === agentId) set({ current: null });
  },
}));
