import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSelect } from "@/components/settings";
import { SHOW_TAB_SWITCHERS, type ShowTabSwitcher, useAppSettings } from "@/hooks/use-settings";

// hizuri: how the user moves between Zuri's Show tabs (stage/tabs/switcher.tsx). All four
// prototypes are kept as choices.

export function ShowTabSwitcherRow() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const options = useMemo(
    () =>
      SHOW_TAB_SWITCHERS.map((value) => ({
        value,
        label: t(`settings.appearance.show.switcher.${value}.label`),
        description: t(`settings.appearance.show.switcher.${value}.description`),
      })),
    [t],
  );
  const handleChange = useCallback(
    (showTabSwitcher: ShowTabSwitcher) => void updateSettings({ showTabSwitcher }),
    [updateSettings],
  );
  const selected = options.find((option) => option.value === settings.showTabSwitcher);
  return (
    <SettingsSelect
      label={t("settings.appearance.show.switcher.title")}
      hint={selected?.description}
      value={settings.showTabSwitcher}
      options={options}
      onValueChange={handleChange}
      testID="settings-show-tab-switcher"
    />
  );
}
