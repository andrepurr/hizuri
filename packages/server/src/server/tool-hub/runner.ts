import { execFile } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  promises as fs,
  lstatSync,
  readlinkSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "pino";
import type { ToolContract } from "./pinning.js";
import type { ToolHubStore, ToolInstall, ToolLaunch } from "./store.js";

// Hizuri (tool hub): installing and running third-party MCP servers.
//   Install: `npm install --ignore-scripts` into $PASEO_HOME/tool-hub/servers/<id>, so no package
//   code runs at install time. Only after the user's yes.
//   Run: the smallest sandbox that works on this Linux. bubblewrap first: the server sees /usr,
//   /etc, node and its own install read-only, writes only servers/<id>/home, gets a private /tmp
//   and no view of the user's home (keys, ~/.ssh, ~/.hizuri, other projects). Where unprivileged
//   user namespaces are off (Ubuntu 24.04's AppArmor restriction), rootless podman with the same
//   mounts in a node image. The network stays on: most tools exist to reach it. Keys from
//   secrets.json go in through the sandbox's environment, never its command line, and the agent
//   never sees them. No sandbox, no run.
//   Remote (streamable-http) servers run elsewhere; the daemon adds their keys as headers.

const run = promisify(execFile);

export type SandboxKind = "bwrap" | "podman" | "landrun";

export const PODMAN_IMAGE_DEFAULT = "docker.io/library/node:22-slim";

export interface ToolConnection {
  listTools(): Promise<ToolContract[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult>;
  close(): Promise<void>;
}

export type ConnectTool = (install: ToolInstall) => Promise<ToolConnection>;
export type InstallPackage = (params: {
  installId: string;
  launch: Extract<ToolLaunch, { kind: "npm" }>;
}) => Promise<void>;

async function works(command: string, args: string[]): Promise<boolean> {
  try {
    await run(command, args, { timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/** HIZURI_TOOL_HUB_SANDBOX=bwrap|podman|landrun forces one; otherwise the first that works. */
export async function detectSandbox(
  env: NodeJS.ProcessEnv = process.env,
): Promise<SandboxKind | null> {
  const forced = env.HIZURI_TOOL_HUB_SANDBOX;
  if (forced === "bwrap" || forced === "podman" || forced === "landrun") return forced;
  if (await works("bwrap", ["--ro-bind", "/", "/", "--unshare-all", "--share-net", "true"])) {
    return "bwrap";
  }
  if (await works("podman", ["--version"])) return "podman";
  if (await landlockEnforces()) return "landrun";
  return null;
}

/**
 * landrun runs with --best-effort so it works on older Landlock ABIs (Ubuntu 24.04 has v4: files
 * and TCP ports, which is all the hub uses). best-effort would also run unconfined on a kernel
 * without Landlock, so the probe demands a denial: reading /etc must fail when only /usr is open.
 */
async function landlockEnforces(): Promise<boolean> {
  const system = ["/usr", "/bin", "/lib", "/lib64"].flatMap((p) => ["--rox", p]);
  const base = ["--best-effort", "--ignore-missing", "--unrestricted-network"];
  return (
    (await works("landrun", [...base, "--rox", "/", "true"])) &&
    !(await works("landrun", [...base, ...system, "cat", "/etc/hostname"]))
  );
}

/**
 * The sandbox, detected on first need and again later while none works: a sandbox tool installed
 * (or removed) after the daemon started is seen without a restart.
 */
export function createSandboxDetector(
  env: NodeJS.ProcessEnv = process.env,
): () => Promise<SandboxKind | null> {
  let found: SandboxKind | null = null;
  let checkedAt = 0;
  return async () => {
    if (found) return found;
    if (Date.now() - checkedAt < 30_000 && checkedAt !== 0) return null;
    checkedAt = Date.now();
    found = await detectSandbox(env);
    return found;
  };
}

function npmCommand(): string {
  const beside = path.join(path.dirname(process.execPath), "npm");
  return existsSync(beside) ? beside : "npm";
}

export function createNpmInstaller(params: {
  store: ToolHubStore;
  logger: Logger;
}): InstallPackage {
  return async ({ installId, launch }) => {
    const dir = params.store.serverDir(installId);
    await fs.mkdir(path.join(dir, "home", "tmp"), { recursive: true, mode: 0o700 });
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({ name: `hizuri-tool-${installId}`, private: true }),
    );
    params.logger.info(
      { installId, pkg: launch.package, version: launch.version },
      "tool_hub.npm_install",
    );
    await run(
      npmCommand(),
      [
        "install",
        "--prefix",
        dir,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--omit=dev",
        `${launch.package}@${launch.version}`,
      ],
      { timeout: 5 * 60_000, maxBuffer: 16 * 1024 * 1024 },
    );
  };
}

/** The JS file a package's bin points at, relative to the install folder. */
export async function resolvePackageEntry(dir: string, pkg: string): Promise<string> {
  const pkgDir = path.join("node_modules", pkg);
  const manifest = JSON.parse(
    await fs.readFile(path.join(dir, pkgDir, "package.json"), "utf8"),
  ) as {
    bin?: string | Record<string, string>;
    main?: string;
  };
  let entry: string | undefined;
  if (typeof manifest.bin === "string") {
    entry = manifest.bin;
  } else if (manifest.bin) {
    const bins = Object.entries(manifest.bin);
    const short = pkg.split("/").at(-1);
    entry = (bins.find(([name]) => name === short) ?? bins[0])?.[1];
  }
  entry ??= manifest.main;
  if (!entry) throw new Error(`${pkg} has no bin or main to run`);
  return path.join(pkgDir, entry);
}

/**
 * The sandbox binary as an absolute path from the daemon's PATH: the server's own environment is
 * minimal, and spawn looks commands up in the child's PATH.
 */
export function resolveExecutable(name: string, env: NodeJS.ProcessEnv = process.env): string {
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  return name;
}

function bindSystemDir(target: string): string[] {
  try {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) return ["--symlink", readlinkSync(target), target];
    return ["--ro-bind", target, target];
  } catch {
    return [];
  }
}

export interface SandboxCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function buildSandboxCommand(params: {
  sandbox: SandboxKind;
  dir: string;
  entry: string;
  args: string[];
  secrets: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  podmanImage?: string;
}): SandboxCommand {
  const { dir, entry, secrets } = params;
  const home = path.join(dir, "home");
  const hostEnv = params.env ?? process.env;
  if (params.sandbox === "bwrap") {
    const nodeBin = path.dirname(process.execPath);
    const nodePrefix = path.dirname(nodeBin);
    return {
      command: resolveExecutable("bwrap", hostEnv),
      args: [
        "--die-with-parent",
        "--unshare-all",
        "--share-net",
        "--new-session",
        "--ro-bind",
        "/usr",
        "/usr",
        ...["/bin", "/sbin", "/lib", "/lib64"].flatMap(bindSystemDir),
        "--ro-bind",
        "/etc",
        "/etc",
        "--ro-bind-try",
        "/run/systemd/resolve",
        "/run/systemd/resolve",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        ...(nodePrefix.startsWith("/usr") ? [] : ["--ro-bind", nodePrefix, nodePrefix]),
        "--ro-bind",
        dir,
        dir,
        "--bind",
        home,
        home,
        "--chdir",
        home,
        process.execPath,
        path.join(dir, entry),
        ...params.args,
      ],
      // bwrap passes its own environment on: only these names reach the server.
      env: { HOME: home, PATH: `${nodeBin}:/usr/bin:/bin`, LANG: "C.UTF-8", ...secrets },
    };
  }
  if (params.sandbox === "landrun") {
    // Landlock: no user namespaces and no root needed. The server may read and run the system,
    // node and its own install, write only its home, and open TCP connections only to ports 80
    // and 443, so loopback services (the daemon itself on 6767/6768) stay out of reach. /proc is
    // limited to its own entry: another process's environ would leak that process's keys.
    const nodeBin = path.dirname(process.execPath);
    const env = {
      HOME: home,
      TMPDIR: path.join(home, "tmp"),
      PATH: `${nodeBin}:/usr/bin:/bin`,
      LANG: "C.UTF-8",
      ...secrets,
    };
    return {
      command: resolveExecutable("landrun", hostEnv),
      args: [
        "--best-effort",
        "--ignore-missing",
        ...["/usr", "/bin", "/sbin", "/lib", "/lib64", path.dirname(nodeBin)].flatMap((p) => [
          "--rox",
          p,
        ]),
        ...[
          "/etc",
          "/run/systemd/resolve",
          "/dev/urandom",
          "/proc/self",
          "/proc/cpuinfo",
          "/proc/meminfo",
          dir,
        ].flatMap((p) => ["--ro", p]),
        ...["/dev/null", home].flatMap((p) => ["--rw", p]),
        "--connect-tcp",
        "443",
        "--connect-tcp",
        "80",
        ...Object.keys(env).flatMap((name) => ["--env", name]),
        // landrun parses flags after the command too; "--" keeps the server's own arguments its own.
        "--",
        process.execPath,
        path.join(dir, entry),
        ...params.args,
      ],
      env,
    };
  }
  return {
    command: resolveExecutable("podman", hostEnv),
    args: [
      "run",
      "--rm",
      "-i",
      "--init",
      "--pull=missing",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop=all",
      "--security-opt",
      "no-new-privileges",
      "-v",
      `${dir}:/hub:ro`,
      "-v",
      `${home}:/hub/home`,
      "-e",
      "HOME=/hub/home",
      "-w",
      "/hub/home",
      // `-e NAME` without a value copies it from podman's own environment: keys stay off argv.
      ...Object.keys(secrets).flatMap((name) => ["-e", name]),
      params.podmanImage ?? hostEnv.HIZURI_TOOL_HUB_PODMAN_IMAGE ?? PODMAN_IMAGE_DEFAULT,
      "node",
      path.posix.join("/hub", entry),
      ...params.args,
    ],
    env: {
      ...pickEnv(hostEnv, ["PATH", "HOME", "USER", "XDG_RUNTIME_DIR", "LANG"]),
      ...secrets,
    },
  };
}

function pickEnv(env: NodeJS.ProcessEnv, names: string[]): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const name of names) {
    const value = env[name];
    if (value !== undefined) picked[name] = value;
  }
  return picked;
}

async function connectClient(
  transport: StdioClientTransport | StreamableHTTPClientTransport,
): Promise<ToolConnection> {
  const client = new Client({ name: "hizuri-tool-hub", version: "1.0.0" });
  await client.connect(transport);
  return {
    async listTools() {
      const tools: ToolContract[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {});
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      return tools;
    },
    async callTool(name, args) {
      return (await client.callTool({ name, arguments: args })) as CallToolResult;
    },
    close: () => client.close(),
  };
}

export function createToolConnector(params: {
  store: ToolHubStore;
  sandbox: () => Promise<SandboxKind | null>;
  logger: Logger;
}): ConnectTool {
  return async (install) => {
    const secrets = await params.store.readSecrets([install.id, install.name]);
    const launch = install.launch;
    if (launch.kind === "remote") {
      const headers = Object.fromEntries(
        launch.headers.filter((name) => secrets[name]).map((name) => [name, secrets[name]]),
      );
      return connectClient(
        new StreamableHTTPClientTransport(new URL(launch.url), { requestInit: { headers } }),
      );
    }
    const sandbox = await params.sandbox();
    if (!sandbox) {
      throw new Error(
        "no sandbox on this machine (bubblewrap, podman or landrun); the hub runs no tool without one",
      );
    }
    const dir = params.store.serverDir(install.id);
    const entry = await resolvePackageEntry(dir, launch.package);
    const command = buildSandboxCommand({
      sandbox,
      dir,
      entry,
      args: launch.args,
      secrets: Object.fromEntries(
        launch.env.filter((name) => secrets[name]).map((name) => [name, secrets[name]]),
      ),
    });
    const transport = new StdioClientTransport({ ...command, stderr: "pipe" });
    let stderrTail = "";
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
      params.logger.debug(
        { installId: install.id, stderr: chunk.toString().slice(0, 2000) },
        "tool_hub.server_stderr",
      );
    });
    params.logger.info({ installId: install.id, sandbox }, "tool_hub.server_start");
    try {
      return await connectClient(transport);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const tail = stderrTail.trim().split("\n").slice(-6).join(" | ");
      throw new Error(
        `${install.name} did not start: ${reason}${tail ? ` (stderr: ${tail})` : ""}`,
        { cause: error },
      );
    }
  };
}
