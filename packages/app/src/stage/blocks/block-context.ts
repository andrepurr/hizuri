import { createContext, useContext } from "react";
import type { StageSlide } from "@getpaseo/protocol/stage";

// What a block needs from the tab it sits in: whether the tab is on screen (video plays and
// loops run only then), how a tap on one of its buttons reaches Zuri, and the daemon's origin
// that the pictures and videos show_file opened are served from, the slide Zuri flipped the
// tab's live page to, and where a secure form's values go (the daemon's vault, never the agent).

export interface StageBlockContextValue {
  active: boolean;
  /** First paint of the tab: blocks enter one after another; later changes glide in place. */
  animate: boolean;
  sendAction: (blockId: string, value: string) => void;
  /** `http://host:port` of the daemon, or null through the relay (blocks/stage-media.ts). */
  mediaOrigin?: string | null;
  /** Zuri's last flip of the tab's live page (stage main.slides). */
  slide?: StageSlide | null;
  /** Sends a secret form's values to the vault (secret.store); absent on a host without it. */
  storeSecret?: StoreSecret | null;
}

export type StoreSecret = (input: {
  form: string;
  values?: Record<string, string>;
  decline?: boolean;
}) => Promise<{ stored: boolean; error: string | null }>;

export const StageBlockContext = createContext<StageBlockContextValue>({
  active: false,
  animate: false,
  sendAction: () => {},
});

export function useStageBlockContext(): StageBlockContextValue {
  return useContext(StageBlockContext);
}
