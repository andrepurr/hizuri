import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { BitwardenBackend } from "./bitwarden.js";
import { SecretVault } from "./vault.js";

// A stand-in for a `bw` wrapper: `create item` reads the encoded item on stdin, `get item <id>`
// prints it, `delete item <id>` drops it. Every argv goes to a log, so the test can prove that no
// value ever travels as an argument.
const FAKE_BW = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const [db, argvLog] = [process.env.FAKE_BW_DB, process.env.FAKE_BW_ARGV];
const args = process.argv.slice(2);
appendFileSync(argvLog, JSON.stringify(args) + "\\n");
const items = existsSync(db) ? JSON.parse(readFileSync(db, "utf8")) : {};
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const [verb, object, id] = args;
  if (verb === "create" && object === "item") {
    const item = JSON.parse(Buffer.from(input.trim(), "base64").toString("utf8"));
    item.id = "id-" + Object.keys(items).length;
    items[item.id] = item;
    writeFileSync(db, JSON.stringify(items));
    process.stdout.write(JSON.stringify(item));
  } else if (verb === "get" && object === "item" && items[id]) {
    process.stdout.write(JSON.stringify(items[id]));
  } else if (verb === "delete" && object === "item") {
    delete items[id];
    writeFileSync(db, JSON.stringify(items));
  } else {
    process.stderr.write("Not found.");
    process.exit(1);
  }
});
`;

let root: string;
let command: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "secret-bw-"));
  await writeFile(path.join(root, "fake-bw.mjs"), FAKE_BW);
  command = path.join(root, "bw");
  await writeFile(
    command,
    `#!/bin/sh\nFAKE_BW_DB="${root}/db.json" FAKE_BW_ARGV="${root}/argv.log" exec "${process.execPath}" "${root}/fake-bw.mjs" "$@"\n`,
  );
  await chmod(command, 0o700);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const noKey = {
  load: async (): Promise<Buffer> => {
    throw new Error("a Bitwarden vault never needs the local key");
  },
};

describe("Bitwarden vault", () => {
  test("stores a card as a Bitwarden card item and reads it back, values only on stdin", async () => {
    const vault = new SecretVault({
      dir: path.join(root, "vault"),
      key: noKey,
      bitwarden: new BitwardenBackend(command),
    });
    const card = { holder: "Jane Doe", number: "4242424242424242", expiry: "04/29", cvc: "737" };
    const entry = await vault.store({ name: "visa", kind: "card", why: "shopping", values: card });
    expect(entry).toMatchObject({ backend: "bitwarden", ref: "id-0" });

    const items = JSON.parse(await readFile(path.join(root, "db.json"), "utf8"));
    expect(items["id-0"]).toMatchObject({
      type: 3,
      name: "hizuri/visa",
      card: {
        cardholderName: "Jane Doe",
        number: "4242424242424242",
        expMonth: "04",
        expYear: "2029",
        code: "737",
      },
    });
    expect(await vault.reveal("visa")).toEqual(card);

    const argv = await readFile(path.join(root, "argv.log"), "utf8");
    expect(argv).not.toContain("4242");
    expect(argv).not.toContain("737");
    // The index next to it holds no value either.
    expect(await readFile(path.join(root, "vault", "index.json"), "utf8")).not.toContain("4242");
  });

  test("a replaced login drops the old item; forget deletes it", async () => {
    const vault = new SecretVault({
      dir: path.join(root, "vault"),
      key: noKey,
      bitwarden: new BitwardenBackend(command),
    });
    const values = { username: "octo", password: "first-pass-123" };
    await vault.store({ name: "github", kind: "password", why: "x", values });
    await vault.store({
      name: "github",
      kind: "password",
      why: "x",
      values: { ...values, password: "second-pass-456" },
    });
    let items = JSON.parse(await readFile(path.join(root, "db.json"), "utf8"));
    expect(Object.keys(items)).toEqual(["id-1"]);
    expect(items["id-1"]).toMatchObject({ type: 1, login: { username: "octo" } });
    expect(await vault.reveal("github")).toEqual({ username: "octo", password: "second-pass-456" });

    expect(await vault.forget("github")).toBe(true);
    items = JSON.parse(await readFile(path.join(root, "db.json"), "utf8"));
    expect(items).toEqual({});
  });

  test("an error carries bw's message and never its output", async () => {
    const backend = new BitwardenBackend(command);
    await expect(backend.read("missing", "password")).rejects.toThrow(/Not found/);
  });
});
