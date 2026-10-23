import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppLogEntry } from "./messages.js";

// Zuri: log lines the app uploads with app.logs.upload.request. One file per UTC day under
// $PASEO_HOME/app-logs, one line per entry, so `tail -f` and grep work without tooling.

/** Caps keep one client from filling the disk: a batch, and one message inside it. */
export const APP_LOG_MAX_ENTRIES_PER_UPLOAD = 1_000;
export const APP_LOG_MAX_MESSAGE_CHARS = 4_000;

export function appLogsDirectory(paseoHome: string): string {
  return path.join(paseoHome, "app-logs");
}

export function appLogFilePath(paseoHome: string, now: Date): string {
  return path.join(appLogsDirectory(paseoHome), `${now.toISOString().slice(0, 10)}.log`);
}

function singleLine(value: string): string {
  return value.replace(/\r?\n/g, "\\n");
}

export function formatAppLogLine(input: {
  entry: AppLogEntry;
  clientId: string;
  platform?: string;
  appVersion?: string;
}): string {
  const { entry } = input;
  const message =
    entry.message.length > APP_LOG_MAX_MESSAGE_CHARS
      ? `${entry.message.slice(0, APP_LOG_MAX_MESSAGE_CHARS)}…[truncated]`
      : entry.message;
  const source = [input.platform, input.appVersion, input.clientId].filter(Boolean).join("/");
  const tag = entry.tag ? ` [${singleLine(entry.tag)}]` : "";
  return `${singleLine(entry.ts)} ${singleLine(entry.level).toUpperCase()} ${source}${tag} ${singleLine(message)}`;
}

/** Appends the batch to today's file and returns how many entries were written. */
export async function appendAppLogs(input: {
  paseoHome: string;
  clientId: string;
  entries: AppLogEntry[];
  platform?: string;
  appVersion?: string;
  now?: Date;
}): Promise<number> {
  const entries = input.entries.slice(0, APP_LOG_MAX_ENTRIES_PER_UPLOAD);
  if (entries.length === 0) {
    return 0;
  }
  const lines = entries.map((entry) =>
    formatAppLogLine({
      entry,
      clientId: input.clientId,
      platform: input.platform,
      appVersion: input.appVersion,
    }),
  );
  await mkdir(appLogsDirectory(input.paseoHome), { recursive: true });
  await appendFile(
    appLogFilePath(input.paseoHome, input.now ?? new Date()),
    `${lines.join("\n")}\n`,
  );
  return entries.length;
}
