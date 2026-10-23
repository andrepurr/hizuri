import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { claudeConfigDir } from "./project-dir.js";
import type { ClaudeOptions } from "./query.js";

// Hizuri: the hizuri Claude Code plugin (`claude/` in the repo) is loaded straight from the folder,
// never from a copy. The installer lists that folder in CLAUDE_CODE_PLUGIN_DIRS in the user's
// Claude Code settings, so every Claude Code session loads it, ours included. HIZURI_PLUGIN_DIR (in
// the user's settings.json, applied by the daemon at start) loads it in daemon sessions only,
// through the Agent SDK plugins option. When Claude Code already loads it (from
// CLAUDE_CODE_PLUGIN_DIRS or a marketplace install, `hizuri@<marketplace>`), the daemon adds
// nothing, so the plugin never loads twice.
//
// The plugin's own MCP server is the daemon's MCP endpoint, for terminal sessions. A session the
// daemon starts already has that endpoint as `paseo`, tied to its agent id, so the plugin's copy is
// switched off there (`mcp__plugin_<plugin>_<server>` is how Claude Code names it).

export const HIZURI_PLUGIN_NAME = "hizuri";
export const HIZURI_PLUGIN_MCP_RULE = "mcp__plugin_hizuri_hizuri";

export interface HizuriPluginOptions {
  plugins?: { type: "local"; path: string }[];
  disallowedTools: string[];
}

type Env = Record<string, string | undefined>;

function expandHome(file: string): string {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

function readObject(file: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isHizuriPlugin(dir: string): boolean {
  return readObject(path.join(dir, ".claude-plugin", "plugin.json"))?.name === HIZURI_PLUGIN_NAME;
}

/** Whether Claude Code loads the plugin by itself, from the user's settings or environment. */
function claudeCodeLoadsIt(env: Env): boolean {
  const settings = readObject(
    path.join(claudeConfigDir(env as NodeJS.ProcessEnv), "settings.json"),
  );
  const enabled = settings?.enabledPlugins;
  if (typeof enabled === "object" && enabled !== null) {
    const marketplace = Object.entries(enabled).some(
      ([id, on]) => on === true && id.startsWith(`${HIZURI_PLUGIN_NAME}@`),
    );
    if (marketplace) {
      return true;
    }
  }
  const settingsEnv = settings?.env;
  const fromSettings =
    typeof settingsEnv === "object" && settingsEnv !== null
      ? (settingsEnv as Record<string, unknown>).CLAUDE_CODE_PLUGIN_DIRS
      : undefined;
  const dirs = [env.CLAUDE_CODE_PLUGIN_DIRS, typeof fromSettings === "string" ? fromSettings : ""]
    .join(path.delimiter)
    .split(path.delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean);
  return dirs.some((dir) => isHizuriPlugin(path.resolve(expandHome(dir))));
}

export function resolveHizuriPluginOptions(env: Env): HizuriPluginOptions {
  if (claudeCodeLoadsIt(env)) {
    return { disallowedTools: [HIZURI_PLUGIN_MCP_RULE] };
  }
  const raw = env.HIZURI_PLUGIN_DIR?.trim();
  if (!raw) {
    return { disallowedTools: [] };
  }
  const dir = path.resolve(expandHome(raw));
  if (!existsSync(path.join(dir, ".claude-plugin", "plugin.json"))) {
    return { disallowedTools: [] };
  }
  return { plugins: [{ type: "local", path: dir }], disallowedTools: [HIZURI_PLUGIN_MCP_RULE] };
}

/** Adds the plugin and hides its duplicate MCP server on the options of one daemon session. */
export function applyHizuriPlugin(options: ClaudeOptions, env: Env): void {
  const hizuri = resolveHizuriPluginOptions(env);
  if (hizuri.plugins) {
    options.plugins = [...(options.plugins ?? []), ...hizuri.plugins];
  }
  if (hizuri.disallowedTools.length > 0) {
    options.disallowedTools = [...(options.disallowedTools ?? []), ...hizuri.disallowedTools];
  }
}
