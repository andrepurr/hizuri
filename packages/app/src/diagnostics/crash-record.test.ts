import { describe, expect, it } from "vitest";
import { AppLogBuffer } from "./app-log-uploader";
import { replayCrash, serializeCrash } from "./crash-record";

describe("crash record", () => {
  it("keeps the error and the unsent lines, and puts them back after a relaunch", () => {
    const before = new AppLogBuffer();
    before.record({ level: "info", tag: "voice", message: "phase=listening", now: new Date(0) });
    const text = serializeCrash({
      error: new TypeError("boom"),
      buffer: before,
      now: new Date("2026-10-19T15:20:59.000Z"),
    });
    expect(before.size).toBe(1);

    const after = new AppLogBuffer();
    expect(replayCrash(text, after)).toBe(true);
    const [crash, line] = after.take();
    expect(crash).toMatchObject({ level: "error", tag: "crash" });
    expect(crash?.message).toContain("2026-10-19T15:20:59.000Z");
    expect(crash?.message).toContain("TypeError: boom");
    expect(line).toMatchObject({ level: "info", tag: "crash:voice" });
    expect(line?.message).toBe("1970-01-01T00:00:00.000Z phase=listening");
  });

  it("ignores a file that is not a crash record", () => {
    const buffer = new AppLogBuffer();
    expect(replayCrash("not json", buffer)).toBe(false);
    expect(replayCrash("{}", buffer)).toBe(false);
    expect(buffer.size).toBe(0);
  });
});
