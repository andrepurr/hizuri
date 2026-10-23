import { createInstance, type BackendModule, type i18n as I18n } from "i18next";
import { afterEach, describe, expect, it } from "vitest";
import { applyAssistantName, watchAssistantName } from "./assistant-name";
import { ja } from "./resources/ja";

// The app bundles every language but loads all except English only when chosen (i18next.ts), so
// a language can arrive after the host's name was applied.

const bundles: Record<string, { assistant: { name: string } }> = {
  en: { assistant: { name: "Zuri" } },
  fr: { assistant: { name: "Zuri" } },
  ja: { assistant: { name: ja.assistant.name } },
};

const lazyBundles: BackendModule = {
  type: "backend",
  init() {},
  read(language, _namespace, callback) {
    callback(null, bundles[language]);
  },
};

const instances: I18n[] = [];

async function createLazyI18n(): Promise<I18n> {
  const i18n = createInstance();
  await i18n.use(lazyBundles).init({
    lng: "en",
    fallbackLng: "en",
    partialBundledLanguages: true,
    resources: { en: { translation: bundles.en } },
  });
  instances.push(i18n);
  return i18n;
}

afterEach(() => {
  for (const i18n of instances.splice(0)) applyAssistantName(i18n, null);
});

describe("the assistant's name from the host", () => {
  it("reaches a language that was loaded before the name came", async () => {
    const i18n = await createLazyI18n();
    await i18n.changeLanguage("ja");

    applyAssistantName(i18n, { name: "Nova", byLanguage: { ja: "Nova (ja)" } });

    expect(i18n.t("assistant.name")).toBe("Nova (ja)");
  });

  it("reaches a language loaded after the name came", async () => {
    const i18n = await createLazyI18n();
    const stop = watchAssistantName(i18n, { name: "Nova", byLanguage: { ja: "Nova (ja)" } });

    await i18n.changeLanguage("ja");
    expect(i18n.t("assistant.name")).toBe("Nova (ja)");
    await i18n.changeLanguage("fr");
    expect(i18n.t("assistant.name")).toBe("Nova");
    stop();
  });

  it("gives every language its own default back when the host has no name", async () => {
    const i18n = await createLazyI18n();
    await i18n.changeLanguage("ja");
    applyAssistantName(i18n, { name: "Nova" });

    applyAssistantName(i18n, null);

    expect(i18n.t("assistant.name")).toBe(ja.assistant.name);
    await i18n.changeLanguage("en");
    expect(i18n.t("assistant.name")).toBe("Zuri");
  });
});
