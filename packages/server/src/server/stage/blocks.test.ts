import { describe, expect, it } from "vitest";
import { describeBlocks, normalizeBlocks, StageBlockError } from "./blocks.js";

describe("lottie block", () => {
  it("takes one of the app's built-in animations with a caption", () => {
    const [block] = normalizeBlocks([
      { type: "lottie", props: { name: "win", caption: "Bought", size: "large" } },
    ]);
    expect(block).toMatchObject({
      type: "lottie",
      id: "b1",
      props: { name: "win", caption: "Bought", size: "large" },
      fallback: "Bought",
    });
  });

  it("refuses a block with both a name and a link, naming the place", () => {
    expect(() =>
      normalizeBlocks([
        { type: "lottie", props: { name: "success", url: "https://example.com/a.json" } },
      ]),
    ).toThrow(new StageBlockError("blocks[0] (lottie)", "give exactly one of name or url"));
  });

  it("refuses an animation the app does not carry", () => {
    expect(() => normalizeBlocks([{ type: "lottie", props: { name: "fireworks" } }])).toThrow(
      StageBlockError,
    );
  });

  it("is found by the moments it is for", () => {
    expect(describeBlocks({ tags: ["celebrate"] }).map((block) => block.type)).toEqual(["lottie"]);
  });
});

describe("brand blocks", () => {
  it("takes a verdict that blooms in and falls back to its answer and why", () => {
    const [block] = normalizeBlocks([
      {
        type: "verdict",
        id: "verdict",
        enter: "bloom",
        props: {
          answer: "Yes, we take the Orbit 2",
          says: "yes",
          why: "The brightest and within budget.",
        },
      },
    ]);
    expect(block).toMatchObject({
      type: "verdict",
      id: "verdict",
      enter: "bloom",
      fallback: "Yes, we take the Orbit 2 — The brightest and within budget.",
    });
  });

  it("falls back from a compare to both columns and the conclusion", () => {
    const [block] = normalizeBlocks([
      {
        type: "compare",
        props: {
          left: { title: "hizuri", kind: "plus", items: ["Voice first"] },
          right: { title: "Hermes", kind: "minus", items: ["Text only", "Cloud"] },
          verdict: "hizuri wins on voice",
        },
      },
    ]);
    expect(block?.fallback).toBe(
      "hizuri: Voice first — Hermes: Text only, Cloud — hizuri wins on voice",
    );
  });

  it("refuses a timeline state the app does not draw, naming the place", () => {
    expect(() =>
      normalizeBlocks([
        { type: "timeline", props: { items: [{ label: "Ship", state: "later" }] } },
      ]),
    ).toThrow(StageBlockError);
  });

  it("is found by the tags Zuri picks a layout with", () => {
    const types = (tags: string[]) => describeBlocks({ tags }).map((block) => block.type);
    expect(types(["verdict"])).toEqual(expect.arrayContaining(["verdict", "card"]));
    expect(types(["versus"])).toEqual(["compare"]);
    expect(types(["roadmap"])).toEqual(["timeline"]);
    expect(types(["hero"])).toEqual(expect.arrayContaining(["verdict", "figure", "cover"]));
  });
});
