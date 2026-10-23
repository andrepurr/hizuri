import { existsSync } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { findProfileDir } from "../owner-profile.js";
import type { StageStore } from "../stage/store.js";
import { BitwardenBackend, secretToolKeyring } from "./bitwarden.js";
import { SecretService } from "./service.js";
import { createSecretRunner } from "./use.js";
import { SecretVault, resolveVaultKeySource, type VaultKeySource } from "./vault.js";

// Hizuri (secrets through Show): which vault the daemon uses, from its environment (the user
// profile's settings.json sets these like any PASEO_* knob):
// - HIZURI_BW_COMMAND: a command that runs one `bw` command unlocked → values go to Bitwarden.
// - HIZURI_VAULT_DIR: the vault folder; default `<personal folder>/vault`.
// - HIZURI_VAULT_PASSPHRASE: derive the local key from it; else the OS keyring (secret-tool),
//   else `$PASEO_HOME/secrets/vault.key`.
// - HIZURI_SECRET_DISPLAY: the X display secret_use types into; default DISPLAY.

function onPath(command: string, env: NodeJS.ProcessEnv): boolean {
  return (env.PATH ?? "")
    .split(path.delimiter)
    .some((dir) => dir && existsSync(path.join(dir, command)));
}

export function resolveVaultDir(env: NodeJS.ProcessEnv): string {
  const explicit = env.HIZURI_VAULT_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const profile = findProfileDir(env);
  if (profile) return path.join(profile, "vault");
  const home = env.HIZURI_HOME?.trim() || path.join(env.HOME ?? "", ".hizuri");
  return path.join(home, "personal", "vault");
}

/** The vault the daemon's environment names; it touches no file until a secret is used. */
export function openSecretVault(options: {
  paseoHome: string;
  env: NodeJS.ProcessEnv;
}): SecretVault {
  const env = options.env;
  const dir = resolveVaultDir(env);
  const command = env.HIZURI_BW_COMMAND?.trim();
  const keyring =
    env.DBUS_SESSION_BUS_ADDRESS && onPath("secret-tool", env) ? secretToolKeyring() : null;
  // The key source is picked on first use, so a daemon that never stores a secret writes nothing.
  let source: Promise<VaultKeySource> | null = null;
  const key: VaultKeySource = {
    load: async () => {
      source ??= resolveVaultKeySource({
        vaultDir: dir,
        keyFile: path.join(options.paseoHome, "secrets", "vault.key"),
        passphrase: env.HIZURI_VAULT_PASSPHRASE,
        keyring,
      }).catch((error: unknown) => {
        source = null;
        throw error;
      });
      return (await source).load();
    },
  };
  return new SecretVault({
    dir,
    key,
    bitwarden: command ? new BitwardenBackend(command) : null,
  });
}

export function createSecretService(options: {
  paseoHome: string;
  stage: StageStore;
  logger: Logger;
  env?: NodeJS.ProcessEnv;
}): { service: SecretService; display: string | null } {
  const env = options.env ?? process.env;
  const vault = openSecretVault({ paseoHome: options.paseoHome, env });
  options.logger.info({ dir: resolveVaultDir(env), backend: vault.backend }, "Secret vault ready");
  return {
    service: new SecretService({
      vault,
      stage: options.stage,
      runner: createSecretRunner(),
      logger: options.logger,
    }),
    display: env.HIZURI_SECRET_DISPLAY?.trim() || env.DISPLAY?.trim() || null,
  };
}
