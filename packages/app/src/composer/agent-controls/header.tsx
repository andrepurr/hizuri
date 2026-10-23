import { memo, type ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { ContextWindowMeter } from "@/components/context-window-meter";
import { AgentControls } from "@/composer/agent-controls";
import { ComposerKeyboardScopeProvider } from "@/composer/keyboard-scope";
import { useSessionStore } from "@/stores/session-store";
import { ICON_SIZE } from "@/styles/theme";

/**
 * Hizuri: a live agent's model, effort, mode and context meter, shown in the screen header
 * instead of the typing bar. The composer holds only “+”, dictate, send or stop and
 * the voice switch; these settings change rarely, so they sit up top, out of reach of
 * a stray thumb. The chip opens the same sheet the compact composer used.
 *
 * `isActive` scopes the agent's command-center entries to the focused workspace, as the
 * composer's pane focus did before.
 */
export const AgentHeaderControls = memo(function AgentHeaderControls({
  serverId,
  agentId,
  isActive,
}: {
  serverId: string;
  agentId: string;
  isActive: boolean;
}): ReactElement {
  const usage = useSessionStore(
    useShallow((state) => {
      const lastUsage = state.sessions[serverId]?.agents?.get(agentId)?.lastUsage;
      return {
        maxTokens: lastUsage?.contextWindowMaxTokens ?? null,
        usedTokens: lastUsage?.contextWindowUsedTokens ?? null,
        totalCostUsd: lastUsage?.totalCostUsd ?? null,
      };
    }),
  );
  return (
    <ComposerKeyboardScopeProvider isPaneFocused={isActive} isActiveComposer={isActive}>
      <View style={styles.row} testID="agent-header-controls">
        <AgentControls agentId={agentId} serverId={serverId} isCompactLayout />
        <View style={styles.meterSlot}>
          <ContextWindowMeter
            serverId={serverId}
            agentId={agentId}
            maxTokens={usage.maxTokens}
            usedTokens={usage.usedTokens}
            totalCostUsd={usage.totalCostUsd}
            glyphSize={ICON_SIZE.md}
          />
        </View>
      </View>
    </ComposerKeyboardScopeProvider>
  );
});

const styles = StyleSheet.create((theme) => ({
  row: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  meterSlot: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
}));
