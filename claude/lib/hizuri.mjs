// Shared parts of the hizuri plugin's commands: where things live, the memory database, quoting.
// No dependencies beyond Node: the database is reached through `psql` inside its own container.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HOME = homedir();
export const HIZURI_HOME = path.resolve(expand(process.env.HIZURI_HOME || "~/.hizuri"));
export const PERSONAL = path.join(HIZURI_HOME, "personal");
export const CLAUDE_DIR = path.resolve(expand(process.env.CLAUDE_CONFIG_DIR || "~/.claude"));
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MEMORY_CONFIG = path.join(HIZURI_HOME, "memory.json");

export function expand(file) {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

export function die(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function timeZone() {
  return (
    process.env.HIZURI_TIME_ZONE ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  );
}

/** A SQL string literal (standard_conforming_strings is on by default). NUL cannot be stored. */
export function lit(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\0", "").replace(/'/g, "''")}'`;
}

export function ensureDir(dir, mode = 0o700) {
  mkdirSync(dir, { recursive: true, mode });
  return dir;
}

function which(cmd) {
  const r = spawnSync("sh", ["-c", `command -v ${cmd}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The memory database's settings, written once by `hizuri-memory up`. */
export function memoryConfig() {
  if (existsSync(MEMORY_CONFIG)) {
    return JSON.parse(readFileSync(MEMORY_CONFIG, "utf8"));
  }
  let engine = null;
  if (which("docker")) engine = "docker";
  else if (which("podman")) engine = "podman";
  return {
    engine,
    container: "hizuri-memory",
    image: "docker.io/library/postgres:17",
    port: 5439,
    user: "hizuri",
    db: "memory",
    fresh: true,
  };
}

export function saveMemoryConfig(config) {
  ensureDir(HIZURI_HOME);
  const { fresh: _fresh, ...rest } = config;
  writeFileSync(MEMORY_CONFIG, `${JSON.stringify(rest, null, 2)}\n`, { mode: 0o600 });
}

export function engineRun(config, args, options = {}) {
  if (!config.engine) {
    die(
      "hizuri memory: neither docker nor podman is installed; install one and run hizuri-memory up",
    );
  }
  return spawnSync(config.engine, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    ...options,
  });
}

const FIELD = "\x1f";
const RECORD = "\x1e";

/**
 * Runs SQL in the memory database; returns rows as arrays of strings. The script goes in on stdin,
 * so inline COPY data and long statements need no temporary files.
 */
export function sql(script, { config = memoryConfig(), rows = true } = {}) {
  const args = ["exec", "-i", config.container, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  args.push("-U", config.user, "-d", config.db);
  if (rows) args.push("-At", "-F", FIELD, "-R", RECORD);
  const r = engineRun(config, args, { input: script });
  if (r.status !== 0) {
    const why = (r.stderr || r.error?.message || "").trim();
    throw new Error(`memory database: ${why || `psql exited ${r.status}`}`);
  }
  if (!rows) return [];
  // psql ends its output with one newline after the last record.
  return r.stdout
    .replace(/\n$/, "")
    .split(RECORD)
    .filter((row) => row.length > 0)
    .map((row) => row.replace(/^\n/, "").split(FIELD));
}

export function containerState(config = memoryConfig()) {
  if (!config.engine) return "no-engine";
  const r = engineRun(config, ["inspect", "-f", "{{.State.Status}}", config.container]);
  return r.status === 0 ? r.stdout.trim() : "missing";
}

export function parseFlags(argv, spec) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = spec[a];
    if (key === undefined) {
      rest.push(a);
    } else if (key.endsWith("?")) {
      flags[key.slice(0, -1)] = true;
    } else {
      if (i + 1 >= argv.length) die(`${a} needs a value`);
      flags[key] = argv[++i];
    }
  }
  return { flags, rest };
}
