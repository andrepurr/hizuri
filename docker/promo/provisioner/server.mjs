// hizuri promo demos: the provisioner. A visitor redeems a code on the front door; each
// redemption gets one isolated hizuri environment (daemon + web UI in its own container, its own
// network, its own public HTTPS link, its own password and a capped trial brain), removed after
// PROMO_ENV_DAYS days. Plain Node, no dependencies. Two listeners:
//   - the front door (PROMO_PORT, 127.0.0.1), published through a Cloudflare tunnel;
//   - the admin API (PROMO_ADMIN_PORT, 127.0.0.1 only, bearer PROMO_ADMIN_TOKEN) for `promo`.
// State holds hashes of codes and secrets only, never a code, a secret or a trial token.

import { execFile } from "node:child_process";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Resolver } from "node:dns";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const cfg = {
  port: Number(env.PROMO_PORT || 8780),
  adminPort: Number(env.PROMO_ADMIN_PORT || 8781),
  adminToken: env.PROMO_ADMIN_TOKEN || "",
  stateFile: env.PROMO_STATE || join(HERE, "..", "state", "promo.json"),
  image: env.PROMO_IMAGE || "hizuri-promo:latest",
  tunnelImage: env.PROMO_TUNNEL_IMAGE || "cloudflare/cloudflared:latest",
  relayAdminUrl: env.PROMO_RELAY_ADMIN_URL || "http://127.0.0.1:8790",
  relayAdminToken: env.PROMO_RELAY_ADMIN_TOKEN || "",
  relayEnvUrl: env.PROMO_RELAY_ENV_URL || "http://hz-relay:8790",
  cpus: env.PROMO_ENV_CPUS || "2",
  memory: env.PROMO_ENV_MEMORY || "3g",
  disk: env.PROMO_ENV_DISK || "8G",
  pids: env.PROMO_ENV_PIDS || "1024",
  days: Number(env.PROMO_ENV_DAYS || 14),
  trialUsd: Number(env.PROMO_TRIAL_USD || 1),
  trialRequests: Number(env.PROMO_TRIAL_REQUESTS || 400),
  maxEnvs: Number(env.PROMO_MAX_ENVS || 10),
  hostnames: env.PROMO_HOSTNAMES || ".trycloudflare.com,.hizuri.com",
  // Own domain (named Cloudflare tunnel): environments become https://<id>.<domain>, routed by
  // the host router; the front door is PROMO_FRONT_URL. Unset: one quick tunnel per environment.
  domain: (env.PROMO_DOMAIN || "").toLowerCase(),
  frontUrl: env.PROMO_FRONT_URL || "",
  routerPort: Number(env.PROMO_ROUTER_PORT || 8782),
  tunnelEnvFile: env.PROMO_TUNNEL_ENV_FILE || "", // TUNNEL_TOKEN=… of the named tunnel
};
if (!cfg.adminToken || !cfg.relayAdminToken) {
  throw new Error("PROMO_ADMIN_TOKEN and PROMO_RELAY_ADMIN_TOKEN must be set");
}

const STEPS = [
  ["space", "Reserving your private space"],
  ["start", "Starting your hizuri"],
  ["wake", "Waking hizuri up"],
  ["link", "Opening your secure link"],
  ["check", "Checking the link from the internet"],
];
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no 0/O, 1/I/L, U
const TRYCF = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/g;

// ---------------------------------------------------------------- state

const sha = (text) => createHash("sha256").update(text).digest("hex");
const now = () => new Date();
const log = (entry) =>
  process.stdout.write(`${JSON.stringify({ t: now().toISOString(), ...entry })}\n`);

function loadState() {
  try {
    return JSON.parse(readFileSync(cfg.stateFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { codes: {}, envs: {}, front: null };
    throw error;
  }
}
const state = loadState();
function save() {
  mkdirSync(dirname(cfg.stateFile), { recursive: true });
  const tmp = `${cfg.stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1), { mode: 0o600 });
  renameSync(tmp, cfg.stateFile);
}

function normalizeCode(raw) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^HZ/, "");
}
function newCode() {
  let body = "";
  for (let i = 0; i < 8; i += 1) body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `HZ-${body.slice(0, 4)}-${body.slice(4)}`;
}
const liveEnvs = () =>
  Object.values(state.envs).filter((e) => e.status !== "removed" && e.status !== "failed");

// ---------------------------------------------------------------- docker

function run(cmd, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (error, stdout, stderr) => {
      if (error) {
        // Never echo the command: its arguments carry the environment's secrets.
        reject(new Error(`${cmd} ${args[0]} failed: ${String(stderr).trim().slice(0, 300)}`));
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}
const docker = (...args) => run("docker", args);
const names = (id) => ({
  env: `hz-${id}`,
  link: `hz-${id}-link`,
  net: `hz-${id}`,
  bridge: `hzb-${id}`,
});

// cloudflared prints its quick-tunnel name to stderr; the last one printed is the live one.
function tunnelUrlOf(container) {
  return new Promise((resolve) => {
    execFile(
      "docker",
      ["logs", "--tail", "300", container],
      { maxBuffer: 4 << 20 },
      (_e, out, err) => {
        const all = `${out}\n${err}`.match(TRYCF);
        resolve(all ? all[all.length - 1] : null);
      },
    );
  });
}

async function containerIp(container, network) {
  const ip = await docker(
    "inspect",
    "-f",
    `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`,
    container,
  );
  return ip || null;
}

function httpOk(url, { timeoutMs = 3000, lookup } = {}) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const request = parsed.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(
      parsed,
      { method: "GET", timeout: timeoutMs, ...(lookup ? { lookup } : {}) },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

// Ask Cloudflare's resolver directly, so no resolver along the way caches "no such name" for a
// link that is seconds old; the visitor's browser only learns the name once it works.
const cfResolver = new Resolver();
cfResolver.setServers(["1.1.1.1", "1.0.0.1"]);
function cfLookup(hostname, options, callback) {
  cfResolver.resolve4(hostname, (error, addresses) => {
    if (error) callback(error);
    else if (options?.all)
      callback(
        null,
        addresses.map((address) => ({ address, family: 4 })),
      );
    else callback(null, addresses[0], 4);
  });
}

async function relayAdmin(method, path, body) {
  const response = await fetch(`${cfg.relayAdminUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${cfg.relayAdminToken}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`relay ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

// ---------------------------------------------------------------- environments

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, { timeoutMs, everyMs = 1000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(everyMs);
  }
  return null;
}

function step(envRec, key) {
  const now_ = now().toISOString();
  for (const s of envRec.steps) {
    if (s.key === key) s.startedAt = now_;
    else if (s.startedAt && !s.doneAt) s.doneAt = now_;
  }
  save();
}
function finishSteps(envRec) {
  const now_ = now().toISOString();
  for (const s of envRec.steps) if (s.startedAt && !s.doneAt) s.doneAt = now_;
}

async function provision(envRec, secret) {
  const n = names(envRec.id);
  try {
    step(envRec, "space");
    await docker(
      "network",
      "create",
      "--driver",
      "bridge",
      "--opt",
      `com.docker.network.bridge.name=${n.bridge}`,
      "--label",
      `hizuri.promo.env=${envRec.id}`,
      n.net,
    );
    const install = await relayAdmin("POST", "/v1/admin/installs", {
      label: `promo ${envRec.id}`,
      capUsd: envRec.trial.capUsd,
      capRequests: cfg.trialRequests,
    });
    envRec.relayInstallId = install.installId;
    save();

    step(envRec, "start");
    await docker(
      "create",
      "--name",
      n.env,
      "--hostname",
      "hizuri",
      "--network",
      n.net,
      "--label",
      `hizuri.promo.env=${envRec.id}`,
      "--cpus",
      cfg.cpus,
      "--memory",
      cfg.memory,
      "--memory-swap",
      cfg.memory,
      "--pids-limit",
      cfg.pids,
      "--storage-opt",
      `size=${cfg.disk}`,
      "--cap-drop",
      "ALL",
      ...["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER", "KILL"].flatMap((c) => [
        "--cap-add",
        c,
      ]),
      "--security-opt",
      "no-new-privileges",
      "--restart",
      "unless-stopped",
      "--add-host",
      "hz-relay:host-gateway",
      "-e",
      `PASEO_PASSWORD=${secret}`,
      "-e",
      `PASEO_HOSTNAMES=${cfg.hostnames}`,
      // The host router reaches the daemon from its network's gateway (other environments are
      // firewalled off), so it may say the visitor came over https.
      "-e",
      "PASEO_TRUSTED_PROXIES=loopback,172.30.0.0/16",
      "-e",
      "PASEO_RELAY_ENABLED=false",
      // Text only in demos: voice would download local speech models into every environment.
      "-e",
      "PASEO_VOICE_MODE_ENABLED=false",
      "-e",
      "PASEO_DICTATION_ENABLED=false",
      "-e",
      `PASEO_FREE_BRAIN_URL=${cfg.relayEnvUrl}`,
      "-e",
      `HIZURI_TRIAL_TOKEN=${install.token}`,
      cfg.image,
    );
    await docker("start", n.env);

    step(envRec, "wake");
    const ip = await until(() => containerIp(n.env, n.net), { timeoutMs: 20_000 });
    if (!ip) throw new Error("the environment got no address");
    envRec.ip = ip;
    const awake = await until(() => httpOk(`http://${ip}:6767/api/health`), { timeoutMs: 120_000 });
    if (!awake) throw new Error("hizuri did not wake up in 2 minutes");
    envRec.terminalPath = await seedChat(n.env);

    step(envRec, "link");
    if (cfg.domain) {
      envRec.url = `https://${envRec.id}.${cfg.domain}`;
    } else {
      await startLink(envRec.id);
      envRec.url = await until(() => tunnelUrlOf(n.link), { timeoutMs: 60_000 });
      if (!envRec.url) throw new Error("no public link in 1 minute");
    }
    save();

    step(envRec, "check");
    const reachable = await until(
      () => httpOk(`${envRec.url}/api/health`, { timeoutMs: 5000, lookup: cfLookup }),
      {
        timeoutMs: 180_000,
        everyMs: 2000,
      },
    );
    if (!reachable) throw new Error("the public link did not answer in 3 minutes");

    finishSteps(envRec);
    envRec.status = "ready";
    envRec.readyAt = now().toISOString();
    save();
    log({ event: "env_ready", env: envRec.id, seconds: secondsSince(envRec.createdAt) });
  } catch (error) {
    finishSteps(envRec);
    envRec.status = "failed";
    envRec.error = String(error.message || error);
    // A failed setup gives its place on the code back, so the visitor can simply try again.
    const code = state.codes[envRec.codeHash];
    if (code) code.envIds = code.envIds.filter((id) => id !== envRec.id);
    save();
    log({ event: "env_failed", env: envRec.id, error: envRec.error });
    await removeEnv(envRec, { keepRecord: true });
  }
}

// A first chat, so the visitor lands in a conversation instead of an empty "add a project"
// screen: one project and workspace, and a hizuri agent on the trial brain that says hello.
const FIRST_MESSAGE = "Hi! What are you, and what can I do here?";
async function seedChat(container) {
  const paseo = (...args) =>
    docker("exec", "-u", "paseo", "-w", "/workspace", container, "paseo", ...args);
  await docker("exec", "-u", "paseo", container, "mkdir", "-p", "/workspace/hizuri");
  await paseo("project", "create", "/workspace/hizuri", "--json");
  const workspace = JSON.parse(
    await paseo(
      "workspace",
      "create",
      "--isolation",
      "local",
      "--path",
      "/workspace/hizuri",
      "--title",
      "My hizuri",
      "--json",
    ),
  );
  await paseo(
    "run",
    "-d",
    "--provider",
    "hizuri-free",
    "--title",
    "hizuri",
    "--workspace",
    workspace.workspaceId,
    FIRST_MESSAGE,
  );
  // Simple mode shows no terminals; a terminal made here opens straight from a link
  // (/h/<server>/workspace/<workspace>?open=terminal:<id>), even on a phone.
  const terminal = JSON.parse(
    await paseo(
      "terminal",
      "create",
      "--workspace",
      workspace.workspaceId,
      "--cwd",
      "/workspace/hizuri",
      "--name",
      "Connect a brain",
      "--json",
    ),
  );
  const { serverId } = JSON.parse(await paseo("daemon", "status", "--json"));
  return `/h/${serverId}/workspace/${workspace.workspaceId}?open=terminal:${terminal.id}`;
}

async function startLink(id) {
  const n = names(id);
  await docker("rm", "-f", n.link).catch(() => undefined);
  await docker(
    "run",
    "-d",
    "--name",
    n.link,
    "--network",
    `container:${n.env}`,
    "--label",
    `hizuri.promo.env=${id}`,
    "--restart",
    "unless-stopped",
    "--memory",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    cfg.tunnelImage,
    "tunnel",
    "--no-autoupdate",
    "--url",
    "http://127.0.0.1:6767",
  );
}

async function removeEnv(envRec, { keepRecord = false } = {}) {
  const n = names(envRec.id);
  await docker("rm", "-f", n.link).catch(() => undefined);
  await docker("rm", "-f", "-v", n.env).catch(() => undefined);
  await docker("network", "rm", n.net).catch(() => undefined);
  if (envRec.relayInstallId) {
    await relayAdmin("DELETE", `/v1/admin/installs/${envRec.relayInstallId}`).catch(
      () => undefined,
    );
  }
  if (!keepRecord) envRec.status = "removed";
  envRec.removedAt = now().toISOString();
  save();
  log({ event: "env_removed", env: envRec.id });
}

const secondsSince = (iso) => Math.round((Date.now() - Date.parse(iso)) / 1000);

// Every minute: expire old environments; if a daemon restarted, its tunnel joined a dead network
// namespace, so restart the tunnel and pick up its new link (quick tunnels change name).
async function tend() {
  for (const envRec of Object.values(state.envs)) {
    if (envRec.status !== "ready") continue;
    if (Date.parse(envRec.expiresAt) <= Date.now()) {
      await removeEnv(envRec);
      continue;
    }
    const n = names(envRec.id);
    try {
      envRec.ip = (await containerIp(n.env, n.net)) ?? envRec.ip;
      if (cfg.domain) continue;
      const started = async (c) =>
        Date.parse(await docker("inspect", "-f", "{{.State.StartedAt}}", c));
      const [envStart, linkStart] = await Promise.all([
        started(n.env),
        started(n.link).catch(() => 0),
      ]);
      if (!linkStart || envStart > linkStart) await startLink(envRec.id);
      const url = await tunnelUrlOf(n.link);
      if (url && url !== envRec.url) {
        envRec.url = url;
        save();
        log({ event: "env_link_changed", env: envRec.id });
      }
    } catch (error) {
      log({ event: "tend_error", env: envRec.id, error: String(error.message || error) });
    }
  }
  await ensureFront().catch((error) => log({ event: "front_error", error: String(error.message) }));
}

// The front door's own quick tunnel (until it has a fixed name on hizuri.com).
async function ensureFront() {
  if (cfg.tunnelEnvFile) return ensureNamedTunnel();
  const name = "hz-front-link";
  const running = await docker("inspect", "-f", "{{.State.Running}}", name).catch(() => "");
  if (running !== "true") {
    await docker("rm", "-f", name).catch(() => undefined);
    await docker(
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "host",
      "--userns",
      "host",
      "--restart",
      "unless-stopped",
      "--memory",
      "256m",
      "--cpus",
      "0.5",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      cfg.tunnelImage,
      "tunnel",
      "--no-autoupdate",
      "--url",
      `http://127.0.0.1:${cfg.port}`,
    );
  }
  const url = await until(() => tunnelUrlOf(name), { timeoutMs: 30_000 });
  if (url && state.front !== url) {
    state.front = url;
    save();
    log({ event: "front_url", url });
  }
}

// The named tunnel (own domain): its routes live in the Cloudflare dashboard —
// <front host> -> http://localhost:PROMO_PORT, *.<domain> -> http://localhost:PROMO_ROUTER_PORT.
async function ensureNamedTunnel() {
  const name = "hz-named-link";
  const running = await docker("inspect", "-f", "{{.State.Running}}", name).catch(() => "");
  if (running !== "true") {
    await docker("rm", "-f", name).catch(() => undefined);
    await docker(
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "host",
      "--userns",
      "host",
      "--restart",
      "unless-stopped",
      "--memory",
      "256m",
      "--cpus",
      "1",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--env-file",
      cfg.tunnelEnvFile,
      cfg.tunnelImage,
      "tunnel",
      "--no-autoupdate",
      "run",
    );
  }
  if (state.front !== cfg.frontUrl) {
    state.front = cfg.frontUrl;
    save();
  }
}

// ---------------------------------------------------------------- host router (own domain)

function routedEnv(req) {
  const host = String(req.headers.host || "")
    .toLowerCase()
    .replace(/:\d+$/, "");
  const suffix = `.${cfg.domain}`;
  if (!cfg.domain || !host.endsWith(suffix)) return null;
  const envRec = state.envs[host.slice(0, -suffix.length)];
  return envRec?.status === "ready" && envRec.ip ? envRec : null;
}

function forwardedHeaders(req) {
  const headers = { ...req.headers };
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-for"] = String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress);
  return headers;
}

function routeRequest(req, res) {
  const envRec = routedEnv(req);
  if (!envRec) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("No hizuri here.");
    return;
  }
  const upstream = httpRequest(
    {
      host: envRec.ip,
      port: 6767,
      method: req.method,
      path: req.url,
      headers: forwardedHeaders(req),
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

function routeUpgrade(req, socket, head) {
  const envRec = routedEnv(req);
  if (!envRec) {
    socket.destroy();
    return;
  }
  const upstream = connect(6767, envRec.ip, () => {
    const lines = Object.entries(forwardedHeaders(req)).flatMap(([key, value]) =>
      (Array.isArray(value) ? value : [value]).map((v) => `${key}: ${v}`),
    );
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
}

// ---------------------------------------------------------------- HTTP helpers

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}
async function readJson(req, max = 4096) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > max) throw Object.assign(new Error("too large"), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("bad json"), { status: 400 });
  }
}
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Wrong codes: 10 per address per hour, 200 for everyone per hour.
const failures = new Map();
function tooManyFailures(ip) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `${hour}:${ip}`;
  const all = `${hour}:*`;
  return (failures.get(key) ?? 0) >= 10 || (failures.get(all) ?? 0) >= 200;
}
function countFailure(ip) {
  const hour = Math.floor(Date.now() / 3_600_000);
  for (const key of [`${hour}:${ip}`, `${hour}:*`]) failures.set(key, (failures.get(key) ?? 0) + 1);
  if (failures.size > 5000) failures.clear();
}

async function trialUsage(envRec) {
  try {
    const { installs } = await relayAdmin("GET", "/v1/admin/installs");
    const mine = installs.find((i) => i.installId === envRec.relayInstallId);
    return mine ? { spentUsd: mine.spentUsd, capUsd: mine.capUsd } : null;
  } catch {
    return null;
  }
}

function publicEnv(envRec) {
  return {
    id: envRec.id,
    status: envRec.status,
    createdAt: envRec.createdAt,
    readyAt: envRec.readyAt ?? null,
    expiresAt: envRec.expiresAt,
    steps: STEPS.map(([key, label]) => {
      const s = envRec.steps.find((x) => x.key === key) ?? {};
      return { key, label, startedAt: s.startedAt ?? null, doneAt: s.doneAt ?? null };
    }),
    url: envRec.status === "ready" ? envRec.url : null,
    terminalPath: envRec.status === "ready" ? (envRec.terminalPath ?? null) : null,
    error:
      envRec.status === "failed"
        ? "Something went wrong while setting up. Try your code again, or tell the person who gave it to you."
        : null,
    trial: envRec.trial,
  };
}

// ---------------------------------------------------------------- front door

const PAGE = readFileSync(join(HERE, "public", "index.html"));

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
};

function redeemProblem(code) {
  if (!code || code.revoked) return "That code is not valid. Check it and try again.";
  if (Date.parse(code.expiresAt) <= Date.now()) return "That code has expired.";
  if (code.envIds.length >= code.maxEnvs) {
    return "That code has already been used for all its environments.";
  }
  if (liveEnvs().length >= cfg.maxEnvs)
    return "The demo server is full right now. Try again later.";
  return null;
}

async function redeem(req, res, ip) {
  if (tooManyFailures(ip)) {
    return send(res, 429, { error: "Too many wrong codes. Wait an hour and try again." });
  }
  const body = await readJson(req);
  // The browser makes the secret, so a retry after a dropped answer (a phone switching networks)
  // finds the environment it already made instead of spending the code twice.
  const secret = String(body.secret ?? "");
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(secret)) {
    return send(res, 400, { error: "Reload the page and try again." });
  }
  const secretHash = sha(secret);
  const codeHash = sha(normalizeCode(body.code));
  const again = Object.values(state.envs).find(
    (e) => e.secretHash === secretHash && e.codeHash === codeHash,
  );
  if (again) return send(res, 200, { id: again.id });
  const code = state.codes[codeHash];
  const problem = redeemProblem(code);
  if (problem) {
    if (!code) countFailure(ip);
    log({ event: "redeem_denied", reason: problem.slice(0, 30) });
    return send(res, code ? 409 : 404, { error: problem });
  }
  const id = randomBytes(4).toString("hex");
  const created = now();
  const envRec = {
    id,
    codeHash,
    label: code.label,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + cfg.days * 86_400_000).toISOString(),
    status: "provisioning",
    secretHash,
    steps: STEPS.map(([key]) => ({ key })),
    url: null,
    trial: { capUsd: code.trialUsd ?? cfg.trialUsd },
  };
  state.envs[id] = envRec;
  code.envIds.push(id);
  save();
  log({ event: "redeemed", env: id, code: codeHash.slice(0, 8) });
  void provision(envRec, secret);
  // Only the secret's hash is kept; the browser holds the secret itself.
  return send(res, 200, { id });
}

async function envStatus(req, res, id) {
  const envRec = state.envs[id];
  const given = String(req.headers["x-env-secret"] || "");
  if (!envRec || !safeEqual(sha(given), envRec.secretHash)) {
    return send(res, 404, { error: "Not found." });
  }
  const body = publicEnv(envRec);
  if (envRec.status === "ready") body.trial = { ...body.trial, ...(await trialUsage(envRec)) };
  return send(res, 200, body);
}

function front(req, res) {
  const url = new URL(req.url, "http://front");
  const ip = String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "?");
  const isPage = url.pathname === "/" || /^\/e\/[0-9a-f]{8}$/.test(url.pathname);
  if (req.method === "GET" && isPage) {
    res.writeHead(200, PAGE_HEADERS);
    res.end(PAGE);
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true });
  if (req.method === "POST" && url.pathname === "/api/redeem") return redeem(req, res, ip);
  const status = /^\/api\/envs\/([0-9a-f]{8})$/.exec(url.pathname);
  if (req.method === "GET" && status) return envStatus(req, res, status[1]);
  return send(res, 404, { error: "Not found." });
}

// ---------------------------------------------------------------- admin (localhost only)

async function createCode(req, res) {
  const body = await readJson(req);
  const maxEnvs = Number(body.envs ?? 2);
  const days = Number(body.days ?? 14);
  if (!Number.isInteger(maxEnvs) || maxEnvs < 1 || maxEnvs > 20) {
    return send(res, 400, { error: "envs: 1..20" });
  }
  const code = newCode();
  const expiresAt = body.expires
    ? new Date(`${body.expires}T23:59:59Z`).toISOString()
    : new Date(Date.now() + days * 86_400_000).toISOString();
  state.codes[sha(normalizeCode(code))] = {
    label: String(body.label ?? "").slice(0, 60) || null,
    maxEnvs,
    expiresAt,
    createdAt: now().toISOString(),
    envIds: [],
    ...(body.trialUsd !== undefined ? { trialUsd: Number(body.trialUsd) } : {}),
  };
  save();
  log({ event: "code_created", code: sha(normalizeCode(code)).slice(0, 8), maxEnvs });
  // The code itself is shown once, here, and never stored.
  return send(res, 200, { code, maxEnvs, expiresAt, front: state.front });
}

async function listEnvs(res) {
  const envs = await Promise.all(
    Object.values(state.envs).map(async (e) => ({
      id: e.id,
      label: e.label,
      status: e.status,
      createdAt: e.createdAt,
      expiresAt: e.expiresAt,
      url: e.url,
      secondsToReady: e.readyAt
        ? Math.round((Date.parse(e.readyAt) - Date.parse(e.createdAt)) / 1000)
        : null,
      error: e.error ?? null,
      trial: e.status === "ready" ? await trialUsage(e) : null,
    })),
  );
  return send(res, 200, { front: state.front, envs });
}

async function admin(req, res) {
  const auth = String(req.headers.authorization || "");
  if (!safeEqual(auth, `Bearer ${cfg.adminToken}`))
    return send(res, 401, { error: "unauthorized" });
  const url = new URL(req.url, "http://admin");
  const route = `${req.method} ${url.pathname}`;

  if (route === "POST /admin/codes") return createCode(req, res);
  if (route === "GET /admin/codes") {
    return send(res, 200, {
      codes: Object.entries(state.codes).map(([hash, c]) =>
        Object.assign({ id: hash.slice(0, 8) }, c),
      ),
    });
  }
  const revokeCode = /^\/admin\/codes\/([0-9a-f]{8})$/.exec(url.pathname);
  if (req.method === "DELETE" && revokeCode) {
    const entry = Object.entries(state.codes).find(([hash]) => hash.startsWith(revokeCode[1]));
    if (!entry) return send(res, 404, { error: "no such code" });
    entry[1].revoked = true;
    save();
    return send(res, 200, { revoked: revokeCode[1] });
  }
  if (route === "GET /admin/envs") return listEnvs(res);
  const removeOne = /^\/admin\/envs\/([0-9a-f]{8})$/.exec(url.pathname);
  if (req.method === "DELETE" && removeOne) {
    const envRec = state.envs[removeOne[1]];
    if (!envRec) return send(res, 404, { error: "no such environment" });
    await removeEnv(envRec);
    return send(res, 200, { removed: envRec.id });
  }
  send(res, 404, { error: "not found" });
}

// ---------------------------------------------------------------- start

function serve(handler, port) {
  createServer((req, res) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((error) => {
        if (!res.headersSent)
          send(res, error.status || 500, {
            error: error.status ? error.message : "internal error",
          });
        else res.end();
      });
  }).listen(port, "127.0.0.1");
}
serve(front, cfg.port);
serve(admin, cfg.adminPort);
if (cfg.domain) {
  const router = createServer(routeRequest);
  router.on("upgrade", routeUpgrade);
  router.listen(cfg.routerPort, "127.0.0.1");
}
log({ event: "start", port: cfg.port, adminPort: cfg.adminPort, image: cfg.image });

// Environments caught mid-setup by a restart cannot finish: clear them away.
for (const envRec of Object.values(state.envs)) {
  if (envRec.status === "provisioning") {
    envRec.status = "failed";
    envRec.error = "the provisioner restarted during setup";
    void removeEnv(envRec, { keepRecord: true });
  }
}
void tend();
setInterval(() => void tend(), 60_000);
