import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import Animated, {
  createAnimatedComponent,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import Svg, { Circle, Defs, G, RadialGradient, Stop } from "react-native-svg";
import { type StagePalette, useStagePalette } from "../palette";

// The brand's dot field (docs/brand.md, Fluctuation): a still field of dots, pulled toward a warm
// core, with colour born where it bends — the warm ring next to the core, the spectrum rings
// around it, the blue field beyond. The stage draws it in three sizes: a field behind a verdict or
// a cover, a dotted rule between parts of a tab, and a single dot that marks a row. The field
// opens the way the mark breathes: the core first, then each ring outwards, once.

const RING_DELAY_MS = 120;
const RING_FADE_MS = 520;
const CORE_MS = 700;
const RINGS = 5;
const MIN_RADIUS = 0.5;

interface FieldDot {
  key: string;
  x: number;
  y: number;
  r: number;
  ring: number;
  color: string;
  opacity: number;
}

/** The ring-2 colour by direction, as on the mark: rose on the axes, violet on the diagonals. */
function ringTwoColor(palette: StagePalette, dx: number, dy: number): string {
  const angle = Math.abs(Math.atan2(dy, dx)) % (Math.PI / 2);
  const offAxis = Math.min(angle, Math.PI / 2 - angle) / (Math.PI / 4);
  if (offAxis < 0.35) return palette.rose;
  if (offAxis < 0.75) return palette.orchid;
  return palette.violet;
}

/**
 * The dots of a field `width` × `height`, every one pulled toward the core by an amount that
 * falls off with distance, coloured by its ring. `toneColor` is the ring next to the core.
 */
export function fieldDots(input: {
  width: number;
  height: number;
  core: { x: number; y: number };
  spacing: number;
  palette: StagePalette;
  toneColor: string;
}): FieldDot[] {
  const { width, height, core, spacing, palette, toneColor } = input;
  const dots: FieldDot[] = [];
  const columns = Math.floor(width / spacing);
  const rows = Math.floor(height / spacing);
  const left = (width - (columns - 1) * spacing) / 2;
  const top = (height - (rows - 1) * spacing) / 2;
  const reach = Math.max(width, height);
  // The core sits on a grid point, so its rings are whole, as on the mark.
  const coreX = left + Math.round((core.x - left) / spacing) * spacing;
  const coreY = top + Math.round((core.y - top) / spacing) * spacing;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = left + column * spacing;
      const y = top + row * spacing;
      const dx = x - coreX;
      const dy = y - coreY;
      const distance = Math.hypot(dx, dy);
      if (distance < spacing * 0.9) continue;
      const pull = 1 - 0.4 * Math.exp(-distance / (spacing * 2.2));
      const ring = ringOf(distance / spacing);
      const inner = ring <= 2;
      dots.push({
        key: `${row}:${column}`,
        x: coreX + dx * pull,
        y: coreY + dy * pull,
        r: inner ? spacing * 0.17 : spacing * 0.12,
        ring,
        color: ringColor({ ring, palette, toneColor, dx, dy }),
        opacity: inner ? 1 : 0.18 + 0.5 * Math.exp(-distance / (reach * 0.45)),
      });
    }
  }
  return dots;
}

function ringOf(steps: number): number {
  if (steps < 1.6) return 1;
  if (steps < 2.9) return 2;
  if (steps < 4.2) return 3;
  return 4;
}

/** The grid point nearest to `value` on a field of `size` with dots every `spacing`. */
export function snapToGrid(value: number, size: number, spacing: number): number {
  const count = Math.floor(size / spacing);
  const start = (size - (count - 1) * spacing) / 2;
  return start + Math.round((value - start) / spacing) * spacing;
}

function ringColor(input: {
  ring: number;
  palette: StagePalette;
  toneColor: string;
  dx: number;
  dy: number;
}): string {
  const { ring, palette, toneColor, dx, dy } = input;
  if (ring === 1) return toneColor;
  if (ring === 2) return ringTwoColor(palette, dx, dy);
  if (ring === 3) return palette.violet;
  return palette.field;
}

const AnimatedG = createAnimatedComponent(G);
const AnimatedCircle = createAnimatedComponent(Circle);

function useRingOpacity(ring: number, play: boolean): SharedValue<number> {
  const value = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) {
      value.value = 1;
      return;
    }
    value.value = withDelay(
      ring * RING_DELAY_MS,
      withTiming(1, { duration: RING_FADE_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [play, ring, value]);
  return value;
}

function Ring({ dots, opacity }: { dots: FieldDot[]; opacity: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));
  return (
    <AnimatedG animatedProps={animatedProps}>
      {dots.map((dot) => (
        <Circle
          key={dot.key}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={dot.color}
          opacity={dot.opacity}
        />
      ))}
    </AnimatedG>
  );
}

function Core({
  x,
  y,
  radius,
  color,
  glow,
  play,
}: {
  x: number;
  y: number;
  radius: number;
  color: string;
  glow: string;
  play: boolean;
}) {
  const grow = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) {
      grow.value = 1;
      return;
    }
    grow.value = withTiming(1, { duration: CORE_MS, easing: Easing.bezier(0.3, 1.4, 0.5, 1) });
  }, [play, grow]);
  // Never a zero radius: Android's RadialGradient throws on one and takes the app down.
  const coreProps = useAnimatedProps(() => ({ r: Math.max(radius * grow.value, MIN_RADIUS) }));
  const haloProps = useAnimatedProps(() => ({ r: Math.max(radius * 7 * grow.value, MIN_RADIUS) }));
  return (
    <>
      <AnimatedCircle cx={x} cy={y} fill={glow} animatedProps={haloProps} />
      <AnimatedCircle cx={x} cy={y} fill={color} animatedProps={coreProps} />
    </>
  );
}

/**
 * A field of dots bent toward a warm core at (`coreX`, `coreY`) in fractions of the box. It fills
 * its parent; put it behind content with `absoluteFill`.
 */
export function DotField({
  coreX,
  coreY,
  spacing = 16,
  toneColor,
  bloom = true,
  testID,
}: {
  coreX: number;
  coreY: number;
  spacing?: number;
  toneColor?: string;
  bloom?: boolean;
  testID?: string;
}) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }, []);
  const play = bloom && !reduceMotion && size.width > 0;
  const core = useMemo(
    () => ({
      x: snapToGrid(size.width * coreX, size.width, spacing),
      y: snapToGrid(size.height * coreY, size.height, spacing),
    }),
    [size.width, size.height, coreX, coreY, spacing],
  );
  const tone = toneColor ?? palette.warm;
  const rings = useMemo(() => {
    const dots = fieldDots({ ...size, core, spacing, palette, toneColor: tone });
    return Array.from({ length: RINGS }, (_, ring) => dots.filter((dot) => dot.ring === ring));
  }, [size, core, spacing, palette, tone]);
  const opacities = [
    useRingOpacity(0, play),
    useRingOpacity(1, play),
    useRingOpacity(2, play),
    useRingOpacity(3, play),
    useRingOpacity(4, play),
  ];
  const haloId = `stage-halo-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const halo = `url(#${haloId})`;
  return (
    <View style={styles.fill} onLayout={onLayout} pointerEvents="none" testID={testID}>
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <RadialGradient id={haloId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={tone} stopOpacity={0.34} />
              <Stop offset="0.45" stopColor={tone} stopOpacity={0.1} />
              <Stop offset="1" stopColor={tone} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Core
            x={core.x}
            y={core.y}
            radius={spacing * 0.36}
            color={palette.core}
            glow={halo}
            play={play}
          />
          {rings.map((dots, ring) =>
            ring === 0 ? null : (
              <Ring key={RING_KEYS[ring]} dots={dots} opacity={opacities[ring]} />
            ),
          )}
        </Svg>
      ) : null}
    </View>
  );
}

const RING_KEYS = ["core", "warm", "spectrum", "violet", "field"];

const RULE_SPACING = 9;

/**
 * A dotted rule: one line of the field, bent up a little where its core sits (`at`, 0–1) and
 * coloured from there. With `draw`, it draws itself on from the left.
 */

function ruleDotRadius(steps: number, near: boolean): number {
  if (steps === 0) return 2.6;
  return near ? 1.8 : 1.3;
}
export function DotRule({
  at = 0,
  toneColor,
  draw = true,
  delay = 0,
}: {
  at?: number;
  toneColor?: string;
  draw?: boolean;
  delay?: number;
}) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const reveal = useSharedValue(draw && !reduceMotion ? 0 : 1);
  useEffect(() => {
    if (!draw || reduceMotion || width === 0) {
      reveal.value = 1;
      return;
    }
    reveal.value = withDelay(
      delay,
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [draw, reduceMotion, width, delay, reveal]);
  const revealStyle = useAnimatedStyle(() => ({ width: width * reveal.value }));
  const tone = toneColor ?? palette.warm;
  const dots = useMemo(
    () => ruleDots({ width, at, palette, toneColor: tone }),
    [width, at, palette, tone],
  );
  return (
    <View style={styles.rule} onLayout={onLayout} pointerEvents="none">
      <Animated.View style={[styles.ruleReveal, revealStyle]}>
        {width > 0 ? (
          <Svg width={width} height={RULE_HEIGHT}>
            {dots.map((dot) => (
              <Circle
                key={dot.key}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dot.color}
                opacity={dot.opacity}
              />
            ))}
          </Svg>
        ) : null}
      </Animated.View>
    </View>
  );
}

const RULE_HEIGHT = 14;

function ruleDots(input: {
  width: number;
  at: number;
  palette: StagePalette;
  toneColor: string;
}): FieldDot[] {
  const { width, at, palette, toneColor } = input;
  const count = Math.floor(width / RULE_SPACING);
  const coreX = width * at;
  const rings = [palette.core, toneColor, palette.rose, palette.violet];
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const x = RULE_SPACING / 2 + index * RULE_SPACING;
    const steps = Math.round(Math.abs(x - coreX) / RULE_SPACING);
    const near = steps < rings.length;
    return {
      key: String(index),
      x,
      y: RULE_HEIGHT / 2 - (near ? (rings.length - steps) * 0.6 : 0),
      r: ruleDotRadius(steps, near),
      ring: Math.min(4, steps),
      color: near ? rings[steps] : palette.field,
      opacity: near ? 1 : 0.25 + 0.45 * Math.exp(-steps / 14),
    };
  });
}

/** One dot of the field: the marker of a row, a step, a column. */
export function SpectrumDot({
  color,
  size = 8,
  hollow = false,
}: {
  color: string;
  size?: number;
  hollow?: boolean;
}) {
  const style = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: hollow ? "transparent" : color,
      borderWidth: hollow ? 1.5 : 0,
      borderColor: color,
      shadowColor: color,
    }),
    [size, color, hollow],
  );
  return <View style={[styles.dot, hollow ? null : styles.dotLit, style]} />;
}

/** A soft glow of `color` behind a number or a word: colour born at the bending point. */
export function CoreGlow({ color, size: rawSize = 180 }: { color: string; size?: number }) {
  const size = Math.max(rawSize, 1);
  const id = `stage-glow-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const style = useMemo(
    () => ({ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }),
    [size],
  );
  return (
    <View style={[styles.glow, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={0.26} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.07} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  rule: {
    height: RULE_HEIGHT,
    marginVertical: theme.spacing[2],
  },
  ruleReveal: {
    height: RULE_HEIGHT,
    overflow: "hidden",
  },
  dot: {
    flexShrink: 0,
  },
  dotLit: {
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  glow: {
    position: "absolute",
    left: "50%",
    top: "50%",
  },
}));
