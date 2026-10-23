import { create } from "zustand";

interface VoiceThinkHintState {
  /**
   * By server id: the daemon's last guess of how long the assistant thinks before its voice, in
   * seconds.
   */
  byServer: Record<string, number>;
  hint: (serverId: string, thinkSeconds: number) => void;
}

/**
 * Hizuri (face): the daemon's `voice_think_hint`, sent when the user's phrase reaches the
 * assistant; the face page sizes the assistant's thinking footage by it (face-host.tsx).
 */
export const useVoiceThinkHintStore = create<VoiceThinkHintState>()((set, get) => ({
  byServer: {},
  hint: (serverId, thinkSeconds) => {
    if (!(thinkSeconds > 0) || get().byServer[serverId] === thinkSeconds) return;
    set({ byServer: { ...get().byServer, [serverId]: thinkSeconds } });
  },
}));
