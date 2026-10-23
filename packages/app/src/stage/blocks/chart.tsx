import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import {
  createAnimatedComponent,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  type ChartFrame,
  type ValueScale,
  compactNumber,
  pieSlices,
  polylineLength,
  smoothPath,
  valueScale,
  xOf,
  yOf,
} from "../chart-geometry";
import { type StageBlockNode, uniqueKeys } from "../model";
import { seriesColors, useStagePalette, withAlpha } from "../palette";
import { STAGE_FONT } from "../type";
import { BlockTitle, MutedLine, Panel, arr, num, rec, str } from "./primitives";

// show_chart drawn natively. A line draws itself on and its area fades in under it; bars grow
// from the axis; a pie sweeps round. When Zuri re-sends the chart with new numbers, the shapes
// glide from the old values to the new ones instead of redrawing.

const AnimatedPath = createAnimatedComponent(Path);
const AnimatedRect = createAnimatedComponent(Rect);
const AnimatedCircle = createAnimatedComponent(Circle);

const CHART_HEIGHT = 190;
const AXIS_WIDTH = 34;
const X_LABEL_HEIGHT = 18;
const DRAW_MS = 1100;
const MORPH_MS = 700;
const OUT = Easing.out(Easing.cubic);

interface Series {
  name: string;
  values: number[];
}

function readSeries(props: Record<string, unknown>): Series[] {
  return arr(props.series).map((entry) => {
    const series = rec(entry);
    return {
      name: str(series.name, 40),
      values: arr(series.values).map((value) => num(value) ?? 0),
    };
  });
}

function useTimed(target: number, delay: number, duration: number, initial: number) {
  const reduceMotion = useReducedMotion();
  const value = useSharedValue(reduceMotion ? target : initial);
  useEffect(() => {
    value.value = reduceMotion
      ? target
      : withDelay(delay, withTiming(target, { duration, easing: OUT }));
  }, [target, delay, duration, reduceMotion, value]);
  return value;
}

/** Points that glide from their last place to new values; a changed count snaps. */
function useMorphingYs(ys: number[]): {
  from: SharedValue<number[]>;
  to: SharedValue<number[]>;
  t: SharedValue<number>;
} {
  const reduceMotion = useReducedMotion();
  const from = useSharedValue(ys);
  const to = useSharedValue(ys);
  const t = useSharedValue(1);
  const key = ys.join(",");
  const lastKeyRef = useRef(key);
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    const next = key.split(",").map(Number);
    const sameCount = to.value.length === next.length;
    from.value = sameCount && !reduceMotion ? to.value : next;
    to.value = next;
    t.value = 0;
    t.value = withTiming(1, { duration: reduceMotion ? 0 : MORPH_MS, easing: OUT });
  }, [key, from, to, t, reduceMotion]);
  return { from, to, t };
}

function LineSeries({
  xs,
  ys,
  baseY,
  color,
  index,
}: {
  xs: number[];
  ys: number[];
  baseY: number;
  color: string;
  index: number;
}) {
  const gradientId = `area${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { from, to, t } = useMorphingYs(ys);
  const draw = useTimed(1, index * 160, DRAW_MS, 0);
  const length = polylineLength(xs, ys) * 1.25 + 40;
  const dash = useMemo(() => [length, length], [length]);
  const lineProps = useAnimatedProps(() => {
    const current = to.value.map(
      (y, i) => (from.value[i] ?? y) + (y - (from.value[i] ?? y)) * t.value,
    );
    return { d: smoothPath(xs, current), strokeDashoffset: length * (1 - draw.value) };
  });
  const areaProps = useAnimatedProps(() => {
    const current = to.value.map(
      (y, i) => (from.value[i] ?? y) + (y - (from.value[i] ?? y)) * t.value,
    );
    const first = xs[0] ?? 0;
    const last = xs[xs.length - 1] ?? 0;
    return {
      d: `${smoothPath(xs, current)} L${last},${baseY} L${first},${baseY} Z`,
      opacity: draw.value,
    };
  });
  return (
    <G>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.34} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <AnimatedPath fill={`url(#${gradientId})`} animatedProps={areaProps} />
      <AnimatedPath
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
        animatedProps={lineProps}
      />
    </G>
  );
}

function Axis({ scale, frame, width }: { scale: ValueScale; frame: ChartFrame; width: number }) {
  const palette = useStagePalette();
  const grid = withAlpha(palette.foregroundMuted, 0.18);
  return (
    <G>
      {scale.ticks.map((tick) => {
        const y = yOf(tick, scale, frame);
        return (
          <G key={String(tick)}>
            <Line x1={frame.left} x2={width} y1={y} y2={y} stroke={grid} strokeWidth={1} />
            <SvgText
              x={frame.left - 6}
              y={y + 4}
              fontSize={10}
              fill={palette.foregroundMuted}
              textAnchor="end"
            >
              {compactNumber(tick)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

function XLabels({
  labels,
  frame,
  centered,
}: {
  labels: string[];
  frame: ChartFrame;
  centered: boolean;
}) {
  const palette = useStagePalette();
  const step = Math.max(1, Math.ceil(labels.length / 5));
  const keys = uniqueKeys(labels);
  const y = frame.top + frame.height + 14;
  return (
    <G>
      {labels.map((label, index) => {
        if (index % step !== 0 && index !== labels.length - 1) return null;
        const x = centered
          ? frame.left + ((index + 0.5) / labels.length) * frame.width
          : xOf(index, labels.length, frame);
        return (
          <SvgText
            key={keys[index]}
            x={x}
            y={y}
            fontSize={10}
            fill={palette.foregroundMuted}
            textAnchor="middle"
          >
            {label.length > 9 ? `${label.slice(0, 8)}…` : label}
          </SvgText>
        );
      })}
    </G>
  );
}

function chartFrame(width: number): ChartFrame {
  return {
    left: AXIS_WIDTH,
    top: 8,
    width: Math.max(10, width - AXIS_WIDTH - 6),
    height: CHART_HEIGHT - 8 - X_LABEL_HEIGHT,
  };
}

function LineChart({ x, series, width }: { x: string[]; series: Series[]; width: number }) {
  const palette = useStagePalette();
  const colors = seriesColors(palette);
  const frame = chartFrame(width);
  const scale = valueScale(
    series.flatMap((entry) => entry.values),
    false,
  );
  const xs = x.map((_, index) => xOf(index, x.length, frame));
  const keys = uniqueKeys(series.map((entry) => entry.name));
  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Axis scale={scale} frame={frame} width={width} />
      {series.map((entry, index) => (
        <LineSeries
          key={keys[index]}
          xs={xs}
          ys={entry.values.map((value) => yOf(value, scale, frame))}
          baseY={frame.top + frame.height}
          color={colors[index % colors.length] ?? palette.accent}
          index={index}
        />
      ))}
      <XLabels labels={x} frame={frame} centered={false} />
    </Svg>
  );
}

function BarRect({
  x,
  width,
  top,
  base,
  color,
  delay,
}: {
  x: number;
  width: number;
  top: number;
  base: number;
  color: string;
  delay: number;
}) {
  const edge = useTimed(top, delay, MORPH_MS + 200, base);
  const props = useAnimatedProps(() => ({
    y: Math.min(edge.value, base),
    height: Math.max(1, Math.abs(base - edge.value)),
  }));
  return (
    <AnimatedRect
      x={x}
      width={width}
      rx={Math.min(5, width / 3)}
      fill={color}
      animatedProps={props}
    />
  );
}

interface BarShape {
  key: string;
  x: number;
  width: number;
  top: number;
  base: number;
  color: string;
  delay: number;
}

function barShapes(input: {
  x: string[];
  series: Series[];
  stacked: boolean;
  frame: ChartFrame;
  scale: ValueScale;
  colors: string[];
}): BarShape[] {
  const { x, series, stacked, frame, scale, colors } = input;
  const slot = frame.width / Math.max(1, x.length);
  const inner = slot * 0.72;
  const each = stacked ? inner : inner / Math.max(1, series.length);
  const shapes: BarShape[] = [];
  x.forEach((label, xi) => {
    let stackBase = 0;
    series.forEach((entry, si) => {
      const value = entry.values[xi] ?? 0;
      const from = stacked ? stackBase : 0;
      const to = from + value;
      stackBase = stacked ? to : 0;
      shapes.push({
        key: `${label}|${entry.name}|${xi}|${si}`,
        x: frame.left + xi * slot + (slot - inner) / 2 + (stacked ? 0 : si * each),
        width: Math.max(2, each - 3),
        top: yOf(to, scale, frame),
        base: yOf(from, scale, frame),
        color: colors[si % colors.length] ?? colors[0] ?? "",
        delay: Math.min(xi, 12) * 50 + si * 30,
      });
    });
  });
  return shapes;
}

function BarChart({
  x,
  series,
  stacked,
  width,
}: {
  x: string[];
  series: Series[];
  stacked: boolean;
  width: number;
}) {
  const palette = useStagePalette();
  const frame = chartFrame(width);
  const totals = stacked
    ? x.map((_, xi) => series.reduce((sum, entry) => sum + (entry.values[xi] ?? 0), 0))
    : series.flatMap((entry) => entry.values);
  const scale = valueScale(totals, true);
  const shapes = barShapes({ x, series, stacked, frame, scale, colors: seriesColors(palette) });
  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Axis scale={scale} frame={frame} width={width} />
      {shapes.map((shape) => (
        <BarRect
          key={shape.key}
          x={shape.x}
          width={shape.width}
          top={shape.top}
          base={shape.base}
          color={shape.color}
          delay={shape.delay}
        />
      ))}
      <XLabels labels={x} frame={frame} centered />
    </Svg>
  );
}

function PieSlice({
  start,
  share,
  radius,
  center,
  stroke,
  color,
  sweep,
}: {
  start: number;
  share: number;
  radius: number;
  center: number;
  stroke: number;
  color: string;
  sweep: SharedValue<number>;
}) {
  const circumference = 2 * Math.PI * radius;
  const dash = useMemo(() => [circumference, circumference], [circumference]);
  const gap = share > 0.02 ? 3 : 0;
  const props = useAnimatedProps(() => {
    const shown = Math.min(Math.max(sweep.value - start, 0), share) * circumference;
    return { strokeDashoffset: circumference - Math.max(0, shown - gap) };
  });
  return (
    <G rotation={-90 + start * 360} originX={center} originY={center}>
      <AnimatedCircle
        cx={center}
        cy={center}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={dash}
        fill="none"
        animatedProps={props}
      />
    </G>
  );
}

function PieChart({ x, series }: { x: string[]; series: Series[] }) {
  const palette = useStagePalette();
  const colors = seriesColors(palette);
  const slices = pieSlices(x, series[0]?.values ?? []);
  const sweep = useTimed(1, 0, DRAW_MS + 200, 0);
  const size = 170;
  const stroke = 30;
  const center = size / 2;
  const top = slices.reduce<(typeof slices)[number] | null>(
    (best, slice) => (best && best.share >= slice.share ? best : slice),
    null,
  );
  const keys = uniqueKeys(slices.map((slice) => slice.label));
  const sizeStyle = useMemo(() => ({ width: size, height: size }), []);
  return (
    <View style={[styles.pie, sizeStyle]}>
      <Svg width={size} height={size}>
        {slices.map((slice, index) => (
          <PieSlice
            key={keys[index]}
            start={slice.start}
            share={slice.share}
            radius={center - stroke / 2}
            center={center}
            stroke={stroke}
            color={colors[index % colors.length] ?? palette.accent}
            sweep={sweep}
          />
        ))}
      </Svg>
      {top ? (
        <View style={styles.pieCenter} pointerEvents="none">
          <Text style={styles.pieValue}>{`${Math.round(top.share * 100)}%`}</Text>
          <Text style={styles.pieLabel} numberOfLines={1}>
            {top.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ names, shares }: { names: string[]; shares: number[] | null }) {
  const palette = useStagePalette();
  const colors = seriesColors(palette);
  const keys = uniqueKeys(names);
  if (names.length < 2 && !shares) return null;
  return (
    <View style={styles.legend}>
      {names.map((name, index) => (
        <LegendItem
          key={keys[index]}
          name={name}
          color={colors[index % colors.length] ?? palette.accent}
          share={shares ? (shares[index] ?? 0) : null}
        />
      ))}
    </View>
  );
}

function LegendItem({ name, color, share }: { name: string; color: string; share: number | null }) {
  const dotStyle = useMemo(() => ({ backgroundColor: color }), [color]);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, dotStyle]} />
      <Text style={styles.legendText} numberOfLines={1}>
        {share === null ? name : `${name} · ${Math.round(share * 100)}%`}
      </Text>
    </View>
  );
}

function ChartBody({ props, width }: { props: Record<string, unknown>; width: number }) {
  const x = arr(props.x).map((label) => str(label, 40));
  const series = readSeries(props);
  if (props.kind === "pie") {
    const slices = pieSlices(x, series[0]?.values ?? []);
    return (
      <>
        <PieChart x={x} series={series} />
        <Legend names={x} shares={slices.map((slice) => slice.share)} />
      </>
    );
  }
  const names = series.map((entry) => entry.name);
  if (width <= 0) return null;
  return (
    <>
      {props.kind === "bar" ? (
        <BarChart x={x} series={series} stacked={props.stacked === true} width={width} />
      ) : (
        <LineChart x={x} series={series} width={width} />
      )}
      <Legend names={names} shares={null} />
    </>
  );
}

export function ChartBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(props.title, 120)} />
      <View style={styles.canvas} onLayout={onLayout}>
        <ChartBody props={props} width={width} />
      </View>
      {props.kind === "pie" ? null : <MutedLine text={str(props.yLabel, 20)} />}
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  canvas: {
    minHeight: CHART_HEIGHT,
  },
  pie: {
    alignSelf: "center",
    marginVertical: theme.spacing[2],
  },
  pieCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  pieValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: theme.fontSize["4xl"],
  },
  pieLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    marginTop: theme.spacing[3],
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    maxWidth: "100%",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  legendText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
