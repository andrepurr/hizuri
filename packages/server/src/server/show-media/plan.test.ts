import { describe, expect, test } from "vitest";
import {
  ShowMediaInputError,
  parseYoutubeTime,
  planMediaControl,
  planShowMedia,
  videoContentType,
} from "./plan.js";

describe("planShowMedia picks the lane", () => {
  test("a YouTube watch link plays in the embedded player, with its start time and playlist", () => {
    expect(
      planShowMedia({
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&list=PL1234567890",
      }),
    ).toEqual({
      lane: "youtube",
      videoId: "dQw4w9WgXcQ",
      playlistId: "PL1234567890",
      title: null,
      startAt: 90,
      queue: [],
    });
  });

  test("short links, shorts and embeds resolve to the video id", () => {
    for (const url of [
      "https://youtu.be/dQw4w9WgXcQ?t=42",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    ]) {
      const plan = planShowMedia({ url });
      expect(plan).toMatchObject({ lane: "youtube", videoId: "dQw4w9WgXcQ" });
    }
  });

  test("a YouTube page the player cannot play opens the YouTube app", () => {
    expect(planShowMedia({ url: "https://www.youtube.com/@veritasium" })).toMatchObject({
      lane: "app",
      app: "youtube",
      url: "https://www.youtube.com/@veritasium",
      androidPackage: "com.google.android.youtube",
      playFromSearch: false,
    });
  });

  test("a youtubeId with a queue plays in the embedded player", () => {
    expect(
      planShowMedia({
        youtubeId: "dQw4w9WgXcQ",
        title: "Rick",
        playlist: ["9bZkp7q19f0", "https://youtu.be/kJQP7kiw5Fk", "not a video"],
      }),
    ).toEqual({
      lane: "youtube",
      videoId: "dQw4w9WgXcQ",
      playlistId: null,
      title: "Rick",
      startAt: null,
      queue: ["9bZkp7q19f0", "kJQP7kiw5Fk"],
    });
  });

  test("music and DRM services always open the user's own app", () => {
    expect(planShowMedia({ url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ" })).toMatchObject({
      lane: "app",
      app: "youtube_music",
    });
    expect(planShowMedia({ url: "https://www.netflix.com/title/80057281" })).toMatchObject({
      lane: "app",
      app: "netflix",
      androidPackage: "com.netflix.mediaclient",
    });
    expect(planShowMedia({ url: "https://open.spotify.com/track/abc" })).toMatchObject({
      lane: "app",
      app: "spotify",
    });
  });

  test("app + query searches the app, and music apps may start playing the match", () => {
    expect(planShowMedia({ app: "spotify", query: "Metallica Nothing Else Matters" })).toEqual({
      lane: "app",
      app: "spotify",
      url: "https://open.spotify.com/search/Metallica%20Nothing%20Else%20Matters",
      androidPackage: "com.spotify.music",
      query: "Metallica Nothing Else Matters",
      playFromSearch: true,
    });
    expect(planShowMedia({ app: "netflix", query: "Dark" })).toMatchObject({
      url: "https://www.netflix.com/search?q=Dark",
      playFromSearch: false,
    });
    expect(planShowMedia({ app: "youtube_music" })).toMatchObject({
      url: "https://music.youtube.com/",
      query: null,
      playFromSearch: false,
    });
  });

  test("a query without an app searches the YouTube app", () => {
    expect(planShowMedia({ query: "lofi beats" })).toMatchObject({
      lane: "app",
      app: "youtube",
      url: "https://www.youtube.com/results?search_query=lofi%20beats",
    });
  });

  test("direct media and stream links play in the native player with their format", () => {
    expect(planShowMedia({ url: "https://cdn.example.com/live/master.m3u8?token=1" })).toEqual({
      lane: "video",
      uri: "https://cdn.example.com/live/master.m3u8?token=1",
      contentType: "hls",
      title: null,
      startAt: null,
      queue: [],
    });
    expect(planShowMedia({ url: "http://192.0.2.1:8096/film.mkv", startAt: 600 })).toMatchObject({
      lane: "video",
      contentType: "auto",
      startAt: 600,
    });
  });

  test("a daemon file link plays in the native player", () => {
    expect(
      planShowMedia({ fileUri: "/hizuri-media/file/tok/film.mpd", title: "Film" }),
    ).toMatchObject({ lane: "video", uri: "/hizuri-media/file/tok/film.mpd", contentType: "dash" });
  });

  test("inputs Zuri can fix come back as ShowMediaInputError", () => {
    expect(() => planShowMedia({})).toThrow(ShowMediaInputError);
    expect(() => planShowMedia({ url: "ftp://example.com/a.mp4" })).toThrow(/http\(s\)/);
    expect(() => planShowMedia({ url: "not a link" })).toThrow(/Not a link/);
    expect(() => planShowMedia({ youtubeId: "short" })).toThrow(/YouTube video id/);
  });
});

describe("helpers", () => {
  test("YouTube times", () => {
    expect(parseYoutubeTime("90")).toBe(90);
    expect(parseYoutubeTime("1h2m3s")).toBe(3723);
    expect(parseYoutubeTime("45s")).toBe(45);
    expect(parseYoutubeTime("soon")).toBeNull();
    expect(parseYoutubeTime(null)).toBeNull();
  });

  test("content types", () => {
    expect(videoContentType("https://a/b.MPD")).toBe("dash");
    expect(videoContentType("https://a/b.mp4#t=3")).toBe("auto");
  });
});

describe("planMediaControl", () => {
  test("normalizes seek and volume", () => {
    expect(planMediaControl({ action: "seek", offset: -10 })).toEqual({
      action: "seek",
      position: null,
      offset: -10,
    });
    expect(planMediaControl({ action: "seek", position: 60, offset: 5 })).toEqual({
      action: "seek",
      position: 60,
      offset: null,
    });
    expect(planMediaControl({ action: "volume", volume: 140 })).toEqual({
      action: "volume",
      volume: 100,
    });
    expect(planMediaControl({ action: "next" })).toEqual({ action: "next" });
  });

  test("rejects a seek or volume without its value", () => {
    expect(() => planMediaControl({ action: "seek" })).toThrow(ShowMediaInputError);
    expect(() => planMediaControl({ action: "volume" })).toThrow(/0–100/);
  });
});
