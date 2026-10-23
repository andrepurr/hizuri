import { describe, expect, it } from "vitest";
import { FACE_LOAD_START, type FaceLoad, nextFaceLoad } from "./loading";
import type { FacePageMessage } from "./bridge";

function play(messages: FacePageMessage[]): FaceLoad {
  return messages.reduce(nextFaceLoad, FACE_LOAD_START);
}

describe("nextFaceLoad", () => {
  it("follows a cold load: download, then preparing, then ready", () => {
    expect(play([{ type: "face.progress", value: 0.4 }])).toEqual({
      step: "downloading",
      share: 0.4,
    });
    expect(
      play([
        { type: "face.progress", value: 0.4 },
        { type: "face.progress", value: 1 },
      ]),
    ).toEqual({ step: "preparing" });
    expect(play([{ type: "face.progress", value: 1 }, { type: "face.ready" }])).toEqual({
      step: "ready",
    });
  });

  it("stays on starting through the saved still: the live model is still loading", () => {
    expect(play([{ type: "face.still" }])).toEqual({ step: "starting" });
  });

  it("shows an error that comes before the assistant's first frame", () => {
    expect(
      play([
        { type: "face.progress", value: 0.2 },
        { type: "face.error", message: "WebGL" },
      ]),
    ).toEqual({ step: "failed", message: "WebGL" });
    expect(
      play([
        { type: "face.error", message: "WebGL" },
        { type: "face.progress", value: 0.5 },
      ]),
    ).toEqual({ step: "failed", message: "WebGL" });
  });

  it("lets the assistant's first frame win over an earlier error, and ignores errors once it is drawn", () => {
    expect(play([{ type: "face.error", message: "outfit" }, { type: "face.ready" }])).toEqual({
      step: "ready",
    });
    expect(play([{ type: "face.ready" }, { type: "face.error", message: "late" }])).toEqual({
      step: "ready",
    });
  });
});
