import { useBlockAgentPageSwipes } from "@/agent-pages/agent-pages";
import { useBlockMobilePanelOpenGestures } from "@/mobile-panels/provider";

/**
 * While the user pinches a page or a picture, or has it bigger than its size, a sideways drag is
 * theirs: the agent pages hold still, and so do the panels behind the edges (Show is the last page,
 * so a drag left there would open the file explorer).
 */
export function useHoldPagesStill(held: boolean): void {
  useBlockAgentPageSwipes(held);
  useBlockMobilePanelOpenGestures(held, "both");
}
