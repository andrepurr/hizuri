import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeVoiceOutput, type VoiceOutputEvent } from "../voice-output";
import {
  NATIVE_PREFEED_MS,
  nativeOutputDrainMs,
  playPcm16,
  stopQueuedPcm16,
  waitForNativeOutputDrain,
} from "./index";

// One second of 16 kHz mono PCM16 (no resampling).
const ONE_SECOND = new Uint8Array(16000 * 2);
const MIME = "audio/pcm;rate=16000";

function createOutput() {
  return {
    resumePlayback: vi.fn(),
    playPCMData: vi.fn(),
    stopPlayback: vi.fn(),
  };
}

describe("playPcm16", () => {
  let events: VoiceOutputEvent[];
  let unsubscribe: () => void;
  // The native queue's horizon is module state: every test starts well after the last one's.
  let base = 1_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    base += 100_000;
    vi.setSystemTime(base);
    events = [];
    unsubscribe = subscribeVoiceOutput((event) => events.push(event));
  });

  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it("settles a chunk before its sound ends, so the next one is queued in time", async () => {
    const output = createOutput();
    const settled = vi.fn();
    void playPcm16(ONE_SECOND, MIME, new AbortController().signal, output).then(settled);

    await vi.advanceTimersByTimeAsync(1000 - NATIVE_PREFEED_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledWith(1);
    expect(nativeOutputDrainMs()).toBe(NATIVE_PREFEED_MS);
  });

  it("reports each chunk's start behind the chunks still queued", async () => {
    const output = createOutput();
    const signal = new AbortController().signal;
    const first = playPcm16(ONE_SECOND, MIME, signal, output);
    await vi.advanceTimersByTimeAsync(1000 - NATIVE_PREFEED_MS);
    await first;
    void playPcm16(ONE_SECOND, MIME, signal, output);

    const starts = events.flatMap((event) =>
      event.type === "chunk" ? [event.chunk.startedAt] : [],
    );
    expect(starts).toEqual([base, base + 1000]);
    expect(nativeOutputDrainMs()).toBe(1000 + NATIVE_PREFEED_MS);
  });

  it("gives the face the audible moment the player measured, read before the hand-over", async () => {
    const order: string[] = [];
    const output = {
      ...createOutput(),
      playPCMData: vi.fn(() => order.push("play")),
      getOutputTiming: vi.fn(() => {
        order.push("timing");
        return { audibleInMs: 137 };
      }),
    };
    void playPcm16(ONE_SECOND, MIME, new AbortController().signal, output);

    expect(order).toEqual(["timing", "play"]);
    const chunk = events.flatMap((event) => (event.type === "chunk" ? [event.chunk] : []))[0];
    expect(chunk?.audibleAt).toBe(base + 137);
  });

  it("keeps the estimate when the player has no timestamp yet", async () => {
    const output = { ...createOutput(), getOutputTiming: vi.fn(() => null) };
    void playPcm16(ONE_SECOND, MIME, new AbortController().signal, output);

    const chunk = events.flatMap((event) => (event.type === "chunk" ? [event.chunk] : []))[0];
    expect(chunk?.audibleAt).toBeUndefined();
    expect(chunk?.startedAt).toBe(base);
  });

  it("waits for the queued sound to drain", async () => {
    const output = createOutput();
    const first = playPcm16(ONE_SECOND, MIME, new AbortController().signal, output);
    await vi.advanceTimersByTimeAsync(1000 - NATIVE_PREFEED_MS);
    await first;
    const drained = vi.fn();
    void waitForNativeOutputDrain().then(drained);
    await vi.advanceTimersByTimeAsync(NATIVE_PREFEED_MS - 1);
    expect(drained).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(drained).toHaveBeenCalled();
  });

  it("stops sound still queued after its chunk settled", async () => {
    const output = createOutput();
    const first = playPcm16(ONE_SECOND, MIME, new AbortController().signal, output);
    await vi.advanceTimersByTimeAsync(1000 - NATIVE_PREFEED_MS);
    await first;

    stopQueuedPcm16(output);
    expect(output.stopPlayback).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: "stop" });
    expect(nativeOutputDrainMs()).toBe(0);

    stopQueuedPcm16(output);
    expect(output.stopPlayback).toHaveBeenCalledTimes(1);
  });
});
