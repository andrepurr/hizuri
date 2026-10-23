import { useCallback, useMemo } from "react";
import { Alert, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  SettingsCard,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@/components/settings";
import { floatNative } from "@/float/float-native";
import { useAppSettings, type AppSettings } from "@/hooks/use-settings";

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

export function ChatSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();

  const toolCallDetailOptions = useMemo(
    () =>
      TOOL_CALL_DETAIL_LEVELS.map((value) => ({
        value,
        label: t(`settings.general.toolCallDetail.options.${value}`),
      })),
    [t],
  );

  const changeToolCallDetailLevel = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) =>
      void updateSettings({ toolCallDetailLevel }),
    [updateSettings],
  );
  const changeAutoExpandReasoning = useCallback(
    (autoExpandReasoning: boolean) => void updateSettings({ autoExpandReasoning }),
    [updateSettings],
  );
  const changeFaceInVoiceMode = useCallback(
    (faceInVoiceMode: boolean) => void updateSettings({ faceInVoiceMode }),
    [updateSettings],
  );

  // Floating Zuri needs the "Display over other apps" switch; turning it on without it says so
  // and opens that page. It starts once the user comes back with it allowed.
  const changeFloatOverApps = useCallback(
    (floatOverApps: boolean) => {
      void updateSettings({ floatOverApps });
      if (!floatOverApps || !floatNative || floatNative.canDrawOverlays()) return;
      Alert.alert(t("face.float.permissionTitle"), t("face.float.permissionMessage"), [
        { text: t("common.actions.cancel"), style: "cancel" },
        {
          text: t("face.float.permissionOpen"),
          onPress: () => {
            floatNative?.openOverlaySettings();
          },
        },
      ]);
    },
    [t, updateSettings],
  );

  // hizuri: the simple version keeps only Zuri's own switches; how an agent's work is drawn in
  // the timeline belongs to the full version.
  const simple = settings.simpleMode;
  const timelineRows = simple
    ? null
    : [
        <SettingsSwitch
          key="reasoning"
          label={t("settings.general.autoExpandReasoning.label")}
          hint={t("settings.general.autoExpandReasoning.description")}
          value={settings.autoExpandReasoning}
          onValueChange={changeAutoExpandReasoning}
        />,
        <SettingsSelect
          key="tool-calls"
          label={t("settings.general.toolCallDetail.label")}
          hint={t("settings.general.toolCallDetail.description")}
          value={settings.toolCallDetailLevel}
          options={toolCallDetailOptions}
          onValueChange={changeToolCallDetailLevel}
        />,
      ];

  return (
    <View>
      <SettingsSection
        title={simple ? t("simpleMode.menu.assistant") : t("settings.appearance.detailLevel.title")}
      >
        <SettingsCard>
          {timelineRows}
          <SettingsSwitch
            label={t("face.inVoiceMode.label")}
            hint={t("face.inVoiceMode.description")}
            value={settings.faceInVoiceMode}
            onValueChange={changeFaceInVoiceMode}
          />
          {floatNative ? (
            <SettingsSwitch
              label={t("face.float.label")}
              hint={t("face.float.description")}
              value={settings.floatOverApps}
              onValueChange={changeFloatOverApps}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    </View>
  );
}
