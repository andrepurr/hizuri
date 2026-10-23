import type { AppLogBuffer } from "./app-log-uploader";

// hizuri: the black box keeps fatal JS errors on the phone (crash-box.native.ts); the web app
// has the browser's own console.

export function installCrashBox(_buffer: AppLogBuffer): () => void {
  return () => {};
}

export function replayLastCrash(_buffer: AppLogBuffer): void {}
