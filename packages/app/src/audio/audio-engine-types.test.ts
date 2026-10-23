import { describe, expect, it } from "vitest";

import { outputRouteOf } from "./audio-engine-types";

describe("outputRouteOf", () => {
  it("reads the phone's own speaker as the loudspeaker", () => {
    expect(
      outputRouteOf('route=communication out=speaker("Phone") in=default reason=no-headphones'),
    ).toBe("speaker");
  });

  it("reads every headset and Bluetooth output as headphones", () => {
    for (const out of ['bt_sco("Buds")', "wired_headset", 'bt_a2dp("BT Speaker")', "usb_headset"]) {
      expect(outputRouteOf(`route=communication out=${out} in=default reason=x`)).toBe(
        "headphones",
      );
    }
  });

  it("knows nothing without an output", () => {
    expect(outputRouteOf("route=communication out=default in=default reason=x")).toBeUndefined();
    expect(outputRouteOf("")).toBeUndefined();
  });
});
