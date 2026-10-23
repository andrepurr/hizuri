import path from "node:path";

import type { ModulesSection } from "./modules/settings.js";

// Hizuri: one parser for the voice pipeline's PASEO_* env knobs, so every knob reads the same way.
// An empty, missing or non-numeric value falls back to the default.
//
// Values from voice-settings.json (voice-settings/store.ts) win over the daemon's own process.env,
// so a knob read at its point of use changes without a restart. A caller that passes its own env
// object (tests, explicit configs) gets exactly that object.

type Env = NodeJS.ProcessEnv;

let liveOverrides: ReadonlyMap<string, string> = new Map();

/** Replace the live overrides (voice-settings/store.ts is the only writer). */
export function setLiveVoiceOverrides(next: ReadonlyMap<string, string>): void {
  liveOverrides = next;
}

/** The live override of a knob, if the settings file sets one. */
export function liveVoiceOverride(name: string): string | undefined {
  return liveOverrides.get(name);
}

let liveModules: ModulesSection = {};
const moduleListeners = new Set<(section: ModulesSection) => void>();

/** Replace the `modules` section of voice-settings.json (voice-settings/store.ts is the writer). */
export function setLiveModuleSettings(next: ModulesSection): void {
  liveModules = next;
  for (const listener of moduleListeners) {
    listener(next);
  }
}

/** The `modules` section in force, and every later one (the module kernel listens). */
export function watchLiveModuleSettings(listener: (section: ModulesSection) => void): () => void {
  moduleListeners.add(listener);
  listener(liveModules);
  return () => moduleListeners.delete(listener);
}

/** A module's own settings from its entry in the `modules` section; empty when it has none. */
export function moduleSettings(module: string): Readonly<Record<string, unknown>> {
  return liveModules[module]?.settings ?? {};
}

function readRaw(name: string, env: Env): string | undefined {
  return (env === process.env ? liveOverrides.get(name) : undefined) ?? env[name];
}

function readFinite(name: string, env: Env): number | null {
  const raw = readRaw(name, env);
  if (raw === undefined || raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Any finite number, else the fallback. */
export function envNumber(name: string, fallback: number, env: Env = process.env): number {
  return readFinite(name, env) ?? fallback;
}

/** A finite number above zero, else the fallback. */
export function envPositive(name: string, fallback: number, env: Env = process.env): number {
  const value = readFinite(name, env);
  return value !== null && value > 0 ? value : fallback;
}

/** A finite number of zero or more, else the fallback. */
export function envNonNegative(name: string, fallback: number, env: Env = process.env): number {
  const value = readFinite(name, env);
  return value !== null && value >= 0 ? value : fallback;
}

/** "1" turns a flag on, "0" turns it off; anything else keeps the default. */
export function envFlag(name: string, fallback: boolean, env: Env = process.env): boolean {
  const raw = readRaw(name, env)?.trim();
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  return fallback;
}

/** The raw string when set (empty included), else the fallback. */
export function envString(name: string, fallback: string, env: Env = process.env): string {
  return readRaw(name, env) ?? fallback;
}

/** A path from `name`, else `fallbackPath`. */
export function envPath(name: string, fallbackPath: string, env: Env = process.env): string {
  const raw = env[name]?.trim();
  return raw ? path.resolve(raw) : fallbackPath;
}

/** Local speech models: PASEO_LOCAL_MODELS_DIR, else `<paseoHome>/models/local-speech`. */
export function localSpeechModelsDir(paseoHome: string, env: Env = process.env): string {
  return envPath("PASEO_LOCAL_MODELS_DIR", path.join(paseoHome, "models", "local-speech"), env);
}

/** A list knob: words or phrases separated by "|" or ",", trimmed, lowercased, empties dropped. */
export function envWordList(name: string, env: Env = process.env): string[] {
  return (readRaw(name, env) ?? "")
    .split(/[|,]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

/** The time zone for clocks in prompts: PASEO_TIME_ZONE, else the system's own (undefined). */
export function voiceTimeZone(env: Env = process.env): string | undefined {
  return readRaw("PASEO_TIME_ZONE", env)?.trim() || undefined;
}
