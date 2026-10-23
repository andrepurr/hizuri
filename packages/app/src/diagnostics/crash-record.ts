import type { AppLogBuffer, AppLogEntry, AppLogLevel } from "./app-log-uploader";

/**
 * hizuri: what the black box (crash-box.native.ts) keeps of a fatal JS error: the error and the
 * log lines that had not reached the daemon yet, which die with the app otherwise.
 */

export interface CrashRecord {
  ts: string;
  error: string;
  recent: AppLogEntry[];
}

const KEPT_ENTRIES = 80;
const LEVELS: ReadonlySet<string> = new Set(["debug", "info", "warn", "error"]);

function levelOf(value: string): AppLogLevel {
  return LEVELS.has(value) ? (value as AppLogLevel) : "info";
}

export function describeCrashError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}

export function serializeCrash(input: {
  error: unknown;
  buffer: AppLogBuffer;
  now?: Date;
}): string {
  const record: CrashRecord = {
    ts: (input.now ?? new Date()).toISOString(),
    error: describeCrashError(input.error),
    recent: input.buffer.peek(KEPT_ENTRIES),
  };
  return JSON.stringify(record);
}

/** Puts a crash from the last run into the buffer: the error first, then the lines before it. */
export function replayCrash(text: string, buffer: AppLogBuffer): boolean {
  let record: Partial<CrashRecord>;
  try {
    record = JSON.parse(text) as Partial<CrashRecord>;
  } catch {
    return false;
  }
  if (typeof record.error !== "string") return false;
  buffer.record({
    level: "error",
    tag: "crash",
    message: `the last run died at ${record.ts ?? "?"}: ${record.error}`,
  });
  for (const entry of Array.isArray(record.recent) ? record.recent : []) {
    buffer.record({
      level: levelOf(entry.level),
      tag: `crash:${entry.tag ?? "log"}`,
      message: `${entry.ts} ${entry.message}`,
    });
  }
  return true;
}
