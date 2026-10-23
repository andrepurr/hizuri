import type { MediaCommand } from "./model";

/** What the media calls steer on the player tab's player (stage/blocks/player.tsx). */
export interface MediaPlayerHandle {
  apply(command: MediaCommand): void;
}
