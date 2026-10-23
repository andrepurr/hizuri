import type { CardLimits, SecretKind, SecretValues } from "./vault.js";

// Hizuri (secrets through Show): what the form of each kind asks, and the checks on the user's
// answer. The app draws these fields natively (stage block `secret`); an error goes back to the
// form, never to the agent, and never repeats a value.

export interface SecretFormField {
  key: string;
  label: string;
  /** Masked while the user types, never echoed. */
  secure: boolean;
  optional?: boolean;
  keyboard?: "default" | "email" | "number";
  /** The platform autofill hint, so the user's password manager can fill it. */
  autofill?: "username" | "password" | "email" | "cc-name" | "cc-number" | "cc-exp" | "cc-csc";
  placeholder?: string;
}

const FIELDS: Record<SecretKind, SecretFormField[]> = {
  password: [
    { key: "username", label: "Login", secure: false, optional: true, autofill: "username" },
    { key: "password", label: "Password", secure: true, autofill: "password" },
  ],
  email: [
    { key: "address", label: "E-mail", secure: false, keyboard: "email", autofill: "email" },
    { key: "password", label: "Password", secure: true, optional: true, autofill: "password" },
  ],
  card: [
    { key: "holder", label: "Name on card", secure: false, autofill: "cc-name" },
    {
      key: "number",
      label: "Card number",
      secure: false,
      keyboard: "number",
      autofill: "cc-number",
    },
    {
      key: "expiry",
      label: "Expiry",
      secure: false,
      keyboard: "number",
      autofill: "cc-exp",
      placeholder: "MM/YY",
    },
    { key: "cvc", label: "CVC", secure: true, keyboard: "number", autofill: "cc-csc" },
  ],
  text: [{ key: "value", label: "Value", secure: true }],
};

/** A card's limits: the user's rules for the agent, not secret; they sit in the index. */
export const LIMIT_FIELDS: SecretFormField[] = [
  {
    key: "limit.perPayment",
    label: "Most per payment",
    secure: false,
    keyboard: "number",
  },
  { key: "limit.perMonth", label: "Most per month", secure: false, keyboard: "number" },
  {
    key: "limit.currency",
    label: "Currency",
    secure: false,
    optional: true,
    placeholder: "EUR",
  },
];

export function formFields(kind: SecretKind): SecretFormField[] {
  return FIELDS[kind];
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export type CheckedForm =
  | { ok: true; values: SecretValues; limits?: CardLimits }
  | { ok: false; error: string };

/** Checks the user's answer; trims, normalises a card, and splits off the limits. */
export function checkForm(kind: SecretKind, raw: Record<string, string>): CheckedForm {
  const values: SecretValues = {};
  for (const field of FIELDS[kind]) {
    const value = field.secure ? (raw[field.key] ?? "") : (raw[field.key] ?? "").trim();
    if (!value) {
      if (field.optional) continue;
      return { ok: false, error: `${field.label} is empty` };
    }
    values[field.key] = value;
  }
  if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.address ?? "")) {
    return { ok: false, error: "E-mail does not look like an address" };
  }
  return kind === "card" ? checkCard(values, raw) : { ok: true, values };
}

function checkCard(values: SecretValues, raw: Record<string, string>): CheckedForm {
  const number = (values.number ?? "").replace(/[\s-]/g, "");
  if (!/^\d{12,19}$/.test(number) || !luhn(number)) {
    return { ok: false, error: "Card number does not check out" };
  }
  values.number = number;
  const expiry = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(values.expiry ?? "");
  const month = Number(expiry?.[1]);
  if (!expiry || month < 1 || month > 12) return { ok: false, error: "Expiry must be MM/YY" };
  values.expiry = `${String(month).padStart(2, "0")}/${expiry[2]!.slice(-2)}`;
  if (!/^\d{3,4}$/.test(values.cvc ?? "")) return { ok: false, error: "CVC must be 3 or 4 digits" };

  const amount = (key: string) => {
    const text = (raw[key] ?? "").trim().replace(",", ".");
    const parsed = Number(text);
    return text && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const perPayment = amount("limit.perPayment");
  const perMonth = amount("limit.perMonth");
  if (perPayment === null || perMonth === null) {
    return { ok: false, error: "Set both limits: per payment and per month" };
  }
  const currency = (raw["limit.currency"] ?? "").trim().toUpperCase() || "EUR";
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: "Currency is three letters" };
  return { ok: true, values, limits: { currency, perPayment, perMonth } };
}
