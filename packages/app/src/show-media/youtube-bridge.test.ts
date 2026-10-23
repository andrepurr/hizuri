import { describe, expect, it } from "vitest";
import type { YoutubePlan } from "./model";
import {
  buildYoutubePageUrl,
  commandScript,
  isEmbedRefused,
  parseYoutubePageEvent,
  youtubeAppPlan,
} from "./youtube-bridge";

const PLAN: YoutubePlan = {
  lane: "youtube",
  videoId: "dQw4w9WgXcQ",
  playlistId: null,
  title: null,
  startAt: 90.7,
  queue: ["9bZkp7q19f0", "kJQP7kiw5Fk"],
};

describe("youtube bridge", () => {
  it("builds the daemon page URL with the first video, start and queue", () => {
    expect(buildYoutubePageUrl("http://192.0.2.1:6768", PLAN)).toBe(
      "http://192.0.2.1:6768/hizuri-media/youtube?v=dQw4w9WgXcQ&start=90&queue=9bZkp7q19f0%2CkJQP7kiw5Fk",
    );
    expect(
      buildYoutubePageUrl("https://host.example", {
        ...PLAN,
        videoId: null,
        playlistId: "PL1234567890",
        startAt: null,
        queue: [],
      }),
    ).toBe("https://host.example/hizuri-media/youtube?list=PL1234567890");
  });

  it("hands a command to the page as a script the WebView can inject", () => {
    expect(commandScript({ action: "seek", position: null, offset: 10 })).toBe(
      'window.hizuriMedia && window.hizuriMedia.receive({"type":"media.command","command":{"action":"seek","position":null,"offset":10}}); true;',
    );
  });

  it("parses page events and ignores anything else", () => {
    expect(parseYoutubePageEvent('{"type":"media.ready"}')).toEqual({ type: "media.ready" });
    expect(parseYoutubePageEvent('{"type":"media.error","code":150}')).toEqual({
      type: "media.error",
      code: 150,
    });
    expect(parseYoutubePageEvent('{"type":"media.state","state":"playing"}')).toEqual({
      type: "media.state",
      state: "playing",
    });
    expect(parseYoutubePageEvent("not json")).toBeNull();
    expect(parseYoutubePageEvent({ type: "media.ready" })).toBeNull();
  });

  it("refused embeds fall back to the user's YouTube app at the same moment", () => {
    expect(isEmbedRefused(150)).toBe(true);
    expect(isEmbedRefused(101)).toBe(true);
    expect(isEmbedRefused(153)).toBe(false);
    expect(youtubeAppPlan(PLAN)).toEqual({
      lane: "app",
      app: "youtube",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s",
      androidPackage: "com.google.android.youtube",
      query: null,
      playFromSearch: false,
    });
  });
});
