import { compareCodePoints, hashJson } from "./receipts.js";

// Hizuri (tool hub): pinning by hash, the defence against a "rug pull" (OWASP MCP03, tool
// poisoning): a server that looked clean when the user approved it and changed its tool
// descriptions later. rugsnare found 140 such silent changes across 66 releases of the official
// servers, none flagged by a version bump. The fingerprint covers everything the model reads:
// name, title, description, input and output schema, annotations.

export interface ToolContract {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: unknown;
}

export interface ToolFingerprint {
  hash: string;
  tools: Array<{ name: string; hash: string }>;
}

function contractOf(tool: ToolContract): ToolContract {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: tool.annotations,
  };
}

export function fingerprintTools(tools: readonly ToolContract[]): ToolFingerprint {
  const sorted = [...tools].sort((a, b) => compareCodePoints(a.name, b.name));
  return {
    hash: hashJson(sorted.map(contractOf)),
    tools: sorted.map((tool) => ({ name: tool.name, hash: hashJson(contractOf(tool)) })),
  };
}

export interface ToolDrift {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffFingerprints(pinned: ToolFingerprint, live: ToolFingerprint): ToolDrift {
  const before = new Map(pinned.tools.map((tool) => [tool.name, tool.hash]));
  const after = new Map(live.tools.map((tool) => [tool.name, tool.hash]));
  return {
    added: [...after.keys()].filter((name) => !before.has(name)),
    removed: [...before.keys()].filter((name) => !after.has(name)),
    changed: [...after.entries()]
      .filter(([name, hash]) => before.has(name) && before.get(name) !== hash)
      .map(([name]) => name),
  };
}

export function describeDrift(drift: ToolDrift): string {
  const parts = [
    drift.changed.length ? `changed: ${drift.changed.join(", ")}` : "",
    drift.added.length ? `added: ${drift.added.join(", ")}` : "",
    drift.removed.length ? `removed: ${drift.removed.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join("; ") || "no difference";
}
