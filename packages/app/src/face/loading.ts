import type { FacePageMessage } from "./bridge";

// What the face page shows while the assistant's avatar loads, so a slow load says what it is doing
// instead of a bare spinner. The avatar page reports progress only while the model downloads; a
// model from its IndexedDB copy skips straight to ready. Parsing the model and compiling its
// shaders send nothing, so the step after the last byte is "preparing".

export type FaceLoad =
  | { step: "starting" }
  | { step: "downloading"; share: number }
  | { step: "preparing" }
  | { step: "ready" }
  | { step: "failed"; message: string };

export const FACE_LOAD_START: FaceLoad = { step: "starting" };

export function nextFaceLoad(current: FaceLoad, message: FacePageMessage): FaceLoad {
  if (current.step === "ready") return current;
  if (message.type === "face.ready") return { step: "ready" };
  if (message.type === "face.error") return { step: "failed", message: message.message };
  if (current.step === "failed") return current;
  if (message.type === "face.progress") {
    return message.value >= 1
      ? { step: "preparing" }
      : { step: "downloading", share: message.value };
  }
  return current;
}
