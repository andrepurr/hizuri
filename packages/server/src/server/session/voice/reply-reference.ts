// Hizuri (echo cancel): the assistant's reply as the phone plays it, laid on the microphone's own
// sample clock, so an echo canceller can subtract it from the user's mic audio and a recording can
// be replayed offline.
//
// Why on the mic clock: the host never hears the loudspeaker; it knows only when it sent each chunk
// of the assistant's audio and how many mic samples it has received. A chunk is placed at the mic
// sample the host was at when it sent the chunk, or right after the chunk before it when the phone
// is still playing that one (the pacer sends each chunk before the previous one ends). The
// assistant's echo then reaches the mic later than its reference by the downlink, the phone's
// playback queue, its output latency and the uplink: 0.26-0.99 s on a real phone, the same for a
// whole reply and different from one reply to the next. Both engines lose the echo once it lags
// more than about 0.45 s (bench: at 0.6 s AEC3 removed 3 dB instead of 39), so EchoLag below moves
// the reference to the measured lag of each reply before the canceller sees it.

const MIC_RATE = 16_000;
const TTS_RATE = 24_000;
/** Low-pass taps for 24 kHz -> 16 kHz (cut near 7 kHz), so the reference holds no aliases. */
const LOWPASS = lowpassTaps(31, 7_000 / TTS_RATE);
/** A reference this far ahead of the mic is dropped: the phone cannot have buffered more. */
const MAX_AHEAD_SAMPLES = 30 * MIC_RATE;

function lowpassTaps(count: number, cutoff: number): Float64Array {
  const taps = new Float64Array(count);
  const mid = (count - 1) / 2;
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const x = i - mid;
    const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (count - 1));
    taps[i] = sinc * hann;
    sum += taps[i];
  }
  for (let i = 0; i < count; i++) {
    taps[i] /= sum;
  }
  return taps;
}

/** 24 kHz PCM16 mono -> 16 kHz Int16 samples (low-pass, then linear 3:2). One chunk at a time. */
export function tts24kTo16k(pcm: Buffer): Int16Array {
  const n = Math.floor(pcm.length / 2);
  const src = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    src[i] = pcm.readInt16LE(i * 2);
  }
  const half = (LOWPASS.length - 1) / 2;
  const filtered = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < LOWPASS.length; k++) {
      const j = i + k - half;
      if (j >= 0 && j < n) {
        acc += src[j] * LOWPASS[k];
      }
    }
    filtered[i] = acc;
  }
  const outLen = Math.floor((n * MIC_RATE) / TTS_RATE);
  const out = new Int16Array(outLen);
  const step = TTS_RATE / MIC_RATE;
  for (let o = 0; o < outLen; o++) {
    const pos = o * step;
    const i = Math.floor(pos);
    const frac = pos - i;
    const next = i + 1 < n ? filtered[i + 1] : filtered[i];
    out[o] = Math.max(
      -32768,
      Math.min(32767, Math.round(filtered[i] + (next - filtered[i]) * frac)),
    );
  }
  return out;
}

interface PlacedChunk {
  start: number;
  pcm: Int16Array;
}

export class ReplyReference {
  private readonly placed: PlacedChunk[] = [];
  /** Mic samples taken so far: the mic clock. */
  private micPos = 0;
  /** Where the next chunk starts when the phone is still playing the previous one. */
  private cursor = 0;

  /**
   * A chunk of the assistant's audio just went out to the phone: 24 kHz PCM16, after the output
   * gain.
   */
  play(pcm24k: Buffer): void {
    const pcm = tts24kTo16k(pcm24k);
    if (pcm.length === 0) {
      return;
    }
    const start = Math.max(this.cursor, this.micPos);
    if (start - this.micPos > MAX_AHEAD_SAMPLES) {
      return;
    }
    this.placed.push({ start, pcm });
    this.cursor = start + pcm.length;
  }

  /** The phone dropped what it had not played yet (a cut): forget it here too. */
  cut(): void {
    for (const chunk of this.placed) {
      const keep = Math.max(0, this.micPos - chunk.start);
      if (keep < chunk.pcm.length) {
        chunk.pcm = chunk.pcm.subarray(0, keep);
      }
    }
    this.cursor = this.micPos;
  }

  /**
   * True while some placed audio is still ahead of the mic clock (the assistant is audible or about
   * to be).
   */
  pending(): boolean {
    return this.placed.some((chunk) => chunk.start + chunk.pcm.length > this.micPos);
  }

  /** The reference for the next `samples` mic samples; advances the mic clock. Zeros where silent. */
  take(samples: number): Int16Array {
    const out = new Int16Array(samples);
    const from = this.micPos;
    const to = from + samples;
    for (const chunk of this.placed) {
      const a = Math.max(from, chunk.start);
      const b = Math.min(to, chunk.start + chunk.pcm.length);
      if (a < b) {
        out.set(chunk.pcm.subarray(a - chunk.start, b - chunk.start), a - from);
      }
    }
    this.micPos = to;
    while (this.placed.length > 0) {
      const head = this.placed[0];
      if (head.start + head.pcm.length > this.micPos) {
        break;
      }
      this.placed.shift();
    }
    return out;
  }
}

// --- where the echo really is -------------------------------------------------------------------

/** A reply's audio starts after this much silence in the reference: 1 s. */
const BURST_GAP_SAMPLES = MIC_RATE;
/** The reference is measured on its first second of a reply... */
const MEASURE_SAMPLES = MIC_RATE;
/** ...against the mic up to this much later: the echo's longest lag, 1.2 s. */
const MAX_LAG_SAMPLES = Math.round(1.2 * MIC_RATE);
/** The reference is placed this much ahead of the echo, inside the canceller's window. */
const MARGIN_SAMPLES = Math.round(0.04 * MIC_RATE);
/** A lag is believed when the echo matches the reference at least this well (0-1). */
const MIN_MATCH = 0.3;
/** The lag of the first reply, before any is measured (the median on a real phone). */
const FIRST_LAG_SAMPLES = Math.round(0.35 * MIC_RATE);
const DECIMATE = 4;
const LOUD = 300;
const FRAME = MIC_RATE / 100;

/**
 * Hizuri (echo cancel): the reference moved to where the assistant's echo really reaches the mic.
 * On a real phone the echo comes back 0.26-0.99 s after the reference the host lays down, the lag
 * holds for a whole reply and jumps between replies (the phone's playback queue and the network).
 * A canceller then re-learns at every reply, and beyond its window removes nothing. So each reply
 * starts at the last reply's lag; once its first second has played and 1.2 s of mic is in, the
 * lag is measured (the peak of the cross-correlation between that second and the mic) and the rest
 * of the reply follows it. The reference only ever moves later, out of its own past, so the mic
 * audio waits for nothing.
 */
export class EchoLag {
  private readonly history = new Int16Array(4 * MIC_RATE);
  /** Reference samples seen so far: the mic clock, and the write position in `history`. */
  private pos = 0;
  private lag = FIRST_LAG_SAMPLES;
  private quiet = BURST_GAP_SAMPLES;
  /** The reply being measured: where it started on the mic clock and the mic heard since. */
  private burstAt: number | null = null;
  private burstMic: Int16Array | null = null;
  private burstMicLen = 0;

  constructor(private readonly onLag?: (lagMs: number, match: number) => void) {}

  /** The reference for these mic samples, moved by the current lag. */
  align(mic: Int16Array, placed: Int16Array): Int16Array {
    const n = placed.length;
    const out = new Int16Array(n);
    const shift = Math.max(0, this.lag - MARGIN_SAMPLES);
    for (let i = 0; i < n; i++) {
      this.history[(this.pos + i) % this.history.length] = placed[i];
    }
    for (let i = 0; i < n; i++) {
      const t = this.pos + i - shift;
      out[i] =
        t >= 0 && this.pos + i - t < this.history.length
          ? this.history[t % this.history.length]
          : 0;
    }
    this.track(mic, placed);
    this.pos += n;
    return out;
  }

  /** The lag the next samples use, ms. */
  lagMs(): number {
    return Math.round((this.lag * 1000) / MIC_RATE);
  }

  private track(mic: Int16Array, placed: Int16Array): void {
    for (let f = 0; f < placed.length; f += FRAME) {
      let loud = false;
      for (let i = f; i < Math.min(placed.length, f + FRAME); i++) {
        if (Math.abs(placed[i]) > LOUD) {
          loud = true;
          break;
        }
      }
      if (loud && this.quiet >= BURST_GAP_SAMPLES && this.burstAt === null) {
        this.burstAt = this.pos + f;
        this.burstMic = new Int16Array(MEASURE_SAMPLES + MAX_LAG_SAMPLES);
        this.burstMicLen = 0;
      }
      this.quiet = loud ? 0 : this.quiet + FRAME;
    }
    if (this.burstAt !== null) {
      this.appendMic(mic.subarray(Math.max(0, this.burstAt - this.pos)));
      if (this.burstMicLen === this.burstMic?.length) {
        this.measure();
      }
    }
  }

  private appendMic(mic: Int16Array): void {
    if (!this.burstMic) {
      return;
    }
    const take = Math.min(mic.length, this.burstMic.length - this.burstMicLen);
    this.burstMic.set(mic.subarray(0, take), this.burstMicLen);
    this.burstMicLen += take;
  }

  private measure(): void {
    const at = this.burstAt as number;
    const mic = this.burstMic as Int16Array;
    this.burstAt = null;
    this.burstMic = null;
    const ref = new Int16Array(MEASURE_SAMPLES);
    for (let i = 0; i < MEASURE_SAMPLES; i++) {
      ref[i] = this.history[(at + i) % this.history.length];
    }
    const found = peakLag(ref, mic);
    if (found && found.match >= MIN_MATCH) {
      this.lag = found.lag;
    }
    this.onLag?.(Math.round(((found?.lag ?? 0) * 1000) / MIC_RATE), found?.match ?? 0);
  }
}

/** Lag (samples, 0..MAX_LAG) of `ref`'s echo in `mic` and how well it matches (0-1). */
export function peakLag(ref: Int16Array, mic: Int16Array): { lag: number; match: number } | null {
  // Coarse at 4 kHz over every lag, then exact at 16 kHz around the best one.
  const r = decimate(ref);
  const m = decimate(mic);
  const lags = Math.min(MAX_LAG_SAMPLES / DECIMATE, m.length - r.length);
  if (lags <= 0) {
    return null;
  }
  let best = 0;
  let bestValue = -1;
  for (let k = 0; k <= lags; k++) {
    let acc = 0;
    for (let i = 0; i < r.length; i++) {
      acc += r[i] * m[i + k];
    }
    if (Math.abs(acc) > bestValue) {
      bestValue = Math.abs(acc);
      best = k;
    }
  }
  let lag = best * DECIMATE;
  let peak = -1;
  for (let k = Math.max(0, lag - DECIMATE * 2); k <= lag + DECIMATE * 2; k++) {
    if (k + ref.length > mic.length) {
      break;
    }
    let acc = 0;
    for (let i = 0; i < ref.length; i++) {
      acc += ref[i] * mic[i + k];
    }
    if (Math.abs(acc) > peak) {
      peak = Math.abs(acc);
      lag = k;
    }
  }
  let refEnergy = 0;
  let micEnergy = 0;
  for (let i = 0; i < ref.length; i++) {
    refEnergy += ref[i] * ref[i];
    micEnergy += mic[i + lag] * mic[i + lag];
  }
  if (refEnergy === 0 || micEnergy === 0) {
    return null;
  }
  return { lag, match: peak / Math.sqrt(refEnergy * micEnergy) };
}

function decimate(x: Int16Array): Float64Array {
  const out = new Float64Array(Math.floor(x.length / DECIMATE));
  for (let i = 0; i < out.length; i++) {
    let acc = 0;
    for (let k = 0; k < DECIMATE; k++) {
      acc += x[i * DECIMATE + k];
    }
    out[i] = acc;
  }
  return out;
}
