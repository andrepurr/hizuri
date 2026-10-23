import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-settings";
import { settingsStyles } from "@/styles/settings";

/** hizuri: the one switch for uploading app logs to the host. On by default. */
export function AppLogsRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const handleChange = useCallback(
    (uploadAppLogs: boolean) => void updateSettings({ uploadAppLogs }),
    [updateSettings],
  );
  return (
    <View style={settingsStyles.row} testID="upload-app-logs-row">
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.diagnostics.uploadLogs.label")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.diagnostics.uploadLogs.description")}
        </Text>
      </View>
      <Switch
        value={settings.uploadAppLogs}
        onValueChange={handleChange}
        accessibilityLabel={t("settings.diagnostics.uploadLogs.label")}
        testID="upload-app-logs-switch"
      />
    </View>
  );
}
