import { describe, expect, it } from "vitest";
import { isCompactLayout } from "./layout";

describe("isCompactLayout", () => {
  it("is compact on a phone-sized window whatever the setting", () => {
    expect(isCompactLayout({ breakpoint: "xs", phoneLayout: false })).toBe(true);
    expect(isCompactLayout({ breakpoint: "sm", phoneLayout: false })).toBe(true);
  });

  it("keeps the phone layout on a wide window while the setting is on", () => {
    expect(isCompactLayout({ breakpoint: "lg", phoneLayout: true })).toBe(true);
    expect(isCompactLayout({ breakpoint: "xl", phoneLayout: true })).toBe(true);
  });

  it("gives a wide window the desktop layout once the setting is off", () => {
    expect(isCompactLayout({ breakpoint: "md", phoneLayout: false })).toBe(false);
    expect(isCompactLayout({ breakpoint: "xl", phoneLayout: false })).toBe(false);
    expect(isCompactLayout({ breakpoint: undefined, phoneLayout: false })).toBe(false);
  });
});
