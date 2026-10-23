import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Hizuri (tool hub): one signed receipt per tool call. A receipt says which agent called which
// tool (with the pinned fingerprint of its descriptions), the hashes of the request and the
// answer, the outcome and the time, and links to the previous receipt by hash. The install's own
// Ed25519 key signs the canonical JSON of the receipt without its signature, so anyone holding
// the public key can check a receipt and the whole chain offline. Shape follows the idea of the
// IETF draft "Acta Signed Receipts" (Ed25519 + canonical JSON + previousReceiptHash); it is not
// byte-compatible with that draft. What a receipt proves: this install made this call and got
// this answer. It does not prove the install is not a vendor's bot farm.

/** Plain code-unit order, the same on every machine and locale. */
export function compareCodePoints(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** Canonical JSON: object keys sorted, no whitespace; undefined fields are left out. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? "null" : canonicalJson(item))).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareCodePoints(a, b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export const ReceiptSchema = z.object({
  v: z.literal(1),
  id: z.string(),
  installKeyId: z.string(),
  agentId: z.string(),
  tool: z.string(),
  command: z.string(),
  toolsHash: z.string(),
  requestHash: z.string(),
  responseHash: z.string(),
  outcome: z.enum(["ok", "error"]),
  at: z.string(),
  previousReceiptHash: z.string().nullable(),
  signature: z.string(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;
export type UnsignedReceipt = Omit<Receipt, "signature">;

export interface InstallKey {
  id: string;
  publicKeyPem: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

const KeyFileSchema = z.object({
  v: z.literal(1),
  publicKeyPem: z.string(),
  privateKeyPem: z.string(),
  createdAt: z.string(),
});

function keyIdOf(publicKey: KeyObject): string {
  const raw = publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Loads the install key from `file`, creating it (mode 0600) on first use. */
export async function loadOrCreateInstallKey(file: string): Promise<InstallKey> {
  try {
    const parsed = KeyFileSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
    const privateKey = createPrivateKey(parsed.privateKeyPem);
    const publicKey = createPublicKey(parsed.publicKeyPem);
    return { id: keyIdOf(publicKey), publicKeyPem: parsed.publicKeyPem, privateKey, publicKey };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const body = {
    v: 1,
    publicKeyPem,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    createdAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // wx: two daemons racing on first use never overwrite each other's key.
  await fs.writeFile(file, JSON.stringify(body, null, 2), { mode: 0o600, flag: "wx" });
  return { id: keyIdOf(publicKey), publicKeyPem, privateKey, publicKey };
}

export function newReceiptId(): string {
  return `rcpt_${randomBytes(8).toString("hex")}`;
}

export function signReceipt(body: UnsignedReceipt, key: InstallKey): Receipt {
  const signature = sign(null, Buffer.from(canonicalJson(body), "utf8"), key.privateKey);
  return { ...body, signature: signature.toString("base64url") };
}

export function verifyReceipt(receipt: Receipt, publicKey: KeyObject | string): boolean {
  const key = typeof publicKey === "string" ? createPublicKey(publicKey) : publicKey;
  const { signature, ...body } = receipt;
  try {
    return verify(
      null,
      Buffer.from(canonicalJson(body), "utf8"),
      key,
      Buffer.from(signature, "base64url"),
    );
  } catch {
    return false;
  }
}

/** The hash the next receipt links to: the signed receipt, canonical. */
export function receiptHash(receipt: Receipt): string {
  return hashJson(receipt);
}

export type ChainCheck = { ok: true } | { ok: false; index: number; reason: string };

/** Checks every signature and every previousReceiptHash link, in file order. */
export function verifyChain(
  receipts: readonly Receipt[],
  publicKey: KeyObject | string,
): ChainCheck {
  let previous: string | null = null;
  for (const [index, receipt] of receipts.entries()) {
    if (!verifyReceipt(receipt, publicKey)) {
      return { ok: false, index, reason: "bad signature" };
    }
    if (receipt.previousReceiptHash !== previous) {
      return { ok: false, index, reason: "broken link to the previous receipt" };
    }
    previous = receiptHash(receipt);
  }
  return { ok: true };
}
