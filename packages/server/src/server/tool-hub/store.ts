import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { writeJsonFileAtomic } from "../atomic-file.js";
import { ReceiptSchema, receiptHash, sha256Hex, type Receipt } from "./receipts.js";

// Hizuri (tool hub): what the hub keeps, under $PASEO_HOME/tool-hub (docs/data-model.md):
//   install-key.json   the install's Ed25519 key (0600), signs every receipt
//   installs.json      approved tools: launch spec, pinned fingerprint, status (atomic writes)
//   receipts.jsonl     one signed receipt per call, append-only, each linked to the previous by hash
//   reviews.json       agents' reviews, each tied to one receipt (atomic writes)
//   secrets.json       keys the user puts there per tool (0600); read by the daemon, never shown
//   cache/<hash>.json  answers of the outside catalogs, with the time they were fetched
//   servers/<id>/      a tool's npm install and the only folder its sandbox can write (home/)
// Every change runs in one queue, so the receipt chain never forks and a review is unique per
// receipt.

const ScoresSchema = z.object({
  usefulness: z.number().int().min(1).max(5),
  ease: z.number().int().min(1).max(5),
  reliability: z.number().int().min(1).max(5),
});
export type ReviewScores = z.infer<typeof ScoresSchema>;

const ToolFingerprintSchema = z.object({
  hash: z.string(),
  tools: z.array(z.object({ name: z.string(), hash: z.string() })),
});

const LaunchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("npm"),
    package: z.string(),
    version: z.string(),
    args: z.array(z.string()).default([]),
    /** Env names the server needs; values come from secrets.json. */
    env: z.array(z.string()).default([]),
  }),
  z.object({
    kind: z.literal("remote"),
    url: z.string(),
    /** Header names the server needs; values come from secrets.json. */
    headers: z.array(z.string()).default([]),
  }),
]);
export type ToolLaunch = z.infer<typeof LaunchSchema>;

const InstallSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string().optional(),
  description: z.string(),
  version: z.string(),
  launch: LaunchSchema,
  sandbox: z.enum(["bwrap", "podman", "landrun", "remote"]),
  fingerprint: ToolFingerprintSchema,
  /** What the model reads for each tool, kept so the daemon can expose them without a launch. */
  tools: z.array(
    z.object({
      name: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      inputSchema: z.unknown().optional(),
    }),
  ),
  approvedAt: z.string(),
  approvalRequestId: z.string(),
  status: z.discriminatedUnion("state", [
    z.object({ state: z.literal("active") }),
    z.object({
      state: z.literal("blocked"),
      at: z.string(),
      reason: z.string(),
      liveHash: z.string(),
    }),
  ]),
});
export type ToolInstall = z.infer<typeof InstallSchema>;

const InstallsFileSchema = z.object({ v: z.literal(1), installs: z.array(InstallSchema) });

const ReviewSchema = z.object({
  id: z.string(),
  receiptId: z.string(),
  tool: z.string(),
  agentId: z.string(),
  scores: ScoresSchema,
  text: z.string(),
  at: z.string(),
  receipt: ReceiptSchema,
});
export type ToolReview = z.infer<typeof ReviewSchema>;

const ReviewsFileSchema = z.object({ v: z.literal(1), reviews: z.array(ReviewSchema) });

const SecretsFileSchema = z.record(z.string(), z.record(z.string(), z.string()));

const CacheEntrySchema = z.object({ fetchedAt: z.number(), value: z.unknown() });

export class ToolHubStoreError extends Error {
  constructor(
    public readonly code: "duplicate_review" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "ToolHubStoreError";
  }
}

export class ToolHubStore {
  readonly dir: string;
  private installs = new Map<string, ToolInstall>();
  private receipts: Receipt[] = [];
  private readonly receiptIndex = new Map<string, Receipt>();
  private reviews: ToolReview[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(paseoHome: string) {
    this.dir = path.join(paseoHome, "tool-hub");
  }

  get keyFile(): string {
    return path.join(this.dir, "install-key.json");
  }

  get secretsFile(): string {
    return path.join(this.dir, "secrets.json");
  }

  serverDir(installId: string): string {
    return path.join(this.dir, "servers", installId);
  }

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    const installs = await readJson(path.join(this.dir, "installs.json"), InstallsFileSchema);
    this.installs = new Map((installs?.installs ?? []).map((install) => [install.id, install]));
    const reviews = await readJson(path.join(this.dir, "reviews.json"), ReviewsFileSchema);
    this.reviews = reviews?.reviews ?? [];
    this.receipts = [];
    this.receiptIndex.clear();
    const lines = await fs
      .readFile(path.join(this.dir, "receipts.jsonl"), "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
    for (const line of lines.split("\n")) {
      if (!line.trim()) continue;
      const receipt = ReceiptSchema.parse(JSON.parse(line));
      this.receipts.push(receipt);
      this.receiptIndex.set(receipt.id, receipt);
    }
  }

  listInstalls(): ToolInstall[] {
    return [...this.installs.values()];
  }

  getInstall(id: string): ToolInstall | undefined {
    return this.installs.get(id);
  }

  findInstallByName(name: string): ToolInstall | undefined {
    return this.installs.get(name) ?? this.listInstalls().find((install) => install.name === name);
  }

  saveInstall(install: ToolInstall): Promise<void> {
    return this.enqueue(async () => {
      const next = new Map(this.installs);
      next.set(install.id, InstallSchema.parse(install));
      await writeJsonFileAtomic(path.join(this.dir, "installs.json"), {
        v: 1,
        installs: [...next.values()],
      });
      this.installs = next;
    });
  }

  /** Appends one receipt; `build` gets the hash of the last one, so the chain cannot fork. */
  appendReceipt(build: (previousReceiptHash: string | null) => Receipt): Promise<Receipt> {
    return this.enqueue(async () => {
      const last = this.receipts.at(-1);
      const receipt = ReceiptSchema.parse(build(last ? receiptHash(last) : null));
      await fs.appendFile(path.join(this.dir, "receipts.jsonl"), `${JSON.stringify(receipt)}\n`, {
        mode: 0o600,
      });
      this.receipts.push(receipt);
      this.receiptIndex.set(receipt.id, receipt);
      return receipt;
    });
  }

  getReceipt(id: string): Receipt | undefined {
    return this.receiptIndex.get(id);
  }

  listReceipts(): readonly Receipt[] {
    return this.receipts;
  }

  /** One review per receipt; a second one is refused. */
  addReview(review: ToolReview): Promise<ToolReview> {
    return this.enqueue(async () => {
      if (this.reviews.some((existing) => existing.receiptId === review.receiptId)) {
        throw new ToolHubStoreError(
          "duplicate_review",
          `Receipt ${review.receiptId} already has a review`,
        );
      }
      const parsed = ReviewSchema.parse(review);
      const next = [...this.reviews, parsed];
      await writeJsonFileAtomic(path.join(this.dir, "reviews.json"), { v: 1, reviews: next });
      this.reviews = next;
      return parsed;
    });
  }

  listReviews(tool?: string): ToolReview[] {
    return tool ? this.reviews.filter((review) => review.tool === tool) : [...this.reviews];
  }

  /** The keys the user stored for a tool (by install id or registry name); never logged. */
  async readSecrets(keys: readonly string[]): Promise<Record<string, string>> {
    const file = await readJson(this.secretsFile, SecretsFileSchema);
    const merged: Record<string, string> = {};
    for (const key of keys) Object.assign(merged, file?.[key] ?? {});
    return merged;
  }

  async readCache<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
    const entry = await readJson(this.cacheFile(key), CacheEntrySchema).catch(() => undefined);
    if (!entry || Date.now() - entry.fetchedAt > maxAgeMs) return undefined;
    return entry.value as T;
  }

  async writeCache(key: string, value: unknown): Promise<void> {
    await writeJsonFileAtomic(this.cacheFile(key), { fetchedAt: Date.now(), value });
  }

  private cacheFile(key: string): string {
    return path.join(this.dir, "cache", `${sha256Hex(key).slice(0, 32)}.json`);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

async function readJson<T>(file: string, schema: z.ZodType<T>): Promise<T | undefined> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return schema.parse(JSON.parse(text));
}
