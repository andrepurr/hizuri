import type { AppLogEntry } from "@getpaseo/protocol/messages";

/**
 * hizuri: the app's own log lines, buffered on the device and sent to the daemon, which appends
 * them to `$PASEO_HOME/app-logs/YYYY-MM-DD.log`. Sources: console warnings and errors, voice
 * state changes, mic level stats and host reconnects. One setting turns it off.
 */

export type { AppLogEntry };
export type AppLogLevel = "debug" | "info" | "warn" | "error";

const MAX_BUFFERED_ENTRIES = 2_000;
const MAX_BATCH_ENTRIES = 500;
const MAX_MESSAGE_CHARS = 2_000;
export const APP_LOG_FLUSH_INTERVAL_MS = 30_000;

export class AppLogBuffer {
  private entries: AppLogEntry[] = [];
  private dropped = 0;

  record(input: { level: AppLogLevel; tag?: string; message: string; now?: Date }): void {
    const message =
      input.message.length > MAX_MESSAGE_CHARS
        ? `${input.message.slice(0, MAX_MESSAGE_CHARS)}…`
        : input.message;
    this.entries.push({
      ts: (input.now ?? new Date()).toISOString(),
      level: input.level,
      ...(input.tag ? { tag: input.tag } : {}),
      message,
    });
    this.trim();
  }

  get size(): number {
    return this.entries.length;
  }

  /** Removes and returns the oldest entries, prefixed by a note when entries were dropped. */
  take(max: number = MAX_BATCH_ENTRIES): AppLogEntry[] {
    const batch = this.entries.splice(0, max);
    if (this.dropped > 0) {
      batch.unshift({
        ts: new Date().toISOString(),
        level: "warn",
        tag: "app-logs",
        message: `dropped ${this.dropped} entries while the buffer was full`,
      });
      this.dropped = 0;
    }
    return batch;
  }

  /** The newest entries, left in place. */
  peek(max: number): AppLogEntry[] {
    return this.entries.slice(-max);
  }

  /** Puts a batch that failed to upload back in front of newer entries. */
  restore(batch: AppLogEntry[]): void {
    this.entries = [...batch, ...this.entries];
    this.trim();
  }

  clear(): void {
    this.entries = [];
    this.dropped = 0;
  }

  private trim(): void {
    const overflow = this.entries.length - MAX_BUFFERED_ENTRIES;
    if (overflow > 0) {
      this.entries.splice(0, overflow);
      this.dropped += overflow;
    }
  }
}

function describeLogArg(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (value === undefined) return "undefined";
  try {
    return JSON.stringify(value, (_key, nested: unknown) =>
      nested instanceof Error ? `${nested.name}: ${nested.message}` : nested,
    );
  } catch {
    return String(value);
  }
}

export function formatLogArgs(args: unknown[]): string {
  return args.map(describeLogArg).join(" ");
}

type ConsoleMethod = "warn" | "error";

/** Copies console warnings and errors into the buffer. Returns the uninstall function. */
export function captureConsole(buffer: AppLogBuffer, target: Console = console): () => void {
  const originals: Record<ConsoleMethod, Console[ConsoleMethod]> = {
    warn: target.warn,
    error: target.error,
  };
  for (const method of ["warn", "error"] as const) {
    target[method] = (...args: unknown[]) => {
      try {
        buffer.record({ level: method, tag: "console", message: formatLogArgs(args) });
      } catch {
        // Logging must never break the caller.
      }
      originals[method].apply(target, args);
    };
  }
  return () => {
    target.warn = originals.warn;
    target.error = originals.error;
  };
}

export interface AppLogUploadTarget {
  upload(entries: AppLogEntry[]): Promise<void>;
}

/**
 * Sends the buffer to the first capable host. A failed batch goes back into the buffer; while
 * the setting is off nothing is kept.
 */
export async function flushAppLogs(input: {
  buffer: AppLogBuffer;
  isEnabled: () => boolean;
  resolveTarget: () => AppLogUploadTarget | null;
}): Promise<number> {
  if (!input.isEnabled()) {
    input.buffer.clear();
    return 0;
  }
  if (input.buffer.size === 0) {
    return 0;
  }
  const target = input.resolveTarget();
  if (!target) {
    return 0;
  }
  const batch = input.buffer.take();
  try {
    await target.upload(batch);
    return batch.length;
  } catch {
    input.buffer.restore(batch);
    return 0;
  }
}

export const appLogBuffer = new AppLogBuffer();
