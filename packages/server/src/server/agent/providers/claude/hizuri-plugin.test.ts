import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { HIZURI_PLUGIN_MCP_RULE, resolveHizuriPluginOptions } from "./hizuri-plugin.js";

describe("the hizuri plugin in daemon sessions", () => {
  let root: string;
  let pluginDir: string;
  let configDir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "hizuri-plugin-"));
    pluginDir = path.join(root, "repo", "claude");
    configDir = path.join(root, "claude-config");
    mkdirSync(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    writeFileSync(path.join(pluginDir, ".claude-plugin", "plugin.json"), '{"name":"hizuri"}');
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("loads the plugin straight from HIZURI_PLUGIN_DIR and hides its duplicate MCP server", () => {
    const options = resolveHizuriPluginOptions({
      HIZURI_PLUGIN_DIR: pluginDir,
      CLAUDE_CONFIG_DIR: configDir,
    });
    expect(options).toEqual({
      plugins: [{ type: "local", path: pluginDir }],
      disallowedTools: [HIZURI_PLUGIN_MCP_RULE],
    });
  });

  test("adds nothing without HIZURI_PLUGIN_DIR or when the folder holds no plugin", () => {
    expect(resolveHizuriPluginOptions({ CLAUDE_CONFIG_DIR: configDir })).toEqual({
      disallowedTools: [],
    });
    expect(
      resolveHizuriPluginOptions({ HIZURI_PLUGIN_DIR: root, CLAUDE_CONFIG_DIR: configDir }),
    ).toEqual({ disallowedTools: [] });
  });

  test("leaves loading to Claude Code when a marketplace install is enabled", () => {
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ enabledPlugins: { "hizuri@hizuri": true } }),
    );
    expect(
      resolveHizuriPluginOptions({ HIZURI_PLUGIN_DIR: pluginDir, CLAUDE_CONFIG_DIR: configDir }),
    ).toEqual({ disallowedTools: [HIZURI_PLUGIN_MCP_RULE] });
  });

  test("leaves loading to Claude Code when its settings list the folder in CLAUDE_CODE_PLUGIN_DIRS", () => {
    writeFileSync(
      path.join(configDir, "settings.json"),
      JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: `/elsewhere:${pluginDir}` } }),
    );
    expect(
      resolveHizuriPluginOptions({ HIZURI_PLUGIN_DIR: pluginDir, CLAUDE_CONFIG_DIR: configDir }),
    ).toEqual({ disallowedTools: [HIZURI_PLUGIN_MCP_RULE] });
  });
});
