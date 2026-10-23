import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { applyOwnerProfile, findProfileDir, readOwnerProfile } from "../owner-profile.js";
import { resolvePaseoHome } from "../paseo-home.js";
import { openSecretVault } from "../secrets/setup.js";
import { SecretError, type SecretValues } from "../secrets/vault.js";
import { configPathScope, isSecretName, lastKey, tokenShape } from "./scopes.js";
import {
  ConfigSecretError,
  ENV_KNOBS_SITE,
  isFilledField,
  isFilledKnob,
  isSecretRefText,
  parseSecretRef,
  pathKey,
  SECRET_KNOBS,
  setLoadedConfigSecrets,
  type ConfigSecretErrorCode,
  type OpenedField,
  type SecretRef,
} from "./secret-refs.js";

// Hizuri: config.json names a secret, the vault holds its value (Home Assistant's `!secret`).
// A field written `"!secret <name>"` (or `"!secret <name>.<field>"` for a secret with several
// fields) is filled from the vault once, at daemon start, before the configuration is read. The
// same goes for the few env knobs that hold a credential (secret-refs.ts ENV_KNOBS_SITE), set in
// the user's personal settings.json or the daemon's environment: the env keeps the reference.
// The file and the configuration the daemon keeps and sends to the app hold the reference only:
// a value is put in where it is used (an agent process's env, the OpenAI speech keys, a plugin
// registry's authorization), so a config edit from the app never writes a value into the file.
//
// The start check looks for literal secrets in config.json: a non-empty value under a key named
// like a credential, in a field whose scope is `secret`, or shaped like a known token. With
// HIZURI_CONFIG_SECRETS=warn (the default) the start never stops: literal secrets are logged as
// a warning, and a reference that cannot be opened (unknown name, locked vault, malformed) is
// logged as an error and its setting stays unset, so the voice keeps running and only what needs
// that secret fails. `refuse` stops the start on any of them. A value is never printed: findings
// and errors carry field paths, and secret names only of secrets the vault holds.

const CONFIG_FILE = "config.json";
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export interface LiteralSecretFinding {
  path: string;
  /** `key-name`, `secret-scope` or a token shape such as `github-token`. */
  rule: string;
}

export type ConfigSecretsMode = "warn" | "refuse";

/** What can open a secret by name; the vault (vault.ts) is one. */
export interface SecretSource {
  reveal(name: string): Promise<SecretValues>;
}

type StringVisitor = (keys: string[], text: string) => void;

/** Calls `visit` with the path and text of every string in a parsed JSON value. */
function visitStrings(value: unknown, visit: StringVisitor, keys: string[] = []): void {
  if (typeof value === "string") {
    visit(keys, value);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, visit, [...keys, String(index)]));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) visitStrings(item, visit, [...keys, key]);
  }
}

/** A reference the start could not use: the field and why, never the value. */
export interface ConfigSecretProblem {
  path: string;
  code: ConfigSecretErrorCode;
  message: string;
}

interface MalformedRef {
  keys: string[];
  text: string;
  problem: ConfigSecretProblem;
}

interface FoundRefs {
  refs: SecretRef[];
  malformed: MalformedRef[];
}

/** Every `!secret` reference in a parsed config.json, and the malformed ones. */
export function findSecretRefs(config: unknown): FoundRefs {
  const found: FoundRefs = { refs: [], malformed: [] };
  visitStrings(config, (keys, text) => {
    const where = keys.join(".");
    try {
      const ref = parseSecretRef(text);
      if (ref) found.refs.push({ path: where, keys, text, ...ref });
    } catch (error) {
      if (!(error instanceof ConfigSecretError)) throw error;
      found.malformed.push({
        keys,
        text,
        problem: { path: where, code: error.code, message: `${where}: ${error.message}` },
      });
    }
  });
  return found;
}

/** Why a value counts as a literal secret, or null. */
function literalRule(keys: readonly string[], value: string): string | null {
  if (isSecretName(lastKey(keys))) return "key-name";
  if (configPathScope(keys) === "secret") return "secret-scope";
  return tokenShape(value);
}

/** Literal secrets in a parsed config.json: field paths and the rule that found them. */
export function findLiteralSecrets(config: unknown): LiteralSecretFinding[] {
  const findings: LiteralSecretFinding[] = [];
  visitStrings(config, (keys, text) => {
    const value = text.trim();
    if (!value || isSecretRefText(value) || BCRYPT_HASH.test(value)) return;
    const rule = literalRule(keys, value);
    if (rule) findings.push({ path: keys.join("."), rule });
  });
  return findings;
}

export function configSecretsMode(env: NodeJS.ProcessEnv): ConfigSecretsMode {
  const raw = env.HIZURI_CONFIG_SECRETS?.trim().toLowerCase() ?? "";
  if (raw === "" || raw === "warn") return "warn";
  if (raw === "refuse") return "refuse";
  throw new ConfigSecretError("bad-mode", "HIZURI_CONFIG_SECRETS must be warn or refuse");
}

interface PickInput {
  ref: SecretRef;
  values: SecretValues;
}

function pickValue({ ref, values }: PickInput): string {
  const fields = Object.keys(values);
  const field = ref.field ?? (fields.length === 1 ? fields[0]! : "value");
  const value = values[field];
  if (value === undefined) {
    throw new ConfigSecretError(
      "secret-field",
      `${ref.path}: the secret “${ref.name}” has the fields ${fields.join(", ")}; write "!secret ${ref.name}.<field>"`,
      [ref.path],
    );
  }
  return value;
}

/** Why the vault could not open a secret, without its message (a backend may quote a value). */
function vaultFailure(error: unknown): string {
  // The local vault's "locked" messages name only a knob or a key file; Bitwarden's quote its
  // output, so only their code is shown.
  if (error instanceof SecretError) {
    return error.code === "locked"
      ? `the vault is locked: ${error.message}`
      : `the vault is unavailable (${error.code})`;
  }
  const code = (error as NodeJS.ErrnoException | null)?.code;
  const name = error instanceof Error ? error.name : typeof error;
  return `the vault failed (${name}${code ? `, ${code}` : ""})`;
}

export interface OpenSecretRefsInput {
  refs: readonly SecretRef[];
  source: SecretSource;
}

export interface OpenedSecretRefs {
  /** By config path (pathKey); a field that could not be opened has no value. */
  fields: Map<string, OpenedField>;
  problems: ConfigSecretProblem[];
}

/**
 * Opens every referenced secret, each name once and all at once. A name the vault does not hold
 * is reported by its fields only.
 */
export async function openSecretRefs({
  refs,
  source,
}: OpenSecretRefsInput): Promise<OpenedSecretRefs> {
  const names = [...new Set(refs.map((ref) => ref.name))];
  const settled = await Promise.allSettled(names.map((name) => source.reveal(name)));
  const opened = new Map(names.map((name, index) => [name, settled[index]!]));
  const result: OpenedSecretRefs = { fields: new Map(), problems: [] };
  for (const ref of refs) {
    const outcome = opened.get(ref.name)!;
    const key = pathKey(ref.keys);
    if (outcome.status === "rejected") {
      const reason: unknown = outcome.reason;
      const unknown = reason instanceof SecretError && reason.code === "not_found";
      result.fields.set(key, { text: ref.text, value: undefined });
      result.problems.push(
        unknown
          ? {
              path: ref.path,
              code: "unknown-secret",
              message: `${ref.path}: the vault holds no secret of that name (compare with secret_list)`,
            }
          : { path: ref.path, code: "vault", message: `${ref.path}: ${vaultFailure(reason)}` },
      );
      continue;
    }
    try {
      result.fields.set(key, { text: ref.text, value: pickValue({ ref, values: outcome.value }) });
    } catch (error) {
      if (!(error instanceof ConfigSecretError)) throw error;
      result.fields.set(key, { text: ref.text, value: undefined });
      result.problems.push({ path: ref.path, code: error.code, message: error.message });
    }
  }
  return result;
}

export interface ConfigSecretsReport {
  mode: ConfigSecretsMode;
  configPath: string;
  literal: LiteralSecretFinding[];
  /** Fields filled from the vault, with the secret names. */
  resolved: Array<{ path: string; name: string }>;
  /** References that could not be used; their settings stay unset. */
  problems: ConfigSecretProblem[];
}

export interface SecretSourceInput {
  env: NodeJS.ProcessEnv;
  paseoHome: string;
}

export interface PrepareConfigSecretsOptions {
  env?: NodeJS.ProcessEnv;
  /** Opens the vault; by default the daemon's own (secrets/setup.ts). */
  openSource?: (input: SecretSourceInput) => SecretSource;
}

function refuse(report: ConfigSecretsReport): void {
  if (report.mode !== "refuse") return;
  if (report.literal.length > 0) {
    const fields = report.literal.map((finding) => finding.path);
    throw new ConfigSecretError(
      "literal-secret",
      `${report.configPath} holds ${fields.length} secret value(s) in plain text: ${fields.join(", ")}. Store each in the vault and write "!secret <name>" there (HIZURI_CONFIG_SECRETS=refuse).`,
      fields,
    );
  }
  const first = report.problems[0];
  if (first) {
    throw new ConfigSecretError(
      first.code,
      `${report.configPath}: ${report.problems.map((problem) => problem.message).join("; ")} (HIZURI_CONFIG_SECRETS=refuse)`,
      report.problems.map((problem) => problem.path),
    );
  }
}

/** config.json parsed, or undefined when it is missing or broken. */
function readConfigFile(configPath: string): unknown {
  if (!existsSync(configPath)) return undefined;
  try {
    return JSON.parse(readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    // The configuration loader reports a broken file with its own error.
    return undefined;
  }
}

/**
 * The env knobs to check, as `{ env: { KNOB: text } }`: the personal settings' knobs (a reference
 * there that is not filled is reported) and every filled knob the env sets.
 */
function knobValues(env: NodeJS.ProcessEnv, profileKeys: readonly string[]): unknown {
  const values: Record<string, string> = {};
  for (const key of new Set([...profileKeys, ...SECRET_KNOBS])) {
    const value = env[key];
    if (value !== undefined) values[key] = value;
  }
  return { [ENV_KNOBS_SITE.at[0]!]: values };
}

/**
 * Daemon start, before the configuration is read: checks config.json for literal secrets, checks
 * every reference in config.json and in the env knobs (the personal settings.json's included),
 * and opens the referenced secrets. The personal profile folder's knobs (applyOwnerProfile)
 * count as defaults here, as they do for the daemon. Throws only in `refuse` mode (and on a bad
 * mode value).
 */
export async function prepareConfigSecrets(
  options: PrepareConfigSecretsOptions = {},
): Promise<ConfigSecretsReport> {
  const env = { ...(options.env ?? process.env) };
  const profileDir = findProfileDir(env);
  const profile = profileDir ? readOwnerProfile(profileDir) : null;
  if (profile) applyOwnerProfile(env, profile);
  const paseoHome = resolvePaseoHome(env);
  const configPath = path.join(paseoHome, CONFIG_FILE);
  const mode = configSecretsMode(env);
  const report: ConfigSecretsReport = { mode, configPath, literal: [], resolved: [], problems: [] };
  setLoadedConfigSecrets(new Map());

  const config = readConfigFile(configPath);
  const inConfig: FoundRefs =
    config === undefined ? { refs: [], malformed: [] } : findSecretRefs(config);
  if (config !== undefined) report.literal = findLiteralSecrets(config);
  const inKnobs = findSecretRefs(knobValues(env, Object.keys(profile?.env ?? {})));
  const refs = [...inConfig.refs, ...inKnobs.refs];
  const malformed = [...inConfig.malformed, ...inKnobs.malformed];
  const isFilled = (keys: readonly string[]) =>
    keys[0] === ENV_KNOBS_SITE.at[0] ? isFilledKnob(keys) : isFilledField(keys);

  report.problems.push(...malformed.map((entry) => entry.problem));
  report.problems.push(
    ...refs
      .filter((ref) => !isFilled(ref.keys))
      .map((ref) => ({
        path: ref.path,
        code: "unsupported-field" as const,
        message:
          ref.keys[0] === ENV_KNOBS_SITE.at[0]
            ? `${ref.path}: the daemon fills "!secret" only in the env knobs ${SECRET_KNOBS.join(", ")}; the text stays as written`
            : `${ref.path}: the daemon fills "!secret" only in agent provider env, the OpenAI keys and plugin registry authorization; the text stays as written`,
      })),
  );
  refuse(report);

  // A malformed reference in a filled field leaves it unset, like one that cannot be opened.
  const fields = new Map<string, OpenedField>(
    malformed
      .filter((entry) => isFilled(entry.keys))
      .map((entry) => [pathKey(entry.keys), { text: entry.text, value: undefined }]),
  );
  const usable = refs.filter((ref) => isFilled(ref.keys));
  if (usable.length > 0) {
    const openSource = options.openSource ?? ((input: SecretSourceInput) => openSecretVault(input));
    const opened = await openSecretRefs({ refs: usable, source: openSource({ env, paseoHome }) });
    for (const [key, field] of opened.fields) fields.set(key, field);
    report.problems.push(...opened.problems);
    refuse(report);
  }
  setLoadedConfigSecrets(fields);
  const failed = new Set(report.problems.map((problem) => problem.path));
  report.resolved = usable
    .filter((ref) => !failed.has(ref.path))
    .map((ref) => ({ path: ref.path, name: ref.name }));
  return report;
}

interface ReportLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface LogConfigSecretsInput {
  logger: ReportLogger;
  report: ConfigSecretsReport;
}

export function logConfigSecretsReport({ logger, report }: LogConfigSecretsInput): void {
  if (report.literal.length > 0) {
    logger.warn(
      {
        configPath: report.configPath,
        mode: report.mode,
        fields: report.literal.map((finding) => `${finding.path} (${finding.rule})`),
      },
      'config_secrets.literal: config.json holds secret values in plain text; store them in the vault and write "!secret <name>"',
    );
  }
  if (report.problems.length > 0) {
    logger.error(
      {
        configPath: report.configPath,
        problems: report.problems.map((problem) => problem.message),
      },
      "config_secrets.unresolved: references the daemon cannot use; a filled field stays unset until it is fixed and the daemon restarts",
    );
  }
  if (report.resolved.length > 0) {
    logger.info(
      { fields: report.resolved.map((ref) => `${ref.path} ← ${ref.name}`) },
      "config_secrets.resolved",
    );
  }
}
