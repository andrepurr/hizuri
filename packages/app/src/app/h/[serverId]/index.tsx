import { Redirect } from "expo-router";
import { useHostRouteServerId } from "@/navigation/host-route-context";
import {
  resolveHostIndexRoute,
  resolveWorkspaceSelectionStatus,
} from "@/navigation/host-runtime-bootstrap";
import { useFirstOpenDecision } from "@/navigation/use-first-open";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useHasHydratedWorkspaces, useWorkspaceExists } from "@/stores/session-store-hooks";
import {
  useIsLastWorkspaceSelectionHydrated,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { buildHostAgentDetailRoute } from "@/utils/host-routes";

export default function HostIndexRoute() {
  const serverId = useHostRouteServerId();
  const workspaceSelection = useLastWorkspaceSelection();
  const isWorkspaceSelectionLoaded = useIsLastWorkspaceSelectionHydrated();
  const workspaceSelectionWorkspaceId =
    workspaceSelection?.serverId === serverId ? workspaceSelection.workspaceId : null;
  const hasHydratedWorkspaces = useHasHydratedWorkspaces(serverId);
  const workspaceSelectionExists = useWorkspaceExists(serverId, workspaceSelectionWorkspaceId);
  const workspaceSelectionStatus = resolveWorkspaceSelectionStatus({
    hasHydratedWorkspaces,
    workspaceExists: workspaceSelectionExists,
  });
  // Hizuri: the first open goes to the agent the user talks to before the remembered workspace.
  const firstOpen = useFirstOpenDecision({
    serverId,
    hasRestorableWorkspace:
      workspaceSelectionWorkspaceId !== null && workspaceSelectionStatus !== "missing",
  });

  if (!serverId || !isWorkspaceSelectionLoaded || firstOpen.kind === "wait") {
    return <StartupSplashScreen />;
  }

  if (firstOpen.kind === "agent") {
    return (
      <Redirect
        href={buildHostAgentDetailRoute(
          serverId,
          firstOpen.agentId,
          firstOpen.workspaceId ?? undefined,
        )}
      />
    );
  }

  return (
    <Redirect
      href={resolveHostIndexRoute({
        serverId,
        workspaceSelection,
        workspaceSelectionStatus,
      })}
    />
  );
}
