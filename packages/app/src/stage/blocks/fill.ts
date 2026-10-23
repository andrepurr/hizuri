import type { ReactElement } from "react";
import type { StageBlockNode } from "../model";
import { PictureFill, VideoFill } from "./media";
import { arr } from "./primitives";
import { WebPageFill } from "./web";

// A tab that holds one page, one picture or one video (what show_file opens) gives the whole tab
// to it: the page scrolls itself, the picture zooms, the video fits. The player tab (show_media)
// keeps the tab empty: the stage page draws its player over it, mounted for as long as the tab
// lives. Anything else is a list of blocks in the tab's scroll view.

/** The player tab's own slot; the player itself is the stage page's layer (blocks/player.tsx). */
function PlayerSlot(_props: { block: StageBlockNode }) {
  return null;
}

type FillComponent = (props: { block: StageBlockNode }) => ReactElement | null;

export function fillBlockFor(blocks: readonly StageBlockNode[]): FillComponent | null {
  if (blocks.length !== 1) return null;
  const [block] = blocks;
  if (block.type === "web" && typeof block.props.html === "string") return WebPageFill;
  if (block.type === "image" && arr(block.props.images).length === 1) return PictureFill;
  if (block.type === "media" && block.props.player === true) return PlayerSlot;
  if (block.type === "media" && block.props.kind === "video") return VideoFill;
  return null;
}
