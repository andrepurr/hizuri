// Hizuri: what a module version must answer before the kernel (kernel.ts) runs it. A module is a
// set of pure decision functions ("give me the situation, I give you a verdict"); its contract
// names every decision and may carry probes: sample inputs each version answers once at load,
// with a check of the answer's shape. Arguments and answers are plain data, so the shadow run can
// copy them (structuredClone) and compare answers (isDeepStrictEqual).

export type Decision = (...args: never[]) => unknown;

/** A module's decisions: every member of T is a function (an interface needs no index signature). */
export type Decisions<T> = { [K in keyof T]: Decision };

export interface ModuleProbe {
  decision: string;
  args: readonly unknown[];
  /** Null when the answer fits the contract, else why it does not. */
  check(answer: unknown): string | null;
}

/** What the kernel reads of a contract, whatever its decisions' types. */
export interface ContractShape {
  /** The folder under `$PASEO_HOME/modules` and the key in voice-settings.json's `modules`. */
  name: string;
  decisions: readonly string[];
  probes?: readonly ModuleProbe[];
}

export interface ModuleContract<T extends Decisions<T>> extends ContractShape {
  decisions: readonly (keyof T & string)[];
}

/** A decision as the kernel calls it: plain data in, plain data out. */
export type DecisionCall = (args: readonly unknown[]) => unknown;

export class ModuleContractError extends Error {
  // Plain fields: the speech worker runs this file in strip-only TypeScript mode.
  readonly module: string;
  readonly version: string;
  readonly reason: string;

  constructor(module: string, version: string, reason: string) {
    super(`module ${module} version ${version} does not answer its contract: ${reason}`);
    this.module = module;
    this.version = version;
    this.reason = reason;
    this.name = "ModuleContractError";
  }
}

const MODULE_NAME = /^[a-z][a-z0-9-]{0,63}$/;

export function isModuleName(name: string): boolean {
  return MODULE_NAME.test(name);
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof Reflect.get(value, "then") === "function"
  );
}

function describe(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Every decision of the contract from a module's exports, checked: each is a function and every
 * probe gets an answer that fits. Throws ModuleContractError naming the first thing missing.
 */
export function decisionTable(input: {
  contract: ContractShape;
  version: string;
  exports: object;
}): ReadonlyMap<string, DecisionCall> {
  const { contract, version, exports } = input;
  const refuse = (reason: string) => new ModuleContractError(contract.name, version, reason);
  const table = new Map<string, DecisionCall>();
  for (const name of contract.decisions) {
    const fn: unknown = Reflect.get(exports, name);
    if (typeof fn !== "function") {
      const found = Object.keys(exports).join(", ") || "nothing";
      throw refuse(`no function “${name}” (it exports: ${found})`);
    }
    table.set(name, (args) => Reflect.apply(fn, undefined, args));
  }
  for (const probe of contract.probes ?? []) {
    const call = table.get(probe.decision);
    if (!call) {
      throw refuse(`probe names “${probe.decision}”, which is not one of its decisions`);
    }
    let answer: unknown;
    try {
      answer = call(structuredClone(probe.args));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw refuse(`${probe.decision}(${describe(probe.args)}) threw: ${message}`);
    }
    if (isThenable(answer)) {
      Promise.resolve(answer).catch(() => undefined);
      throw refuse(`${probe.decision} answered a Promise; decisions answer at once`);
    }
    const wrong = probe.check(answer);
    if (wrong !== null) {
      throw refuse(
        `${probe.decision}(${describe(probe.args)}) answered ${describe(answer)}: ${wrong}`,
      );
    }
  }
  return table;
}
