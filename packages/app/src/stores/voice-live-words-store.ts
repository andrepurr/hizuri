import { create } from "zustand";
import { EMPTY_LIVE_WORDS, hearLiveWords, landLiveWords, type LiveWords } from "@/voice/live-words";

interface VoiceLiveWordsState {
  /** By server id: voice mode runs one conversation per host. */
  byServer: Record<string, LiveWords>;
  hear: (serverId: string, segmentId: string, text: string) => void;
  /** The user's phrase reached the chat now; returns the words that went with it. */
  land: (serverId: string) => string;
  clear: (serverId: string) => void;
}

/** Hizuri: the user's live words in voice mode (see @/voice/live-words). */
export const useVoiceLiveWordsStore = create<VoiceLiveWordsState>()((set, get) => ({
  byServer: {},
  hear: (serverId, segmentId, text) => {
    const current = get().byServer[serverId] ?? EMPTY_LIVE_WORDS;
    const next = hearLiveWords(current, { segmentId, text, now: Date.now() });
    if (next !== current) set({ byServer: { ...get().byServer, [serverId]: next } });
  },
  land: (serverId) => {
    const current = get().byServer[serverId] ?? EMPTY_LIVE_WORDS;
    const { state, landedText } = landLiveWords(current, Date.now());
    if (state !== current) set({ byServer: { ...get().byServer, [serverId]: state } });
    return landedText;
  },
  clear: (serverId) => {
    if (!get().byServer[serverId]) return;
    const { [serverId]: _cleared, ...rest } = get().byServer;
    set({ byServer: rest });
  },
}));

export function selectLiveWords(serverId: string) {
  return (state: VoiceLiveWordsState): LiveWords => state.byServer[serverId] ?? EMPTY_LIVE_WORDS;
}

/** The user's words are on screen now: a spoken message that appears meanwhile is them arriving. */
export function selectHasLiveWords(serverId: string) {
  return (state: VoiceLiveWordsState): boolean =>
    (state.byServer[serverId]?.segments.length ?? 0) > 0;
}
