import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { exportableSetup, readSetupSources } from "./exportable-setup.js";

// Invented personal values and a token built at run time, so none of them sits in the source.
const PERSON = ["Quilla", "Marrowby"].join(" ");
const OTHER_PERSON = ["Tobin", "Askew"].join(" ");
const HOST = ["zed", "box", "example", "invalid"].join(".");
const PRIVATE_DIR = ["", "home", "zedtester", "private-notes"].join("/");
const TOKEN = ["gh", "p_", "Qw7".repeat(12)].join("");
const SECOND_TOKEN = ["sk-", "ant-", "api03-", "Rt5".repeat(12)].join("");

const GUARD = path.resolve(import.meta.dirname, "../../../../../scripts/personal-guard.mjs");

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "exportable-setup-"));
  dirs.push(dir);
  return dir;
}

const plantedConfig = {
  version: 1,
  daemon: {
    listen: `${HOST}:7000`,
    hostnames: [HOST],
    mcp: { injectIntoAgents: true },
    relay: { enabled: false, endpoint: `${HOST}:443` },
  },
  app: { baseUrl: `https://${HOST}/pair` },
  providers: { openai: { apiKey: "!secret speech-key", baseUrl: `http://${HOST}/v1` } },
  agents: {
    providers: {
      custom: {
        extends: "claude",
        label: "Custom",
        command: [`${PRIVATE_DIR}/bin/launcher`],
        env: {
          ANTHROPIC_AUTH_TOKEN: TOKEN,
          ANTHROPIC_API_KEY: "",
          ANTHROPIC_BASE_URL: `https://${HOST}/api`,
          ANTHROPIC_DEFAULT_OPUS_MODEL: "model-large",
          CLAUDE_CONFIG_DIR: PRIVATE_DIR,
          API_TIMEOUT_MS: "600000",
          NOTE: SECOND_TOKEN,
        },
        models: [{ id: "model-large", label: "Large", isDefault: true }],
        disallowedTools: ["WebSearch"],
      },
    },
  },
  features: { face: { avatarDir: PRIVATE_DIR }, voiceMode: { enabled: true } },
  worktrees: { root: PRIVATE_DIR },
};

const plantedVoiceSettings = { PASEO_TTS_GAIN_DB: 3, PASEO_BARGE_STOP_WORDS_ONLY: false };

const plantedProfileEnv = {
  PASEO_USER_NAME: PERSON,
  PASEO_OTHER_PEOPLE: OTHER_PERSON,
  PASEO_TIME_ZONE: "Atlantic/Example",
  PASEO_SHOW_FILE_DIRS: PRIVATE_DIR,
  PASEO_VOICE_LANGUAGE: "en",
  PASEO_FAST_FRONT_SKIP_PROVIDERS: "custom",
  HIZURI_VAULT_PASSPHRASE: SECOND_TOKEN,
  PASEO_TTS_GAIN_DB: "1",
};

const PLANTED = [PERSON, OTHER_PERSON, HOST, PRIVATE_DIR, TOKEN, SECOND_TOKEN, "Atlantic/Example"];

/** The repo's personal guard over one file, as a process, with an invented deny-list. */
function guard(content: string): { status: number | null; output: string } {
  const repo = tempDir();
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
  git("init", "-q");
  writeFileSync(path.join(repo, "setup.json"), content);
  git("add", "setup.json");
  git("-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-qm", "setup");
  const deny = path.join(tempDir(), "deny-list.txt");
  writeFileSync(
    deny,
    [`word:${PERSON}`, `word:${OTHER_PERSON}`, HOST.replaceAll(".", "\\."), PRIVATE_DIR, ""].join(
      "\n",
    ),
  );
  // gitleaks runs when the gate names its folder (HIZURI_GUARD_TOOLS_DIR); the token check of
  // the export itself is the assertion on PLANTED below either way.
  const toolsDir = process.env.HIZURI_GUARD_TOOLS_DIR;
  const scanners = toolsDir ? ["--tools-dir", toolsDir] : ["--no-secret-scan"];
  const run = spawnSync(
    process.execPath,
    [GUARD, "--tree", "HEAD", "--repo", repo, "--deny", deny, "--base", "none", ...scanners],
    { env: { PATH: process.env.PATH, HOME: tempDir() }, encoding: "utf8" },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

describe("exportableSetup", () => {
  test("drops every personal value and nulls every secret, keeping the setup", () => {
    const setup = exportableSetup({
      config: plantedConfig,
      voiceSettings: plantedVoiceSettings,
      profileEnv: plantedProfileEnv,
    });
    const text = JSON.stringify(setup);

    for (const value of PLANTED) expect(text).not.toContain(value);
    expect(setup.config).toEqual({
      version: 1,
      daemon: { mcp: { injectIntoAgents: true }, relay: { enabled: false } },
      providers: { openai: { apiKey: null } },
      agents: {
        providers: {
          custom: {
            extends: "claude",
            label: "Custom",
            env: {
              ANTHROPIC_AUTH_TOKEN: null,
              ANTHROPIC_API_KEY: null,
              ANTHROPIC_DEFAULT_OPUS_MODEL: "model-large",
              API_TIMEOUT_MS: "600000",
              NOTE: null,
            },
            models: [{ id: "model-large", label: "Large", isDefault: true }],
            disallowedTools: ["WebSearch"],
          },
        },
      },
      features: { voiceMode: { enabled: true } },
    });
    // voice-settings.json wins over the personal folder's value of the same knob.
    expect(setup.knobs).toEqual({
      PASEO_TTS_GAIN_DB: 3,
      PASEO_BARGE_STOP_WORDS_ONLY: false,
      PASEO_VOICE_LANGUAGE: "en",
      PASEO_FAST_FRONT_SKIP_PROVIDERS: "custom",
      HIZURI_VAULT_PASSPHRASE: null,
    });
    expect(setup.secrets).toEqual([
      { path: "config.providers.openai.apiKey", name: "speech-key" },
      { path: "config.agents.providers.custom.env.ANTHROPIC_AUTH_TOKEN", name: null },
      { path: "config.agents.providers.custom.env.ANTHROPIC_API_KEY", name: null },
      { path: "config.agents.providers.custom.env.NOTE", name: null },
      { path: "knobs.HIZURI_VAULT_PASSPHRASE", name: null },
    ]);
    expect(setup.dropped).toContain("config.daemon.listen");
    expect(setup.dropped).toContain("profile.PASEO_USER_NAME");
  });

  test("a setup field that names a home folder is left out whole", () => {
    const setup = exportableSetup({
      config: { agents: { providers: { x: { description: `Reads ${PRIVATE_DIR}/notes.md` } } } },
    });
    expect(setup.config).toEqual({});
    expect(setup.dropped).toEqual(["config.agents.providers.x.description"]);
  });

  test("unnamed keys are dropped, credentials are nulled at any depth, registries go whole", () => {
    const passwordUrl = ["postgres://reader:", "pw", "-", "77zz", "@db.example.invalid/x"].join("");
    const setup = exportableSetup({
      config: {
        daemon: {
          somethingNew: "kept-out",
          mcp: { injectIntoAgents: true, authToken: "x".repeat(12) },
          terminalProfiles: [{ id: "db", name: "DB", command: "psql", args: [passwordUrl] }],
          agentProfiles: [{ id: "a", name: "A", provider: "claude", notes: PERSON }],
        },
        pluginRegistries: { [HOST]: { authorization: "!secret registry-auth" } },
        features: { voiceMode: { llm: { model: passwordUrl } } },
      },
    });

    expect(setup.config).toEqual({
      daemon: {
        mcp: { injectIntoAgents: true, authToken: null },
        terminalProfiles: [{ id: "db", name: "DB" }],
        agentProfiles: [{ id: "a", name: "A", provider: "claude" }],
      },
      features: { voiceMode: { llm: { model: null } } },
    });
    expect(JSON.stringify(setup)).not.toContain(HOST);
    expect(JSON.stringify(setup)).not.toContain("77zz");
    expect(setup.secrets).toEqual([
      { path: "config.daemon.mcp.authToken", name: null },
      { path: "config.pluginRegistries", name: "registry-auth" },
      { path: "config.features.voiceMode.llm.model", name: null },
    ]);
    expect(setup.dropped).toEqual([
      "config.daemon.somethingNew",
      "config.daemon.terminalProfiles.0.command",
      "config.daemon.terminalProfiles.0.args",
      "config.daemon.agentProfiles.0.notes",
      "config.pluginRegistries",
    ]);
  });

  test("the repo's personal guard finds nothing in the export and finds the planted values in the source", () => {
    const sources = {
      config: plantedConfig,
      voiceSettings: plantedVoiceSettings,
      profileEnv: plantedProfileEnv,
    };
    const exported = guard(`${JSON.stringify(exportableSetup(sources), null, 2)}\n`);
    expect(exported.output).toContain("personal guard: clean");
    expect(exported.status).toBe(0);

    const raw = guard(`${JSON.stringify(sources, null, 2)}\n`);
    expect(raw.status).toBe(1);
    for (const label of [
      `word:${PERSON}`,
      `word:${OTHER_PERSON}`,
      HOST.replaceAll(".", "\\."),
      PRIVATE_DIR,
    ]) {
      expect(raw.output).toContain(label);
    }
  });

  test("reads a daemon home and a personal folder", () => {
    const home = tempDir();
    const profile = tempDir();
    writeFileSync(path.join(home, "config.json"), JSON.stringify({ version: 1 }));
    writeFileSync(path.join(home, "voice-settings.json"), JSON.stringify({ PASEO_TTS_SPEED: 1.1 }));
    writeFileSync(
      path.join(profile, "settings.json"),
      JSON.stringify({ env: { PASEO_VOICE_LANGUAGE: "en" } }),
    );
    expect(readSetupSources({ paseoHome: home, profileDir: profile })).toEqual({
      config: { version: 1 },
      voiceSettings: { PASEO_TTS_SPEED: 1.1 },
      profileEnv: { PASEO_VOICE_LANGUAGE: "en" },
    });
  });
});
