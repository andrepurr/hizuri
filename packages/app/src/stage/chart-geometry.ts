// Chart geometry for the stage's native charts (blocks/chart.tsx): plain numbers in, pixels out,
// so the drawing code only animates between two sets of points.

export interface ChartFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ValueScale {
  min: number;
  max: number;
  ticks: number[];
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  if (fraction <= 1) return power;
  if (fraction <= 2) return 2 * power;
  if (fraction <= 5) return 5 * power;
  return 10 * power;
}

/** A value axis with round ticks that holds every value; bars always start from zero. */
export function valueScale(values: readonly number[], fromZero: boolean): ValueScale {
  const finite = values.filter((value) => Number.isFinite(value));
  let min = finite.length > 0 ? Math.min(...finite) : 0;
  let max = finite.length > 0 ? Math.max(...finite) : 1;
  if (fromZero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const step = niceStep(max - min, 4);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(Number(tick.toFixed(10)));
  return { min: low, max: high, ticks };
}

export function yOf(value: number, scale: ValueScale, frame: ChartFrame): number {
  const span = scale.max - scale.min || 1;
  return frame.top + frame.height - ((value - scale.min) / span) * frame.height;
}

/** X of the n-th of `count` points spread over the frame. */
export function xOf(index: number, count: number, frame: ChartFrame): number {
  if (count <= 1) return frame.left + frame.width / 2;
  return frame.left + (index / (count - 1)) * frame.width;
}

/** A smooth path through the points: each segment bends at its middle. */
export function smoothPath(xs: readonly number[], ys: readonly number[]): string {
  "worklet";
  if (xs.length === 0) return "";
  let d = `M${xs[0]},${ys[0]}`;
  for (let index = 1; index < xs.length; index += 1) {
    const x0 = xs[index - 1] ?? 0;
    const x1 = xs[index] ?? 0;
    const mid = (x0 + x1) / 2;
    d += ` C${mid},${ys[index - 1]} ${mid},${ys[index]} ${x1},${ys[index]}`;
  }
  return d;
}

/** Length of the broken line through the points; the smooth path is a little longer. */
export function polylineLength(xs: readonly number[], ys: readonly number[]): number {
  let length = 0;
  for (let index = 1; index < xs.length; index += 1) {
    length += Math.hypot(
      (xs[index] ?? 0) - (xs[index - 1] ?? 0),
      (ys[index] ?? 0) - (ys[index - 1] ?? 0),
    );
  }
  return length;
}

export interface PieSlice {
  label: string;
  value: number;
  share: number;
  /** Where the slice starts, as a share of the circle. */
  start: number;
}

export function pieSlices(labels: readonly string[], values: readonly number[]): PieSlice[] {
  const positive = values.map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = positive.reduce((sum, value) => sum + value, 0);
  let start = 0;
  return positive.map((value, index) => {
    const share = total > 0 ? value / total : 0;
    const slice = { label: labels[index] ?? "", value, share, start };
    start += share;
    return slice;
  });
}

/** 1 234 → “1.2k”: axis labels stay short. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${Number((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${Number((value / 1_000).toFixed(1))}k`;
  return String(Number(value.toFixed(2)));
}
