import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";

import { envFlag, envPositive, watchLiveModuleSettings } from "../voice-env.js";
import {
  ModuleContractError,
  decisionTable,
  isThenable,
  type ContractShape,
  type DecisionCall,
  type Decisions,
  type ModuleContract,
} from "./contract.js";
import type { ModuleEntry, ModulesSection } from "./settings.js";
import {
  BUILTIN_VERSION,
  ModuleVersionError,
  ModuleVersionUnreadableError,
  importModuleVersion,
} from "./versions.js";

// Hizuri: the module kernel, the one fixed part that runs hizuri's swappable logic without a
// restart (a rewrite changes only what the assistant can say, the voice never
// drops). Code loaded here runs
// on the voice's hot path in the daemon's process: every call into a loaded version is timed,
// fenced from the caller's data by a copy, and switched back when it fails.

export interface KernelLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

interface Version {
  id: string;
  calls: ReadonlyMap<string, DecisionCall>;
}

interface ModuleSlot {
  contract: ContractShape;
  builtIn: Version;
  active: Version;
  /** Where a rollback goes: the version that was in force before the last switch. */
  lastGood: Version;
  shadow: Version | null;
  loaded: Map<string, Version>;
  loading: Map<string, Promise<void>>;
  /** Versions that failed (contract, import, throw, slow) with why; never put in force again. */
  refused: Map<string, string>;
  /** Files that could not be read; tried again when the module's settings entry changes. */
  unreadable: Map<string, string>;
  stats: ModuleStats;
}

export interface ModuleStats {
  calls: number;
  shadowCalls: number;
  disagreements: number;
}

export interface ModuleStatus extends ModuleStats {
  module: string;
  active: string;
  lastGood: string;
  shadow: string | null;
  refused: Readonly<Record<string, string>>;
  /** The settings pick a version or shadow not in force yet: loading, or waiting for a phrase end. */
  pending: boolean;
}

export interface ModuleKernelOptions {
  /** PASEO_MODULES, read on every call. */
  isEnabled?: () => boolean;
  /** PASEO_MODULES_MAX_MS, read on every call. */
  maxDecisionMs?: () => number;
  /** Milliseconds, for decision times and open phrases; performance.now. */
  now?: () => number;
  /** A phrase open this long is taken as closed (a session that died mid-phrase). */
  stalePhraseMs?: number;
}

export interface ModuleKernelStart {
  paseoHome: string;
  logger: KernelLogger;
}

export interface ModuleKernel {
  /** Attach the daemon's home and log, and follow the `modules` section. Once per daemon. */
  start(input: ModuleKernelStart): void;
  stop(): void;
  register<T extends Decisions<T>>(input: { contract: ModuleContract<T>; builtIn: T }): T;
  /** A voice session's phrase began (the VAD confirmed the user's speech). */
  phraseOpened(session: object): void;
  /** A voice session's phrase ended; waiting switches apply when no phrase is open. */
  phraseClosed(session: object): void;
  /** Resolves when every version being loaded is loaded or refused. */
  settled(): Promise<void>;
  status(): ModuleStatus[];
}

interface Wanted {
  version: string;
  shadow: string | null;
}

const STALE_PHRASE_MS = 120_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A decision answers at once: a Promise from a loaded version is a contract break. */
function syncAnswer(answer: unknown, decision: string): unknown {
  if (isThenable(answer)) {
    // Its rejection must not become an unhandled one, which would stop the daemon.
    Promise.resolve(answer).catch(() => undefined);
    throw new Error(`${decision} answered a Promise; decisions answer at once`);
  }
  return answer;
}

/**
 * The facade is built from the contract's own decision list, so this always holds; it narrows the
 * object to the module's type without a cast.
 */
function isFacadeOf<T extends Decisions<T>>(
  value: Record<string, unknown>,
  contract: ModuleContract<T>,
): value is T {
  return contract.decisions.every((name) => typeof value[name] === "function");
}

export function createModuleKernel(options: ModuleKernelOptions = {}): ModuleKernel {
  const isEnabled = options.isEnabled ?? (() => envFlag("PASEO_MODULES", false));
  const maxDecisionMs = options.maxDecisionMs ?? (() => envPositive("PASEO_MODULES_MAX_MS", 5));
  const now = options.now ?? (() => performance.now());
  const stalePhraseMs = options.stalePhraseMs ?? STALE_PHRASE_MS;
  const slots = new Map<string, ModuleSlot>();
  const openPhrases = new Map<object, number>();
  let started: ModuleKernelStart | null = null;
  let unwatch: (() => void) | null = null;
  let section: ModulesSection = {};
  // PASEO_MODULES turning off takes effect at once; turning on, like a switch, at a phrase end.
  let liveOn = false;

  function log(): KernelLogger | null {
    return started?.logger ?? null;
  }

  function wanted(slot: ModuleSlot): Wanted {
    const entry = section[slot.contract.name];
    return { version: entry?.version ?? BUILTIN_VERSION, shadow: entry?.shadow ?? null };
  }

  function forgetStalePhrases(): void {
    if (openPhrases.size === 0) {
      return;
    }
    const oldest = now() - stalePhraseMs;
    for (const [session, openedAt] of openPhrases) {
      if (openedAt < oldest) {
        openPhrases.delete(session);
        log()?.warn({ openedMs: Math.round(now() - openedAt) }, "modules.phrase_stale");
      }
    }
  }

  function atPhraseBoundary(): boolean {
    forgetStalePhrases();
    return openPhrases.size === 0;
  }

  function isUsable(slot: ModuleSlot, id: string): boolean {
    return !slot.refused.has(id) && !slot.unreadable.has(id);
  }

  /** The version for an id once it is loaded and not refused; else null. */
  function ready(slot: ModuleSlot, id: string): Version | null {
    if (id === BUILTIN_VERSION) {
      return slot.builtIn;
    }
    return isUsable(slot, id) ? (slot.loaded.get(id) ?? null) : null;
  }

  function load(slot: ModuleSlot, id: string): void {
    const home = started?.paseoHome;
    const known = id === BUILTIN_VERSION || slot.loaded.has(id) || slot.loading.has(id);
    if (!home || known || !isUsable(slot, id)) {
      return;
    }
    slot.loading.set(id, loadVersion(slot, id, home));
  }

  async function loadVersion(slot: ModuleSlot, id: string, home: string): Promise<void> {
    const module = slot.contract.name;
    try {
      const exports = await importModuleVersion({ paseoHome: home, module, version: id });
      const calls = decisionTable({ contract: slot.contract, version: id, exports });
      slot.loaded.set(id, { id, calls });
      log()?.info({ module, version: id }, "modules.loaded");
    } catch (error) {
      if (error instanceof ModuleVersionUnreadableError) {
        slot.unreadable.set(id, error.reason);
        log()?.warn({ module, version: id, reason: error.reason }, "modules.unreadable");
        return;
      }
      // Whatever else stops a version from loading (a probe's own check throwing too) refuses it;
      // the version in force goes on and the daemon never sees the error.
      const known = error instanceof ModuleVersionError || error instanceof ModuleContractError;
      const reason = known ? error.reason : `load failed: ${errorMessage(error)}`;
      slot.refused.set(id, reason);
      log()?.warn({ module, version: id, reason }, "modules.refused");
    } finally {
      slot.loading.delete(id);
      reconcile(slot);
    }
  }

  function switchTo(slot: ModuleSlot, next: Version): void {
    const from = slot.active.id;
    slot.lastGood = slot.active;
    slot.active = next;
    log()?.info(
      { module: slot.contract.name, from, to: next.id, reason: "settings" },
      "modules.switch",
    );
  }

  function setShadow(slot: ModuleSlot, next: Version | null, reason: string): void {
    const module = slot.contract.name;
    if (slot.shadow && slot.shadow !== next) {
      log()?.info({ module, version: slot.shadow.id, reason }, "modules.shadow_stopped");
    }
    if (next && next !== slot.shadow) {
      log()?.info({ module, version: next.id, against: slot.active.id }, "modules.shadow_started");
    }
    slot.shadow = next;
  }

  /** Load what the settings pick and, between phrases, put it in force. */
  function reconcile(slot: ModuleSlot): void {
    if (!started || !isEnabled()) {
      return;
    }
    const want = wanted(slot);
    load(slot, want.version);
    if (want.shadow) {
      load(slot, want.shadow);
    }
    if (!atPhraseBoundary()) {
      return;
    }
    liveOn = true;
    const live = ready(slot, want.version);
    if (live && live !== slot.active) {
      switchTo(slot, live);
    }
    const shadow = want.shadow ? ready(slot, want.shadow) : null;
    if (shadow === slot.active) {
      setShadow(slot, null, "now in force");
    } else if (shadow !== slot.shadow) {
      // A shadow the settings no longer name stops even while the next one still loads.
      setShadow(slot, shadow, "settings");
    }
  }

  function reconcileAll(): void {
    for (const slot of slots.values()) {
      reconcile(slot);
    }
  }

  function applySection(next: ModulesSection): void {
    for (const slot of slots.values()) {
      const name = slot.contract.name;
      const before: ModuleEntry | undefined = section[name];
      if (!isDeepStrictEqual(before, next[name])) {
        slot.unreadable.clear();
      }
    }
    section = next;
    reconcileAll();
  }

  function rollback(slot: ModuleSlot, failed: Version, reason: string): void {
    slot.refused.set(failed.id, reason);
    const lastGoodUsable = slot.lastGood !== failed && isUsable(slot, slot.lastGood.id);
    const target = lastGoodUsable ? slot.lastGood : slot.builtIn;
    slot.active = target;
    slot.lastGood = target;
    if (slot.shadow === target || slot.shadow === failed) {
      slot.shadow = null;
    }
    log()?.warn(
      { module: slot.contract.name, from: failed.id, to: target.id, reason, mode: "live" },
      "modules.rollback",
    );
  }

  function dropShadow(slot: ModuleSlot, failed: Version, reason: string): void {
    slot.refused.set(failed.id, reason);
    slot.shadow = null;
    log()?.warn(
      { module: slot.contract.name, from: failed.id, to: slot.active.id, reason, mode: "shadow" },
      "modules.rollback",
    );
  }

  function slowReason(ms: number, limit: number): string {
    return `one decision took ${ms.toFixed(2)} ms (limit ${limit} ms)`;
  }

  /** The answer of a loaded version on its own copy of the input, timed. */
  function callLoaded(version: Version, name: string, args: readonly unknown[]) {
    const call = version.calls.get(name);
    if (!call) {
      throw new Error(`no decision “${name}”`);
    }
    const input = structuredClone(args);
    const startedAt = now();
    const answer = syncAnswer(call(input), name);
    return { answer, ms: now() - startedAt };
  }

  function runShadow(input: {
    slot: ModuleSlot;
    shadow: Version;
    name: string;
    args: readonly unknown[];
    answer: unknown;
    answeredBy: string;
  }): void {
    const { slot, shadow, name, args, answer, answeredBy } = input;
    let result: { answer: unknown; ms: number };
    try {
      result = callLoaded(shadow, name, args);
    } catch (error) {
      dropShadow(slot, shadow, `threw in ${name}: ${errorMessage(error)}`);
      return;
    }
    slot.stats.shadowCalls += 1;
    if (!isDeepStrictEqual(result.answer, answer)) {
      slot.stats.disagreements += 1;
      log()?.info(
        {
          module: slot.contract.name,
          decision: name,
          active: answeredBy,
          shadow: shadow.id,
          args,
          answer,
          shadowAnswer: result.answer,
        },
        "modules.shadow_disagree",
      );
    }
    const limit = maxDecisionMs();
    if (result.ms > limit) {
      dropShadow(slot, shadow, slowReason(result.ms, limit));
    }
  }

  function run(slot: ModuleSlot, name: string, args: readonly unknown[]): unknown {
    const builtIn = slot.builtIn.calls.get(name);
    if (!builtIn) {
      throw new ModuleContractError(slot.contract.name, BUILTIN_VERSION, `no decision “${name}”`);
    }
    if (!isEnabled()) {
      liveOn = false;
      return builtIn(args);
    }
    if (!liveOn) {
      return builtIn(args);
    }
    slot.stats.calls += 1;
    const active = slot.active;
    const shadow = slot.shadow;
    let answer: unknown;
    if (active === slot.builtIn) {
      answer = builtIn(args);
    } else {
      let result: { answer: unknown; ms: number };
      try {
        result = callLoaded(active, name, args);
      } catch (error) {
        rollback(slot, active, `threw in ${name}: ${errorMessage(error)}`);
        return run(slot, name, args);
      }
      answer = result.answer;
      const limit = maxDecisionMs();
      if (result.ms > limit) {
        rollback(slot, active, slowReason(result.ms, limit));
      }
    }
    if (shadow && shadow === slot.shadow) {
      try {
        runShadow({ slot, shadow, name, args, answer, answeredBy: active.id });
      } catch (error) {
        // Logging or comparing failed in a way not foreseen: drop the shadow, keep the answer.
        dropShadow(slot, shadow, `shadow run failed in ${name}: ${errorMessage(error)}`);
      }
    }
    return answer;
  }

  return {
    start(input) {
      if (started) {
        if (started.paseoHome !== input.paseoHome) {
          started.logger.warn(
            { home: started.paseoHome, asked: input.paseoHome },
            "modules.start_ignored: already started with another home",
          );
        }
        return;
      }
      started = input;
      input.logger.info(
        { home: input.paseoHome, modules: [...slots.keys()], enabled: isEnabled() },
        "modules.started",
      );
      unwatch = watchLiveModuleSettings(applySection);
    },

    stop() {
      unwatch?.();
      unwatch = null;
      started = null;
      section = {};
      liveOn = false;
      openPhrases.clear();
    },

    register({ contract, builtIn }) {
      if (slots.has(contract.name)) {
        throw new ModuleContractError(contract.name, BUILTIN_VERSION, "registered twice");
      }
      const builtInVersion: Version = {
        id: BUILTIN_VERSION,
        calls: decisionTable({ contract, version: BUILTIN_VERSION, exports: builtIn }),
      };
      const slot: ModuleSlot = {
        contract,
        builtIn: builtInVersion,
        active: builtInVersion,
        lastGood: builtInVersion,
        shadow: null,
        loaded: new Map(),
        loading: new Map(),
        refused: new Map(),
        unreadable: new Map(),
        stats: { calls: 0, shadowCalls: 0, disagreements: 0 },
      };
      slots.set(contract.name, slot);
      const facade: Record<string, unknown> = {};
      for (const name of contract.decisions) {
        facade[name] = (...args: unknown[]) => run(slot, name, args);
      }
      if (!isFacadeOf(facade, contract)) {
        throw new ModuleContractError(contract.name, BUILTIN_VERSION, "facade incomplete");
      }
      reconcile(slot);
      return facade;
    },

    phraseOpened(session) {
      forgetStalePhrases();
      openPhrases.set(session, now());
    },

    phraseClosed(session) {
      if (openPhrases.delete(session)) {
        reconcileAll();
      }
    },

    async settled() {
      for (;;) {
        const pending: Promise<void>[] = [];
        for (const slot of slots.values()) {
          pending.push(...slot.loading.values());
        }
        if (pending.length === 0) {
          return;
        }
        await Promise.all(pending);
      }
    },

    status() {
      return [...slots.values()].map((slot) => {
        const want = wanted(slot);
        const liveAhead = want.version !== slot.active.id && isUsable(slot, want.version);
        const shadowWanted =
          want.shadow !== null && want.shadow !== slot.active.id && isUsable(slot, want.shadow);
        const shadowAhead = (shadowWanted ? want.shadow : null) !== (slot.shadow?.id ?? null);
        return {
          module: slot.contract.name,
          active: slot.active.id,
          lastGood: slot.lastGood.id,
          shadow: slot.shadow?.id ?? null,
          refused: Object.fromEntries(slot.refused),
          pending: liveAhead || shadowAhead,
          calls: slot.stats.calls,
          shadowCalls: slot.stats.shadowCalls,
          disagreements: slot.stats.disagreements,
        };
      });
    },
  };
}

/** The daemon's kernel: started at bootstrap, told about phrases by the voice sessions. */
export const moduleKernel = createModuleKernel();
