import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { FacePage, useFaceAvailable, useVoiceHere } from "@/face/face-host";
import { ShowPage } from "@/show/show-host";
import { takePageRequest } from "@/simple-mode/model";
import { useAgentPageStore } from "@/simple-mode/page-store";
import { AgentPages } from "./agent-pages";
import type { AgentPage } from "./model";
import { useAgentPageCommands } from "./use-agent-page-commands";

/** A voice start after at least this long without voice counts as a new conversation. */
const NEW_CONVERSATION_GAP_MS = 3000;

/**
 * An agent chat on a phone: face, chat and Show as three swipeable pages. Who moves the pager: the
 * user's finger; Zuri's show_page call (useAgentPageCommands); the assistant's other show_* calls
 * (to Show); “Back to chat” on the Show page; and voice. Opening the chat in a voice conversation,
 * or starting a new one, lands on the assistant's face, like a call screen. A blip that drops voice
 * for a moment moves nothing.
 */
export const CompactAgentPages = memo(function CompactAgentPages({
  serverId,
  agentId,
  children,
}: {
  serverId: string;
  agentId: string;
  /** The chat page. */
  children: ReactNode;
}) {
  const voiceHere = useVoiceHere(serverId, agentId);
  const faceAvailable = useFaceAvailable(serverId);
  const [page, setPage] = useState<AgentPage>(() => (voiceHere && faceAvailable ? "face" : "chat"));

  const voiceOffAtRef = useRef<number | null>(voiceHere ? null : 0);
  useEffect(() => {
    if (!voiceHere) {
      voiceOffAtRef.current ??= Date.now();
      return;
    }
    const offAt = voiceOffAtRef.current;
    voiceOffAtRef.current = null;
    if (offAt === null || Date.now() - offAt < NEW_CONVERSATION_GAP_MS || !faceAvailable) return;
    setPage((current) => (current === "chat" ? "face" : current));
  }, [faceAvailable, voiceHere]);

  useAgentPageCommands({ serverId, agentId, onPage: setPage });

  // The simple menu's Face, Chat and Show move the pager too; the menu marks the page shown.
  const pageRequest = useAgentPageStore((state) => state.request);
  useEffect(() => {
    const requested = takePageRequest({ request: pageRequest, agentId, now: Date.now() });
    if (!requested) return;
    setPage(requested);
    useAgentPageStore.getState().clearRequest();
  }, [agentId, pageRequest]);
  useEffect(() => {
    useAgentPageStore.getState().setCurrent(agentId, page);
  }, [agentId, page]);
  useEffect(() => () => useAgentPageStore.getState().clearCurrent(agentId), [agentId]);

  const face = useMemo(
    () => <FacePage serverId={serverId} agentId={agentId} />,
    [agentId, serverId],
  );
  const show = useMemo(
    () => <ShowPage serverId={serverId} agentId={agentId} />,
    [agentId, serverId],
  );

  return <AgentPages page={page} onPageChange={setPage} face={face} chat={children} show={show} />;
});
