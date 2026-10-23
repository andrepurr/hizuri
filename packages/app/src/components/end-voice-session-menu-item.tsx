import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PhoneOff } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { stopRealtimeVoice } from "@/composer/input/state";
import { useToast } from "@/contexts/toast-context";
import { useVoiceOptional } from "@/contexts/voice-context";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { selectAgentTurnPresentation, useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";

const ThemedPhoneOff = withUnistyles(PhoneOff);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const END_SESSION_ICON = <ThemedPhoneOff size={16} uniProps={mutedColorMapping} />;

/**
 * Hizuri: “End session” is an emergency brake, so it sits in a menu, out of the way of the voice
 * bar, and asks first: the header menu on wide layouts, the chat page's “…” on
 * a phone (agent-pages/chat-page-menu.tsx). It stops everything, as it did in the
 * voice bar: the agent's running turn, voice, the agent's voice mode and the saved session.
 *
 * Call it where the menu is rendered, not inside the menu content: on compact the content is
 * portaled above VoiceProvider (app/_layout.tsx), where the voice context is absent.
 * It ends only the open chat's session (not another agent's active session).
 * Returns null when the open chat's agent holds no session.
 */
export function useEndVoiceSession(serverId: string, agentId: string | null): (() => void) | null {
  const { t } = useTranslation();
  const toast = useToast();
  const voice = useVoiceOptional();
  const session =
    agentId && voice?.isSessionForAgent(serverId, agentId) ? (voice.session ?? null) : null;
  const client = useHostRuntimeClient(session?.serverId ?? "");
  const isAgentRunning = useSessionStore((state) =>
    session
      ? selectAgentTurnPresentation(state.sessions[session.serverId], session.agentId).isActive
      : false,
  );

  const endSession = useCallback(() => {
    if (!voice || !session) return;
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("realtimeVoice.endSessionConfirm.title"),
        message: t("realtimeVoice.endSessionConfirm.message"),
        confirmLabel: t("realtimeVoice.actions.endSession"),
        cancelLabel: t("common.actions.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      if (voice.isVoiceModeForAgent(session.serverId, session.agentId)) {
        await stopRealtimeVoice({
          voice,
          isRealtimeVoiceForCurrentAgent: true,
          isAgentRunning,
          client,
          voiceAgentId: session.agentId,
        });
        return;
      }
      await voice.endSession();
    })().catch((error: unknown) => {
      console.error("[EndVoiceSession] Failed to end the voice session", error);
      toast.error(error instanceof Error ? error.message : String(error));
    });
  }, [client, isAgentRunning, session, t, toast, voice]);

  return session ? endSession : null;
}

export function EndVoiceSessionMenuItem({
  onSelect,
  separated = true,
}: {
  onSelect: (() => void) | null;
  /** False when it is the menu's only item. */
  separated?: boolean;
}) {
  const { t } = useTranslation();
  if (!onSelect) return null;
  return (
    <>
      {separated ? <DropdownMenuSeparator /> : null}
      <DropdownMenuItem
        testID="header-menu-end-voice-session"
        leading={END_SESSION_ICON}
        onSelect={onSelect}
      >
        {t("realtimeVoice.actions.endSession")}
      </DropdownMenuItem>
    </>
  );
}
