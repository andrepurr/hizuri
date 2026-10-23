// The Lottie animations the app carries for the stage's `lottie` block and for the moments a
// show_* block lands on (a success card, a progress that reaches 100 %). They are built here as
// Lottie JSON instead of shipped as files, so they take the theme's colours, cost no download and
// play offline. The daemon names them in LOTTIE_NAMES (packages/server/src/server/stage/blocks.ts).
//
// Only plain features every player draws: shape layers, ellipses, rectangles, a star, paths,
// fills, strokes, trim paths, and layer transforms with split-dimension positions.

export const LOTTIE_NAMES = ["success", "loading", "win", "error"] as const;
export type LottieName = (typeof LOTTIE_NAMES)[number];

export interface LottiePalette {
  accent: string;
  success: string;
  warning: string;
  danger: string;
  foreground: string;
  /** The brand core (warm white) for ticks and confetti; the foreground when absent. */
  core?: string;
}

type Rgba = [number, number, number, number];
type Value = number | number[];

interface Keyframe {
  t: number;
  s: number[];
  o?: { x: number[]; y: number[] };
  i?: { x: number[]; y: number[] };
}

interface Animated {
  a: 0 | 1;
  k: unknown;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const FPS = 60;

export function isLottieName(value: unknown): value is LottieName {
  return typeof value === "string" && (LOTTIE_NAMES as readonly string[]).includes(value);
}

function rgba(hex: string, alpha = 1): Rgba {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : clean.slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return [1, 1, 1, alpha];
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha];
}

function still(k: unknown): Animated {
  return { a: 0, k };
}

// Ease out (cubic-bezier .33,1,.68,1) and a back-out with overshoot (.34,1.56,.64,1).
const EASE_OUT = { o: [0.33, 1], i: [0.68, 1] };
const BACK_OUT = { o: [0.34, 1.56], i: [0.64, 1] };
const LINEAR = { o: [0, 0], i: [1, 1] };

/** Keyframes [frame, value]; every keyframe but the last eases into the next one. */
function animate(frames: [number, Value][], ease = EASE_OUT): Animated {
  const keys: Keyframe[] = frames.map(([t, value], index) => {
    const s = Array.isArray(value) ? value : [value];
    if (index === frames.length - 1) return { t, s };
    const dims = s.length;
    const perDim = (n: number) => Array.from({ length: dims }, () => n);
    return {
      t,
      s,
      o: { x: perDim(ease.o[0]!), y: perDim(ease.o[1]!) },
      i: { x: perDim(ease.i[0]!), y: perDim(ease.i[1]!) },
    };
  });
  return { a: 1, k: keys };
}

function groupTransform() {
  return {
    ty: "tr",
    p: still([0, 0]),
    a: still([0, 0]),
    s: still([100, 100]),
    r: still(0),
    o: still(100),
    sk: still(0),
    sa: still(0),
  };
}

function group(name: string, items: unknown[]) {
  return { ty: "gr", nm: name, np: items.length, it: [...items, groupTransform()] };
}

function ellipse(diameter: number) {
  return { ty: "el", d: 1, p: still([0, 0]), s: still([diameter, diameter]) };
}

function rect(width: number, height: number, radius = 2) {
  return { ty: "rc", d: 1, p: still([0, 0]), s: still([width, height]), r: still(radius) };
}

function path(points: [number, number][], closed = false) {
  const zero = points.map(() => [0, 0]);
  return { ty: "sh", ks: still({ c: closed, v: points, i: zero, o: zero }) };
}

function star(outer: number, inner: number) {
  return {
    ty: "sr",
    sy: 1,
    d: 1,
    pt: still(5),
    p: still([0, 0]),
    r: still(0),
    ir: still(inner),
    is: still(0),
    or: still(outer),
    os: still(0),
  };
}

function fill(color: Rgba) {
  return { ty: "fl", c: still(color), o: still(color[3] * 100), r: 1 };
}

function stroke(color: Rgba, width: number) {
  return { ty: "st", c: still(color), o: still(color[3] * 100), w: still(width), lc: 2, lj: 2 };
}

function trim(start: Animated, end: Animated) {
  return { ty: "tm", s: start, e: end, o: still(0), m: 1 };
}

interface LayerTransform {
  o?: Animated;
  r?: Animated;
  p?: Animated | { s: true; x: Animated; y: Animated };
  s?: Animated;
}

function layer(input: {
  index: number;
  name: string;
  op: number;
  shapes: unknown[];
  transform?: LayerTransform;
}) {
  const transform = input.transform ?? {};
  return {
    ddd: 0,
    ind: input.index,
    ty: 4,
    nm: input.name,
    sr: 1,
    ks: {
      o: transform.o ?? still(100),
      r: transform.r ?? still(0),
      p: transform.p ?? still([CENTER, CENTER, 0]),
      a: still([0, 0, 0]),
      s: transform.s ?? still([100, 100, 100]),
    },
    ao: 0,
    shapes: input.shapes,
    ip: 0,
    op: input.op,
    st: 0,
    bm: 0,
  };
}

/** A Lottie document: the shape lottie-react-native's AnimationObject takes. */
export interface LottieComposition {
  v: string;
  nm: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  ddd: number;
  assets: unknown[];
  layers: unknown[];
}

function composition(name: string, op: number, layers: unknown[]): LottieComposition {
  return { v: "5.7.4", nm: name, fr: FPS, ip: 0, op, w: SIZE, h: SIZE, ddd: 0, assets: [], layers };
}

/** Rays around a circle: each a short line from `from` to `to` px off the centre. */
function rays(count: number, from: number, to: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return path([
      [cos * from, sin * from],
      [cos * to, sin * to],
    ]);
  });
}

function pop(from: number, peak: number, to: number) {
  return animate(
    [
      [from, [0, 0, 100]],
      [peak, [112, 112, 100]],
      [to, [100, 100, 100]],
    ],
    BACK_OUT,
  );
}

function success(palette: LottiePalette) {
  const op = 66;
  const green = rgba(palette.success);
  return composition("success", op, [
    layer({
      index: 1,
      name: "tick",
      op,
      shapes: [
        group("tick", [
          path([
            [-26, 2],
            [-8, 20],
            [28, -18],
          ]),
          trim(
            still(0),
            animate([
              [14, 0],
              [32, 100],
            ]),
          ),
          stroke(rgba(palette.core ?? palette.foreground), 11),
        ]),
      ],
    }),
    layer({
      index: 2,
      name: "disc",
      op,
      transform: { s: pop(0, 14, 22) },
      shapes: [group("disc", [ellipse(118), fill(green)])],
    }),
    layer({
      index: 3,
      name: "rays",
      op,
      shapes: [
        group("rays", [
          ...rays(8, 70, 92),
          trim(
            animate([
              [26, 0],
              [46, 100],
            ]),
            animate([
              [20, 0],
              [36, 100],
            ]),
          ),
          stroke(green, 6),
        ]),
      ],
    }),
  ]);
}

function loading(palette: LottiePalette) {
  const op = 60;
  const accent = rgba(palette.accent);
  return composition("loading", op, [
    layer({
      index: 1,
      name: "arc",
      op,
      transform: {
        r: animate(
          [
            [0, 0],
            [op, 360],
          ],
          LINEAR,
        ),
      },
      shapes: [
        group("arc", [
          ellipse(120),
          trim(
            animate([
              [28, 0],
              [58, 72],
            ]),
            animate([
              [0, 6],
              [30, 78],
            ]),
          ),
          stroke(accent, 12),
        ]),
      ],
    }),
    layer({
      index: 2,
      name: "track",
      op,
      shapes: [group("track", [ellipse(120), stroke(rgba(palette.accent, 0.18), 12)])],
    }),
  ]);
}

/** A deterministic sequence in [0, 1), so the confetti falls the same way every time. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function confetti(palette: LottiePalette, op: number, firstIndex: number) {
  const random = seeded(7);
  const colors = [
    palette.accent,
    palette.success,
    palette.warning,
    palette.danger,
    palette.core ?? palette.foreground,
  ];
  return Array.from({ length: 22 }, (_, index) => {
    const angle = random() * Math.PI * 2;
    const distance = 52 + random() * 46;
    const x = CENTER + Math.cos(angle) * distance;
    const y = CENTER + Math.sin(angle) * distance;
    const spin = (random() - 0.5) * 720;
    const color = rgba(colors[index % colors.length]!);
    const start = 4 + Math.round(random() * 6);
    return layer({
      index: firstIndex + index,
      name: `confetti ${index + 1}`,
      op,
      transform: {
        p: {
          s: true,
          x: animate([
            [start, CENTER],
            [start + 26, x],
          ]),
          y: animate([
            [start, CENTER],
            [start + 26, y],
            [op, y + 34],
          ]),
        },
        r: animate([
          [start, 0],
          [op, spin],
        ]),
        o: animate([
          [start, 100],
          [op - 22, 100],
          [op, 0],
        ]),
      },
      shapes: [
        group("piece", [index % 3 === 0 ? ellipse(8) : rect(6 + (index % 2) * 4, 10), fill(color)]),
      ],
    });
  });
}

function win(palette: LottiePalette) {
  const op = 90;
  const gold = rgba(palette.warning);
  return composition("win", op, [
    layer({
      index: 1,
      name: "star",
      op,
      transform: {
        s: pop(0, 18, 28),
        r: animate([
          [0, -40],
          [28, 0],
        ]),
      },
      shapes: [group("star", [star(46, 20), fill(gold)])],
    }),
    layer({
      index: 2,
      name: "glow",
      op,
      transform: {
        s: animate([
          [6, [40, 40, 100]],
          [40, [150, 150, 100]],
        ]),
        o: animate([
          [6, 70],
          [40, 0],
        ]),
      },
      shapes: [group("glow", [ellipse(110), stroke(gold, 6)])],
    }),
    ...confetti(palette, op, 3),
  ]);
}

function error(palette: LottiePalette) {
  const op = 52;
  const red = rgba(palette.danger);
  const white = rgba(palette.core ?? palette.foreground);
  const shake = animate([
    [20, CENTER],
    [24, CENTER - 9],
    [28, CENTER + 8],
    [32, CENTER - 5],
    [36, CENTER + 3],
    [40, CENTER],
  ]);
  return composition("error", op, [
    layer({
      index: 1,
      name: "cross",
      op,
      transform: { p: { s: true, x: shake, y: still(CENTER) } },
      shapes: [
        group("cross", [
          path([
            [-20, -20],
            [20, 20],
          ]),
          path([
            [20, -20],
            [-20, 20],
          ]),
          trim(
            still(0),
            animate([
              [12, 0],
              [26, 100],
            ]),
          ),
          stroke(white, 11),
        ]),
      ],
    }),
    layer({
      index: 2,
      name: "disc",
      op,
      transform: { s: pop(0, 12, 20), p: { s: true, x: shake, y: still(CENTER) } },
      shapes: [group("disc", [ellipse(118), fill(red)])],
    }),
  ]);
}

const BUILDERS: Record<LottieName, (palette: LottiePalette) => LottieComposition> = {
  success,
  loading,
  win,
  error,
};

const cache = new Map<string, LottieComposition>();

/** The animation as a Lottie JSON object, in the theme's colours (built once per palette). */
export function lottieAnimation(name: LottieName, palette: LottiePalette): LottieComposition {
  const key = `${name}:${palette.accent}:${palette.success}:${palette.warning}:${palette.danger}:${palette.core ?? palette.foreground}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const built = BUILDERS[name](palette);
  cache.set(key, built);
  return built;
}

/** Whether it plays once (a moment) or loops (a wait). */
export function lottieLoops(name: LottieName): boolean {
  return name === "loading";
}
