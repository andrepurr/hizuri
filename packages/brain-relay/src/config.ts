export type Upstream = "gemini" | "openrouter";

export interface RelayLimits {
  /** Upstream calls one install may make per UTC day. */
  installDailyRequests: number;
  /** Upstream calls one install may ever make. */
  installTotalRequests: number;
  /** Upstream calls from one IP address per UTC day, across all its installs. */
  ipDailyRequests: number;
  /** New install tokens one IP address may take per UTC day. */
  ipDailyInstalls: number;
  /** Upstream calls for everyone per UTC day: the stop before the bill grows. */
  globalDailyRequests: number;
  /** Dollars one install may ever spend; 0 means no spend cap (the request caps still apply). */
  installTotalUsd: number;
}

/** Upstream prices per million tokens, for upstreams that do not report the cost themselves. */
export interface RelayPrices {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export interface RelayConfig {
  host: string;
  port: number;
  upstream: Upstream;
  upstreamBaseUrl: string;
  upstreamKey: string;
  model: string;
  /** Gemini 3 models cannot switch thinking off; "minimal" is the least they do. */
  reasoningEffort: string;
  maxOutputTokens: number;
  maxBodyBytes: number;
  limits: RelayLimits;
  stateFile: string | null;
  /** Read the client address from X-Forwarded-For (only behind our own reverse proxy). */
  trustProxy: boolean;
  /** Salt for hashing client addresses, so the state file and logs hold no raw IPs. */
  ipSalt: string;
  prices: RelayPrices;
  /** Bearer for the /v1/admin endpoints (hosted demos issue their own installs); off when null. */
  adminToken: string | null;
}

const UPSTREAM_DEFAULTS: Record<Upstream, { baseUrl: string; model: string }> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.1-flash-lite",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-3.1-flash-lite",
  },
};

export const DEFAULT_LIMITS: RelayLimits = {
  installDailyRequests: 60,
  installTotalRequests: 300,
  ipDailyRequests: 200,
  ipDailyInstalls: 5,
  globalDailyRequests: 20_000,
  installTotalUsd: 0,
};

/** Gemini 3.1 Flash-Lite, standard paid tier (ai.google.dev pricing). */
const DEFAULT_PRICES: RelayPrices = { inputPerMillionUsd: 0.25, outputPerMillionUsd: 1.5 };

function readUsd(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a dollar amount, got "${raw}"`);
  }
  return value;
}

function readInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number, got "${raw}"`);
  }
  return value;
}

function readOptional(env: NodeJS.ProcessEnv, name: string): string | null {
  return env[name]?.trim() || null;
}

function loadLimits(env: NodeJS.ProcessEnv): RelayLimits {
  return {
    installDailyRequests: readInt(
      env,
      "FREE_BRAIN_INSTALL_DAILY_REQUESTS",
      DEFAULT_LIMITS.installDailyRequests,
    ),
    installTotalRequests: readInt(
      env,
      "FREE_BRAIN_INSTALL_TOTAL_REQUESTS",
      DEFAULT_LIMITS.installTotalRequests,
    ),
    ipDailyRequests: readInt(env, "FREE_BRAIN_IP_DAILY_REQUESTS", DEFAULT_LIMITS.ipDailyRequests),
    ipDailyInstalls: readInt(env, "FREE_BRAIN_IP_DAILY_INSTALLS", DEFAULT_LIMITS.ipDailyInstalls),
    globalDailyRequests: readInt(
      env,
      "FREE_BRAIN_GLOBAL_DAILY_REQUESTS",
      DEFAULT_LIMITS.globalDailyRequests,
    ),
    installTotalUsd: readUsd(env, "FREE_BRAIN_INSTALL_TOTAL_USD", DEFAULT_LIMITS.installTotalUsd),
  };
}

function loadPrices(env: NodeJS.ProcessEnv): RelayPrices {
  return {
    inputPerMillionUsd: readUsd(
      env,
      "FREE_BRAIN_PRICE_INPUT_PER_M",
      DEFAULT_PRICES.inputPerMillionUsd,
    ),
    outputPerMillionUsd: readUsd(
      env,
      "FREE_BRAIN_PRICE_OUTPUT_PER_M",
      DEFAULT_PRICES.outputPerMillionUsd,
    ),
  };
}

/** Every knob is an env var (the service reads them from its env file). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const upstream = (env.FREE_BRAIN_UPSTREAM?.trim() || "gemini") as Upstream;
  if (!(upstream in UPSTREAM_DEFAULTS)) {
    throw new Error(`FREE_BRAIN_UPSTREAM must be gemini or openrouter, got "${upstream}"`);
  }
  const upstreamKey = env.FREE_BRAIN_UPSTREAM_KEY?.trim() ?? "";
  if (!upstreamKey) {
    throw new Error("FREE_BRAIN_UPSTREAM_KEY is not set");
  }
  const defaults = UPSTREAM_DEFAULTS[upstream];
  return {
    host: env.FREE_BRAIN_HOST?.trim() || "127.0.0.1",
    port: readInt(env, "FREE_BRAIN_PORT", 8790),
    upstream,
    upstreamBaseUrl: (env.FREE_BRAIN_UPSTREAM_URL?.trim() || defaults.baseUrl).replace(/\/+$/, ""),
    upstreamKey,
    model: env.FREE_BRAIN_MODEL?.trim() || defaults.model,
    reasoningEffort: env.FREE_BRAIN_REASONING_EFFORT?.trim() || "minimal",
    maxOutputTokens: readInt(env, "FREE_BRAIN_MAX_OUTPUT_TOKENS", 1024),
    maxBodyBytes: readInt(env, "FREE_BRAIN_MAX_BODY_BYTES", 256 * 1024),
    limits: loadLimits(env),
    stateFile: env.FREE_BRAIN_STATE_FILE?.trim() || null,
    trustProxy: env.FREE_BRAIN_TRUST_PROXY === "1",
    ipSalt: env.FREE_BRAIN_IP_SALT?.trim() || "hizuri-free-brain",
    prices: loadPrices(env),
    adminToken: readOptional(env, "FREE_BRAIN_ADMIN_TOKEN"),
  };
}
