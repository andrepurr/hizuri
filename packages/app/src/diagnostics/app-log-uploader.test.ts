import { describe, expect, it, vi } from "vitest";
import { AppLogBuffer, captureConsole, flushAppLogs, formatLogArgs } from "./app-log-uploader";

describe("AppLogBuffer", () => {
  it("keeps the newest entries and reports how many it dropped", () => {
    const buffer = new AppLogBuffer();
    for (let index = 0; index < 2_005; index += 1) {
      buffer.record({ level: "info", message: `line ${index}` });
    }
    const batch = buffer.take(3);
    expect(batch.map((entry) => entry.message)).toEqual([
      "dropped 5 entries while the buffer was full",
      "line 5",
      "line 6",
      "line 7",
    ]);
  });

  it("puts a failed batch back in front of newer entries", () => {
    const buffer = new AppLogBuffer();
    buffer.record({ level: "info", message: "old" });
    const batch = buffer.take();
    buffer.record({ level: "info", message: "new" });
    buffer.restore(batch);
    expect(buffer.take().map((entry) => entry.message)).toEqual(["old", "new"]);
  });
});

describe("flushAppLogs", () => {
  it("uploads the buffer to the resolved host", async () => {
    const buffer = new AppLogBuffer();
    buffer.record({ level: "warn", tag: "mic", message: "zeroChunks=3" });
    const upload = vi.fn(async () => undefined);
    const sent = await flushAppLogs({
      buffer,
      isEnabled: () => true,
      resolveTarget: () => ({ upload }),
    });
    expect(sent).toBe(1);
    expect(upload).toHaveBeenCalledWith([
      expect.objectContaining({ level: "warn", tag: "mic", message: "zeroChunks=3" }),
    ]);
    expect(buffer.size).toBe(0);
  });

  it("keeps the entries when the upload fails or no host can take them", async () => {
    const buffer = new AppLogBuffer();
    buffer.record({ level: "error", message: "boom" });
    await flushAppLogs({ buffer, isEnabled: () => true, resolveTarget: () => null });
    expect(buffer.size).toBe(1);
    await flushAppLogs({
      buffer,
      isEnabled: () => true,
      resolveTarget: () => ({
        upload: async () => {
          throw new Error("offline");
        },
      }),
    });
    expect(buffer.size).toBe(1);
  });

  it("drops everything while the setting is off", async () => {
    const buffer = new AppLogBuffer();
    buffer.record({ level: "error", message: "private" });
    const upload = vi.fn(async () => undefined);
    await flushAppLogs({ buffer, isEnabled: () => false, resolveTarget: () => ({ upload }) });
    expect(upload).not.toHaveBeenCalled();
    expect(buffer.size).toBe(0);
  });
});

describe("captureConsole", () => {
  it("copies warnings and errors and still prints them", () => {
    const buffer = new AppLogBuffer();
    const printed: unknown[][] = [];
    const target = {
      warn: (...args: unknown[]) => printed.push(args),
      error: (...args: unknown[]) => printed.push(args),
    } as unknown as Console;
    const uninstall = captureConsole(buffer, target);
    target.warn("[Voice] retry", { attempt: 2 });
    target.error(new Error("socket closed"));
    uninstall();
    target.warn("after uninstall");

    const entries = buffer.take();
    expect(entries.map((entry) => [entry.level, entry.tag])).toEqual([
      ["warn", "console"],
      ["error", "console"],
    ]);
    expect(entries[0]?.message).toBe('[Voice] retry {"attempt":2}');
    expect(entries[1]?.message).toContain("socket closed");
    expect(printed).toHaveLength(3);
  });
});

describe("formatLogArgs", () => {
  it("survives values JSON cannot encode", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatLogArgs(["x", undefined, circular])).toBe("x undefined [object Object]");
  });
});
