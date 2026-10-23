import { spawn } from "node:child_process";
import type { KeyringClient, SecretKind, SecretValues } from "./vault.js";
import { SecretError } from "./vault.js";

// Hizuri (secrets through Show): the user's own Bitwarden as the vault. `HIZURI_BW_COMMAND` names
// a command that runs one `bw` command with the vault unlocked (for example a wrapper that
// unlocks with `--passwordfile` and exports BW_SESSION). Values travel only on stdin and stdout,
// never in argv (another user could read it in `ps`), and an error carries bw's stderr, never its
// output. Item JSON follows the CLI's own templates (`bw get template item.login|item.card`):
// login type 1, secure note 2, card 3.

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs a command with stdin; nothing it reads or prints is logged. */
export function runWithInput(
  command: string,
  args: readonly string[],
  input: string,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs ?? 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

interface BitwardenItem {
  id?: string;
  type?: number;
  name?: string;
  notes?: string | null;
  login?: { username?: string | null; password?: string | null } | null;
  card?: {
    cardholderName?: string | null;
    number?: string | null;
    expMonth?: string | null;
    expYear?: string | null;
    code?: string | null;
  } | null;
}

function itemFor(input: {
  name: string;
  kind: SecretKind;
  why: string;
  values: SecretValues;
}): BitwardenItem & Record<string, unknown> {
  const base = { name: `hizuri/${input.name}`, favorite: false, reprompt: 0 };
  const { values } = input;
  switch (input.kind) {
    case "password":
      return {
        ...base,
        type: 1,
        notes: input.why,
        login: { username: values.username ?? null, password: values.password ?? null },
      };
    case "email":
      return {
        ...base,
        type: 1,
        notes: input.why,
        login: { username: values.address ?? null, password: values.password ?? null },
      };
    case "card": {
      const [month = "", year = ""] = (values.expiry ?? "").split("/").map((part) => part.trim());
      return {
        ...base,
        type: 3,
        notes: input.why,
        card: {
          cardholderName: values.holder ?? null,
          number: values.number ?? null,
          expMonth: month || null,
          expYear: year.length === 2 ? `20${year}` : year || null,
          code: values.cvc ?? null,
        },
      };
    }
    case "text":
      return { ...base, type: 2, secureNote: { type: 0 }, notes: values.value ?? "" };
  }
}

function valuesFrom(item: BitwardenItem, kind: SecretKind): SecretValues {
  const pick = (entries: Record<string, string | null | undefined>): SecretValues =>
    Object.fromEntries(
      Object.entries(entries).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  switch (kind) {
    case "password":
      return pick({ username: item.login?.username, password: item.login?.password });
    case "email":
      return pick({ address: item.login?.username, password: item.login?.password });
    case "card": {
      const card = item.card ?? {};
      const expiry =
        card.expMonth && card.expYear ? `${card.expMonth}/${card.expYear.slice(-2)}` : undefined;
      return pick({ holder: card.cardholderName, number: card.number, expiry, cvc: card.code });
    }
    case "text":
      return pick({ value: item.notes });
  }
}

export class BitwardenBackend {
  constructor(
    private readonly command: string,
    private readonly run: typeof runWithInput = runWithInput,
  ) {}

  /** Creates the item and returns its id. */
  async create(input: {
    name: string;
    kind: SecretKind;
    why: string;
    values: SecretValues;
  }): Promise<string> {
    const encoded = Buffer.from(JSON.stringify(itemFor(input)), "utf8").toString("base64");
    const result = await this.call(["create", "item"], encoded);
    const id = (JSON.parse(result) as BitwardenItem).id;
    if (!id) throw new SecretError("backend", "Bitwarden created no item id");
    return id;
  }

  async read(id: string, kind: SecretKind): Promise<SecretValues> {
    return valuesFrom(JSON.parse(await this.call(["get", "item", id], "")) as BitwardenItem, kind);
  }

  async remove(id: string): Promise<void> {
    await this.call(["delete", "item", id], "");
  }

  private async call(args: string[], input: string): Promise<string> {
    let result: RunResult;
    try {
      result = await this.run(this.command, args, input);
    } catch (error) {
      throw new SecretError(
        "backend",
        `Bitwarden command failed to start: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (result.code !== 0) {
      throw new SecretError(
        "backend",
        `bw ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim().slice(0, 200)}`,
      );
    }
    return result.stdout;
  }
}

/** libsecret's `secret-tool`: the secret goes on stdin and comes back on stdout. */
export function secretToolKeyring(command = "secret-tool"): KeyringClient {
  const flat = (attributes: Record<string, string>) => Object.entries(attributes).flat();
  return {
    async lookup(attributes) {
      const result = await runWithInput(command, ["lookup", ...flat(attributes)], "", {
        timeoutMs: 10_000,
      });
      if (result.code !== 0) {
        if (result.stderr.trim()) throw new Error(result.stderr.trim().slice(0, 200));
        return null;
      }
      return result.stdout.trim() || null;
    },
    async store(label, attributes, secret) {
      const result = await runWithInput(
        command,
        ["store", `--label=${label}`, ...flat(attributes)],
        secret,
        { timeoutMs: 10_000 },
      );
      if (result.code !== 0) throw new Error(result.stderr.trim().slice(0, 200) || "store failed");
    },
  };
}
