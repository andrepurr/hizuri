import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type KeyringClient, SecretError, SecretVault, resolveVaultKeySource } from "./vault.js";

const PASSWORD = "Tr0ub4dor&3-horse-staple";

let root: string;
let vaultDir: string;
let keyFile: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "secret-vault-"));
  vaultDir = path.join(root, "personal", "vault");
  keyFile = path.join(root, "paseo-home", "secrets", "vault.key");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function everyFileText(dir: string): Promise<string> {
  const names = await readdir(dir, { recursive: true });
  const texts = await Promise.all(
    names.map(async (name) => {
      const file = path.join(dir, String(name));
      return (await stat(file)).isFile() ? readFile(file, "utf8") : "";
    }),
  );
  return texts.join("\n");
}

describe("local vault", () => {
  test("seals values so no file on disk holds them, and opens them again", async () => {
    const key = await resolveVaultKeySource({ vaultDir, keyFile });
    const vault = new SecretVault({ dir: vaultDir, key });
    const entry = await vault.store({
      name: "github",
      kind: "password",
      why: "push to the user's repos",
      values: { username: "octo", password: PASSWORD },
    });
    expect(entry).toMatchObject({
      kind: "password",
      backend: "local",
      fields: ["password", "username"],
    });

    expect(await everyFileText(vaultDir)).not.toContain(PASSWORD);
    expect(await everyFileText(path.dirname(keyFile))).not.toContain(PASSWORD);
    expect((await stat(path.join(vaultDir, "github.secret"))).mode & 0o777).toBe(0o600);
    expect((await stat(keyFile)).mode & 0o777).toBe(0o600);
    // The key never sits in the vault folder (it may be a git repo).
    expect(keyFile.startsWith(vaultDir)).toBe(false);

    const again = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile }),
    });
    expect(await again.reveal("github")).toEqual({ username: "octo", password: PASSWORD });
  });

  test("a passphrase vault refuses the wrong passphrase", async () => {
    const vault = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile, passphrase: "right one" }),
    });
    await vault.store({ name: "api", kind: "text", why: "x", values: { value: PASSWORD } });

    const wrong = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile, passphrase: "wrong one" }),
    });
    await expect(wrong.reveal("api")).rejects.toThrow(/does not open/);
    const right = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile, passphrase: "right one" }),
    });
    expect(await right.reveal("api")).toEqual({ value: PASSWORD });
  });

  test("keeps the key in the OS keyring when one answers, and never switches source later", async () => {
    const stored = new Map<string, string>();
    const keyring: KeyringClient = {
      lookup: async (attributes) => stored.get(JSON.stringify(attributes)) ?? null,
      store: async (_label, attributes, secret) => {
        stored.set(JSON.stringify(attributes), secret);
      },
    };
    const vault = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile, keyring }),
    });
    await vault.store({ name: "api", kind: "text", why: "x", values: { value: PASSWORD } });
    expect(stored.size).toBe(1);
    await expect(stat(keyFile)).rejects.toThrow();
    // Later the keyring is gone: the vault says so instead of making a new key.
    await expect(resolveVaultKeySource({ vaultDir, keyFile })).rejects.toThrow(/keyring/);
  });

  test("falls back to the key file when the keyring does not answer", async () => {
    const keyring: KeyringClient = {
      lookup: async () => {
        throw new Error("Cannot autolaunch D-Bus without X11 $DISPLAY");
      },
      store: async () => undefined,
    };
    const vault = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile, keyring }),
    });
    await vault.store({ name: "api", kind: "text", why: "x", values: { value: PASSWORD } });
    expect((await stat(keyFile)).isFile()).toBe(true);
  });

  test("rejects names that cannot be a tab id", async () => {
    const vault = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile }),
    });
    await expect(
      vault.store({ name: "../etc", kind: "text", why: "x", values: { value: "v" } }),
    ).rejects.toBeInstanceOf(SecretError);
  });
});

describe("card limits", () => {
  test("holds a payment to the user's per-payment and monthly limits, one checkout counted once", async () => {
    let now = new Date("2026-10-19T10:00:00.000Z");
    const vault = new SecretVault({
      dir: vaultDir,
      key: await resolveVaultKeySource({ vaultDir, keyFile }),
      now: () => now,
    });
    await vault.store({
      name: "visa",
      kind: "card",
      why: "shopping",
      values: { number: "4242424242424242" },
      limits: { currency: "EUR", perPayment: 50, perMonth: 80 },
    });

    await expect(vault.charge("visa", { amount: 60, merchant: "shop" })).rejects.toThrow(
      /per payment/,
    );
    await vault.charge("visa", { amount: 45, merchant: "shop" });
    // The expiry and the CVC of the same checkout do not count again.
    await vault.charge("visa", { amount: 45, merchant: "shop" });
    await expect(vault.charge("visa", { amount: 40, merchant: "other" })).rejects.toThrow(
      /a month/,
    );
    now = new Date("2026-11-01T10:00:00.000Z");
    await vault.charge("visa", { amount: 40, merchant: "other" });
    expect((await vault.entry("visa"))?.charges).toHaveLength(2);
  });
});
