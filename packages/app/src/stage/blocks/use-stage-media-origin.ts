import { useMemo } from "react";
import { isWeb } from "@/constants/platform";
import { useHostRuntimeSnapshot, useHosts } from "@/runtime/host-runtime";
import { daemonOrigin } from "./stage-media";

/** The daemon's http origin for this host, or null through the relay (there is no origin). */
export function useStageMediaOrigin(serverId: string): string | null {
  const active = useHostRuntimeSnapshot(serverId)?.activeConnection ?? null;
  const hosts = useHosts();
  return useMemo(() => {
    const secure = isWeb && typeof location !== "undefined" && location.protocol === "https:";
    if (active?.type === "directTcp") return daemonOrigin(active.endpoint, secure);
    const profile = hosts.find((host) => host.serverId === serverId);
    const direct = profile?.connections.filter((connection) => connection.type === "directTcp");
    const preferred =
      direct?.find((connection) => connection.id === profile?.preferredConnectionId) ?? direct?.[0];
    return preferred?.type === "directTcp" ? daemonOrigin(preferred.endpoint, secure) : null;
  }, [active, hosts, serverId]);
}
