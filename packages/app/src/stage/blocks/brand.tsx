import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingDown, TrendingUp } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { leadingMark } from "../emoji";
import { type StageBlockNode, uniqueKeys } from "../model";
import { type StageTone, toneColor, useStagePalette, withAlpha } from "../palette";
import { rowDelay } from "../motion";
import { STAGE_FONT } from "../type";
import { CARD_TONES } from "./basic";
import { useBlockEnterDelay } from "./block-enter";
import { EnteringRow, StepLine, useBreath, useReveal } from "./content";
import { CoreGlow, DotField, DotRule, SpectrumDot } from "./dots";
import { useStageBlockContext } from "./block-context";
import { resolveStageMediaUrl } from "./stage-media";
import { BlockTitle, CountText, MutedLine, Panel, arr, rec, str } from "./primitives";

// Unistyles styles never reach third-party views (LinearGradient, expo-image) on web
// (docs/unistyles.md): a wrapper View owns the layout and the view fills it.
const GRADIENT_FILL = { flex: 1 } as const;

// The blocks that give a tab its shape, drawn from the brand (docs/brand.md, Fluctuation):
// - verdict: the answer, blooming out of the warm core of a dot field;
// - figure: one big number in Geist Mono that counts up over a glow of the core;
// - compare: two columns, each in its own spectrum colour, and the call under them;
// - timeline: dated nodes on a line that draws itself down;
// - divider: one line of the field, bent where its core sits;
// - cover: the tab's opening — a picture, or the dot field — with a large light title.
// A tab built from them reads as a story with a top, a middle and an end, and two tabs stop
// looking alike. The first card of a tab with a kind and a lone number tile take the verdict and
// figure looks too, so tabs written before these blocks existed draw the same way.

const SAYS_TONES: Record<string, StageTone> = {
  yes: "success",
  no: "danger",
  careful: "warning",
  note: "merged",
};

const SIDE_TONES: Record<string, StageTone> = {
  plus: "success",
  minus: "danger",
  neutral: "accent",
};

/** Text that follows the field's bloom in: it waits for the core, then rises. */
function Following({ order, children }: { order: number; children: ReactNode }) {
  const blockDelay = useBlockEnterDelay();
  const style = useReveal(blockDelay === null ? null : rowDelay(order, blockDelay + 260));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function VerdictView({
  id,
  answer,
  why,
  source,
  tone,
  glow,
}: {
  id: string;
  answer: string;
  why: string;
  source: string;
  tone: StageTone | null;
  glow: boolean;
}) {
  const palette = useStagePalette();
  const color = toneColor(palette, tone ?? "success");
  const frame = useMemo(
    () => ({
      borderColor: withAlpha(color, 0.3),
      backgroundColor: withAlpha(palette.surface1, 0.9),
      shadowColor: color,
    }),
    [color, palette.surface1],
  );
  const wash = useMemo(
    () => [withAlpha(color, 0.14), withAlpha(color, 0.02), withAlpha(color, 0)] as const,
    [color],
  );
  return (
    <View
      style={[styles.verdict, frame, glow ? styles.verdictGlow : null]}
      testID={`stage-block-${id}`}
    >
      <View style={styles.fill} pointerEvents="none">
        <LinearGradient colors={wash} start={WASH_START} end={WASH_END} style={GRADIENT_FILL} />
      </View>
      <View style={styles.verdictField}>
        <DotField coreX={0.12} coreY={0.5} spacing={15} toneColor={color} />
      </View>
      <View style={styles.verdictBody}>
        <Following order={0}>
          <Text style={styles.verdictAnswer}>{leadingMark(answer).text}</Text>
        </Following>
        {why ? (
          <Following order={1}>
            <Text style={styles.verdictWhy}>{why}</Text>
          </Following>
        ) : null}
        {source ? (
          <Following order={2}>
            <Text style={styles.source}>{source}</Text>
          </Following>
        ) : null}
      </View>
    </View>
  );
}

const WASH_START = { x: 0, y: 0 } as const;
const WASH_END = { x: 0.8, y: 1 } as const;

export function VerdictBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  return (
    <VerdictView
      id={block.id}
      answer={str(props.answer, 160)}
      why={str(props.why, 600)}
      source={str(props.source, 200)}
      tone={SAYS_TONES[str(props.says, 10)] ?? null}
      glow={block.emphasis === "glow"}
    />
  );
}

/** The first card of a tab, when it carries a kind, is the tab's verdict. */
export function VerdictFromCard({ block }: { block: StageBlockNode }) {
  const { props } = block;
  return (
    <VerdictView
      id={block.id}
      answer={str(props.title, 120)}
      why={str(props.body, 4000)}
      source={str(props.footer, 200)}
      tone={CARD_TONES[str(props.kind, 20)] ?? null}
      glow={block.emphasis === "glow"}
    />
  );
}

function Delta({ delta }: { delta: Record<string, unknown> }) {
  const palette = useStagePalette();
  const text = str(delta.value, 40);
  const color = toneColor(palette, delta.good === true ? "success" : "danger");
  const colorStyle = useMemo(() => ({ color }), [color]);
  if (!text) return null;
  const Arrow = delta.direction === "down" ? TrendingDown : TrendingUp;
  return (
    <View style={styles.delta}>
      <Arrow size={15} color={color} strokeWidth={1.5} />
      <Text style={[styles.deltaText, colorStyle]}>{text}</Text>
    </View>
  );
}

export function FigureView({
  id,
  value,
  label,
  caption,
  delta,
  pulse,
}: {
  id: string;
  value: string;
  label: string;
  caption: string;
  delta: Record<string, unknown>;
  pulse: boolean;
}) {
  const palette = useStagePalette();
  return (
    <Panel pulseKey={value} glow={pulse} testID={`stage-block-${id}`}>
      <Text style={styles.figureLabel}>{label}</Text>
      <View style={styles.figureValueBox}>
        <View style={styles.figureGlow} pointerEvents="none">
          <CoreGlow color={palette.warm} size={220} />
        </View>
        <CountText text={value} style={styles.figureValue} />
      </View>
      <DotRule at={0.04} delay={240} />
      <Delta delta={delta} />
      <MutedLine text={caption} />
    </Panel>
  );
}

export function FigureBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  return (
    <FigureView
      id={block.id}
      value={str(props.value, 40)}
      label={str(props.label, 120)}
      caption={str(props.caption, 240)}
      delta={rec(props.delta)}
      pulse={block.emphasis === "glow"}
    />
  );
}

/** A number tile that stands alone in its row is the tab's big number. */
export function FigureFromStat({ block }: { block: StageBlockNode }) {
  const { props } = block;
  return (
    <FigureView
      id={block.id}
      value={str(props.value, 40)}
      label={str(props.label, 80)}
      caption={str(props.footer, 200)}
      delta={rec(props.delta)}
      pulse={block.emphasis === "glow"}
    />
  );
}

function CompareSide({
  side,
  fallbackTone,
  order,
}: {
  side: Record<string, unknown>;
  fallbackTone: StageTone;
  order: number;
}) {
  const palette = useStagePalette();
  const title = leadingMark(str(side.title, 80));
  const tone = SIDE_TONES[str(side.kind, 10)] ?? title.tone ?? fallbackTone;
  const color = toneColor(palette, tone);
  const items = arr(side.items).map((item) => str(item, 160));
  const keys = uniqueKeys(items);
  const ruleStyle = useMemo(() => ({ backgroundColor: color, shadowColor: color }), [color]);
  return (
    <View style={styles.side}>
      <View style={[styles.sideRule, ruleStyle]} />
      <Text style={styles.sideTitle}>{title.text}</Text>
      {items.map((item, index) => (
        <EnteringRow key={keys[index]} index={order + index * 2}>
          <View style={styles.sideItem}>
            <View style={styles.sideDot}>
              <SpectrumDot color={color} size={6} />
            </View>
            <Text style={styles.sideText}>{leadingMark(item).text}</Text>
          </View>
        </EnteringRow>
      ))}
    </View>
  );
}

export function CompareBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const verdict = str(props.verdict, 240);
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(props.title, 120)} />
      <View style={styles.sides}>
        <CompareSide side={rec(props.left)} fallbackTone="success" order={0} />
        <CompareSide side={rec(props.right)} fallbackTone="accent" order={1} />
      </View>
      {verdict ? (
        <>
          <DotRule at={0.5} delay={500} />
          <Text style={styles.compareVerdict}>{verdict}</Text>
        </>
      ) : null}
    </Panel>
  );
}

const TIMELINE_NODE = 14;
const WHEN_WIDTH = 64;

function TimelineNode({ state }: { state: string }) {
  const palette = useStagePalette();
  const now = state === "now";
  const breath = useBreath(now);
  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: now ? 1 + 0.25 * breath.value : 1 }],
  }));
  let color = palette.field;
  if (state === "past") color = palette.warm;
  if (now) color = palette.core;
  return (
    <Animated.View style={[styles.timelineNode, pulse]}>
      <SpectrumDot color={color} size={now ? 12 : 9} hollow={state === "next"} />
    </Animated.View>
  );
}

export function TimelineBlock({ block }: { block: StageBlockNode }) {
  const items = arr(block.props.items).map(rec);
  const keys = uniqueKeys(items.map((item) => `${str(item.when, 40)}${str(item.label, 160)}`));
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(block.props.title, 120)} />
      {items.map((item, index) => {
        const state = str(item.state, 10) || "next";
        const detail = str(item.detail, 240);
        return (
          <EnteringRow key={keys[index]} index={index}>
            <View style={styles.timelineRow}>
              {index === items.length - 1 ? null : (
                <StepLine
                  index={index}
                  lit={state === "past"}
                  left={WHEN_WIDTH + 12 + TIMELINE_NODE / 2 - 0.5}
                  top={TIMELINE_NODE + 6}
                />
              )}
              <Text style={styles.when} numberOfLines={2}>
                {str(item.when, 40)}
              </Text>
              <TimelineNode state={state} />
              <View style={styles.rowText}>
                <Text style={state === "next" ? styles.timelineLabelNext : styles.timelineLabel}>
                  {leadingMark(str(item.label, 160)).text}
                </Text>
                {detail ? <Text style={styles.timelineDetail}>{detail}</Text> : null}
              </View>
            </View>
          </EnteringRow>
        );
      })}
    </Panel>
  );
}

export function DividerBlock({ block }: { block: StageBlockNode }) {
  const label = str(block.props.label, 60);
  return (
    <View style={styles.divider} testID={`stage-block-${block.id}`}>
      {label ? <Text style={styles.dividerLabel}>{label}</Text> : null}
      <DotRule at={0} />
    </View>
  );
}

function coverImage(raw: string, origin: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("data:image/") ? raw : resolveStageMediaUrl(raw, origin);
}

const SCRIM_START = { x: 0, y: 0.5 } as const;
const SCRIM_END = { x: 0.75, y: 0.5 } as const;

export function CoverBlock({ block }: { block: StageBlockNode }) {
  const palette = useStagePalette();
  const { props } = block;
  const { mediaOrigin } = useStageBlockContext();
  const raw = str(props.image, 400_000);
  const image = coverImage(raw, mediaOrigin ?? null);
  const kicker = str(props.kicker, 60);
  const subtitle = str(props.subtitle, 240);
  const scrim = useMemo(
    () => [withAlpha(palette.background, 0), withAlpha(palette.background, 0.92)] as const,
    [palette.background],
  );
  // The field stays bright around its core on the right and calms under the words on the left.
  const fieldScrim = useMemo(
    () => [withAlpha(palette.background, 0.82), withAlpha(palette.background, 0)] as const,
    [palette.background],
  );
  return (
    <View style={styles.cover} testID={`stage-block-${block.id}`}>
      {image ? (
        <View style={styles.coverPicture}>
          <View style={styles.fill}>
            <Image source={image} style={GRADIENT_FILL} contentFit="cover" transition={400} />
          </View>
          <View style={styles.fill} pointerEvents="none">
            <LinearGradient colors={scrim} style={GRADIENT_FILL} />
          </View>
        </View>
      ) : (
        <View style={styles.coverField}>
          <DotField coreX={0.8} coreY={0.42} spacing={17} />
          <View style={styles.fill} pointerEvents="none">
            <LinearGradient
              colors={fieldScrim}
              start={SCRIM_START}
              end={SCRIM_END}
              style={GRADIENT_FILL}
            />
          </View>
        </View>
      )}
      <View style={image ? styles.coverTextOver : styles.coverText}>
        {kicker ? (
          <Following order={0}>
            <View style={styles.kicker}>
              <SpectrumDot color={palette.warm} size={6} />
              <Text style={styles.kickerText}>{kicker}</Text>
            </View>
          </Following>
        ) : null}
        <Following order={1}>
          <Text style={styles.coverTitle}>{str(props.title, 120)}</Text>
        </Following>
        {subtitle ? (
          <Following order={2}>
            <Text style={styles.coverSubtitle}>{subtitle}</Text>
          </Following>
        ) : null}
      </View>
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
  verdict: {
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: 1,
    overflow: "hidden",
  },
  verdictGlow: {
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  verdictField: {
    height: 96,
  },
  verdictBody: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[3],
  },
  verdictAnswer: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize["4xl"],
    letterSpacing: -0.6,
    lineHeight: 32,
  },
  verdictWhy: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.content,
    lineHeight: 23,
  },
  source: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.mono,
    fontSize: 11,
    lineHeight: 16,
  },
  figureLabel: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
  },
  figureValueBox: {
    marginTop: theme.spacing[2],
  },
  figureGlow: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 120,
    height: "100%",
  },
  figureValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: 60,
    letterSpacing: -3,
    lineHeight: 68,
    fontVariant: ["tabular-nums"],
  },
  delta: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  deltaText: {
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.base,
    fontVariant: ["tabular-nums"],
  },
  sides: {
    flexDirection: "row",
    gap: theme.spacing[4],
  },
  side: {
    flex: 1,
    minWidth: 0,
  },
  sideRule: {
    height: 2,
    width: 24,
    borderRadius: theme.borderRadius.full,
    marginBottom: theme.spacing[3],
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  sideTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
    marginBottom: theme.spacing[2],
  },
  sideItem: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  sideDot: {
    height: 18,
    justifyContent: "center",
  },
  sideText: {
    flex: 1,
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm + 1,
    lineHeight: 18,
  },
  compareVerdict: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[4],
  },
  when: {
    width: WHEN_WIDTH,
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
    textAlign: "right",
  },
  timelineNode: {
    width: TIMELINE_NODE,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  timelineLabel: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
  },
  timelineLabelNext: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
  },
  timelineDetail: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 17,
    marginTop: theme.spacing[0.5],
  },
  divider: {
    paddingTop: theme.spacing[3],
  },
  dividerLabel: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
    letterSpacing: 1,
  },
  cover: {
    borderRadius: theme.borderRadius["2xl"],
    overflow: "hidden",
  },
  coverPicture: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  coverField: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverText: {
    paddingTop: theme.spacing[16],
    paddingBottom: theme.spacing[4],
    paddingRight: theme.spacing[16],
    gap: theme.spacing[2],
  },
  coverTextOver: {
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  kicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  kickerText: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.sm,
    letterSpacing: 1,
  },
  coverTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.light,
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 40,
  },
  coverSubtitle: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.content,
    lineHeight: 22,
  },
}));
