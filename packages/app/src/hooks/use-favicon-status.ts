import { useEffect, useRef } from "react";
import { getIsElectronRuntimeMac } from "@/constants/layout";
import { useAggregatedAgents } from "./use-aggregated-agents";
import { getDesktopHost } from "@/desktop/host";
import { useWorkspaceStatusesForBadges } from "@/stores/session-store-hooks";
import { deriveMacDockBadgeCountFromWorkspaceStatuses } from "@/utils/desktop-badge-state";
import { isNative } from "@/constants/platform";

type FaviconStatus = "none" | "running" | "attention";

/* eslint-disable @typescript-eslint/no-require-imports */
// Hizuri: the mark reads on dark and light backgrounds alike, so one picture per status.
const FAVICON_IMAGES: Record<FaviconStatus, { uri: string } | number> = {
  none: require("../../assets/images/favicon-dark.png"),
  running: require("../../assets/images/favicon-dark-running.png"),
  attention: require("../../assets/images/favicon-dark-attention.png"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

function deriveFaviconStatus(
  agents: ReturnType<typeof useAggregatedAgents>["agents"],
): FaviconStatus {
  const hasRunning = agents.some((agent) => agent.status === "running");
  if (hasRunning) {
    return "running";
  }
  const hasAttention = agents.some((agent) => agent.requiresAttention);
  const hasNeedsInput = agents.some((agent) => (agent.pendingPermissionCount ?? 0) > 0);
  if (hasAttention || hasNeedsInput) {
    return "attention";
  }
  return "none";
}

function getFaviconUri(status: FaviconStatus): string {
  const image = FAVICON_IMAGES[status];
  if (typeof image === "object" && "uri" in image) {
    return image.uri;
  }
  const suffix = status === "none" ? "" : `-${status}`;
  return `/assets/images/favicon-dark${suffix}.png`;
}

function getOrCreateFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  return link;
}

function updateFavicon(status: FaviconStatus) {
  const link = getOrCreateFaviconLink();
  if (!link) return;

  const newHref = getFaviconUri(status);
  if (link.href !== newHref) {
    link.href = newHref;
  }
}

async function updateMacDockBadge(count?: number) {
  if (isNative || !getIsElectronRuntimeMac()) return;

  const desktopWindow = getDesktopHost()?.window?.getCurrentWindow?.();
  if (!desktopWindow || typeof desktopWindow.setBadgeCount !== "function") {
    return;
  }

  try {
    await desktopWindow.setBadgeCount(count);
  } catch (error) {
    console.warn("[useFaviconStatus] Failed to update macOS dock badge", error);
  }
}

export function useFaviconStatus() {
  const { agents } = useAggregatedAgents({ demand: !isNative });
  const workspaceStatuses = useWorkspaceStatusesForBadges();
  const lastDockBadgeCountRef = useRef<number | undefined>(undefined);

  // Update favicon when agents change
  useEffect(() => {
    if (isNative) return;

    const status = deriveFaviconStatus(agents);
    updateFavicon(status);

    const dockBadgeCount = deriveMacDockBadgeCountFromWorkspaceStatuses(workspaceStatuses);
    if (dockBadgeCount !== lastDockBadgeCountRef.current) {
      lastDockBadgeCountRef.current = dockBadgeCount;
      void updateMacDockBadge(dockBadgeCount);
    }
  }, [agents, workspaceStatuses]);
}
