import { File, Paths } from "expo-file-system";
import type { AppLogBuffer } from "./app-log-uploader";
import { replayCrash, serializeCrash } from "./crash-record";

/**
 * hizuri: the black box. A fatal JS error kills the app before the next 30 s log upload. The
 * global handler writes the error and the unsent lines to a file at once (a synchronous write),
 * then hands the error on as before; the next launch puts them back in the log buffer.
 */

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface ErrorUtilsLike {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
}

function crashFile(): File {
  return new File(Paths.document, "hizuri-last-crash.json");
}

/** Installs the black box; returns the uninstall function. */
export function installCrashBox(buffer: AppLogBuffer): () => void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return () => {};
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      try {
        const file = crashFile();
        if (!file.exists) file.create();
        file.write(serializeCrash({ error, buffer }));
      } catch {
        // The black box must never stand in the way of the crash itself.
      }
    }
    previous(error, isFatal);
  });
  return () => utils.setGlobalHandler(previous);
}

/** Moves a crash the last run left behind into the log buffer. */
export function replayLastCrash(buffer: AppLogBuffer): void {
  try {
    const file = crashFile();
    if (!file.exists) return;
    const text = file.textSync();
    file.delete();
    replayCrash(text, buffer);
  } catch (error) {
    console.warn("[CrashBox] replay failed", error);
  }
}
