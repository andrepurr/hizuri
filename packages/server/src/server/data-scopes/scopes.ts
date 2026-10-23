import { z } from "zod";

import { DAEMON_SETTING_ENV_KEYS } from "../config-environment.js";
import { PersistedConfigSchema } from "../persisted-config.js";
import { VOICE_KNOBS } from "../voice-settings/knobs.js";

// Hizuri: every setting the daemon reads has a scope, so a setup can be shared and nothing
// personal or secret goes with it by accident (the user's data in three layers: personal, setup,
// lists). Like VS Code's setting scopes (`machine` settings never sync) and Home Assistant's
// `!secret` (the configuration names a secret, the value lives elsewhere):
// - `setup`: how the assistant behaves; the same for anyone who installs the setup.
// - `personal`: the value is a fact about the user or their machines: names, other people,
//   places, time zone, folders and paths, host names, URLs of their own servers, voice prints.
// - `secret`: a credential; its value belongs in the vault, and config.json names it
//   (`!secret <name>`, config-secrets.ts).
// A setting nobody classified is personal: unknown values never leave the machine.

export const DATA_SCOPES = ["setup", "personal", "secret"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

/**
 * A key named like a credential (`*_TOKEN`, `*_KEY`, `*_SECRET`, `*_PASSWORD`, `*_PASSPHRASE`,
 * `apiKey`, `Authorization`): its value is a secret wherever it sits.
 */
const SECRET_NAME_PARTS = [
  // snake or kebab case, any letter case: API_TOKEN, api-key, client_secret
  /(?:^|[_-])(?:TOKEN|KEY|SECRET|PASSWORD|PASSPHRASE)$/i,
  // camelCase: apiKey, authToken, clientSecret (case-sensitive, so "hotkey" is not one)
  /[a-z0-9](?:Token|Key|Secret|Password)$/,
  /^(?:token|key|secret|password|passphrase|apikey|authorization)$/i,
];

/** A key that names a place, a person or a machine: folders, files, URLs, hosts, names. */
const PERSONAL_NAME =
  /(?:^|[_-])(?:DIRS?|PATHS?|FILE|LOG|HOME|URL|ENDPOINT|HOSTS?|HOSTNAMES?|NAMES?|FORMS|PEOPLE|ZONE|EMAIL|PHONE|COMMAND|DISPLAY_NAME)$|[a-z](?:Dir|Path|Url|Host|Name)$/i;

/** The scope of a free-form key (an agent provider's env or options), from its name alone. */
export function scopeByName(key: string): DataScope {
  if (isSecretName(key)) return "secret";
  if (PERSONAL_NAME.test(key)) return "personal";
  return "setup";
}

export function isSecretName(key: string): boolean {
  return SECRET_NAME_PARTS.some((pattern) => pattern.test(key));
}

/** Token shapes after gitleaks' default rules, for values under keys with innocent names. */
const TOKEN_SHAPES: ReadonlyArray<readonly [string, RegExp]> = [
  ["anthropic-api-key", /\bsk-ant-[a-z0-9]+-[A-Za-z0-9_-]{20,}/],
  ["openai-style-key", /\bsk-(?:proj-|svcacct-|admin-|or-v1-)?[A-Za-z0-9_-]{20,}/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{50,}/],
  ["gitlab-token", /\bglpat-[A-Za-z0-9_-]{20,}/],
  ["slack-token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["aws-access-key", /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}/],
  ["stripe-key", /\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["huggingface-token", /\bhf_[A-Za-z]{30,}/],
  ["groq-api-key", /\bgsk_[A-Za-z0-9]{40,}/],
  ["xai-api-key", /\bxai-[A-Za-z0-9]{40,}/],
  ["telegram-bot-token", /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/],
  ["private-key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

/** The token shape a value has (e.g. `github-token`), or null. */
export function tokenShape(value: string): string | null {
  return TOKEN_SHAPES.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

type ConfigRuleScope = DataScope | "by-name";

/**
 * config.json paths and their scopes, one rule per schema leaf. `*` is any one key or array index.
 * The rule with the most segments that matches a path's start wins, so an array of scalars and a
 * record of scalars take their field's rule. `by-name` takes the scope from the last key
 * (scopeByName). A path no rule covers (a key the schema lets through without naming it) is
 * personal. The test walks PersistedConfigSchema, its arrays and unions included: a new field
 * fails it until it is listed here.
 */
export const CONFIG_SCOPE_RULES: ReadonlyArray<readonly [string, ConfigRuleScope]> = [
  ["$schema", "setup"],
  ["version", "setup"],
  ["daemon.listen", "personal"],
  ["daemon.hostnames", "personal"],
  ["daemon.allowedHosts", "personal"],
  ["daemon.trustedProxies", "personal"],
  ["daemon.mcp.enabled", "setup"],
  ["daemon.mcp.injectIntoAgents", "setup"],
  ["daemon.browserTools.enabled", "setup"],
  ["daemon.git.maxProcessesPerSecond", "setup"],
  ["daemon.git.maxProcessConcurrency", "setup"],
  ["daemon.autoArchiveAfterMerge", "setup"],
  ["daemon.enableTerminalAgentHooks", "setup"],
  // Free text the user writes for every agent: it names their projects, places and people.
  ["daemon.appendSystemPrompt", "personal"],
  ["daemon.terminalProfiles.*.id", "setup"],
  ["daemon.terminalProfiles.*.name", "setup"],
  ["daemon.terminalProfiles.*.icon", "setup"],
  // A shell command and its arguments name the user's own programs and hosts (`ssh user@host`).
  ["daemon.terminalProfiles.*.command", "personal"],
  ["daemon.terminalProfiles.*.args", "personal"],
  ["daemon.agentProfiles.*.id", "setup"],
  ["daemon.agentProfiles.*.name", "setup"],
  ["daemon.agentProfiles.*.icon", "setup"],
  ["daemon.agentProfiles.*.color", "setup"],
  ["daemon.agentProfiles.*.provider", "setup"],
  ["daemon.agentProfiles.*.model", "setup"],
  ["daemon.agentProfiles.*.modeId", "setup"],
  ["daemon.agentProfiles.*.thinkingOptionId", "setup"],
  ["daemon.agentProfiles.*.featureValues", "setup"],
  ["daemon.agentProfiles.*.notes", "personal"],
  ["daemon.cors.allowedOrigins", "personal"],
  ["daemon.relay.enabled", "setup"],
  ["daemon.relay.useTls", "setup"],
  ["daemon.relay.publicUseTls", "setup"],
  ["daemon.relay.endpoint", "personal"],
  ["daemon.relay.publicEndpoint", "personal"],
  ["daemon.serviceProxy.enabled", "setup"],
  ["daemon.serviceProxy.listen", "personal"],
  ["daemon.serviceProxy.publicBaseUrl", "personal"],
  // A bcrypt hash, written by `daemon set-password`: never exported, never a literal-token warning.
  ["daemon.auth.password", "secret"],
  ["app.baseUrl", "personal"],
  ["providers.openai.apiKey", "secret"],
  ["providers.openai.baseUrl", "personal"],
  ["providers.openai.stt.apiKey", "secret"],
  ["providers.openai.stt.baseUrl", "personal"],
  ["providers.openai.tts.apiKey", "secret"],
  ["providers.openai.tts.baseUrl", "personal"],
  ["providers.local.modelsDir", "personal"],
  ["pluginRegistries.*.authorization", "secret"],
  ["pluginsEnabled", "setup"],
  ["plugins.*.source", "setup"],
  ["plugins.*.path", "personal"],
  ["plugins.*.enabled", "setup"],
  ["worktrees.root", "personal"],
  ["worktrees.servicePorts.range", "setup"],
  ["worktrees.servicePorts.portScript", "personal"],
  ["agents.providers.*.extends", "setup"],
  ["agents.providers.*.label", "setup"],
  ["agents.providers.*.description", "setup"],
  // An argv holds the paths of the user's own launchers.
  ["agents.providers.*.command", "personal"],
  ["agents.providers.*.env", "by-name"],
  ["agents.providers.*.options", "by-name"],
  ["agents.providers.*.params", "by-name"],
  ["agents.providers.*.models.*.id", "setup"],
  ["agents.providers.*.models.*.label", "setup"],
  ["agents.providers.*.models.*.description", "setup"],
  ["agents.providers.*.models.*.isDefault", "setup"],
  ["agents.providers.*.models.*.thinkingOptions.*.id", "setup"],
  ["agents.providers.*.models.*.thinkingOptions.*.label", "setup"],
  ["agents.providers.*.models.*.thinkingOptions.*.description", "setup"],
  ["agents.providers.*.models.*.thinkingOptions.*.isDefault", "setup"],
  ["agents.providers.*.additionalModels.*.id", "setup"],
  ["agents.providers.*.additionalModels.*.label", "setup"],
  ["agents.providers.*.additionalModels.*.description", "setup"],
  ["agents.providers.*.additionalModels.*.isDefault", "setup"],
  ["agents.providers.*.additionalModels.*.thinkingOptions.*.id", "setup"],
  ["agents.providers.*.additionalModels.*.thinkingOptions.*.label", "setup"],
  ["agents.providers.*.additionalModels.*.thinkingOptions.*.description", "setup"],
  ["agents.providers.*.additionalModels.*.thinkingOptions.*.isDefault", "setup"],
  ["agents.providers.*.disallowedTools", "setup"],
  ["agents.providers.*.paseoTools.enabled", "setup"],
  ["agents.providers.*.paseoTools.disabledTools", "setup"],
  ["agents.providers.*.enabled", "setup"],
  ["agents.providers.*.order", "setup"],
  ["agents.catalogRefreshTimeoutMs", "setup"],
  ["agents.metadataGeneration.providers.*.provider", "setup"],
  ["agents.metadataGeneration.providers.*.model", "setup"],
  ["agents.metadataGeneration.providers.*.thinkingOptionId", "setup"],
  ["agents.skills.selection.mode", "setup"],
  ["agents.skills.selection.skills", "setup"],
  ["features.dictation.enabled", "setup"],
  ["features.dictation.stt.provider", "setup"],
  ["features.dictation.stt.model", "setup"],
  ["features.dictation.stt.language", "setup"],
  ["features.dictation.stt.confidenceThreshold", "setup"],
  ["features.voiceMode.enabled", "setup"],
  ["features.voiceMode.llm.provider", "setup"],
  ["features.voiceMode.llm.model", "setup"],
  ["features.voiceMode.stt.provider", "setup"],
  ["features.voiceMode.stt.model", "setup"],
  ["features.voiceMode.stt.language", "setup"],
  ["features.voiceMode.turnDetection.provider", "setup"],
  ["features.voiceMode.tts.provider", "setup"],
  ["features.voiceMode.tts.model", "setup"],
  ["features.voiceMode.tts.voice", "setup"],
  ["features.voiceMode.tts.speakerId", "setup"],
  ["features.voiceMode.tts.speed", "setup"],
  ["features.webUi.enabled", "setup"],
  ["features.webUi.distDir", "personal"],
  ["features.show.screenUrl", "personal"],
  ["features.face.avatarDir", "personal"],
  ["log.level", "setup"],
  ["log.format", "setup"],
  ["log.console.level", "setup"],
  ["log.console.format", "setup"],
  ["log.file.level", "setup"],
  ["log.file.path", "personal"],
  ["log.file.rotate.maxSize", "setup"],
  ["log.file.rotate.maxFiles", "setup"],
];

const PARSED_RULES = CONFIG_SCOPE_RULES.map(([pattern, scope]) => ({
  segments: pattern.split("."),
  scope,
}));

/** The last key of a path that is not an array index. */
export function lastKey(path: readonly string[]): string {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    if (!/^\d+$/.test(path[index]!)) return path[index]!;
  }
  return "";
}

/**
 * The scope of a config.json path (keys and array indexes); null when no rule covers it and the
 * key is not named like a credential.
 */
export function configPathScope(path: readonly string[]): DataScope | null {
  let best: { segments: string[]; scope: ConfigRuleScope } | null = null;
  for (const rule of PARSED_RULES) {
    if (rule.segments.length > path.length) continue;
    const matches = rule.segments.every(
      (segment, index) => segment === "*" || segment === path[index],
    );
    if (matches && (!best || rule.segments.length > best.segments.length)) best = rule;
  }
  if (!best) return isSecretName(lastKey(path)) ? "secret" : null;
  if (best.scope === "by-name") return scopeByName(lastKey(path));
  // A key named like a credential is secret wherever it sits, also deeper than its rule.
  return best.segments.length < path.length && isSecretName(lastKey(path)) ? "secret" : best.scope;
}

function unwrapSchema(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (;;) {
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodReadonly
    ) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodPipe) {
      // .transform() keeps the object in `in`; z.preprocess() keeps it in `out`.
      current = (current.in instanceof z.ZodTransform ? current.out : current.in) as z.ZodType;
    } else {
      return current;
    }
  }
}

/**
 * Every leaf path PersistedConfigSchema accepts: into objects, records and arrays (`*` for a key
 * or an index) and every option of a union. A record of scalars, an array of scalars and a value
 * of any shape are leaves.
 */
export function configSchemaLeafPaths(
  schema: z.ZodType = PersistedConfigSchema,
  prefix: string[] = [],
): string[][] {
  const current = unwrapSchema(schema);
  if (current instanceof z.ZodObject) {
    return Object.entries(current.shape as Record<string, z.ZodType>).flatMap(([key, value]) =>
      configSchemaLeafPaths(value, [...prefix, key]),
    );
  }
  if (current instanceof z.ZodRecord || current instanceof z.ZodArray) {
    const item = (
      current instanceof z.ZodRecord ? current.valueType : current.element
    ) as z.ZodType;
    const inner = unwrapSchema(item);
    const nested =
      inner instanceof z.ZodObject ||
      inner instanceof z.ZodRecord ||
      inner instanceof z.ZodArray ||
      inner instanceof z.ZodUnion;
    return nested ? configSchemaLeafPaths(inner, [...prefix, "*"]) : [prefix];
  }
  if (current instanceof z.ZodUnion) {
    const seen = new Set<string>();
    return (current.options as z.ZodType[])
      .flatMap((option) => configSchemaLeafPaths(option, prefix))
      .filter((leaf) => {
        const key = leaf.join(".");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  return [prefix];
}

/** The rule that covers a path exactly (same length), for the schema coverage test. */
export function hasOwnScopeRule(path: readonly string[]): boolean {
  return PARSED_RULES.some(
    (rule) =>
      (rule.segments.length === path.length || rule.scope === "by-name") &&
      rule.segments.length <= path.length &&
      rule.segments.every((segment, index) => segment === "*" || segment === path[index]),
  );
}

type DaemonSettingEnvKey = (typeof DAEMON_SETTING_ENV_KEYS)[number];

/** config-environment.ts: the env keys the daemon's configuration reads, every one scoped. */
const DAEMON_ENV_TABLE = {
  MCP_DEBUG: "setup",
  OPENAI_STT_BASE_URL: "personal",
  OPENAI_TTS_BASE_URL: "personal",
  PASEO_ALLOWED_HOSTS: "personal",
  PASEO_APP_BASE_URL: "personal",
  PASEO_CORS_ORIGINS: "personal",
  PASEO_DICTATION_ENABLED: "setup",
  PASEO_DICTATION_LANGUAGE: "setup",
  PASEO_DICTATION_LOCAL_STT_MODEL: "setup",
  PASEO_DICTATION_STT_PROVIDER: "setup",
  PASEO_EMPTY_FALLBACK: "setup",
  PASEO_EMPTY_FALLBACK_WAIT_MS: "setup",
  PASEO_ENGLISH_PASS: "setup",
  PASEO_ENGLISH_PASS_LATIN_SHARE: "setup",
  PASEO_ENGLISH_PASS_MIN_ALIKE: "setup",
  PASEO_ENGLISH_PASS_MODEL: "setup",
  PASEO_ENGLISH_PASS_THREADS: "setup",
  PASEO_ENGLISH_PASS_WAIT_MS: "setup",
  PASEO_FACE_AVATAR_DIR: "personal",
  PASEO_GIT_CONCURRENCY: "setup",
  PASEO_GIT_MAX_PROCESSES_PER_SECOND: "setup",
  PASEO_GIT_MAX_PROCESS_CONCURRENCY: "setup",
  PASEO_HOSTNAMES: "personal",
  PASEO_LISTEN: "personal",
  PASEO_LOCAL_MODELS_DIR: "personal",
  PASEO_LOG: "setup",
  PASEO_LOG_CONSOLE_FORMAT: "setup",
  PASEO_LOG_CONSOLE_LEVEL: "setup",
  PASEO_LOG_FILE_LEVEL: "setup",
  PASEO_LOG_FILE_PATH: "personal",
  PASEO_LOG_FILE_ROTATE_COUNT: "setup",
  PASEO_LOG_FILE_ROTATE_SIZE: "setup",
  PASEO_LOG_FORMAT: "setup",
  PASEO_LOG_LEVEL: "setup",
  PASEO_LOG_ROTATE_COUNT: "setup",
  PASEO_LOG_ROTATE_SIZE: "setup",
  PASEO_MIXED_ENGLISH: "setup",
  // The user's own word list may hold private names.
  PASEO_MIXED_ENGLISH_FILE: "personal",
  PASEO_PASSWORD: "secret",
  PASEO_PLUGIN_REGISTRY: "setup",
  PASEO_RELAY_ENABLED: "setup",
  PASEO_RELAY_ENDPOINT: "personal",
  PASEO_RELAY_PUBLIC_ENDPOINT: "personal",
  PASEO_RELAY_PUBLIC_USE_TLS: "setup",
  PASEO_RELAY_USE_TLS: "setup",
  PASEO_SERVICE_PROXY_ENABLED: "setup",
  PASEO_SERVICE_PROXY_LISTEN: "personal",
  PASEO_SERVICE_PROXY_PUBLIC_BASE_URL: "personal",
  PASEO_SHOW_SCREEN_URL: "personal",
  PASEO_STT_VOCAB_FILE: "personal",
  PASEO_TRUSTED_PROXIES: "personal",
  PASEO_VOICE_LANGUAGE: "setup",
  PASEO_VOICE_LLM_PROVIDER: "setup",
  PASEO_VOICE_LOCAL_STT_MODEL: "setup",
  PASEO_VOICE_LOCAL_TTS_MODEL: "setup",
  PASEO_VOICE_LOCAL_TTS_SPEAKER_ID: "setup",
  PASEO_VOICE_LOCAL_TTS_SPEED: "setup",
  PASEO_VOICE_MODE_ENABLED: "setup",
  PASEO_VOICE_STT_PROVIDER: "setup",
  PASEO_VOICE_STT_STREAM: "setup",
  PASEO_VOICE_STT_STREAM_ENDPOINT: "personal",
  PASEO_VOICE_STT_STREAM_MIN_SILENCE_MS: "setup",
  PASEO_VOICE_STT_STREAM_REST_AFTER_MS: "setup",
  PASEO_VOICE_STT_DRAFT: "setup",
  PASEO_VOICE_STT_DRAFT_MARGIN_MS: "setup",
  PASEO_VOICE_STT_DRAFT_KEEP_STREAM_MS: "setup",
  PASEO_VOICE_TTS_PROVIDER: "setup",
  PASEO_VOICE_TURN_DETECTION_PROVIDER: "setup",
  PASEO_WEB_UI_DIST_DIR: "personal",
  PASEO_WEB_UI_ENABLED: "setup",
  PORT: "personal",
  STT_CONFIDENCE_THRESHOLD: "setup",
  STT_MODEL: "setup",
  TTS_MODEL: "setup",
  TTS_VOICE: "setup",
  // The configuration context keys (config-environment.ts CONFIG_CONTEXT_ENV_KEYS).
  PASEO_NODE_ENV: "setup",
  PASEO_DESKTOP_MANAGED: "setup",
  OPENAI_API_KEY: "secret",
  OPENAI_BASE_URL: "personal",
  OPENAI_STT_API_KEY: "secret",
  OPENAI_TTS_API_KEY: "secret",
} satisfies Record<DaemonSettingEnvKey, DataScope> & Partial<Record<string, DataScope>>;

export const DAEMON_ENV_SCOPES: Readonly<Partial<Record<string, DataScope>>> = DAEMON_ENV_TABLE;

/**
 * Knobs of the user's personal folder (`<personal>/settings.json`, owner-profile.ts) and the
 * hizuri start knobs. A key of that file missing here is personal: the file is personal by place.
 */
export const PROFILE_KNOB_SCOPES: Readonly<Partial<Record<string, DataScope>>> = {
  HIZURI_HOME: "personal",
  PASEO_PROFILE_DIR: "personal",
  HIZURI_LANGUAGES_DIR: "personal",
  HIZURI_BW_COMMAND: "personal",
  HIZURI_VAULT_DIR: "personal",
  HIZURI_VAULT_PASSPHRASE: "secret",
  HIZURI_SECRET_DISPLAY: "setup",
  HIZURI_CONFIG_SECRETS: "setup",
  // The assistant's name is the user's choice, but a renamed assistant names them too.
  PASEO_ASSISTANT_NAME: "personal",
  PASEO_ASSISTANT_NAME_FORMS: "personal",
  PASEO_USER_NAME: "personal",
  PASEO_USER_NAME_FORMS: "personal",
  PASEO_USER_CALL_NAME: "personal",
  PASEO_OTHER_PEOPLE: "personal",
  PASEO_NOT_FOR_ME_NAMES: "personal",
  PASEO_NOT_FOR_ME_SOUNDS: "personal",
  PASEO_SECRETARY_HANDOFF_WORDS: "personal",
  PASEO_TIME_ZONE: "personal",
  PASEO_SHOW_FILE_DIRS: "personal",
  PASEO_FAST_FRONT_PERSONA: "personal",
  PASEO_VISUAL_FRONT_PERSONA: "personal",
  PASEO_FAST_FRONT_BRIEF: "personal",
  PASEO_FAST_FRONT_AGENTS_BOARD: "personal",
  PASEO_FAST_FRONT_WORK_BOARD: "personal",
  PASEO_FAST_FRONT_WORK_BOARD_TOKEN: "secret",
  PASEO_FAST_FRONT_SKIP_PROVIDERS: "setup",
};

const VOICE_KNOB_SCOPES = new Map(VOICE_KNOBS.map((knob) => [knob.key, knob.scope]));

/**
 * The scope of an env-style setting: a voice knob, a daemon configuration key, a profile knob
 * (`PASEO_ASSISTANT_NAME_<LANG>` like its base), else personal.
 */
export function settingScope(key: string): DataScope {
  const known =
    VOICE_KNOB_SCOPES.get(key) ??
    DAEMON_ENV_SCOPES[key] ??
    PROFILE_KNOB_SCOPES[key] ??
    (key.startsWith("PASEO_ASSISTANT_NAME_")
      ? PROFILE_KNOB_SCOPES.PASEO_ASSISTANT_NAME
      : undefined);
  if (known) return known;
  return isSecretName(key) ? "secret" : "personal";
}
