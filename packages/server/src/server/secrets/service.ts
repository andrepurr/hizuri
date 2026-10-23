import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import type { NormalizedBlock } from "../stage/blocks.js";
import type { StageStore } from "../stage/store.js";
import { LIMIT_FIELDS, checkForm, formFields } from "./forms.js";
import { OUTPUT_TAIL, redact, type SecretRunner } from "./use.js";
import {
  SecretError,
  assertName,
  type SecretEntry,
  type SecretKind,
  type SecretVault,
} from "./vault.js";

// Hizuri (secrets through Show): the daemon side of a secret form. secret_request opens a tab with
// one `secret` block on the agent's stage — the form's fields and its id, never a value — and
// waits. The app sends the user's values with secret.store.request straight to this service, which
// writes them to the vault and closes the tab; the agent hears only “stored as <name>”. A form the
// user answers after the tool stopped waiting reaches the agent as <secret-stored name=…/>. Nothing
// here logs a value: log lines carry names, kinds and outcomes only.

const FORM_TTL_MS = 30 * 60_000;

export type FormOutcome = "stored" | "declined" | "expired";

interface PendingForm {
  form: string;
  owner: string;
  name: string;
  kind: SecretKind;
  why: string;
  tabId: string;
  settle: (outcome: FormOutcome) => void;
  done: Promise<FormOutcome>;
  waiting: boolean;
  timer: NodeJS.Timeout;
  unsubscribe: () => void;
}

export interface SecretRequestInput {
  owner: string;
  name: string;
  kind: SecretKind;
  why: string;
  replace?: boolean;
  waitMs: number;
  signal?: AbortSignal;
}

export type SecretRequestAnswer =
  | { status: "stored" | "declined" | "expired" | "already-stored"; name: string }
  | { status: "waiting"; name: string; tab: string };

export interface SecretSubmitInput {
  agentId: string;
  form: string;
  values?: Record<string, string>;
  decline?: boolean;
}

export interface SecretSubmitResult {
  stored: boolean;
  name: string | null;
  error: string | null;
  /** The tool stopped waiting: tell the agent this way instead. */
  lateNote: string | null;
}

export type SecretUseTarget =
  | { via: "type"; display: string; enter: boolean }
  | { via: "env"; command: string; variable: string; cwd?: string; timeoutMs: number };

export interface SecretUseInput {
  name: string;
  field?: string;
  target: SecretUseTarget;
  payment?: { amount: number; merchant: string };
}

export interface SecretSummary {
  name: string;
  kind: SecretKind;
  why: string;
  fields: string[];
  backend: SecretEntry["backend"];
  createdAt: string;
  limits?: SecretEntry["limits"];
  spentThisMonth?: number;
}

const PRIMARY_FIELD: Record<SecretKind, string> = {
  password: "password",
  email: "address",
  card: "number",
  text: "value",
};

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** A card field as a checkout form asks it; expiry also as its month and year. */
function fieldValue(values: Record<string, string>, field: string): string | undefined {
  if (field === "expiry-month") return values.expiry?.split("/")[0];
  if (field === "expiry-year") return values.expiry?.split("/")[1];
  if (field === "expiry-year-full") {
    const year = values.expiry?.split("/")[1];
    return year ? `20${year}` : undefined;
  }
  return values[field];
}

export class SecretService {
  private readonly forms = new Map<string, PendingForm>();

  constructor(
    private readonly options: {
      vault: SecretVault;
      stage: StageStore;
      runner: SecretRunner;
      logger: Logger;
      now?: () => Date;
    },
  ) {}

  get backend(): "local" | "bitwarden" {
    return this.options.vault.backend;
  }

  async request(input: SecretRequestInput): Promise<SecretRequestAnswer> {
    const { vault, stage, logger } = this.options;
    const name = assertName(input.name);
    if (!input.replace && (await vault.entry(name))) return { status: "already-stored", name };
    for (const pending of this.forms.values()) {
      if (pending.owner === input.owner && pending.name === name) this.finish(pending, "declined");
    }
    const form = randomUUID();
    const tabId = `secret-${name}`;
    let settle: (outcome: FormOutcome) => void = () => undefined;
    const done = new Promise<FormOutcome>((resolve) => {
      settle = resolve;
    });
    const pending: PendingForm = {
      form,
      owner: input.owner,
      name,
      kind: input.kind,
      why: input.why,
      tabId,
      settle,
      done,
      waiting: true,
      timer: setTimeout(() => this.finish(pending, "expired"), FORM_TTL_MS),
      unsubscribe: () => undefined,
    };
    pending.timer.unref?.();
    this.forms.set(form, pending);
    await stage.open(input.owner, {
      tabId,
      title: "Secure entry",
      icon: "lock",
      blocks: [this.formBlock(pending)],
      enter: "slide",
      createdBy: input.owner,
    });
    // Closing the tab with × is a decline.
    pending.unsubscribe = stage.subscribe(input.owner, (change) => {
      if (change.removed.includes(tabId) || change.closed.some((tab) => tab.id === tabId)) {
        this.finish(pending, "declined");
      }
    });
    logger.info({ name, kind: input.kind, owner: input.owner }, "Secret form opened");

    let timer: NodeJS.Timeout | undefined;
    const waited = await Promise.race([
      done,
      new Promise<"waiting">((resolve) => {
        timer = setTimeout(() => resolve("waiting"), input.waitMs);
        input.signal?.addEventListener("abort", () => resolve("waiting"), { once: true });
      }),
    ]);
    clearTimeout(timer);
    if (waited === "waiting") {
      pending.waiting = false;
      return { status: "waiting", name, tab: tabId };
    }
    return { status: waited, name };
  }

  async submit(input: SecretSubmitInput): Promise<SecretSubmitResult> {
    const { vault, logger } = this.options;
    const pending = this.forms.get(input.form);
    if (!pending || pending.owner !== input.agentId) {
      return { stored: false, name: null, error: "This form is no longer open.", lateNote: null };
    }
    const late = (outcome: string) =>
      pending.waiting
        ? null
        : `<secret-${outcome} name="${escapeAttribute(pending.name)}" kind="${pending.kind}"/>\n` +
          `<instruction>The user answered the secure form you opened. You never see the values; use the secret by name with secret_use.</instruction>`;
    if (input.decline) {
      this.finish(pending, "declined");
      logger.info({ name: pending.name }, "Secret form declined");
      return { stored: false, name: pending.name, error: null, lateNote: late("declined") };
    }
    const checked = checkForm(pending.kind, input.values ?? {});
    if (!checked.ok) {
      return { stored: false, name: pending.name, error: checked.error, lateNote: null };
    }
    try {
      await vault.store({
        name: pending.name,
        kind: pending.kind,
        why: pending.why,
        values: checked.values,
        ...(checked.limits ? { limits: checked.limits } : {}),
      });
    } catch (error) {
      logger.warn(
        { name: pending.name, code: error instanceof SecretError ? error.code : "unknown" },
        "Secret not stored",
      );
      return {
        stored: false,
        name: pending.name,
        error: error instanceof SecretError ? error.message : "The vault could not store it.",
        lateNote: null,
      };
    }
    logger.info(
      { name: pending.name, kind: pending.kind, backend: vault.backend },
      "Secret stored",
    );
    this.finish(pending, "stored");
    return { stored: true, name: pending.name, error: null, lateNote: late("stored") };
  }

  async list(): Promise<SecretSummary[]> {
    const month = (this.options.now?.() ?? new Date()).toISOString().slice(0, 7);
    const entries = await this.options.vault.list();
    const summaries: SecretSummary[] = [];
    for (const [name, entry] of Object.entries(entries)) {
      const summary: SecretSummary = {
        name,
        kind: entry.kind,
        why: entry.why,
        fields: entry.fields,
        backend: entry.backend,
        createdAt: entry.createdAt,
      };
      if (entry.limits) {
        summary.limits = entry.limits;
        summary.spentThisMonth = (entry.charges ?? [])
          .filter((charge) => charge.at.startsWith(month))
          .reduce((sum, charge) => sum + charge.amount, 0);
      }
      summaries.push(summary);
    }
    return summaries;
  }

  async forget(name: string): Promise<boolean> {
    return this.options.vault.forget(assertName(name));
  }

  /** Types or injects one field; the answer carries no value. */
  async use(input: SecretUseInput): Promise<{ field: string; exitCode?: number; output?: string }> {
    const { vault, runner, logger } = this.options;
    const entry = await vault.entry(assertName(input.name));
    if (!entry)
      throw new SecretError("not_found", `no secret “${input.name}”; ask with secret_request`);
    const field = input.field ?? PRIMARY_FIELD[entry.kind];
    if (entry.kind === "card") {
      if (!input.payment) {
        throw new SecretError("invalid", "a card is used only with amount and merchant");
      }
      await vault.charge(input.name, input.payment);
    }
    const values = await vault.reveal(input.name);
    const value = fieldValue(values, field);
    if (value === undefined) {
      throw new SecretError(
        "invalid",
        `“${input.name}” has no field “${field}”; it has ${entry.fields.join(", ")}`,
      );
    }
    logger.info({ name: input.name, field, via: input.target.via }, "Secret used");
    if (input.target.via === "type") {
      await runner.type(value, input.target);
      return { field };
    }
    const outcome = await runner.env(value, input.target);
    return {
      field,
      exitCode: outcome.exitCode,
      output: redact(outcome.output, Object.values(values)).slice(-OUTPUT_TAIL),
    };
  }

  private formBlock(pending: PendingForm): NormalizedBlock {
    const fields = formFields(pending.kind);
    return {
      type: "secret",
      id: "form",
      props: {
        form: pending.form,
        name: pending.name,
        kind: pending.kind,
        why: pending.why,
        fields,
        ...(pending.kind === "card" ? { limits: LIMIT_FIELDS } : {}),
      },
      fallback: `Your agent asks for “${pending.name}” in a secure form. Update the app to enter it.`,
    };
  }

  private finish(pending: PendingForm, outcome: FormOutcome): void {
    if (!this.forms.delete(pending.form)) return;
    clearTimeout(pending.timer);
    pending.unsubscribe();
    pending.settle(outcome);
    void this.options.stage
      .close(pending.owner, { tabId: pending.tabId, by: "agent", delete: true })
      .catch(() => undefined);
  }
}
