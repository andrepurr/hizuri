import { z } from "zod";

import { isModuleName } from "./contract.js";
import { isVersionId } from "./versions.js";

// Hizuri: the `modules` section of voice-settings.json, one entry per module:
//   "modules": { "turn-rules": { "version": "3f2a…", "shadow": "9b1c…", "settings": { … } } }
// `version` is the one that decides (absent = builtin), `shadow` runs next to it and is only
// compared, `settings` is the module's own knobs (voice-env.ts moduleSettings). The section is
// polled and applied with the rest of the file (voice-settings/store.ts).

export const MODULES_SECTION = "modules";

const versionSchema = z.string().refine(isVersionId, "not a version id (16 hex digits or builtin)");

const moduleEntrySchema = z
  .object({
    version: versionSchema.optional(),
    shadow: versionSchema.optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ModuleEntry = z.infer<typeof moduleEntrySchema>;

export type ModulesSection = Readonly<Record<string, ModuleEntry>>;

export interface ModulesSectionRejection {
  module: string;
  reason: string;
}

export interface ParsedModulesSection {
  section: ModulesSection;
  rejected: ModulesSectionRejection[];
}

/** The section as the file has it: each valid entry kept, each bad one named with why. */
export function parseModulesSection(value: unknown): ParsedModulesSection {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { section: {}, rejected: [{ module: "*", reason: "expected an object of modules" }] };
  }
  const section: Record<string, ModuleEntry> = {};
  const rejected: ModulesSectionRejection[] = [];
  for (const [module, entry] of Object.entries(value)) {
    if (!isModuleName(module)) {
      rejected.push({ module, reason: "not a module name (a-z, 0-9 and -)" });
      continue;
    }
    const parsed = moduleEntrySchema.safeParse(entry);
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "entry"}: ${issue.message}`)
        .join("; ");
      rejected.push({ module, reason });
      continue;
    }
    section[module] = parsed.data;
  }
  return { section, rejected };
}

/** A `modules` key holding an object is the section; anything else is the PASEO_MODULES knob. */
export function isModulesSection(key: string, value: unknown): boolean {
  return key === MODULES_SECTION && value !== null && typeof value === "object";
}
