import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { isModulesSection, parseModulesSection, type ModulesSection } from "../modules/settings.js";
import { envPath, setLiveModuleSettings, setLiveVoiceOverrides } from "../voice-env.js";
import {
  VOICE_KNOBS,
  checkVoiceKnobValue,
  findVoiceKnob,
  voiceKnobDefault,
  type VoiceKnob,
  type VoiceKnobApplies,
  type VoiceKnobGroup,
} from "./knobs.js";

// Hizuri: the voice is tuned while the user talks, without a daemon restart. The
// JSON file `$PASEO_HOME/voice-settings.json` maps knob names (knobs.ts) to values; it wins over
// the env, which stays the default. The daemon stats it every half second against the stat of
// its last read (so editors that replace the file and the tool's atomic rename are both seen,
// and a write right after a read is never missed) and logs every effective
// change as `voice_settings.changed` with from and to. A bad value is logged and left out; a file
// that does not parse keeps the values in force. The speech worker process runs its own copy of
// the store on the same file (PASEO_VOICE_SETTINGS_FILE), for the speech-detector knobs. The
// `modules` section (an object, modules/settings.ts) picks module versions for the module kernel.

export const VOICE_SETTINGS_FILE_ENV = "PASEO_VOICE_SETTINGS_FILE";
const POLL_MS = 500;

export function resolveVoiceSettingsFile(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return envPath(VOICE_SETTINGS_FILE_ENV, path.join(paseoHome, "voice-settings.json"), env);
}

export type VoiceKnobSource = "file" | "env" | "default";

export interface VoiceKnobState {
  key: string;
  group: VoiceKnobGroup;
  value: string;
  source: VoiceKnobSource;
  default: string;
  meaning: string;
  applies: VoiceKnobApplies;
  /** "on/off", "-30…18", "stop | hold" or "regex". */
  accepts: string;
}

export interface VoiceKnobChange {
  key: string;
  from: string;
  to: string;
  source: VoiceKnobSource;
  applies: VoiceKnobApplies;
}

/** One requested change: a value, a step for a number (`delta`), or back to the env (`reset`). */
export interface VoiceSettingRequest {
  key: string;
  value?: unknown;
  delta?: number;
  reset?: boolean;
}

interface StoreLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface VoiceSettingsStoreOptions {
  file: string;
  logger: StoreLogger;
  env?: NodeJS.ProcessEnv;
  /** Called after every reload with what changed (the speech worker reports it to the daemon). */
  onApplied?: (changes: VoiceKnobChange[]) => void;
  /** How often the file is checked; 500 ms. */
  pollMs?: number;
}

export class VoiceSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceSettingsError";
  }
}

type FileRead =
  | { status: "ok"; values: Record<string, unknown> }
  | { status: "unreadable"; error: string };

// The store started last owns the process's overrides.
let active: { token: symbol; file: string } | null = null;

/** The file of the daemon's running store, for child processes (the speech worker). */
export function activeVoiceSettingsFile(): string | null {
  return active?.file ?? null;
}

function accepts(knob: VoiceKnob): string {
  switch (knob.kind) {
    case "flag":
      return "on/off";
    case "number":
      return `${knob.min}…${knob.max}`;
    case "choice":
      return knob.choices.join(" | ");
    case "regex":
      return "regex";
  }
}

/** What the file looks like on disk: changes with every write, rename or removal. */
function fileStamp(file: string): string {
  try {
    const stat = statSync(file);
    return `${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable";
  }
}

/** The value as it is written to the file: JSON booleans and numbers where the knob has them. */
function fileValue(knob: VoiceKnob, value: string): unknown {
  if (knob.kind === "flag") {
    return value === "1";
  }
  if (knob.kind === "number") {
    return Number(value);
  }
  return value;
}

export class VoiceSettingsStore {
  readonly file: string;
  private readonly logger: StoreLogger;
  private readonly env: NodeJS.ProcessEnv;
  private readonly onApplied: ((changes: VoiceKnobChange[]) => void) | null;
  private readonly pollMs: number;
  private overrides: ReadonlyMap<string, string> = new Map();
  private poller: ReturnType<typeof setInterval> | null = null;
  private seenStamp = "";
  private readonly token = Symbol("voice-settings");

  constructor(options: VoiceSettingsStoreOptions) {
    this.file = options.file;
    this.logger = options.logger;
    this.env = options.env ?? process.env;
    this.onApplied = options.onApplied ?? null;
    this.pollMs = options.pollMs ?? POLL_MS;
  }

  /** Load the file, apply it to the process and watch it. */
  start(): void {
    active = { token: this.token, file: this.file };
    this.reload("start");
    this.poller = setInterval(() => {
      if (fileStamp(this.file) !== this.seenStamp) {
        this.reload("file");
      }
    }, this.pollMs);
    this.poller.unref();
  }

  stop(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
    if (active?.token === this.token) {
      active = null;
      setLiveVoiceOverrides(new Map());
      setLiveModuleSettings({});
    }
  }

  /** Read the file and apply what is valid in it; a file that does not parse changes nothing. */
  reload(cause: string): void {
    // Taken before the read: a write during it is seen by the next check.
    this.seenStamp = fileStamp(this.file);
    const read = this.readFile();
    if (read.status === "unreadable") {
      this.logger.warn({ file: this.file, error: read.error }, "voice_settings.unreadable");
      return;
    }
    const next = new Map<string, string>();
    let modules: ModulesSection = {};
    for (const [name, value] of Object.entries(read.values)) {
      if (isModulesSection(name, value)) {
        const parsed = parseModulesSection(value);
        for (const rejection of parsed.rejected) {
          this.logger.warn({ ...rejection }, "voice_settings.rejected: bad module entry");
        }
        modules = parsed.section;
        continue;
      }
      const knob = findVoiceKnob(name);
      if (!knob) {
        this.logger.warn({ key: name, value }, "voice_settings.rejected: unknown knob");
        continue;
      }
      const check = checkVoiceKnobValue(knob, value);
      if (!check.ok) {
        this.logger.warn(
          { key: knob.key, value, reason: check.reason },
          "voice_settings.rejected: bad value",
        );
        continue;
      }
      next.set(knob.key, check.value);
    }
    this.apply(next, cause);
    if (active?.token === this.token) {
      setLiveModuleSettings(modules);
    }
  }

  private apply(next: ReadonlyMap<string, string>, cause: string): VoiceKnobChange[] {
    const before = new Map(VOICE_KNOBS.map((knob) => [knob.key, this.state(knob).value]));
    this.overrides = next;
    if (active?.token === this.token) {
      setLiveVoiceOverrides(next);
    }
    const changes: VoiceKnobChange[] = [];
    for (const knob of VOICE_KNOBS) {
      const after = this.state(knob);
      const from = before.get(knob.key) ?? "";
      if (after.value !== from) {
        changes.push({
          key: knob.key,
          from,
          to: after.value,
          source: after.source,
          applies: knob.applies,
        });
      }
    }
    for (const change of changes) {
      this.logger.info({ ...change, cause }, "voice_settings.changed");
    }
    this.logger.info(
      { file: this.file, cause, overrides: next.size, changed: changes.length },
      "voice_settings.loaded",
    );
    this.onApplied?.(changes);
    return changes;
  }

  private readFile(): FileRead {
    let text: string;
    try {
      text = readFileSync(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { status: "ok", values: {} };
      }
      return {
        status: "unreadable",
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (text.trim() === "") {
      return { status: "ok", values: {} };
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { status: "unreadable", error: "expected a JSON object of knob names to values" };
      }
      return { status: "ok", values: parsed as Record<string, unknown> };
    } catch (error) {
      return {
        status: "unreadable",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private state(knob: VoiceKnob): VoiceKnobState {
    const fromFile = this.overrides.get(knob.key);
    const fromEnv = this.env[knob.key];
    let source: VoiceKnobSource = "default";
    let value = voiceKnobDefault(knob);
    if (fromFile !== undefined) {
      source = "file";
      value = fromFile;
    } else if (fromEnv !== undefined && fromEnv !== "") {
      source = "env";
      value = fromEnv;
    }
    return {
      key: knob.key,
      group: knob.group,
      value,
      source,
      default: voiceKnobDefault(knob),
      meaning: knob.meaning,
      applies: knob.applies,
      accepts: accepts(knob),
    };
  }

  /** Every knob, or one group, with its value in force and where it comes from. */
  list(group?: VoiceKnobGroup): VoiceKnobState[] {
    return VOICE_KNOBS.filter((knob) => !group || knob.group === group).map((knob) =>
      this.state(knob),
    );
  }

  get(name: string): VoiceKnobState {
    return this.state(this.knob(name));
  }

  private knob(name: string): VoiceKnob {
    const knob = findVoiceKnob(name);
    if (!knob) {
      throw new VoiceSettingsError(
        `Unknown voice knob “${name}”. Call voice_settings with action "get" for the list.`,
      );
    }
    return knob;
  }

  /**
   * Validate every request, write the file once (atomically) and apply it now. Nothing is written
   * when any request is wrong. A step past a number's range stops at its edge.
   */
  update(requests: VoiceSettingRequest[]): VoiceKnobChange[] {
    const read = this.readFile();
    if (read.status === "unreadable") {
      throw new VoiceSettingsError(
        `${this.file} is not valid JSON (${read.error}); fix or delete it first`,
      );
    }
    const values = { ...read.values };
    const touched: VoiceKnob[] = [];
    for (const request of requests) {
      const knob = this.knob(request.key);
      for (const [name, current] of Object.entries(values)) {
        if (!isModulesSection(name, current) && findVoiceKnob(name)?.key === knob.key) {
          delete values[name];
        }
      }
      touched.push(knob);
      if (request.reset) {
        continue;
      }
      let value = request.value;
      if (request.delta !== undefined) {
        if (knob.kind !== "number") {
          throw new VoiceSettingsError(`${knob.key} is not a number; set a value instead`);
        }
        const current = Number(this.state(knob).value);
        const base = Number.isFinite(current) ? current : knob.default;
        const stepped = Math.round((base + request.delta) * 1000) / 1000;
        value = Math.min(knob.max, Math.max(knob.min, stepped));
      }
      if (value === undefined) {
        throw new VoiceSettingsError(`${knob.key}: give a value, a delta, or reset`);
      }
      const check = checkVoiceKnobValue(knob, value);
      if (!check.ok) {
        throw new VoiceSettingsError(`${knob.key}: ${check.reason}`);
      }
      values[knob.key] = fileValue(knob, check.value);
    }
    this.writeFile(values);
    const before = new Map(touched.map((knob) => [knob.key, this.state(knob)]));
    this.reload("tool");
    return touched.map((knob) => {
      const after = this.state(knob);
      return {
        key: knob.key,
        from: before.get(knob.key)?.value ?? after.value,
        to: after.value,
        source: after.source,
        applies: knob.applies,
      };
    });
  }

  private writeFile(values: Record<string, unknown>): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(values, null, 2)}\n`);
    renameSync(tmp, this.file);
  }
}
