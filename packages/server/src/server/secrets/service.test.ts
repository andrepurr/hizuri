import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { StageStore } from "../stage/store.js";
import { SecretService } from "./service.js";
import { registerSecretTools } from "./tools.js";
import { createSecretRunner, type SecretRunner } from "./use.js";
import { SecretVault, resolveVaultKeySource } from "./vault.js";

// The guarantees of secrets through Show, end to end inside the daemon: the agent's tool results,
// the stage it writes (what every app and the agent's stage_list see) and the daemon log never
// hold a value the user typed; only the daemon's own runner gets it.

const AGENT = "zuri";
const PASSWORD = "s3cret-Value-9f2c71d0";
const CARD = { number: "4242424242424242", cvc: "737" };

interface RegisteredTool {
  config: PaseoToolConfig;
  handler: (args: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>;
}

let root: string;
let logFile: string;
let store: StageStore;
let service: SecretService;
let tools: Map<string, RegisteredTool>;
let typed: string[];

function call(name: string, args: unknown): Promise<PaseoToolResult> {
  const tool = tools.get(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(args, {});
}

function textOf(result: PaseoToolResult): string {
  return JSON.stringify(result);
}

/** The form id the app reads from the stage, as the app would. */
async function openForm(name: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const stage = await store.get(AGENT);
    const tab = stage.tabs.find((candidate) => candidate.id === `secret-${name}`);
    const form = (tab?.blocks[0] as { props?: { form?: string } } | undefined)?.props?.form;
    if (form) return form;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`no form for ${name}`);
}

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

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "secret-service-"));
  logFile = path.join(root, "daemon.log");
  const logger = pino({ level: "trace" }, pino.destination({ dest: logFile, sync: true }));
  const paseoHome = path.join(root, "paseo-home");
  store = new StageStore({ paseoHome, logger });
  const vaultDir = path.join(root, "personal", "vault");
  const vault = new SecretVault({
    dir: vaultDir,
    key: await resolveVaultKeySource({
      vaultDir,
      keyFile: path.join(paseoHome, "secrets", "vault.key"),
    }),
  });
  typed = [];
  const real = createSecretRunner();
  const runner: SecretRunner = {
    type: async (value) => {
      typed.push(value);
    },
    env: real.env,
  };
  service = new SecretService({ vault, stage: store, runner, logger });
  tools = new Map();
  registerSecretTools({
    registerTool: (name, config, handler) => tools.set(name, { config, handler }),
    secrets: service,
    owner: AGENT,
    display: ":99",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("secrets through Show", () => {
  test("a password goes from the form to the vault; the agent, the stage and the log never see it", async () => {
    const asked = call("secret_request", {
      name: "github",
      kind: "password",
      why: "Push to your repos",
      wait: 5,
    });
    const form = await openForm("github");
    const stageWhileOpen = JSON.stringify(await store.get(AGENT));
    expect(stageWhileOpen).toContain('"type":"secret"');

    // A wrong form id stores nothing.
    expect(
      await service.submit({ agentId: AGENT, form: "forged", values: { password: "x" } }),
    ).toMatchObject({
      stored: false,
    });
    // An empty password goes back to the form, not to the agent.
    expect(await service.submit({ agentId: AGENT, form, values: { password: "" } })).toMatchObject({
      stored: false,
      error: "Password is empty",
    });
    const submitted = await service.submit({
      agentId: AGENT,
      form,
      values: { username: "octo", password: PASSWORD },
    });
    expect(submitted).toEqual({ stored: true, name: "github", error: null, lateNote: null });

    const answer = await asked;
    expect(answer.isError).toBeUndefined();
    expect(answer.structuredContent).toMatchObject({ status: "stored", name: "github" });

    // The form tab is gone once stored.
    expect((await store.get(AGENT)).tabs.some((tab) => tab.id === "secret-github")).toBe(false);

    // Asked again: it is already there, no new form.
    const again = await call("secret_request", { name: "github", kind: "password", why: "x" });
    expect(again.structuredContent).toMatchObject({ status: "already-stored" });

    const used = await call("secret_use", { name: "github", via: "type", enter: true });
    expect(used.structuredContent).toMatchObject({ ok: true, field: "password" });
    expect(typed).toEqual([PASSWORD]);

    const injected = await call("secret_use", {
      name: "github",
      via: "env",
      variable: "TOKEN",
      command:
        'test "$TOKEN" = "' + PASSWORD + '" && echo "same: $TOKEN" && printf %s "$TOKEN" | base64',
    });
    expect(injected.structuredContent).toMatchObject({ ok: true, exitCode: 0 });
    expect((injected.structuredContent as { output: string }).output).toContain("same: [secret]");

    const listed = await call("secret_list", {});
    expect(listed.structuredContent).toMatchObject({
      backend: "local",
      secrets: [{ name: "github", kind: "password", fields: ["password", "username"] }],
    });

    const results = [answer, again, used, injected, listed].map(textOf).join("\n");
    expect(results).not.toContain(PASSWORD);
    expect(results).not.toContain(Buffer.from(PASSWORD).toString("base64").replace(/=+$/, ""));
    expect(await everyFileText(path.join(root, "paseo-home", "stage"))).not.toContain(PASSWORD);
    expect(await everyFileText(path.join(root, "personal"))).not.toContain(PASSWORD);

    const log = await readFile(logFile, "utf8");
    expect(log).toContain("Secret stored");
    expect(log).toContain("Secret used");
    expect(log).not.toContain(PASSWORD);
  });

  test("an answer after the tool stopped waiting reaches the agent as a note without the value", async () => {
    const answer = await call("secret_request", {
      name: "openai-key",
      kind: "text",
      why: "Your API key",
      wait: 0,
    });
    expect(answer.structuredContent).toMatchObject({ status: "waiting", tab: "secret-openai-key" });
    const form = await openForm("openai-key");
    const submitted = await service.submit({ agentId: AGENT, form, values: { value: PASSWORD } });
    expect(submitted.stored).toBe(true);
    expect(submitted.lateNote).toContain('<secret-stored name="openai-key" kind="text"/>');
    expect(submitted.lateNote).not.toContain(PASSWORD);
  });

  test("the user's × on the form is a decline", async () => {
    const asked = call("secret_request", { name: "mail", kind: "email", why: "Sign-ups", wait: 5 });
    await openForm("mail");
    await store.close(AGENT, { tabId: "secret-mail", by: "user" });
    expect((await asked).structuredContent).toMatchObject({ status: "declined" });
  });

  test("a card keeps the user's limits; use needs a payment within them; no error repeats a value", async () => {
    const asked = call("secret_request", { name: "visa", kind: "card", why: "Shopping", wait: 5 });
    const form = await openForm("visa");
    const stage = JSON.stringify(await store.get(AGENT));
    expect(stage).toContain("limit.perMonth");

    const badLimit = await service.submit({
      agentId: AGENT,
      form,
      values: { holder: "Jane Doe", number: CARD.number, expiry: "4/29", cvc: CARD.cvc },
    });
    expect(badLimit).toMatchObject({
      stored: false,
      error: "Set both limits: per payment and per month",
    });
    const badNumber = await service.submit({
      agentId: AGENT,
      form,
      values: {
        holder: "Jane Doe",
        number: "4242424242424241",
        expiry: "04/29",
        cvc: CARD.cvc,
        "limit.perPayment": "50",
        "limit.perMonth": "100",
      },
    });
    expect(badNumber.error).toBe("Card number does not check out");
    expect(JSON.stringify(badNumber)).not.toContain("4242424242424241");

    await service.submit({
      agentId: AGENT,
      form,
      values: {
        holder: "Jane Doe",
        number: "4242 4242 4242 4242",
        expiry: "4/29",
        cvc: CARD.cvc,
        "limit.perPayment": "50",
        "limit.perMonth": "100",
        "limit.currency": "eur",
      },
    });
    expect((await asked).structuredContent).toMatchObject({ status: "stored" });

    const noPayment = await call("secret_use", { name: "visa", via: "type" });
    expect(noPayment.isError).toBe(true);
    const tooMuch = await call("secret_use", {
      name: "visa",
      via: "type",
      amount: 70,
      merchant: "shop",
    });
    expect(textOf(tooMuch)).toContain("over the user's limit of 50 EUR per payment");
    for (const field of ["number", "expiry-month", "expiry-year-full", "cvc"]) {
      const used = await call("secret_use", {
        name: "visa",
        via: "type",
        field,
        amount: 30,
        merchant: "shop",
      });
      expect(used.isError).toBeUndefined();
    }
    expect(typed).toEqual([CARD.number, "04", "2029", CARD.cvc]);
    const listed = await call("secret_list", {});
    expect(listed.structuredContent).toMatchObject({
      secrets: [
        {
          name: "visa",
          limits: { currency: "EUR", perPayment: 50, perMonth: 100 },
          spentThisMonth: 30,
        },
      ],
    });
    const everything = [noPayment, tooMuch, listed].map(textOf).join("\n");
    expect(everything).not.toContain(CARD.number);
    expect(await readFile(logFile, "utf8")).not.toContain(CARD.number);
  });
});
