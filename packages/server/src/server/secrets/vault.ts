import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { BitwardenBackend } from "./bitwarden.js";

// Hizuri (secrets through Show): the user's passwords, cards, throwaway e-mails and keys, stored
// once and used by name. The index (index.json) holds only what the agent may know — names,
// kinds, why, a card's limits and its spending — never a value. The values live in the user's
// Bitwarden when one is configured, else here, one AES-256-GCM file per secret. The key never
// sits next to the files: the vault folder is in the personal folder, which may be a git repo.

export const SECRET_KINDS = ["password", "card", "email", "text"] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];
export type SecretValues = Record<string, string>;

/** Lowercase letters, digits and dashes, so the form's tab id is `secret-<name>`. */
export const SECRET_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

const LimitsSchema = z.object({
  currency: z.string(),
  perPayment: z.number().optional(),
  perMonth: z.number().optional(),
});
export type CardLimits = z.infer<typeof LimitsSchema>;

const ChargeSchema = z.object({ at: z.string(), amount: z.number(), merchant: z.string() });
export type CardCharge = z.infer<typeof ChargeSchema>;

const EntrySchema = z.object({
  kind: z.enum(SECRET_KINDS),
  backend: z.enum(["local", "bitwarden"]),
  /** The Bitwarden item id. */
  ref: z.string().optional(),
  why: z.string(),
  fields: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  limits: LimitsSchema.optional(),
  charges: z.array(ChargeSchema).optional(),
});
export type SecretEntry = z.infer<typeof EntrySchema>;

const IndexSchema = z.object({ v: z.literal(1), secrets: z.record(z.string(), EntrySchema) });
type VaultIndex = z.infer<typeof IndexSchema>;

const KeyInfoSchema = z.object({
  v: z.literal(1),
  key: z.enum(["passphrase", "keyring", "file"]),
  salt: z.string().optional(),
});

const SealedSchema = z.object({
  v: z.literal(1),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});

export class SecretError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "locked" | "backend" | "limit",
    message: string,
  ) {
    super(message);
    this.name = "SecretError";
  }
}

/** The 32-byte key; resolveVaultKeySource records its origin in vault.json. */
export interface VaultKeySource {
  load(): Promise<Buffer>;
}

export interface KeyringClient {
  lookup(attributes: Record<string, string>): Promise<string | null>;
  store(label: string, attributes: Record<string, string>, secret: string): Promise<void>;
}

export interface ResolveKeySourceOptions {
  vaultDir: string;
  /** `$PASEO_HOME/secrets/vault.key`: the last resort, outside the personal folder. */
  keyFile: string;
  passphrase?: string;
  keyring?: KeyringClient | null;
}

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

async function writePrivate(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(temp, content, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, file);
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

/**
 * Picks the key source once: a passphrase when set, else the OS keyring when it answers, else a
 * key file. vault.json remembers the choice; a vault made with one source never silently gets a
 * new key from another (its files would become unreadable).
 */
export async function resolveVaultKeySource(
  options: ResolveKeySourceOptions,
): Promise<VaultKeySource> {
  const infoFile = path.join(options.vaultDir, "vault.json");
  const saved = existsSync(infoFile) ? KeyInfoSchema.parse(await readJson(infoFile)) : null;
  const attributes = { service: "hizuri-vault", vault: options.vaultDir };
  const passphrase = options.passphrase?.trim() ? options.passphrase : undefined;

  const fromPassphrase = (salt: string): VaultKeySource => ({
    load: async () => {
      if (!passphrase) {
        throw new SecretError("locked", "the vault needs its passphrase (HIZURI_VAULT_PASSPHRASE)");
      }
      return scryptSync(passphrase, Buffer.from(salt, "base64"), 32, SCRYPT);
    },
  });
  const fromKeyring = (keyring: KeyringClient): VaultKeySource => ({
    load: async () => {
      const stored = await keyring.lookup(attributes);
      if (!stored) throw new SecretError("locked", "the vault key is missing from the OS keyring");
      return Buffer.from(stored.trim(), "base64");
    },
  });
  const fromFile: VaultKeySource = {
    load: async () => {
      if (!existsSync(options.keyFile)) {
        throw new SecretError("locked", `the vault key file is missing (${options.keyFile})`);
      }
      return Buffer.from((await readFile(options.keyFile, "utf8")).trim(), "base64");
    },
  };

  if (saved) {
    if (saved.key === "passphrase") return fromPassphrase(saved.salt ?? "");
    if (saved.key === "keyring") {
      if (!options.keyring) throw new SecretError("locked", "the OS keyring is not reachable");
      return fromKeyring(options.keyring);
    }
    return fromFile;
  }

  const save = (info: z.infer<typeof KeyInfoSchema>) =>
    writePrivate(infoFile, `${JSON.stringify(info, null, 2)}\n`);
  if (passphrase) {
    const salt = randomBytes(16).toString("base64");
    await save({ v: 1, key: "passphrase", salt });
    return fromPassphrase(salt);
  }
  if (options.keyring) {
    try {
      const existing = await options.keyring.lookup(attributes);
      if (!existing) {
        await options.keyring.store(
          "hizuri vault key",
          attributes,
          randomBytes(32).toString("base64"),
        );
      }
      await save({ v: 1, key: "keyring" });
      return fromKeyring(options.keyring);
    } catch {
      // No session bus or no keyring daemon (a headless server): fall through to the key file.
    }
  }
  if (!existsSync(options.keyFile)) {
    await writePrivate(options.keyFile, `${randomBytes(32).toString("base64")}\n`);
  }
  await save({ v: 1, key: "file" });
  return fromFile;
}

export interface SecretVaultOptions {
  dir: string;
  key: VaultKeySource;
  /** The user's Bitwarden; values go there instead of local files. */
  bitwarden?: BitwardenBackend | null;
  now?: () => Date;
}

export interface StoreSecretInput {
  name: string;
  kind: SecretKind;
  why: string;
  values: SecretValues;
  limits?: CardLimits;
}

/** The vault: values in Bitwarden or sealed files, everything else in the index. */
export class SecretVault {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly now: () => Date;

  constructor(private readonly options: SecretVaultOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get backend(): "local" | "bitwarden" {
    return this.options.bitwarden ? "bitwarden" : "local";
  }

  async list(): Promise<Record<string, SecretEntry>> {
    return (await this.readIndex()).secrets;
  }

  async entry(name: string): Promise<SecretEntry | null> {
    return (await this.readIndex()).secrets[name] ?? null;
  }

  async store(input: StoreSecretInput): Promise<SecretEntry> {
    assertName(input.name);
    return this.serial(async () => {
      const index = await this.readIndex();
      const previous = index.secrets[input.name];
      const now = this.now().toISOString();
      const bitwarden = this.options.bitwarden;
      let ref: string | undefined;
      if (bitwarden) {
        ref = await bitwarden.create({
          name: input.name,
          kind: input.kind,
          why: input.why,
          values: input.values,
        });
      } else {
        await this.seal(input.name, input.values);
      }
      const entry: SecretEntry = {
        kind: input.kind,
        backend: this.backend,
        ...(ref ? { ref } : {}),
        why: input.why,
        fields: Object.keys(input.values).sort(),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        ...(input.limits ? { limits: input.limits } : {}),
      };
      index.secrets[input.name] = entry;
      await this.writeIndex(index);
      if (previous?.backend === "bitwarden" && previous.ref && previous.ref !== ref) {
        await bitwarden?.remove(previous.ref).catch(() => undefined);
      }
      if (previous?.backend === "local" && bitwarden)
        await rm(this.file(input.name), { force: true });
      return entry;
    });
  }

  /** The values, for the daemon's own use (typing, an env). Never hand them to an agent. */
  async reveal(name: string): Promise<SecretValues> {
    const entry = await this.entry(name);
    if (!entry) throw new SecretError("not_found", `no secret “${name}”`);
    if (entry.backend === "bitwarden") {
      if (!this.options.bitwarden || !entry.ref) {
        throw new SecretError("backend", `“${name}” is in Bitwarden, which is not configured`);
      }
      return this.options.bitwarden.read(entry.ref, entry.kind);
    }
    return this.open(name);
  }

  async forget(name: string): Promise<boolean> {
    return this.serial(async () => {
      const index = await this.readIndex();
      const entry = index.secrets[name];
      if (!entry) return false;
      if (entry.backend === "bitwarden" && entry.ref)
        await this.options.bitwarden?.remove(entry.ref);
      await rm(this.file(name), { force: true });
      delete index.secrets[name];
      await this.writeIndex(index);
      return true;
    });
  }

  /**
   * Checks a card payment against the limits the user set and records it. The same merchant and
   * amount within 30 minutes is one payment (the number, the expiry and the code of one checkout).
   */
  async charge(name: string, payment: { amount: number; merchant: string }): Promise<void> {
    await this.serial(async () => {
      const index = await this.readIndex();
      const entry = index.secrets[name];
      if (!entry) throw new SecretError("not_found", `no secret “${name}”`);
      const now = this.now();
      const charges = entry.charges ?? [];
      const same = charges.some(
        (charge) =>
          charge.merchant === payment.merchant &&
          charge.amount === payment.amount &&
          now.getTime() - Date.parse(charge.at) < 30 * 60_000,
      );
      if (same) return;
      const limits = entry.limits;
      const currency = limits?.currency ?? "";
      if (limits?.perPayment !== undefined && payment.amount > limits.perPayment) {
        throw new SecretError(
          "limit",
          `${payment.amount} ${currency} is over the user's limit of ${limits.perPayment} ${currency} per payment`,
        );
      }
      const month = now.toISOString().slice(0, 7);
      const spent = charges
        .filter((charge) => charge.at.startsWith(month))
        .reduce((sum, charge) => sum + charge.amount, 0);
      if (limits?.perMonth !== undefined && spent + payment.amount > limits.perMonth) {
        throw new SecretError(
          "limit",
          `this month ${spent} ${currency} is spent; ${payment.amount} more is over the user's ${limits.perMonth} ${currency} a month`,
        );
      }
      entry.charges = [...charges, { at: now.toISOString(), ...payment }].slice(-200);
      await this.writeIndex(index);
    });
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private file(name: string): string {
    return path.join(this.options.dir, `${name}.secret`);
  }

  private async seal(name: string, values: SecretValues): Promise<void> {
    const key = await this.options.key.load();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    cipher.setAAD(Buffer.from(`hizuri-vault:v1:${name}`));
    const data = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
    const sealed = {
      v: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    await writePrivate(this.file(name), `${JSON.stringify(sealed)}\n`);
  }

  private async open(name: string): Promise<SecretValues> {
    const file = this.file(name);
    if (!existsSync(file))
      throw new SecretError("not_found", `the vault file of “${name}” is gone`);
    const sealed = SealedSchema.parse(await readJson(file));
    const key = await this.options.key.load();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"), {
      authTagLength: 16,
    });
    decipher.setAAD(Buffer.from(`hizuri-vault:v1:${name}`));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    try {
      const plain = Buffer.concat([
        decipher.update(Buffer.from(sealed.data, "base64")),
        decipher.final(),
      ]);
      return z.record(z.string(), z.string()).parse(JSON.parse(plain.toString("utf8")));
    } catch {
      throw new SecretError("locked", `“${name}” does not open with this vault key`);
    }
  }

  private async readIndex(): Promise<VaultIndex> {
    const file = path.join(this.options.dir, "index.json");
    if (!existsSync(file)) return { v: 1, secrets: {} };
    return IndexSchema.parse(await readJson(file));
  }

  private async writeIndex(index: VaultIndex): Promise<void> {
    await writePrivate(
      path.join(this.options.dir, "index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
  }
}

export function assertName(name: string): string {
  if (!SECRET_NAME.test(name)) {
    throw new SecretError(
      "invalid",
      `secret name “${name}” must be lowercase letters, digits and dashes, at most 40`,
    );
  }
  return name;
}
