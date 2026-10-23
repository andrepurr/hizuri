import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useVoiceOptional } from "@/contexts/voice-context";
import {
  selectAgentTurnPresentation,
  useSessionStore,
  type SessionState,
} from "@/stores/session-store";
import { voiceContacts } from "./voice-contacts";
import { shouldVoiceFollow, type VoiceFollowTarget } from "./voice-follows-chat";

const KEY_SEPARATOR = "\n";

/** The agent chat in front, as one string so the store selector compares by value. */
function selectFocusedChatKey(state: { sessions: Record<string, SessionState> }): string | null {
  for (const [serverId, session] of Object.entries(state.sessions)) {
    if (session.focusedAgentId) return `${serverId}${KEY_SEPARATOR}${session.focusedAgentId}`;
  }
  return null;
}

function parseChatKey(key: string | null): VoiceFollowTarget | null {
  if (!key) return null;
  const [serverId, agentId] = key.split(KEY_SEPARATOR);
  return serverId && agentId ? { serverId, agentId } : null;
}

/**
 * Hizuri (voice follows the chat): with voice on, opening another agent's chat
 * (the agent list, a swipe, a link) moves the voice there; opening the first chat again moves it
 * back. A chat opened while voice is turning on or moving waits until that settles.
 */
export function VoiceFollowsChatSync() {
  const voice = useVoiceOptional();
  const toast = useToast();
  const { t } = useTranslation();
  const focusedKey = useSessionStore(selectFocusedChatKey);
  const lastFocusedKeyRef = useRef<string | null>(null);
  const pendingRef = useRef<VoiceFollowTarget | null>(null);

  useEffect(() => {
    void voiceContacts.load();
  }, []);

  const liveServerId = voice?.isVoiceMode && !voice.isVoiceSwitching ? voice.activeServerId : null;
  const liveAgentId = liveServerId ? voice?.activeAgentId : null;
  useEffect(() => {
    if (liveServerId && liveAgentId) voiceContacts.remember(liveServerId, liveAgentId);
  }, [liveAgentId, liveServerId]);

  useEffect(() => {
    if (focusedKey !== lastFocusedKeyRef.current) {
      lastFocusedKeyRef.current = focusedKey;
      pendingRef.current = parseChatKey(focusedKey);
    }
    const target = pendingRef.current;
    if (!target || !voice || voice.isVoiceSwitching) return;
    pendingRef.current = null;
    const session = useSessionStore.getState().sessions[target.serverId];
    const agent = session?.agents.get(target.agentId);
    const follow = shouldVoiceFollow({
      voice,
      target,
      agent: agent
        ? { ...agent, isBusy: selectAgentTurnPresentation(session, target.agentId).isActive }
        : undefined,
      isVoiceContact: voiceContacts.has(target.serverId, target.agentId),
    });
    if (!follow) return;
    void voice
      .moveVoice(target.serverId, target.agentId)
      .then((from) => {
        if (from) toast.show(t("realtimeVoice.moved"), { variant: "info" });
        return from;
      })
      .catch((error: unknown) => {
        console.error("[VoiceFollowsChat] Failed to move voice", error);
        const message = error instanceof Error ? error.message : null;
        if (message && message.trim().length > 0) toast.error(message);
      });
  }, [focusedKey, t, toast, voice]);

  return null;
}
