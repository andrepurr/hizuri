import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { useAppSettings } from "@/hooks/use-settings";
import { useAssistantNameSync } from "./assistant-name";
import { i18n } from "./i18next";
import { resolveSupportedLocale } from "./locales";
import { ensureI18nLanguageForRender } from "./sync-language";

interface I18nProviderProps {
  children: ReactNode;
}

const ENGLISH_FIRST: readonly string[] = ["en"];

export function I18nProvider({ children }: I18nProviderProps) {
  const { settings } = useAppSettings();
  // Hizuri: the interface is English unless the user picks a language in Settings; "system"
  // means English, not the phone's language.
  const locale = resolveSupportedLocale(settings.language, ENGLISH_FIRST);

  ensureI18nLanguageForRender(locale, i18n);
  useAssistantNameSync(i18n);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
