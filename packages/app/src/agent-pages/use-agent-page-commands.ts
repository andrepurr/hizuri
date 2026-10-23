import { useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { isFreshShowCall, selectShowItems } from "@/show/model";
import { useShowAllowed } from "@/show/show-host";
import { useSessionStore } from "@/stores/session-store";
import { type AgentPage, latestAgentPageCall } from "./model";

/**
 * Zuri's show_page calls move the pager: each new call once, on the device Show belongs to
 * (useShowAllowed), like its other show_* calls.
 */
export function useAgentPageCommands(input: {
  serverId: string;
  agentId: string;
  onPage: (page: AgentPage) => void;
}): void {
  const { serverId, agentId, onPage } = input;
  const allowed = useShowAllowed(serverId, agentId);
  const items = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectShowItems(state.sessions[serverId], agentId),
    shallow,
  );
  const call = useMemo(() => latestAgentPageCall(items), [items]);
  const seenCallIdRef = useRef<string | null>(null);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  useEffect(() => {
    const lastCall = call ? { id: call.id, at: call.at } : null;
    if (
      allowed &&
      call &&
      isFreshShowCall({ lastCall, seenCallId: seenCallIdRef.current, now: Date.now() })
    ) {
      onPageRef.current(call.page);
    }
    seenCallIdRef.current = call?.id ?? null;
  }, [allowed, call]);
}
