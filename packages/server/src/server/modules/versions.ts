import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { isModuleName } from "./contract.js";

// Hizuri: module versions on disk, `$PASEO_HOME/modules/<module>/<content-hash>.mjs`. Node caches
// an ES module by its resolved URL and cannot unload one, so a version is never edited in place:
// new code is a new file with a new name, and `import()` of that name is a fresh copy. Every
// version loaded stays in memory until the daemon exits (a few small files a day).

/** The version compiled into the daemon; it needs no file. */
export const BUILTIN_VERSION = "builtin";

const HASH_LENGTH = 16;
const VERSION_ID = new RegExp(`^[0-9a-f]{${HASH_LENGTH}}$`);

export class ModuleVersionError extends Error {
  // Plain fields: the speech worker runs this file in strip-only TypeScript mode.
  readonly module: string;
  readonly version: string;
  readonly reason: string;

  constructor(module: string, version: string, reason: string) {
    super(`module ${module} version ${version}: ${reason}`);
    this.module = module;
    this.version = version;
    this.reason = reason;
    this.name = "ModuleVersionError";
  }
}

/** The file is not there (yet) or cannot be read; the same version may load later. */
export class ModuleVersionUnreadableError extends ModuleVersionError {
  constructor(module: string, version: string, reason: string) {
    super(module, version, reason);
    this.name = "ModuleVersionUnreadableError";
  }
}

/** A version id is the start of the sha256 of the file's text, or `builtin`. */
export function isVersionId(version: string): boolean {
  return version === BUILTIN_VERSION || VERSION_ID.test(version);
}

export function versionIdOf(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, HASH_LENGTH);
}

export function moduleVersionFile(input: {
  paseoHome: string;
  module: string;
  version: string;
}): string {
  return path.join(input.paseoHome, "modules", input.module, `${input.version}.mjs`);
}

/** Write a version's source under its content hash (atomically) and return the version id. */
export async function writeModuleVersion(input: {
  paseoHome: string;
  module: string;
  source: string;
}): Promise<string> {
  if (!isModuleName(input.module)) {
    throw new ModuleVersionError(input.module, "-", "not a module name (a-z, 0-9 and -)");
  }
  const version = versionIdOf(input.source);
  const file = moduleVersionFile({ ...input, version });
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, input.source);
  await rename(tmp, file);
  return version;
}

/**
 * The exports of one version file. Its text must still hash to its name: a file edited in place
 * would load as the copy Node already cached, so it is refused instead.
 */
export async function importModuleVersion(input: {
  paseoHome: string;
  module: string;
  version: string;
}): Promise<object> {
  const { module, version } = input;
  if (!isModuleName(module)) {
    throw new ModuleVersionError(module, version, "not a module name (a-z, 0-9 and -)");
  }
  if (version === BUILTIN_VERSION || !VERSION_ID.test(version)) {
    throw new ModuleVersionError(module, version, `not a version id (${HASH_LENGTH} hex digits)`);
  }
  const file = moduleVersionFile(input);
  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : String(error);
    throw new ModuleVersionUnreadableError(module, version, `cannot read ${file} (${code})`);
  }
  if (versionIdOf(source) !== version) {
    throw new ModuleVersionError(
      module,
      version,
      `${file} was changed after it was written; write the new code as a new version`,
    );
  }
  try {
    return await import(pathToFileURL(file).href);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ModuleVersionError(module, version, `import failed: ${message}`);
  }
}
