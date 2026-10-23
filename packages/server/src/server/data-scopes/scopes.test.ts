import { describe, expect, test } from "vitest";
import { z } from "zod";

import { configurationEnvironment } from "../config-environment.js";
import { VOICE_KNOBS } from "../voice-settings/knobs.js";
import {
  DAEMON_ENV_SCOPES,
  DATA_SCOPES,
  configPathScope,
  configSchemaLeafPaths,
  hasOwnScopeRule,
  scopeByName,
  settingScope,
  tokenShape,
} from "./scopes.js";

describe("every setting the daemon reads has a scope", () => {
  test("every voice knob", () => {
    const unscoped = VOICE_KNOBS.filter((knob) => !DATA_SCOPES.includes(knob.scope));
    expect(unscoped.map((knob) => knob.key)).toEqual([]);
    // Tuning knobs are shareable; the stop-word regex is free text that may name people.
    expect(VOICE_KNOBS.filter((knob) => knob.scope !== "setup").map((knob) => knob.key)).toEqual([
      "PASEO_BARGE_STOP_RE",
    ]);
  });

  test("every env key of config-environment.ts", () => {
    const keys = Object.keys(configurationEnvironment({}));
    expect(keys.length).toBeGreaterThan(70);
    expect(keys.filter((key) => DAEMON_ENV_SCOPES[key] === undefined)).toEqual([]);
  });

  test("every field of the config.json schema, arrays and unions included, has its own rule", () => {
    const leaves = configSchemaLeafPaths();
    expect(leaves.length).toBeGreaterThan(110);
    expect(leaves.filter((leaf) => !hasOwnScopeRule(leaf)).map((leaf) => leaf.join("."))).toEqual(
      [],
    );
  });

  test("a new schema field without a rule is caught, also inside a list", () => {
    const grown = z.object({
      daemon: z
        .object({
          listen: z.string(),
          somethingNew: z.string().optional(),
          terminalProfiles: z.array(z.object({ id: z.string(), shell: z.string() })),
        })
        .optional(),
    });
    expect(
      configSchemaLeafPaths(grown)
        .filter((leaf) => !hasOwnScopeRule(leaf))
        .map((leaf) => leaf.join(".")),
    ).toEqual(["daemon.somethingNew", "daemon.terminalProfiles.*.shell"]);
  });
});

describe("scope rules", () => {
  test("config paths: the longest rule wins, record keys by name, array items like their field", () => {
    expect(configPathScope(["daemon", "relay", "enabled"])).toBe("setup");
    expect(configPathScope(["daemon", "relay", "endpoint"])).toBe("personal");
    expect(configPathScope(["daemon", "hostnames", "0"])).toBe("personal");
    expect(configPathScope(["daemon", "auth", "password"])).toBe("secret");
    expect(configPathScope(["agents", "providers", "x", "label"])).toBe("setup");
    expect(configPathScope(["agents", "providers", "x", "command", "0"])).toBe("personal");
    expect(configPathScope(["agents", "providers", "x", "env", "ANTHROPIC_AUTH_TOKEN"])).toBe(
      "secret",
    );
    expect(configPathScope(["agents", "providers", "x", "env", "ANTHROPIC_BASE_URL"])).toBe(
      "personal",
    );
    expect(configPathScope(["agents", "providers", "x", "env", "API_TIMEOUT_MS"])).toBe("setup");
    expect(configPathScope(["daemon"])).toBeNull();
    expect(configPathScope(["daemon", "terminalProfiles", "0", "args", "1"])).toBe("personal");
    expect(configPathScope(["daemon", "agentProfiles", "0", "notes"])).toBe("personal");
    expect(configPathScope(["plugins", "x", "path"])).toBe("personal");
    // A key the schema lets through unnamed has no scope (the export drops it)…
    expect(configPathScope(["daemon", "mcp", "servers"])).toBeNull();
    // …unless it is named like a credential, at any depth.
    expect(configPathScope(["daemon", "mcp", "authToken"])).toBe("secret");
    expect(configPathScope(["daemon", "terminalProfiles", "0", "env", "DB_PASSWORD"])).toBe(
      "secret",
    );
  });

  test("names: credentials are secret, places and people personal, the rest setup", () => {
    for (const key of [
      "ANTHROPIC_AUTH_TOKEN",
      "OPENAI_API_KEY",
      "CLIENT_SECRET",
      "apiKey",
      "Authorization",
    ]) {
      expect(scopeByName(key)).toBe("secret");
    }
    for (const key of ["CLAUDE_CONFIG_DIR", "ANTHROPIC_BASE_URL", "VOICE_LOG", "modelsDir"]) {
      expect(scopeByName(key)).toBe("personal");
    }
    for (const key of [
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "API_TIMEOUT_MS",
      "enabled",
      "hotkey",
      "monkey",
      "GOOGLE_APPLICATION_CREDENTIALS_MODE",
    ]) {
      expect(scopeByName(key)).toBe("setup");
    }
  });

  test("env-style settings: known tables first, an unknown key is personal", () => {
    expect(settingScope("PASEO_TTS_GAIN_DB")).toBe("setup");
    expect(settingScope("PASEO_VOICE_LANGUAGE")).toBe("setup");
    expect(settingScope("PASEO_USER_NAME")).toBe("personal");
    expect(settingScope("PASEO_ASSISTANT_NAME_DE")).toBe("personal");
    expect(settingScope("HIZURI_VAULT_PASSPHRASE")).toBe("secret");
    expect(settingScope("SOME_NEW_KNOB")).toBe("personal");
    expect(settingScope("SOME_NEW_TOKEN")).toBe("secret");
  });

  test("token shapes", () => {
    expect(tokenShape(["gh", "p_", "a1B2".repeat(9)].join(""))).toBe("github-token");
    expect(tokenShape(["sk-", "ant-", "api03-", "x".repeat(30)].join(""))).toBe(
      "anthropic-api-key",
    );
    expect(tokenShape("claude-opus-4-5")).toBeNull();
    expect(tokenShape("127.0.0.1:6767")).toBeNull();
  });
});
