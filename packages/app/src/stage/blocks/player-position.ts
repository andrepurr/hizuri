import AsyncStorage from "@react-native-async-storage/async-storage";

// Where the user was in what the player tab plays, so the tab that comes back after a restart waits
// at the same second. One entry: only the last thing played is worth resuming.

const KEY = "hizuri-player-position:v1";

export async function loadPlayerPosition(playId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as { playId?: unknown; position?: unknown };
    return entry.playId === playId && typeof entry.position === "number" ? entry.position : null;
  } catch {
    return null;
  }
}

export function savePlayerPosition(playId: string, position: number): void {
  if (!Number.isFinite(position) || position < 0) return;
  void AsyncStorage.setItem(KEY, JSON.stringify({ playId, position: Math.floor(position) })).catch(
    () => {},
  );
}
