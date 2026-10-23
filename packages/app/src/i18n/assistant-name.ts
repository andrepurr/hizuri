import { useEffect } from "react";
import type { i18n as I18n } from "i18next";
import { useSessionStore } from "@/stores/session-store";

// hizuri: the assistant's name in the interface. Every language file holds the default name
// (`assistant.name`, Zuri) and its strings nest it as `$t(assistant.name)`. A host where the user
// renamed the assistant (PASEO_ASSISTANT_NAME) sends the name in server_info; it replaces the
// default in every language, or the language's own spelling when the host has one.

export interface AssistantNames {
  name: string;
  byLanguage?: Record<string, string>;
}

const KEY = "assistant.name";
const defaults = new Map<string, string>();

export function applyAssistantName(i18n: I18n, names: AssistantNames | null): void {
  // The store holds every language loaded so far, the lazily loaded ones included.
  for (const language of Object.keys(i18n.store?.data ?? {})) {
    const current = i18n.getResource(language, "translation", KEY);
    if (typeof current === "string" && !defaults.has(language)) {
      defaults.set(language, current);
    }
    const base = language.split("-")[0] ?? language;
    const name = names ? (names.byLanguage?.[base] ?? names.name) : defaults.get(language);
    if (name && name !== current) {
      i18n.addResource(language, "translation", KEY, name);
    }
  }
}

/**
 * Applies the names now and to every language loaded later: the app loads a language's strings
 * only when it is chosen (i18next.ts). Returns the unsubscribe.
 */
export function watchAssistantName(i18n: I18n, names: AssistantNames | null): () => void {
  const apply = () => applyAssistantName(i18n, names);
  apply();
  i18n.on("loaded", apply);
  return () => i18n.off("loaded", apply);
}

/** Keeps the interface's name in step with the first connected host that sends one. */
export function useAssistantNameSync(i18n: I18n): void {
  const names = useSessionStore((state) => {
    for (const session of Object.values(state.sessions)) {
      const own = session.serverInfo?.assistantName;
      if (own) {
        return JSON.stringify(own);
      }
    }
    return "";
  });
  useEffect(
    () => watchAssistantName(i18n, names ? (JSON.parse(names) as AssistantNames) : null),
    [i18n, names],
  );
}
