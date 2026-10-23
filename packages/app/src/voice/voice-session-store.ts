import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { readValidatedJson } from "@/storage/validated-storage";

const VOICE_SESSION_STORAGE_KEY = "@hizuri:voice-session-v1";

const PersistedVoiceSessionSchema = z.object({
  serverId: z.string().min(1),
  agentId: z.string().min(1),
  mode: z.enum(["voice", "text"]),
});

/**
 * Hizuri (session persist): the conversation with one agent, in voice or in text. It survives a
 * closed window, a reload and a dropped connection; only “End session” clears it.
 */
export type PersistedVoiceSession = z.infer<typeof PersistedVoiceSessionSchema>;

export interface VoiceSessionStore {
  load(): Promise<PersistedVoiceSession | null>;
  save(session: PersistedVoiceSession | null): Promise<void>;
}

export interface VoiceSessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createVoiceSessionStore(
  storage: VoiceSessionStorage = AsyncStorage,
): VoiceSessionStore {
  return {
    load: () => readValidatedJson(storage, VOICE_SESSION_STORAGE_KEY, PersistedVoiceSessionSchema),
    async save(session) {
      if (session) {
        await storage.setItem(VOICE_SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        await storage.removeItem(VOICE_SESSION_STORAGE_KEY);
      }
    },
  };
}
