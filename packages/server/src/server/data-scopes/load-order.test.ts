import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { loadConfig } from "../config.js";
import { applyOwnerProfile, findProfileDir, readOwnerProfile } from "../owner-profile.js";
import { SecretVault, resolveVaultKeySource } from "../secrets/vault.js";
import { envNumber } from "../voice-env.js";
import { VoiceSettingsStore } from "../voice-settings/store.js";
import { prepareConfigSecrets } from "./config-secrets.js";
import {
  PROVIDER_SETTINGS_SITE,
  resolveSecretRefs,
  setLoadedConfigSecrets,
} from "./secret-refs.js";

// The load order, each layer over the one before: built-in defaults → setup (config.json,
// voice-settings.json) → the user's personal values (the personal folder's settings.json, then
// the launch environment) → secrets by name, filled where they are used. voice-settings.json
// stays the live layer for the voice knobs, over the env as before (store.test.ts).

const STORED = ["stored", "value", "51c0"].join("-");

const dirs: string[] = [];
const stores: VoiceSettingsStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.stop();
  setLoadedConfigSecrets(null);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function layers() {
  const root = mkdtempSync(path.join(tmpdir(), "load-order-"));
  dirs.push(root);
  const paseoHome = path.join(root, "paseo-home");
  const hizuriHome = path.join(root, "hizuri");
  const profileDir = path.join(hizuriHome, "personal");
  mkdirSync(paseoHome, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  return {
    root,
    paseoHome,
    profileDir,
    env: { PASEO_HOME: paseoHome, HIZURI_HOME: hizuriHome } as NodeJS.ProcessEnv,
    config: (value: unknown) =>
      writeFileSync(path.join(paseoHome, "config.json"), JSON.stringify(value)),
    personal: (env: Record<string, string>) =>
      writeFileSync(path.join(profileDir, "settings.json"), JSON.stringify({ env })),
  };
}

/** What the daemon's start does with the personal folder: its knobs become env defaults. */
function withPersonal(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  const dir = findProfileDir(next);
  if (dir) applyOwnerProfile(next, readOwnerProfile(dir));
  return next;
}

describe("load order: defaults → setup → personal → secrets", () => {
  test("each layer wins over the one before it", () => {
    const home = layers();

    // 1. Built-in defaults.
    expect(loadConfig(home.paseoHome, { env: withPersonal(home.env) }).listen).toBe(
      "127.0.0.1:6767",
    );

    // 2. Setup: config.json.
    home.config({ version: 1, daemon: { listen: "127.0.0.1:7001" } });
    expect(loadConfig(home.paseoHome, { env: withPersonal(home.env) }).listen).toBe(
      "127.0.0.1:7001",
    );

    // 3. Personal: the personal folder's settings.json, and the launch env over it.
    home.personal({ PASEO_LISTEN: "127.0.0.1:7002" });
    expect(loadConfig(home.paseoHome, { env: withPersonal(home.env) }).listen).toBe(
      "127.0.0.1:7002",
    );
    const launched = withPersonal({ ...home.env, PASEO_LISTEN: "127.0.0.1:7003" });
    expect(loadConfig(home.paseoHome, { env: launched }).listen).toBe("127.0.0.1:7003");
  });

  test("secrets come last: the configuration keeps the name, the agent's env gets the value", async () => {
    const home = layers();
    const vaultDir = path.join(home.profileDir, "vault");
    const vault = new SecretVault({
      dir: vaultDir,
      key: {
        load: async () =>
          (
            await resolveVaultKeySource({ vaultDir, keyFile: path.join(home.root, "vault.key") })
          ).load(),
      },
    });
    await vault.store({
      name: "agent-token",
      kind: "text",
      why: "test",
      values: { value: STORED },
    });
    home.config({
      version: 1,
      agents: {
        providers: {
          custom: { extends: "claude", label: "C", env: { API_TOKEN: "!secret agent-token" } },
        },
      },
    });

    await prepareConfigSecrets({ env: home.env, openSource: () => vault });
    const config = loadConfig(home.paseoHome, { env: withPersonal(home.env) });

    expect(config.providerOverrides?.custom?.env?.API_TOKEN).toBe("!secret agent-token");
    // What provider-registry.ts does with them when it builds the agents' settings.
    const filled = resolveSecretRefs({
      value: config.providerOverrides,
      ...PROVIDER_SETTINGS_SITE,
    });
    expect(filled?.custom?.env?.API_TOKEN).toBe(STORED);
  });

  test("voice-settings.json still wins over the env and the personal folder for a voice knob", () => {
    const home = layers();
    home.personal({ PASEO_TTS_GAIN_DB: "1" });
    const file = path.join(home.paseoHome, "voice-settings.json");
    writeFileSync(file, JSON.stringify({ PASEO_TTS_GAIN_DB: 4 }));
    const quiet = { info: () => undefined, warn: () => undefined };
    const store = new VoiceSettingsStore({ file, logger: quiet, env: withPersonal(home.env) });
    stores.push(store);
    store.start();

    expect(envNumber("PASEO_TTS_GAIN_DB", 0)).toBe(4);
  });
});
