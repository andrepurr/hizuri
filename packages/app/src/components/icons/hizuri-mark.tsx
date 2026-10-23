import { useEffect } from "react";
import {
  createAnimatedComponent,
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

// hizuri: the brand mark, "Fluctuation — Spectrum" (brand book round 4): a 7×7 field of dots
// pulled toward the centre, coloured from the warm core out to the blue field. Drawn from the
// round-4 symbol geometry. With `animated`, the rings breathe from the core outwards — the one
// authored motion of the brand; it stays still when the system asks for reduced motion.

/**
 * The brand's colours, read off the mark: the warm-white core, the warm ring, the spectrum rings
 * and the blue field (brand book: “a warm core, spectrum colours spreading out to the blue field”).
 * Every coloured thing outside the interface chrome (the Show stage) takes its colour from here.
 */
export const MARK_SPECTRUM = {
  core: "#FFF3E2",
  warm: "#FFB45C",
  rose: "#FF6F91",
  orchid: "#E573B0",
  violet: "#A47DFF",
  field: "#5680D5",
} as const;

const { core: C, warm: W, rose: R, orchid: O, violet: V, field: F } = MARK_SPECTRUM;

type Dot = readonly [
  cx: number,
  cy: number,
  r: number,
  fill: string,
  opacity: number,
  ring: number,
];

const DOTS: readonly Dot[] = [
  [11.94, 11.94, 2.05, F, 0.6, 3],
  [11.645, 24.43, 2.05, F, 0.6, 3],
  [11.297, 37.099, 2.05, F, 0.6, 3],
  [11.121, 50, 2.05, F, 0.6, 3],
  [11.297, 62.901, 2.05, F, 0.6, 3],
  [11.645, 75.57, 2.05, F, 0.6, 3],
  [11.94, 88.06, 2.05, F, 0.6, 3],
  [24.43, 11.645, 2.05, F, 0.6, 3],
  [23.928, 23.928, 2.05, V, 1, 2],
  [23.025, 36.513, 2.05, O, 1, 2],
  [22.361, 50, 2.05, R, 1, 2],
  [23.025, 63.487, 2.05, O, 1, 2],
  [23.928, 76.072, 2.05, V, 1, 2],
  [24.43, 88.355, 2.05, F, 0.6, 3],
  [37.099, 11.297, 2.05, F, 0.6, 3],
  [36.513, 23.025, 2.05, O, 1, 2],
  [34.251, 34.251, 2.6, W, 1, 1],
  [29.5, 50, 2.6, W, 1, 1],
  [34.251, 65.749, 2.6, W, 1, 1],
  [36.513, 76.975, 2.05, O, 1, 2],
  [37.099, 88.703, 2.05, F, 0.6, 3],
  [50, 11.121, 2.05, F, 0.6, 3],
  [50, 22.361, 2.05, R, 1, 2],
  [50, 29.5, 2.6, W, 1, 1],
  [50, 70.5, 2.6, W, 1, 1],
  [50, 77.639, 2.05, R, 1, 2],
  [50, 88.879, 2.05, F, 0.6, 3],
  [62.901, 11.297, 2.05, F, 0.6, 3],
  [63.487, 23.025, 2.05, O, 1, 2],
  [65.749, 34.251, 2.6, W, 1, 1],
  [70.5, 50, 2.6, W, 1, 1],
  [65.749, 65.749, 2.6, W, 1, 1],
  [63.487, 76.975, 2.05, O, 1, 2],
  [62.901, 88.703, 2.05, F, 0.6, 3],
  [75.57, 11.645, 2.05, F, 0.6, 3],
  [76.072, 23.928, 2.05, V, 1, 2],
  [76.975, 36.513, 2.05, O, 1, 2],
  [77.639, 50, 2.05, R, 1, 2],
  [76.975, 63.487, 2.05, O, 1, 2],
  [76.072, 76.072, 2.05, V, 1, 2],
  [75.57, 88.355, 2.05, F, 0.6, 3],
  [88.06, 11.94, 2.05, F, 0.6, 3],
  [88.355, 24.43, 2.05, F, 0.6, 3],
  [88.703, 37.099, 2.05, F, 0.6, 3],
  [88.879, 50, 2.05, F, 0.6, 3],
  [88.703, 62.901, 2.05, F, 0.6, 3],
  [88.355, 75.57, 2.05, F, 0.6, 3],
  [88.06, 88.06, 2.05, F, 0.6, 3],
  [50, 50, 5, C, 1, 0],
];

const RING_DELAY_MS = 220;
const BREATH_MS = 1400;

const AnimatedCircle = createAnimatedComponent(Circle);

interface HizuriMarkProps {
  size?: number;
  /** One colour for every dot (small icons, masks). Default: the spectrum colours. */
  color?: string;
  /** Rings breathe from the core outwards. */
  animated?: boolean;
}

function BreathingDot({
  dot,
  color,
  phase,
}: {
  dot: Dot;
  color?: string;
  phase: SharedValue<number>;
}) {
  const [cx, cy, r, fill, opacity] = dot;
  const animatedProps = useAnimatedProps(() => ({
    r: r * (1 + 0.18 * phase.value),
    opacity: Math.min(1, opacity * (0.75 + 0.35 * phase.value)),
  }));
  return <AnimatedCircle cx={cx} cy={cy} fill={color ?? fill} animatedProps={animatedProps} />;
}

function useRingPhase(ring: number, enabled: boolean): SharedValue<number> {
  const phase = useSharedValue(0);
  useEffect(() => {
    if (!enabled) {
      phase.value = 0;
      return;
    }
    const ease = Easing.inOut(Easing.cubic);
    phase.value = withDelay(
      ring * RING_DELAY_MS,
      withRepeat(
        withSequence(
          withTiming(1, { duration: BREATH_MS, easing: ease }),
          withTiming(0, { duration: BREATH_MS, easing: ease }),
        ),
        -1,
      ),
    );
  }, [enabled, phase, ring]);
  return phase;
}

export function HizuriMark({ size = 64, color, animated = false }: HizuriMarkProps) {
  const reducedMotion = useReducedMotion();
  const breathe = animated && !reducedMotion;
  const phases = [
    useRingPhase(0, breathe),
    useRingPhase(1, breathe),
    useRingPhase(2, breathe),
    useRingPhase(3, breathe),
  ];

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      {DOTS.map((dot) =>
        breathe ? (
          <BreathingDot
            key={`${dot[0]}:${dot[1]}`}
            dot={dot}
            color={color}
            phase={phases[dot[5]]}
          />
        ) : (
          <Circle
            key={`${dot[0]}:${dot[1]}`}
            cx={dot[0]}
            cy={dot[1]}
            r={dot[2]}
            fill={color ?? dot[3]}
            opacity={color ? 1 : dot[4]}
          />
        ),
      )}
    </Svg>
  );
}
