import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createProviderEnvSpec } from "../agent/provider-launch-config.js";
import { loadConfig } from "../config.js";
import { resolveRegistryPlugin } from "../plugins/managed-source/registry.js";
import { resolveOpenAiSpeechConfig } from "../speech/providers/openai/config.js";
import type { PersistedConfig } from "../persisted-config.js";
import { SecretError, SecretVault, resolveVaultKeySource } from "../secrets/vault.js";
import {
  findLiteralSecrets,
  logConfigSecretsReport,
  prepareConfigSecrets,
  type ConfigSecretsReport,
  type SecretSource,
} from "./config-secrets.js";
import {
  ConfigSecretError,
  PROVIDER_SETTINGS_SITE,
  resolveSecretKnob,
  resolveSecretRefs,
  setLoadedConfigSecrets,
} from "./secret-refs.js";

/** What provider-registry.ts does with the configured provider settings. */
function fillProviders(env: Record<string, string>, extra: Record<string, string> = {}) {
  return resolveSecretRefs({ value: { custom: { ...extra, env } }, ...PROVIDER_SETTINGS_SITE });
}

// Invented values, built at run time so no token shape sits in the source.
const STORED = ["stored", "value", "4f7e1c"].join("-");
const OTHER = ["other", "value", "9a2b3d"].join("-");
const PLANTED_TOKEN = ["gh", "p_", "Zq3".repeat(12)].join("");
const HEX_TOKEN = "a1b2c3d4".repeat(5);

const dirs: string[] = [];

afterEach(() => {
  setLoadedConfigSecrets(null);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface TestHome {
  root: string;
  env: NodeJS.ProcessEnv;
  paseoHome: string;
  vault: SecretVault;
  writeConfig(config: unknown): void;
}

function testHome(extraEnv: NodeJS.ProcessEnv = {}): TestHome {
  const root = mkdtempSync(path.join(tmpdir(), "config-secrets-"));
  dirs.push(root);
  const paseoHome = path.join(root, "paseo-home");
  const vaultDir = path.join(root, "vault");
  mkdirSync(paseoHome, { recursive: true });
  const vault = new SecretVault({
    dir: vaultDir,
    key: {
      load: async () =>
        (await resolveVaultKeySource({ vaultDir, keyFile: path.join(root, "vault.key") })).load(),
    },
  });
  return {
    root,
    // HIZURI_HOME points at an empty folder: the test never reads a real personal folder.
    env: { PASEO_HOME: paseoHome, HIZURI_HOME: path.join(root, "hizuri"), ...extraEnv },
    paseoHome,
    vault,
    writeConfig: (config) =>
      writeFileSync(path.join(paseoHome, "config.json"), JSON.stringify(config, null, 2)),
  };
}

function prepare(home: TestHome, source: SecretSource = home.vault): Promise<ConfigSecretsReport> {
  return prepareConfigSecrets({ env: home.env, openSource: () => source });
}

function providerConfig(env: Record<string, string>) {
  return { version: 1, agents: { providers: { custom: { extends: "claude", label: "C", env } } } };
}

async function thrown(work: Promise<unknown>): Promise<ConfigSecretError> {
  const error = await work.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ConfigSecretError);
  return error as ConfigSecretError;
}

function expectNoValue(text: string, values: readonly string[]): void {
  for (const value of values) expect(text).not.toContain(value);
}

describe("!secret references in config.json", () => {
  test("a configured provider env reference resolves; an env an agent passes at run time does not", async () => {
    const home = testHome();
    await home.vault.store({
      name: "test-token",
      kind: "text",
      why: "test",
      values: { value: STORED },
    });
    home.writeConfig(providerConfig({ API_TOKEN: "!secret test-token", MODEL: "m-1" }));

    const report = await prepare(home);

    expect(report.resolved).toEqual([
      { path: "agents.providers.custom.env.API_TOKEN", name: "test-token" },
    ]);
    expect(report.problems).toEqual([]);
    // The configured env gets the value; the same text in another field stays text.
    expect(
      fillProviders(
        { API_TOKEN: "!secret test-token", MODEL: "m-1" },
        { label: "!secret test-token" },
      ),
    ).toEqual({
      custom: { label: "!secret test-token", env: { API_TOKEN: STORED, MODEL: "m-1" } },
    });
    // An env layered on at run time (a terminal or create-agent request) keeps its text.
    const spec = createProviderEnvSpec({ overlays: [{ X: "!secret test-token" }] });
    expect(spec.envOverlay.X).toBe("!secret test-token");
  });

  test("the OpenAI speech keys resolve, and a field of a secret with several is picked by name", async () => {
    const home = testHome();
    await home.vault.store({
      name: "speech",
      kind: "password",
      why: "test",
      values: { username: OTHER, password: STORED },
    });
    home.writeConfig({ version: 1, providers: { openai: { apiKey: "!secret speech.password" } } });

    await prepare(home);

    const persisted = { providers: { openai: { apiKey: "!secret speech.password" } } };
    const openai = { provider: "openai", enabled: true, explicit: true } as const;
    const speech = resolveOpenAiSpeechConfig({
      env: {},
      persisted: persisted as PersistedConfig,
      providers: {
        dictationStt: openai,
        voiceTurnDetection: openai,
        voiceStt: openai,
        voiceTts: openai,
      },
    });
    expect(speech?.stt?.apiKey).toBe(STORED);
    expect(speech?.tts?.apiKey).toBe(STORED);
  });

  test("spaces around a reference in a field the schema trims still resolve when the config loads", async () => {
    const home = testHome({
      PASEO_DICTATION_STT_PROVIDER: "openai",
      PASEO_VOICE_STT_PROVIDER: "openai",
      PASEO_VOICE_TTS_PROVIDER: "openai",
    });
    await home.vault.store({
      name: "speech-key",
      kind: "text",
      why: "test",
      values: { value: STORED },
    });
    home.writeConfig({
      version: 1,
      providers: {
        openai: {
          stt: { apiKey: " !secret speech-key " },
          tts: { apiKey: "!secret speech-key  " },
        },
      },
    });

    expect((await prepare(home)).problems).toEqual([]);

    const config = loadConfig(home.paseoHome, { env: home.env });
    expect(config.openai?.stt?.apiKey).toBe(STORED);
    expect(config.openai?.tts?.apiKey).toBe(STORED);
  });

  test("a plugin registry's authorization resolves into the request header", async () => {
    const home = testHome();
    await home.vault.store({
      name: "registry",
      kind: "text",
      why: "test",
      values: { value: STORED },
    });
    const seen: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      seen.push(request.headers.authorization);
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
      const registries = { [host]: { authorization: "!secret registry" } };
      home.writeConfig({ version: 1, pluginRegistries: registries });
      await prepare(home);

      await resolveRegistryPlugin(
        { url: `http://${host}`, id: "test/plugin" },
        { registries },
        false,
      ).catch(() => undefined);
      expect(seen).toEqual([STORED]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("an unknown name: by default logged by field, never by name or value, and the setting stays unset", async () => {
    const home = testHome();
    await home.vault.store({ name: "known", kind: "text", why: "test", values: { value: STORED } });
    home.writeConfig(
      providerConfig({ API_TOKEN: `!secret ${HEX_TOKEN}`, OTHER_TOKEN: "!secret known" }),
    );

    const report = await prepare(home);

    expect(report.problems).toEqual([
      {
        path: "agents.providers.custom.env.API_TOKEN",
        code: "unknown-secret",
        message:
          "agents.providers.custom.env.API_TOKEN: the vault holds no secret of that name (compare with secret_list)",
      },
    ]);
    expect(report.resolved.map((ref) => ref.path)).toEqual([
      "agents.providers.custom.env.OTHER_TOKEN",
    ]);
    expect(
      fillProviders({ API_TOKEN: `!secret ${HEX_TOKEN}`, OTHER_TOKEN: "!secret known" }),
    ).toEqual({ custom: { env: { API_TOKEN: undefined, OTHER_TOKEN: STORED } } });
    expectNoValue(JSON.stringify(report), [HEX_TOKEN, STORED]);
  });

  test("an unknown name with HIZURI_CONFIG_SECRETS=refuse stops the start, naming the field only", async () => {
    const home = testHome({ HIZURI_CONFIG_SECRETS: "refuse" });
    home.writeConfig(providerConfig({ API_TOKEN: `!secret ${HEX_TOKEN}` }));

    const error = await thrown(prepare(home));

    expect(error.code).toBe("unknown-secret");
    expect(error.fields).toEqual(["agents.providers.custom.env.API_TOKEN"]);
    expectNoValue(error.message, [HEX_TOKEN]);
  });

  test("a secret with several fields needs the field named", async () => {
    const home = testHome();
    await home.vault.store({
      name: "login",
      kind: "password",
      why: "test",
      values: { username: OTHER, password: STORED },
    });
    home.writeConfig(providerConfig({ API_TOKEN: "!secret login" }));

    const report = await prepare(home);

    expect(report.problems.map((problem) => problem.code)).toEqual(["secret-field"]);
    expect(report.problems[0]?.message).toContain('"!secret login.<field>"');
    expectNoValue(JSON.stringify(report), [STORED, OTHER]);
  });

  test("a token pasted after !secret is malformed: reported by field, never quoted", async () => {
    const home = testHome();
    home.writeConfig(providerConfig({ API_TOKEN: `!secret ${PLANTED_TOKEN}` }));

    const report = await prepare(home);

    expect(report.problems.map((problem) => [problem.path, problem.code])).toEqual([
      ["agents.providers.custom.env.API_TOKEN", "bad-reference"],
    ]);
    expectNoValue(JSON.stringify(report), [PLANTED_TOKEN]);
    expect(fillProviders({ API_TOKEN: `!secret ${PLANTED_TOKEN}`, NOTE: "!secretive" })).toEqual({
      // Text that only starts like the word is no reference.
      custom: { env: { API_TOKEN: undefined, NOTE: "!secretive" } },
    });
  });

  test("a reference in a field the daemon does not fill is reported, and refused with refuse", async () => {
    const home = testHome();
    home.writeConfig({ version: 1, daemon: { listen: "!secret listen-address" } });
    const report = await prepare(home);
    expect(report.problems.map((problem) => [problem.path, problem.code])).toEqual([
      ["daemon.listen", "unsupported-field"],
    ]);
    // A provider label is not a filled field either: its reference stays text at use.
    expect(fillProviders({}, { label: "!secret listen-address" })).toEqual({
      custom: { label: "!secret listen-address", env: {} },
    });

    const strict = testHome({ HIZURI_CONFIG_SECRETS: "refuse" });
    strict.writeConfig({ version: 1, daemon: { listen: "!secret listen-address" } });
    expect((await thrown(prepare(strict))).code).toBe("unsupported-field");
  });

  test("a locked vault or a failing backend is reported by kind, never with the backend's text", async () => {
    const locked: SecretSource = {
      reveal: () => Promise.reject(new SecretError("locked", "the vault needs its passphrase")),
    };
    const failing: SecretSource = {
      reveal: () => Promise.reject(new Error(`bw printed ${STORED}`)),
    };
    const home = testHome();
    home.writeConfig(providerConfig({ API_TOKEN: "!secret test-token" }));

    const lockedReport = await prepare(home, locked);
    expect(lockedReport.problems).toEqual([
      {
        path: "agents.providers.custom.env.API_TOKEN",
        code: "vault",
        message:
          "agents.providers.custom.env.API_TOKEN: the vault is locked: the vault needs its passphrase",
      },
    ]);
    const failingReport = await prepare(home, failing);
    expect(failingReport.problems[0]?.message).toBe(
      "agents.providers.custom.env.API_TOKEN: the vault failed (Error)",
    );
  });

  test("a reference the start never saw fails where it is used; outside the daemon none is filled", () => {
    expect(fillProviders({ A: "!secret late" })).toEqual({
      custom: { env: { A: "!secret late" } },
    });

    setLoadedConfigSecrets(new Map());
    expect(() => fillProviders({ A: "!secret late" })).toThrow(
      "agents.providers.custom.env.A names a secret that was not opened at daemon start",
    );
    const plain = { custom: { env: { A: "plain" } } };
    expect(resolveSecretRefs({ value: plain, ...PROVIDER_SETTINGS_SITE })).toBe(plain);
  });
});

describe("!secret references in the env knobs (the personal settings.json)", () => {
  const KNOB = "PASEO_FAST_FRONT_WORK_BOARD_TOKEN";

  function writeProfile(home: TestHome, env: Record<string, string>): void {
    const dir = path.join(home.root, "hizuri", "personal");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ env }));
  }

  test("a knob in the personal settings resolves where it is used; the env keeps the reference", async () => {
    const home = testHome();
    await home.vault.store({ name: "board", kind: "text", why: "test", values: { value: STORED } });
    writeProfile(home, { [KNOB]: "!secret board" });

    const report = await prepare(home);

    expect(report.resolved).toEqual([{ path: `env.${KNOB}`, name: "board" }]);
    expect(report.problems).toEqual([]);
    expect(resolveSecretKnob(KNOB, "!secret board")).toBe(STORED);
    // The daemon's env is not touched: agent processes inherit the reference, not the value.
    expect(home.env[KNOB]).toBeUndefined();
    expectNoValue(JSON.stringify(report), [STORED]);
  });

  test("the same knob set in the daemon's own env resolves too, with or without config.json", async () => {
    const home = testHome({ [KNOB]: "!secret board" });
    await home.vault.store({ name: "board", kind: "text", why: "test", values: { value: STORED } });

    const report = await prepare(home);

    expect(report.resolved).toEqual([{ path: `env.${KNOB}`, name: "board" }]);
    expect(resolveSecretKnob(KNOB, "!secret board")).toBe(STORED);
  });

  test("a missing secret names the knob, never the value, and leaves it unset", async () => {
    const home = testHome();
    writeProfile(home, { [KNOB]: `!secret ${HEX_TOKEN}` });

    const report = await prepare(home);

    expect(report.problems).toEqual([
      {
        path: `env.${KNOB}`,
        code: "unknown-secret",
        message: `env.${KNOB}: the vault holds no secret of that name (compare with secret_list)`,
      },
    ]);
    expect(report.resolved).toEqual([]);
    expect(resolveSecretKnob(KNOB, `!secret ${HEX_TOKEN}`)).toBeUndefined();
    expectNoValue(JSON.stringify(report), [HEX_TOKEN]);

    const refusing = testHome({ HIZURI_CONFIG_SECRETS: "refuse" });
    writeProfile(refusing, { [KNOB]: `!secret ${HEX_TOKEN}` });
    const error = await thrown(prepare(refusing));
    expect(error.code).toBe("unknown-secret");
    expect(error.fields).toEqual([`env.${KNOB}`]);
    expectNoValue(error.message, [HEX_TOKEN]);
  });

  test("plain values stay as written and open no vault; a reference in another knob is reported, not filled", async () => {
    const home = testHome();
    writeProfile(home, { [KNOB]: "plain-token", PASEO_TIME_ZONE: "Europe/Berlin" });
    let opened = 0;
    const counting: SecretSource = {
      reveal: async (name) => {
        opened += 1;
        return home.vault.reveal(name);
      },
    };

    const report = await prepare(home, counting);

    expect(report.problems).toEqual([]);
    expect(opened).toBe(0);
    expect(resolveSecretKnob(KNOB, "plain-token")).toBe("plain-token");

    const other = testHome();
    writeProfile(other, { PASEO_TIME_ZONE: "!secret zone" });
    const otherReport = await prepare(other);
    expect(otherReport.problems).toEqual([
      {
        path: "env.PASEO_TIME_ZONE",
        code: "unsupported-field",
        message: `env.PASEO_TIME_ZONE: the daemon fills "!secret" only in the env knobs ${KNOB}; the text stays as written`,
      },
    ]);
    expect(resolveSecretKnob("PASEO_TIME_ZONE", "!secret zone")).toBe("!secret zone");
  });

  test("a knob changed since the start fails where it is used", async () => {
    const home = testHome();
    await home.vault.store({ name: "board", kind: "text", why: "test", values: { value: STORED } });
    writeProfile(home, { [KNOB]: "!secret board" });
    await prepare(home);

    expect(() => resolveSecretKnob(KNOB, "!secret other")).toThrow(
      `env.${KNOB} names a secret that was not opened at daemon start`,
    );
  });
});

describe("the start check for literal secrets", () => {
  const literalConfig = {
    version: 1,
    daemon: {
      listen: "127.0.0.1:7000",
      // A bcrypt hash is what set-password stores: not a literal secret.
      auth: { password: `$2b$10$${"a".repeat(53)}` },
    },
    agents: {
      providers: {
        custom: {
          extends: "claude",
          label: "C",
          env: { API_TOKEN: STORED, ANTHROPIC_API_KEY: "", NOTE: PLANTED_TOKEN, MODEL: "m-1" },
        },
      },
    },
    providers: { openai: { apiKey: OTHER } },
  };
  const literalFields = [
    "agents.providers.custom.env.API_TOKEN",
    "agents.providers.custom.env.NOTE",
    "providers.openai.apiKey",
  ];

  test("finds keys named like credentials, secret-scope fields and token shapes; empty values pass", () => {
    expect(findLiteralSecrets(literalConfig)).toEqual([
      { path: "agents.providers.custom.env.API_TOKEN", rule: "key-name" },
      { path: "agents.providers.custom.env.NOTE", rule: "github-token" },
      { path: "providers.openai.apiKey", rule: "key-name" },
    ]);
  });

  test("warn (the default) logs field names, never values, and the start goes on", async () => {
    const home = testHome();
    home.writeConfig(literalConfig);

    const report = await prepare(home);

    expect(report.mode).toBe("warn");
    expect(report.literal.map((finding) => finding.path)).toEqual(literalFields);
    const lines: Array<{ level: string; obj: object; msg: string }> = [];
    logConfigSecretsReport({
      logger: {
        info: (obj, msg) => lines.push({ level: "info", obj, msg }),
        warn: (obj, msg) => lines.push({ level: "warn", obj, msg }),
        error: (obj, msg) => lines.push({ level: "error", obj, msg }),
      },
      report,
    });
    expect(lines.map((line) => line.level)).toEqual(["warn"]);
    const logged = JSON.stringify(lines);
    expect(logged).toContain("agents.providers.custom.env.API_TOKEN (key-name)");
    expectNoValue(logged, [STORED, OTHER, PLANTED_TOKEN]);
  });

  test("HIZURI_CONFIG_SECRETS=refuse stops the start, naming the fields only", async () => {
    const home = testHome({ HIZURI_CONFIG_SECRETS: "refuse" });
    home.writeConfig(literalConfig);

    const error = await thrown(prepare(home));

    expect(error.code).toBe("literal-secret");
    expect(error.fields).toEqual(literalFields);
    expectNoValue(error.message, [STORED, OTHER, PLANTED_TOKEN]);
  });

  test("refuse set in the personal folder's settings.json counts too", async () => {
    const home = testHome();
    const personal = path.join(home.root, "hizuri", "personal");
    mkdirSync(personal, { recursive: true });
    writeFileSync(
      path.join(personal, "settings.json"),
      JSON.stringify({ env: { HIZURI_CONFIG_SECRETS: "refuse" } }),
    );
    home.writeConfig(literalConfig);

    expect((await thrown(prepare(home))).code).toBe("literal-secret");
  });

  test("refuse lets a config with references only start, and a typo in the mode is an error", async () => {
    const home = testHome({ HIZURI_CONFIG_SECRETS: "refuse" });
    await home.vault.store({
      name: "test-token",
      kind: "text",
      why: "test",
      values: { value: STORED },
    });
    home.writeConfig(providerConfig({ API_TOKEN: "!secret test-token" }));
    await expect(prepare(home)).resolves.toMatchObject({
      mode: "refuse",
      literal: [],
      problems: [],
    });

    const typo = testHome({ HIZURI_CONFIG_SECRETS: "refuze" });
    typo.writeConfig(providerConfig({}));
    expect((await thrown(prepare(typo))).code).toBe("bad-mode");
  });
});

describe("the daemon worker runs the check before anything else", () => {
  test("refuse with a literal token: the worker exits 1, naming the field, never the value", () => {
    const home = testHome();
    home.writeConfig(literalConfig());
    const worker = path.resolve(import.meta.dirname, "../daemon-worker.ts");
    const run = spawnSync(process.execPath, ["--import", "tsx", worker], {
      cwd: path.resolve(import.meta.dirname, "../../.."),
      env: {
        PATH: process.env.PATH,
        HOME: home.root,
        PASEO_HOME: home.paseoHome,
        HIZURI_HOME: path.join(home.root, "hizuri"),
        HIZURI_CONFIG_SECRETS: "refuse",
      },
      encoding: "utf8",
      timeout: 60_000,
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("agents.providers.custom.env.API_TOKEN");
    expect(`${run.stdout}${run.stderr}`).not.toContain(STORED);
  }, 90_000);

  function literalConfig() {
    return providerConfig({ API_TOKEN: STORED });
  }
});
