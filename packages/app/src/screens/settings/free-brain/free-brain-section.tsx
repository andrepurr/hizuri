import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@/components/settings";
import { useToast } from "@/contexts/toast-api-context";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { FREE_BRAIN_PROVIDER } from "@/provider-selection/resolve-agent-form";
import { useHosts } from "@/runtime/host-runtime";

type FreeBrainStatus = "ready" | "off" | "checking" | "unavailable";

/**
 * hizuri: the free starter brain in Settings. It is on by default and paid by
 * hizuri through our relay; the user only sees whether it works, can switch it off, and is told
 * that Claude Code is the brain without our limit. Hidden when the host has no such provider.
 */
export function FreeBrainSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const serverId = useHosts()[0]?.serverId ?? null;
  const { entries } = useProvidersSnapshot(serverId);
  const { patchConfig } = useDaemonConfig(serverId);
  const [pending, setPending] = useState(false);

  const freeBrain = entries?.find((entry) => entry.provider === FREE_BRAIN_PROVIDER);
  const claudeReady = entries?.some(
    (entry) => entry.provider === "claude" && entry.enabled && entry.status === "ready",
  );

  const toggle = useCallback(
    async (enabled: boolean) => {
      setPending(true);
      try {
        await patchConfig({ providers: { [FREE_BRAIN_PROVIDER]: { enabled } } });
      } catch {
        toast.error(t("freeBrain.error"));
      } finally {
        setPending(false);
      }
    },
    [patchConfig, t, toast],
  );

  if (!serverId || !freeBrain) return null;
  const status = freeBrainStatus(freeBrain);

  return (
    <SettingsSection title={t("freeBrain.title")}>
      <SettingsCard testID="free-brain-section">
        <SettingsSwitch
          label={t("freeBrain.label")}
          hint={`${t(`freeBrain.status.${status}`)}. ${t("freeBrain.description")}`}
          value={freeBrain.enabled}
          onValueChange={toggle}
          disabled={pending}
        />
        <SettingsRow
          label={t("freeBrain.claudeCode.label")}
          hint={t(claudeReady ? "freeBrain.claudeCode.connected" : "freeBrain.claudeCode.howTo")}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function freeBrainStatus(entry: { enabled: boolean; status: string }): FreeBrainStatus {
  if (!entry.enabled) return "off";
  if (entry.status === "ready") return "ready";
  if (entry.status === "loading") return "checking";
  return "unavailable";
}
