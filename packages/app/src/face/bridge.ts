import type { FaceActivity } from "./activity";
import type { FaceReply } from "./model";

// Messages between the app and the avatar page (served by the daemon at /avatar/?host=app; the
// page lives with its model and motions in the folder features.face.avatarDir points at). The
// page never plays or fetches audio in this mode: the app sends the mouth frames of each chunk it
// plays, timed to the moment the chunk becomes audible, and the chunk's PCM itself to a page that
// asked for it in face.ready (docs/face-mouth.md).

export interface FaceThemeMessage {
  type: "face.theme";
  background: string;
}

export interface FaceVoiceMessage {
  type: "face.voice";
  /** `Date.now()` when the first frame is audible: the app and the page share the device clock. */
  audibleAt: number;
  /** The same as milliseconds from now, for pages that predate `audibleAt`. */
  delayMs: number;
  frameMs: number;
  /** Flat frames: volume, then the A, I, U, E, O weights (face/mouth.ts). */
  frames: number[];
  /** The chunk itself, for a page whose face.ready asked for `pcm16`: 16-bit little-endian mono
   * PCM in base64, at `sampleRate`. */
  pcm?: string;
  sampleRate?: number;
  /** Set on the first chunk of a reply: the face, gesture and outfit it starts with. */
  reply?: FaceReply;
}

/**
 * The reply of the voice already playing, when its speak call reached the app after the voice's
 * first chunk (face.voice then carried no reply). Older pages ignore it.
 */
export interface FaceReplyMessage {
  type: "face.reply";
  /** `Date.now()` when that voice became audible: the reply's line starts there. */
  audibleAt: number;
  reply: FaceReply;
}

export interface FaceStopMessage {
  type: "face.stop";
}

/** Stop or restart drawing (the app went to the background or came back). */
export interface FacePauseMessage {
  type: "face.pause" | "face.resume";
}

/**
 * What the assistant is doing now (face/activity.ts), sent on every change; older pages ignore it.
 */
export interface FaceActivityMessage {
  type: "face.activity";
  activity: FaceActivity;
  /** While thinking: how long until the assistant's voice, from the daemon (voice_think_hint);
   * pages size its thinking footage by it. */
  thinkSeconds?: number;
}

/**
 * Floating Zuri over other apps (float/): what the window is doing, so the page moves the body
 * to match. `walk` plays an in-place walk turned toward `facing` while the window slides;
 * `held` is the user's finger carrying Zuri, `fall` the drop to the floor. Older pages ignore it.
 */
export interface FaceFloatMessage {
  type: "face.float";
  state: "stand" | "walk" | "held" | "fall";
  /** -1 walks to the left of the screen, 1 to the right. */
  facing?: -1 | 1;
  /** The walk motion (motions/dances/): femwalk, catwalk, strut or prance. */
  motion?: string;
}

/** Floating Zuri: the user touched Zuri. `tap` is a poke, `land` the landing after a drop. */
export interface FaceReactMessage {
  type: "face.react";
  kind: "tap" | "land";
}

/**
 * Zuri perched on a block of the Show page (stage/perch.tsx): the pose, where the block's edge
 * lies in the window (`anchor`, a fraction of its height from the top), dp to a metre, the end of
 * the edge Zuri sits at, what Zuri points at (window dp), and whether Zuri just hopped there. `off`
 * fades Zuri out. Older pages ignore it.
 */
export interface FacePerchMessage {
  type: "face.perch";
  pose: "sit" | "point" | "lean" | "off";
  anchor?: number;
  scale?: number;
  side?: "left" | "right";
  target?: { x: number; y: number } | null;
  hop?: boolean;
}

export type FaceHostMessage =
  | FaceThemeMessage
  | FaceVoiceMessage
  | FaceReplyMessage
  | FaceStopMessage
  | FacePauseMessage
  | FaceActivityMessage
  | FaceFloatMessage
  | FaceReactMessage
  | FacePerchMessage;

/** What a page can take besides the mouth frames. */
export type FacePageAudio = "pcm16";

export type FacePageMessage =
  | { type: "face.progress"; value: number }
  /** The page painted the still of the face it saved last time; the live model is still loading. */
  | { type: "face.still" }
  /** The page drew its first live frame. `audio: "pcm16"`: it draws the mouth from the voice
   * itself and wants each chunk's PCM in face.voice. */
  | { type: "face.ready"; audio?: FacePageAudio }
  | { type: "face.error"; message: string };

/** Accepts only the page's own message types; anything else from the frame is dropped. */
export function parseFacePageMessage(raw: unknown): FacePageMessage | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null) return null;
  const message = value as { type?: unknown; value?: unknown; message?: unknown; audio?: unknown };
  if (message.type === "face.ready") {
    return message.audio === "pcm16"
      ? { type: "face.ready", audio: "pcm16" }
      : { type: "face.ready" };
  }
  if (message.type === "face.still") return { type: "face.still" };
  if (message.type === "face.progress" && typeof message.value === "number") {
    return { type: "face.progress", value: Math.max(0, Math.min(1, message.value)) };
  }
  if (message.type === "face.error") {
    return {
      type: "face.error",
      message: typeof message.message === "string" ? message.message.slice(0, 500) : "",
    };
  }
  return null;
}
