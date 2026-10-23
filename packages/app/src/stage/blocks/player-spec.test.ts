import type { StageTab } from "@getpaseo/protocol/stage";
import { describe, expect, it } from "vitest";
import {
  FRESH_PLAY_MS,
  playerStart,
  playerTabOf,
  readPlayerSpec,
  resolvePlayerUrl,
} from "./player-spec";

const film = {
  type: "media",
  id: "player",
  props: {
    kind: "video",
    url: "/hizuri-media/file/abcdefghijklmnopqrstuv/film.mp4",
    player: true,
    playId: "p1",
    title: "Film",
    startAt: 30,
  },
};

function tab(blocks: unknown[]): StageTab {
  return {
    id: "media",
    title: "Film",
    blocks: blocks as StageTab["blocks"],
    createdAt: "2026-10-19T10:00:00.000Z",
    updatedAt: "2026-10-19T10:00:00.000Z",
    version: 1,
  };
}

describe("player spec", () => {
  it("reads the player block and ignores other media blocks", () => {
    expect(readPlayerSpec(film, "x")).toMatchObject({
      kind: "video",
      playId: "p1",
      title: "Film",
      startAt: 30,
      contentType: "auto",
    });
    expect(readPlayerSpec({ ...film, props: { ...film.props, player: false } }, "x")).toBeNull();
    expect(
      readPlayerSpec({ type: "media", props: { kind: "youtube", url: "u", player: true } }, "x"),
    ).toBeNull();
  });

  it("finds the player tab only when it holds the player alone", () => {
    expect(playerTabOf([tab([film])])?.spec.playId).toBe("p1");
    expect(playerTabOf([tab([film, { type: "text", props: {} }])])).toBeNull();
  });

  it("plays a fresh call from the assistant's start and waits paused where the user left a restored tab", () => {
    const spec = readPlayerSpec(film, "x")!;
    const now = Date.parse("2026-10-19T10:00:30.000Z");
    const updated = "2026-10-19T10:00:00.000Z";
    expect(playerStart({ spec, tabUpdatedAt: updated, saved: null, now })).toEqual({
      position: 30,
      autoplay: true,
    });
    expect(playerStart({ spec, tabUpdatedAt: updated, saved: 95, now })).toEqual({
      position: 95,
      autoplay: false,
    });
    const later = Date.parse(updated) + FRESH_PLAY_MS + 1;
    expect(playerStart({ spec, tabUpdatedAt: updated, saved: null, now: later }).autoplay).toBe(
      false,
    );
  });

  it("puts the daemon's paths on its origin and needs one for them", () => {
    expect(resolvePlayerUrl("/hizuri-media/file/t/a.mp4", "http://host:6768")).toBe(
      "http://host:6768/hizuri-media/file/t/a.mp4",
    );
    expect(resolvePlayerUrl("/hizuri-media/file/t/a.mp4", null)).toBeNull();
    expect(resolvePlayerUrl("https://cdn.example/a.mp4", null)).toBe("https://cdn.example/a.mp4");
  });
});
