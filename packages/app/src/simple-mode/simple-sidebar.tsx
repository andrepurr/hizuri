import { router } from "expo-router";
import { AppWindow, MessageSquare, ScanFace, Settings } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentPage } from "@/agent-pages/model";
import { HizuriMark } from "@/components/icons/hizuri-mark";
import { SidebarHeaderRow, type SidebarRowIcon } from "@/components/sidebar/sidebar-header-row";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useVoiceOptional } from "@/contexts/voice-context";
import { useHosts } from "@/runtime/host-runtime";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { pickSimpleAgent } from "./model";
import { useAgentPageStore } from "./page-store";

const PAGE_ROWS: readonly { page: AgentPage; icon: SidebarRowIcon; labelKey: string }[] = [
  { page: "face", icon: ScanFace, labelKey: "simpleMode.menu.face" },
  { page: "chat", icon: MessageSquare, labelKey: "simpleMode.menu.chat" },
  { page: "show", icon: AppWindow, labelKey: "show.title" },
];

/** The host Zuri lives on: the voice conversation's, else the last workspace's, else the first. */
function useSimpleServerId(): string | null {
  const voice = useVoiceOptional();
  const lastSelection = useLastWorkspaceSelection();
  const hosts = useHosts();
  return voice?.session?.serverId ?? lastSelection?.serverId ?? hosts[0]?.serverId ?? null;
}

function useSimpleAgent() {
  const voice = useVoiceOptional();
  const serverId = useSimpleServerId();
  const agentsMap = useSessionStore((state) =>
    serverId ? state.sessions[serverId]?.agents : undefined,
  );
  const voiceAgentId = voice?.session?.serverId === serverId ? voice.session.agentId : null;
  const agent = useMemo(
    () => pickSimpleAgent({ voiceAgentId, agents: agentsMap ? [...agentsMap.values()] : null }),
    [agentsMap, voiceAgentId],
  );
  return serverId && agent ? { serverId, agent } : null;
}

/**
 * The side menu of the simple version: Zuri under the assistant's mark, its three pages, and
 * settings. On a phone each page row opens the assistant's chat on that page; a wide screen has no
 * pages, so one row opens the chat. With no agent yet the rows lead to the host's start screen.
 */
export function SimpleSidebar({
  onBeforeNavigate,
  onOpenSettings,
}: {
  onBeforeNavigate?: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const zuri = useSimpleAgent();
  const current = useAgentPageStore((state) => state.current);
  const requestPage = useAgentPageStore((state) => state.requestPage);
  const rows = isCompact ? PAGE_ROWS : PAGE_ROWS.filter((row) => row.page === "chat");

  const openPage = useCallback(
    (page: AgentPage) => {
      onBeforeNavigate?.();
      if (!zuri) {
        router.navigate("/");
        return;
      }
      requestPage(zuri.agent.id, page);
      navigateToAgent({
        serverId: zuri.serverId,
        agentId: zuri.agent.id,
        workspaceId: zuri.agent.workspaceId,
      });
    },
    [zuri, onBeforeNavigate, requestPage],
  );

  return (
    <View style={styles.container} testID="simple-sidebar">
      <View style={styles.identity}>
        <HizuriMark size={40} />
        <View style={styles.identityText}>
          <Text style={styles.name}>{t("simpleMode.menu.assistant")}</Text>
          <Text style={styles.brand}>hizuri</Text>
        </View>
      </View>
      <View style={styles.pages}>
        {rows.map((row) => (
          <SimplePageRow
            key={row.page}
            page={row.page}
            icon={row.icon}
            label={t(row.labelKey)}
            isActive={
              isCompact && zuri !== null && current?.agentId === zuri.agent.id
                ? current.page === row.page
                : false
            }
            onOpen={openPage}
          />
        ))}
      </View>
      <View style={styles.spacer} />
      <View style={styles.footer}>
        <SidebarHeaderRow
          icon={Settings}
          label={t("sidebar.actions.settings")}
          onPress={onOpenSettings}
          variant="compact"
          testID="sidebar-settings"
        />
      </View>
    </View>
  );
}

function SimplePageRow({
  page,
  icon,
  label,
  isActive,
  onOpen,
}: {
  page: AgentPage;
  icon: SidebarRowIcon;
  label: string;
  isActive: boolean;
  onOpen: (page: AgentPage) => void;
}) {
  const handlePress = useCallback(() => onOpen(page), [onOpen, page]);
  return (
    <SidebarHeaderRow
      icon={icon}
      label={label}
      onPress={handlePress}
      isActive={isActive}
      variant="compact"
      testID={`simple-sidebar-${page}`}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  // The assistant's mark is its face (docs/brand.md); the mobile close button sits on the same
  // line.
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  identityText: {
    gap: 2,
  },
  name: {
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  brand: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  pages: {
    gap: 2,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    paddingVertical: theme.spacing[2],
  },
}));
