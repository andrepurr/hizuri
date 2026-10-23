// The context breakdown of a running Claude session, as Claude Code itself reports it (the SDK's
// Query.getContextUsage(), the same data as /context): categories (system prompt, tools, memory files, skills,
// messages, free space, compaction buffer), each memory file, skill and MCP tool, and the messages split by tool
// type. Written to $PASEO_HOME/context-usage/<session id>.json after a turn ends, at most once a minute, so a
// dashboard can show what fills the agent's context without asking the model.
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Query } from "@anthropic-ai/claude-agent-sdk";
import { resolvePaseoHome } from "../../../paseo-home.js";

const MIN_INTERVAL_MS = 60_000;
const TIMEOUT_MS = 10_000;
const lastWrite = new Map<string, number>();

export async function writeContextUsageFile(
  query: Query,
  sessionId: string,
  now = Date.now(),
): Promise<boolean> {
  if ((lastWrite.get(sessionId) ?? 0) > now - MIN_INTERVAL_MS) return false;
  lastWrite.set(sessionId, now);
  const usage = await Promise.race([
    query.getContextUsage(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
  ]);
  if (!usage) return false;
  const { gridRows: _grid, ...rest } = usage;
  const dir = path.join(resolvePaseoHome(), "context-usage");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.json`);
  await fs.writeFile(
    `${file}.tmp`,
    JSON.stringify({ at: new Date(now).toISOString(), sessionId, ...rest }),
  );
  await fs.rename(`${file}.tmp`, file);
  return true;
}
