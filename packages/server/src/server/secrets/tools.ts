import { z } from "zod";
import type { RegisterStageToolsOptions } from "../stage/tools.js";
import type { PaseoToolResult } from "../agent/tools/types.js";
import type { SecretService } from "./service.js";
import { SECRET_KINDS, SecretError } from "./vault.js";

// Hizuri (secrets through Show): the agent's four secret tools. None of them ever returns a
// value: secret_request answers “stored as <name>”, secret_use answers that it typed or ran,
// secret_list shows names, kinds and a card's limits. The agent asks once; later it uses the
// secret by name.

const nameParam = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "lowercase letters, digits and dashes, at most 40")
  .describe("The secret's name, e.g. github, visa-main, throwaway-mail.");

export const secretRequestShape = {
  name: nameParam,
  kind: z
    .enum(SECRET_KINDS)
    .describe(
      "password (login + password), card (with the user's own spending limits), email (an address, " +
        "e.g. a throwaway one, and its password), text (an API key, a token, anything else).",
    ),
  why: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("One line the user reads on the form: what it is for, in the user's language."),
  replace: z
    .boolean()
    .optional()
    .describe("Ask again even though it is stored (the user changed it)."),
  wait: z
    .number()
    .int()
    .min(0)
    .max(600)
    .optional()
    .describe(
      "Seconds to wait for the user's answer (default 180). Later answers reach you as a note.",
    ),
};

export const secretUseShape = {
  name: nameParam,
  field: z
    .string()
    .max(40)
    .optional()
    .describe(
      "Which part: password|username, address|password, value, or for a card number|holder|" +
        "expiry|expiry-month|expiry-year|expiry-year-full|cvc. Default: the main one.",
    ),
  via: z
    .enum(["type", "env"])
    .describe(
      "type: typed into the focused field of your browser (click the field first). " +
        "env: one shell command runs with the value in an environment variable.",
    ),
  enter: z.boolean().optional().describe("type: press Enter after it."),
  display: z.string().max(20).optional().describe("type: the X display, default your browser's."),
  command: z
    .string()
    .max(4000)
    .optional()
    .describe('env: the command; read the value as "$VAR", never echo or print it.'),
  variable: z
    .string()
    .regex(/^[A-Z_][A-Z0-9_]{0,63}$/)
    .optional()
    .describe("env: the variable name, e.g. GITHUB_TOKEN."),
  cwd: z.string().max(1000).optional(),
  amount: z.number().positive().optional().describe("card: what this payment costs."),
  merchant: z.string().trim().min(1).max(120).optional().describe("card: who is paid."),
};

const DESCRIPTIONS = {
  secret_request:
    "Ask the user once for a password, a card, an e-mail or a key in a secure form on their screen. " +
    "The values go from their phone straight into their vault; you never see them and the answer " +
    "says only “stored as <name>”. Use it the first time a task needs a secret the user has not " +
    "given (secret_list first). A card form also asks the spending limits the user allows you. " +
    "Never ask for a secret in the chat or by voice.",
  secret_use:
    "Use a stored secret by name without seeing it: type it into the focused browser field, or " +
    "run one command with it in an environment variable (you get the exit code and the output " +
    "with the value blanked). A card needs amount and merchant and stays within the user's limits.",
  secret_list:
    "The secrets the user has stored: names, kinds, what each is for, a card's limits and what is " +
    "spent this month. Never the values.",
  secret_forget: "Delete a stored secret when the user asks.",
};

function reply(payload: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
}

function refuse(error: unknown): PaseoToolResult {
  const message =
    error instanceof SecretError || error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

export interface RegisterSecretToolsOptions {
  registerTool: RegisterStageToolsOptions["registerTool"];
  secrets: SecretService;
  /** The agent whose stage gets the form: the root agent, as for the stage tools. */
  owner: string;
  /** The X display of the agent's browser, for `via: type`. */
  display: string | null;
}

export function registerSecretTools(options: RegisterSecretToolsOptions): void {
  const { registerTool, secrets, owner } = options;

  registerTool(
    "secret_request",
    {
      title: "Ask for a secret",
      description: DESCRIPTIONS.secret_request,
      inputSchema: secretRequestShape,
    },
    async (input: z.infer<z.ZodObject<typeof secretRequestShape>>, context) => {
      try {
        const answer = await secrets.request({
          owner,
          name: input.name,
          kind: input.kind,
          why: input.why,
          replace: input.replace,
          waitMs: (input.wait ?? 180) * 1000,
          signal: context.signal,
        });
        const notes: Record<typeof answer.status, string> = {
          stored: `stored as ${answer.name}; use it with secret_use`,
          "already-stored": `already stored as ${answer.name}; use it with secret_use`,
          declined: "the user closed the form; ask them in words whether they want to give it",
          expired: "the form expired unanswered",
          waiting:
            "the form is open on the user's screen; you get <secret-stored> when they save it — go on meanwhile",
        };
        return reply({ ...answer, note: notes[answer.status] });
      } catch (error) {
        return refuse(error);
      }
    },
  );

  registerTool(
    "secret_use",
    { title: "Use a secret", description: DESCRIPTIONS.secret_use, inputSchema: secretUseShape },
    async (input: z.infer<z.ZodObject<typeof secretUseShape>>) => {
      try {
        let target;
        if (input.via === "type") {
          const display = input.display ?? options.display;
          if (!display) throw new SecretError("invalid", "no browser display is set for typing");
          target = { via: "type" as const, display, enter: input.enter === true };
        } else {
          if (!input.command || !input.variable) {
            throw new SecretError("invalid", "env needs command and variable");
          }
          target = {
            via: "env" as const,
            command: input.command,
            variable: input.variable,
            ...(input.cwd ? { cwd: input.cwd } : {}),
            timeoutMs: 120_000,
          };
        }
        const payment =
          input.amount !== undefined && input.merchant
            ? { amount: input.amount, merchant: input.merchant }
            : undefined;
        const result = await secrets.use({
          name: input.name,
          ...(input.field ? { field: input.field } : {}),
          target,
          ...(payment ? { payment } : {}),
        });
        return reply({ ok: true, name: input.name, via: input.via, ...result });
      } catch (error) {
        return refuse(error);
      }
    },
  );

  registerTool(
    "secret_list",
    { title: "List secrets", description: DESCRIPTIONS.secret_list, inputSchema: {} },
    async () => {
      try {
        return reply({ backend: secrets.backend, secrets: await secrets.list() });
      } catch (error) {
        return refuse(error);
      }
    },
  );

  registerTool(
    "secret_forget",
    {
      title: "Forget a secret",
      description: DESCRIPTIONS.secret_forget,
      inputSchema: { name: nameParam },
    },
    async (input: { name: string }) => {
      try {
        return reply({ name: input.name, forgotten: await secrets.forget(input.name) });
      } catch (error) {
        return refuse(error);
      }
    },
  );
}
