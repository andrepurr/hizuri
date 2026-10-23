import { Image } from "expo-image";
import { Check, X } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, Text, type TextStyle, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { leadingMark } from "../emoji";
import { type StageBlockNode, uniqueKeys } from "../model";
import { SETTLE, rowDelay } from "../motion";
import {
  type StagePalette,
  type StageTone,
  spectrumAt,
  toneColor,
  useStagePalette,
  withAlpha,
} from "../palette";
import { STAGE_FONT } from "../type";
import { useBlockEnterDelay } from "./block-enter";
import { useStageBlockContext } from "./block-context";
import { SpectrumDot } from "./dots";
import { BlockTitle, Panel, RowMarker, arr, num, rec, str } from "./primitives";

// Text and rows: headings and paragraphs, lists, a plan's steps, live job status, and the two
// blocks the user answers by tapping (choice, offer). A tap reaches Zuri as a stage action.
//
// On the brand (docs/brand.md): a list's rows are marked by dots or thin icons whose colour walks
// the spectrum from the warm ring at the top out to the blue field at the bottom; a status emoji
// in a title gives the whole list its tone instead. Steps are nodes on a line that draws itself
// down; a done node is lit with the warm core, the one in progress breathes, a failed one turns
// rose. Rows arrive one after another, after their block.

const STATE_TONES: Record<string, StageTone> = {
  running: "accent",
  doing: "success",
  done: "success",
  failed: "danger",
  waiting: "warning",
};

/** **bold** spans inside Zuri's text; everything else stays plain. */
function RichText({ text, style }: { text: string; style: TextStyle }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  const keys = uniqueKeys(parts);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text key={keys[index]} style={styles.bold}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export function TextBlock({ block }: { block: StageBlockNode }) {
  const size = str(block.props.size, 10);
  const text = leadingMark(str(block.props.text, 8000)).text;
  if (size === "title") return <RichText text={text} style={styles.textTitle} />;
  return <RichText text={text} style={size === "small" ? styles.textSmall : styles.textBody} />;
}

/** A row that rises in after its block when the tab arrives whole; in place otherwise. */
export function EnteringRow({ index, children }: { index: number; children: ReactNode }) {
  const blockDelay = useBlockEnterDelay();
  const style = useReveal(blockDelay === null ? null : rowDelay(index, blockDelay));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * A short rise after `delayMs`, or shown at once when null. Driven by a value, not an `entering`
 * layout animation: nested inside a block's own entering and layout transition, Reanimated on web
 * froze the block at the height it had before its rows came in.
 */
export function useReveal(delayMs: number | null) {
  const reduceMotion = useReducedMotion();
  const shown = useSharedValue(delayMs === null || reduceMotion ? 1 : 0);
  useEffect(() => {
    if (delayMs === null || reduceMotion) {
      shown.value = 1;
      return;
    }
    shown.value = withDelay(delayMs, withTiming(1, { duration: 520, easing: SETTLE }));
  }, [delayMs, reduceMotion, shown]);
  return useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * 10 }],
  }));
}

export function useBreath(enabled: boolean) {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!enabled || reduceMotion) {
      cancelAnimation(breath);
      breath.value = 0;
      return;
    }
    breath.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [enabled, reduceMotion, breath]);
  return breath;
}

function StateDot({ state }: { state: string }) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const shake = useSharedValue(0);
  const running = state === "running" || state === "doing";
  const breath = useBreath(running);
  useEffect(() => {
    if (state !== "failed" || reduceMotion) return;
    shake.value = withSequence(
      withTiming(-4, { duration: 60 }),
      withTiming(4, { duration: 80 }),
      withTiming(-2, { duration: 70 }),
      withTiming(0, { duration: 60 }),
    );
  }, [state, reduceMotion, shake]);
  const color = toneColor(palette, STATE_TONES[state] ?? "accent");
  const dotStyle = useAnimatedStyle(() => ({
    opacity: running ? 0.55 + 0.45 * breath.value : 1,
    transform: [{ translateX: shake.value }, { scale: running ? 1 + 0.2 * breath.value : 1 }],
  }));
  if (state === "done") return <StateGlyph kind="done" color={color} palette={palette} />;
  if (state === "failed") return <StateGlyph kind="failed" color={color} palette={palette} />;
  return (
    <Animated.View style={[styles.stateBox, dotStyle]}>
      <SpectrumDot
        color={state === "todo" ? palette.field : color}
        size={10}
        hollow={state === "todo"}
      />
    </Animated.View>
  );
}

function StateGlyph({
  kind,
  color,
  palette,
}: {
  kind: "done" | "failed";
  color: string;
  palette: StagePalette;
}) {
  const style = useMemo(
    () => ({ backgroundColor: withAlpha(color, 0.16), borderColor: withAlpha(color, 0.5) }),
    [color],
  );
  const Glyph = kind === "done" ? Check : X;
  return (
    <View style={styles.stateBox}>
      <View style={[styles.stateGlyph, style]}>
        <Glyph size={12} color={kind === "done" ? palette.core : color} strokeWidth={2} />
      </View>
    </View>
  );
}

function elapsed(startedAt: string, finishedAt: string, now: number): string {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return "";
  const end = finishedAt ? Date.parse(finishedAt) : now;
  const seconds = Math.max(0, Math.round(((Number.isNaN(end) ? now : end) - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function useSecondTicker(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

function StateRow({
  state,
  title,
  detail,
  value,
}: {
  state: string;
  title: string;
  detail: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <StateDot state={state} />
      <View style={styles.rowText}>
        <Text style={state === "todo" ? styles.rowTitleMuted : styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    </View>
  );
}

/** The line from one step's node down to the next: it draws itself on, step after step. */
export function StepLine({
  index,
  lit,
  left = NODE / 2 - 0.5,
  top = NODE,
}: {
  index: number;
  lit: boolean;
  /** Where the line runs: under the centre of the node, below it. */
  left?: number;
  top?: number;
}) {
  const palette = useStagePalette();
  const blockDelay = useBlockEnterDelay();
  const reduceMotion = useReducedMotion();
  const drawn = useSharedValue(blockDelay === null || reduceMotion ? 1 : 0);
  useEffect(() => {
    if (blockDelay === null || reduceMotion) return;
    drawn.value = withDelay(
      blockDelay + 260 + Math.min(index, 10) * 70,
      withTiming(1, { duration: 420, easing: Easing.inOut(Easing.cubic) }),
    );
  }, [blockDelay, reduceMotion, index, drawn]);
  const drawStyle = useAnimatedStyle(() => ({ height: `${drawn.value * 100}%` }));
  const colorStyle = useMemo(
    () => ({
      backgroundColor: lit ? withAlpha(palette.warm, 0.55) : withAlpha(palette.field, 0.4),
    }),
    [lit, palette.warm, palette.field],
  );
  const railStyle = useMemo(() => ({ left, top }), [left, top]);
  return (
    <View style={[styles.stepLineRail, railStyle]} pointerEvents="none">
      <Animated.View style={[styles.stepLine, colorStyle, drawStyle]} />
    </View>
  );
}

function StepNode({ state, number }: { state: string; number: number }) {
  const palette = useStagePalette();
  const running = state === "doing";
  const breath = useBreath(running);
  const tone = STATE_TONES[state];
  const color = tone ? toneColor(palette, tone) : palette.field;
  const lit = state === "done" || running;
  const nodeStyle = useMemo(
    () => ({
      borderColor: lit || state === "failed" ? color : withAlpha(palette.field, 0.6),
      backgroundColor: state === "done" ? withAlpha(color, 0.18) : palette.background,
      shadowColor: color,
    }),
    [lit, state, color, palette.field, palette.background],
  );
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: running ? 1 + 0.12 * breath.value : 1 }],
  }));
  const numberStyle = useMemo(
    () => ({ color: lit ? palette.core : palette.foregroundMuted }),
    [lit, palette.core, palette.foregroundMuted],
  );
  let glyph = (
    <Text style={[styles.stepNumber, numberStyle]}>{String(number).padStart(2, "0")}</Text>
  );
  if (state === "done") glyph = <Check size={13} color={palette.core} strokeWidth={2} />;
  if (state === "failed") glyph = <X size={13} color={color} strokeWidth={2} />;
  return (
    <Animated.View
      style={[styles.stepNode, lit ? styles.stepNodeLit : null, nodeStyle, pulseStyle]}
    >
      {glyph}
    </Animated.View>
  );
}

export function StepsBlock({ block }: { block: StageBlockNode }) {
  const steps = arr(block.props.steps).map(rec);
  const keys = uniqueKeys(steps.map((step) => str(step.label, 160)));
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(block.props.title, 120)} />
      {steps.map((step, index) => {
        const state = str(step.state, 10);
        const last = index === steps.length - 1;
        return (
          <EnteringRow key={keys[index]} index={index}>
            <View style={styles.step}>
              {last ? null : <StepLine index={index} lit={state === "done"} />}
              <StepNode state={state} number={index + 1} />
              <Text style={state === "todo" ? styles.stepLabelTodo : styles.stepLabel}>
                {leadingMark(str(step.label, 160)).text}
              </Text>
            </View>
          </EnteringRow>
        );
      })}
    </Panel>
  );
}

export function StatusBlock({ block }: { block: StageBlockNode }) {
  const items = arr(block.props.items).map(rec);
  const anyRunning = items.some((item) => item.state === "running");
  const now = useSecondTicker(anyRunning);
  const keys = uniqueKeys(items.map((item) => str(item.id, 64) || str(item.label, 160)));
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(block.props.title, 120)} />
      {items.map((item, index) => (
        <EnteringRow key={keys[index]} index={index}>
          <StateRow
            state={str(item.state, 10)}
            title={str(item.label, 160)}
            detail={str(item.detail, 240)}
            value={elapsed(str(item.startedAt, 40), str(item.finishedAt, 40), now)}
          />
        </EnteringRow>
      ))}
    </Panel>
  );
}

function ActionButton({
  blockId,
  value,
  label,
  confirm,
  primary,
}: {
  blockId: string;
  value: string;
  label: string;
  confirm: boolean;
  primary: boolean;
}) {
  const { sendAction } = useStageBlockContext();
  const [armed, setArmed] = useState(false);
  const [sent, setSent] = useState(false);
  // Money never moves on one tap: a confirm action asks for a second tap.
  const onPress = useCallback(() => {
    if (confirm && !armed) {
      setArmed(true);
      return;
    }
    sendAction(blockId, value);
    setSent(true);
    setArmed(false);
  }, [confirm, armed, sendAction, blockId, value]);
  const text = armed ? `${label} ✓?` : label;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.button,
        primary || armed ? styles.buttonPrimary : null,
        sent ? styles.buttonSent : null,
      ]}
    >
      <Text
        style={primary || armed ? styles.buttonTextPrimary : styles.buttonText}
        numberOfLines={2}
      >
        {text}
      </Text>
    </Pressable>
  );
}

/** One list row: its marker, title and subtitle, value, and a button when it acts. */
function ListRow({
  blockId,
  item,
  color,
  first,
}: {
  blockId: string;
  item: Record<string, unknown>;
  color: string;
  first: boolean;
}) {
  const action = rec(item.action);
  const actionValue = str(action.value, 200);
  const title = leadingMark(str(item.title, 160));
  const icon = str(item.icon, 40) || title.emoji;
  return (
    <View style={first ? styles.listItemFirst : styles.listItem}>
      <View style={styles.row}>
        {item.status ? (
          <StateDot state={str(item.status, 10)} />
        ) : (
          <RowMarker icon={icon} color={color} />
        )}
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{title.text}</Text>
          {item.subtitle ? <Text style={styles.rowDetail}>{str(item.subtitle, 240)}</Text> : null}
        </View>
        {item.value ? <Text style={styles.rowValue}>{str(item.value, 60)}</Text> : null}
      </View>
      {actionValue ? (
        <ActionButton
          blockId={blockId}
          value={actionValue}
          label={str(action.label, 40) || title.text.slice(0, 40)}
          confirm={action.confirm === true}
          primary={false}
        />
      ) : null}
    </View>
  );
}

export function ListBlock({ block }: { block: StageBlockNode }) {
  const palette = useStagePalette();
  const items = arr(block.props.items).map(rec);
  const keys = uniqueKeys(items.map((item) => str(item.id, 64) || str(item.title, 160)));
  const title = str(block.props.title, 120);
  const titleTone = leadingMark(title).tone;
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <BlockTitle text={title} />
      {items.map((item, index) => (
        <EnteringRow key={keys[index]} index={index}>
          <ListRow
            blockId={block.id}
            item={item}
            color={
              titleTone
                ? toneColor(palette, titleTone)
                : spectrumAt(palette, index, Math.max(items.length, 3))
            }
            first={index === 0}
          />
        </EnteringRow>
      ))}
    </Panel>
  );
}

export function ChoiceBlock({ block }: { block: StageBlockNode }) {
  const options = arr(block.props.options).map(rec);
  const keys = uniqueKeys(options.map((option) => str(option.value, 200)));
  return (
    <Panel tone="accent" testID={`stage-block-${block.id}`}>
      <BlockTitle text={str(block.props.prompt, 240)} />
      <View style={styles.choices}>
        {options.map((option, index) => (
          <EnteringRow key={keys[index]} index={index}>
            <ActionButton
              blockId={block.id}
              value={str(option.value, 200)}
              label={str(option.label, 80)}
              confirm={false}
              primary={false}
            />
          </EnteringRow>
        ))}
      </View>
    </Panel>
  );
}

const RATING_KEYS = ["r1", "r2", "r3", "r4", "r5"];

/** A rating as five dots of the field, the earned ones lit warm. */
function Rating({ rating }: { rating: number }) {
  const palette = useStagePalette();
  const full = Math.round(rating);
  return (
    <View style={styles.rating} accessibilityLabel={`${rating}/5`}>
      {RATING_KEYS.map((key, index) => (
        <SpectrumDot
          key={key}
          color={index < full ? palette.warm : palette.field}
          hollow={index >= full}
          size={8}
        />
      ))}
    </View>
  );
}

export function OfferBlock({ block }: { block: StageBlockNode }) {
  const { props } = block;
  const action = rec(props.action);
  const image = str(props.image, 400_000);
  const rating = num(props.rating);
  return (
    <Panel tone="success" strong testID={`stage-block-${block.id}`}>
      {image ? (
        <Image source={image} style={styles.offerImage} contentFit="cover" transition={350} />
      ) : null}
      <Text style={styles.offerTitle}>{str(props.title, 160)}</Text>
      <View style={styles.offerMeta}>
        <Text style={styles.offerPrice}>{str(props.price, 40)}</Text>
        {rating !== null ? <Rating rating={rating} /> : null}
        {props.shop ? <Text style={styles.rowDetail}>{str(props.shop, 80)}</Text> : null}
      </View>
      {props.why ? <Text style={styles.offerWhy}>{str(props.why, 240)}</Text> : null}
      {action.value ? (
        <ActionButton
          blockId={block.id}
          value={str(action.value, 200)}
          label={str(action.label, 40) || str(props.title, 40)}
          confirm={action.confirm !== false}
          primary
        />
      ) : null}
    </Panel>
  );
}

export function FallbackBlock({ block }: { block: StageBlockNode }) {
  const palette = useStagePalette();
  const border = useMemo(
    () => ({ borderColor: withAlpha(palette.foregroundMuted, 0.3) }),
    [palette.foregroundMuted],
  );
  if (!block.fallback) return null;
  return (
    <View style={[styles.fallback, border]} testID={`stage-block-${block.id}`}>
      <Text style={styles.textBody}>{block.fallback}</Text>
    </View>
  );
}

const NODE = 26;

const styles = StyleSheet.create((theme) => ({
  bold: {
    fontFamily: STAGE_FONT.medium,
  },
  textTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.light,
    fontSize: theme.fontSize["4xl"] + 4,
    letterSpacing: -0.6,
    lineHeight: 36,
  },
  textBody: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.content,
    lineHeight: 23,
  },
  textSmall: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 17,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
  },
  rowTitleMuted: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
  },
  rowDetail: {
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.sm,
    lineHeight: 17,
    marginTop: theme.spacing[0.5],
  },
  rowValue: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.mono,
    fontSize: theme.fontSize.base,
    fontVariant: ["tabular-nums"],
  },
  stateBox: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  stateGlyph: {
    width: 20,
    height: 20,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listItemFirst: {},
  listItem: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  step: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingBottom: theme.spacing[3],
  },
  stepLineRail: {
    position: "absolute",
    bottom: 0,
    width: 1,
  },
  stepLine: {
    width: 1,
  },
  stepNode: {
    width: NODE,
    height: NODE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNodeLit: {
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  stepNumber: {
    fontFamily: STAGE_FONT.mono,
    fontSize: 10,
    fontVariant: ["tabular-nums"],
  },
  stepLabel: {
    flex: 1,
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
    paddingTop: theme.spacing[1],
  },
  stepLabelTodo: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    lineHeight: 19,
    paddingTop: theme.spacing[1],
  },
  choices: {
    gap: theme.spacing[2],
  },
  button: {
    marginTop: theme.spacing[2],
    borderRadius: theme.borderRadius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  buttonSent: {
    opacity: theme.opacity[50],
  },
  buttonText: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
  buttonTextPrimary: {
    color: theme.colors.accentForeground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
  },
  rating: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  offerImage: {
    width: "100%",
    aspectRatio: 16 / 10,
    borderRadius: theme.borderRadius.xl,
    marginBottom: theme.spacing[3],
  },
  offerTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.xl,
  },
  offerMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  offerPrice: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.monoLight,
    fontSize: theme.fontSize["3xl"] + 4,
    letterSpacing: -0.5,
  },
  offerWhy: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.regular,
    fontSize: theme.fontSize.base,
    marginTop: theme.spacing[2],
  },
  fallback: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing[3],
  },
}));
