import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Stage, StageSchema } from "@getpaseo/protocol/stage";

// The last stage the app saw, per host and agent, so Show paints the assistant's tabs at once after
// a cold start and keeps them with no connection (airplane mode, a daemon restart). The daemon's
// copy always wins once the subscription answers.

const KEY_PREFIX = "hizuri-stage:v1";
/**
 * Android's AsyncStorage reads a row back only under 2 MB (SQLite's CursorWindow): a bigger stage
 * failed every read ("Row too big") and cost a multi-megabyte write after every change. The
 * assistant's pages run near 300 KB, so a stage past this is not kept; the daemon's copy arrives in
 * a moment anyway.
 */
export const MAX_CACHED_STAGE_CHARS = 600_000;

function cacheKey(serverId: string, agentId: string): string {
  return `${KEY_PREFIX}:${serverId}:${agentId}`;
}

export function parseCachedStage(raw: string | null, agentId: string): Stage | null {
  if (!raw) return null;
  try {
    const parsed = StageSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.agentId === agentId ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadCachedStage(serverId: string, agentId: string): Promise<Stage | null> {
  const key = cacheKey(serverId, agentId);
  try {
    return parseCachedStage(await AsyncStorage.getItem(key), agentId);
  } catch (error) {
    // A row too big to read back fails the same way every launch: drop it.
    await AsyncStorage.removeItem(key);
    throw error;
  }
}

export async function saveCachedStage(serverId: string, stage: Stage): Promise<void> {
  const key = cacheKey(serverId, stage.agentId);
  const raw = JSON.stringify(stage);
  if (raw.length > MAX_CACHED_STAGE_CHARS) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, raw);
}
