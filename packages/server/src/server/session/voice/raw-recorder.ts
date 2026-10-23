// Hizuri: pipeline step 5 — all microphone audio is kept, unprocessed, always:
// to train the user's timbre model and to find what a stage lost. Per-phrase clips
// (PASEO_OWNER_RECORD_DIR) keep only what the speech detector called speech; this keeps every
// byte the phone sends. One WAV per session per 10 minutes, 16-bit mono, about 115 MB an hour.
// The WAV sizes are patched every few seconds, so a crash loses at most that much.

import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import path from "node:path";
import type pino from "pino";

const ROTATE_MS = 10 * 60_000;
const PATCH_EVERY_MS = 5_000;
const HEADER_BYTES = 44;

function wavHeader(sampleRate: number, dataBytes: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

interface OpenFile {
  fd: number;
  path: string;
  sampleRate: number;
  dataBytes: number;
  openedAt: number;
  patchedAt: number;
}

export class RawAudioRecorder {
  private file: OpenFile | null = null;

  constructor(
    private readonly dir: string,
    private readonly sessionTag: string,
    private readonly logger: pino.Logger,
  ) {}

  /** PCM16 mono at `sampleRate`, exactly as the phone sent it. */
  append(pcm: Buffer, sampleRate: number, now = Date.now()): void {
    try {
      const file = this.fileFor(sampleRate, now);
      writeSync(file.fd, pcm, 0, pcm.length, HEADER_BYTES + file.dataBytes);
      file.dataBytes += pcm.length;
      if (now - file.patchedAt >= PATCH_EVERY_MS) {
        this.patch(file, now);
      }
    } catch (error) {
      this.logger.warn({ err: String(error) }, "raw_record.failed");
      this.close();
    }
  }

  close(): void {
    const file = this.file;
    this.file = null;
    if (!file) {
      return;
    }
    try {
      this.patch(file, Date.now());
      closeSync(file.fd);
      this.logger.info(
        { path: file.path, seconds: Math.round(file.dataBytes / (file.sampleRate * 2)) },
        "raw_record.closed",
      );
    } catch (error) {
      this.logger.warn({ err: String(error) }, "raw_record.close_failed");
    }
  }

  private fileFor(sampleRate: number, now: number): OpenFile {
    const current = this.file;
    if (current && current.sampleRate === sampleRate && now - current.openedAt < ROTATE_MS) {
      return current;
    }
    this.close();
    mkdirSync(this.dir, { recursive: true });
    const stamp = new Date(now).toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.dir, `${stamp}_${this.sessionTag}.wav`);
    const fd = openSync(filePath, "w");
    writeSync(fd, wavHeader(sampleRate, 0), 0, HEADER_BYTES, 0);
    this.file = { fd, path: filePath, sampleRate, dataBytes: 0, openedAt: now, patchedAt: now };
    this.logger.info({ path: filePath, sampleRate }, "raw_record.opened");
    return this.file;
  }

  private patch(file: OpenFile, now: number): void {
    writeSync(file.fd, wavHeader(file.sampleRate, file.dataBytes), 0, HEADER_BYTES, 0);
    file.patchedAt = now;
  }
}

/** `audio/pcm;rate=16000;bits=16` → 16000; null for anything that is not 16-bit PCM. */
export function pcmSampleRate(format: string): number | null {
  const lower = format.toLowerCase();
  if (!lower.includes("pcm") || (lower.includes("bits=") && !lower.includes("bits=16"))) {
    return null;
  }
  const rate = Number(lower.match(/rate=(\d+)/)?.[1] ?? 16000);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
