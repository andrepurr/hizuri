import { memo, useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  Keyframe,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { StageTab } from "@getpaseo/protocol/stage";
import type { ShowPalette } from "@/show/bridge";
import { HizuriMark } from "@/components/icons/hizuri-mark";
import { ChartBlock } from "./blocks/chart";
import { LottiePlayer } from "./blocks/lottie-player";
import { CountText } from "./blocks/primitives";
import {
  type LiveJobState,
  type LiveScene,
  type LiveStepState,
  parseCount,
  tabBlocks,
  uniqueKeys,
} from "./model";
import { useStagePalette } from "./palette";
import { STAGE_FONT } from "./type";

// The live tab "Now" (visual front): while the user talks with Zuri, one scene at a time,
// drawn as a composition rather than a dashboard — a topic label with the breathing mark, a big
// headline whose words rise one by one, and the one thing that matters (a number counting up,
// options side by side, points flying in). One idea per screen, readable at a glance on a phone.
// A change of topic or scene type replaces the whole scene; a change inside it moves in place.

const WORD_STAGGER_MS = 55;
const ITEM_STAGGER_MS = 110;
const FOLLOW_DELAY_MS = 160;
const OUT = Easing.out(Easing.cubic);

function sceneEntering() {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 28 }, { scale: 0.98 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }], easing: OUT },
  }).duration(420);
}

function sceneExiting() {
  return new Keyframe({
    0: { opacity: 1, transform: [{ translateY: 0 }] },
    100: { opacity: 0, transform: [{ translateY: -24 }], easing: Easing.in(Easing.cubic) },
  }).duration(220);
}

function wordEntering(index: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 22 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: OUT },
  })
    .duration(380)
    .delay(index * WORD_STAGGER_MS);
}

function itemEntering(index: number, from: "rise" | "left") {
  const start = from === "left" ? { translateX: -36 } : { translateX: 0 };
  return new Keyframe({
    0: { opacity: 0, transform: [start, { translateY: from === "rise" ? 24 : 0 }] },
    100: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }], easing: OUT },
  })
    .duration(420)
    .delay(index * ITEM_STAGGER_MS);
}

const itemLayout = LinearTransition.duration(260);

/** The words of a headline, keyed so a repeated word keeps its own key. */
function keyedWords(text: string): { word: string; key: string }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const keys = uniqueKeys(words);
  return words.map((word, index) => ({ word, key: keys[index] ?? word }));
}

/** A headline whose words rise one after another; a new text rises again. */
function Headline({
  text,
  size,
  delay = 0,
}: {
  text: string;
  size: "display" | "title";
  /** Words of delay before the first word rises. */
  delay?: number;
}) {
  const words = useMemo(() => keyedWords(text), [text]);
  const style = size === "display" ? styles.display : styles.title;
  return (
    <View
      key={text}
      style={[styles.words, size === "display" ? styles.wordsDisplay : styles.wordsTitle]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={text}
    >
      {words.map(({ word, key }, index) => (
        // One line per word: React Native 0.81 on Android can round a word's width down at a
        // fractional font scale, and the last letter then breaks onto a hidden second line.
        <Animated.Text
          key={key}
          entering={wordEntering(index + delay)}
          style={style}
          numberOfLines={1}
          ellipsizeMode="clip"
        >
          {word}
        </Animated.Text>
      ))}
    </View>
  );
}

function Sub({ text, after }: { text: string; after: number }) {
  if (!text) return null;
  return (
    <Animated.Text key={text} entering={itemEntering(after, "rise")} style={styles.sub}>
      {text}
    </Animated.Text>
  );
}

/**
 * The live sign: the assistant's mark breathing above the scene. The heading speaks for the topic
 * itself.
 */
function LiveMark() {
  return (
    <View style={styles.mark} testID="live-mark">
      <HizuriMark size={22} animated />
    </View>
  );
}

/** A thin accent line that draws in from the left under the big number. */
function DrawLine() {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const width = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!reduceMotion) width.value = withTiming(1, { duration: 900, easing: OUT });
  }, [reduceMotion, width]);
  const animated = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }));
  const color = useMemo(() => ({ backgroundColor: palette.accent }), [palette.accent]);
  return (
    <View style={styles.lineTrack}>
      <Animated.View style={[styles.line, color, animated]} />
    </View>
  );
}

function dotColor(state: LiveStepState | LiveJobState, palette: ShowPalette): string {
  if (state === "done") return palette.success;
  if (state === "failed") return palette.danger;
  if (state === "doing" || state === "running") return palette.accent;
  return palette.foregroundMuted;
}

/** The dot of a step or a job: a soft pulse while it runs. */
function StateDot({ state }: { state: LiveStepState | LiveJobState }) {
  const palette = useStagePalette();
  const reduceMotion = useReducedMotion();
  const live = state === "doing" || state === "running";
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!live || reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: OUT }), -1, false);
  }, [live, reduceMotion, pulse]);
  const ring = useAnimatedStyle(() => ({
    opacity: live ? 0.55 * (1 - pulse.value) : 0,
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));
  const color = dotColor(state, palette);
  const filled = state !== "todo" && state !== "waiting";
  const dotStyle = useMemo(
    () => ({
      borderColor: color,
      backgroundColor: filled ? color : "transparent",
    }),
    [color, filled],
  );
  const ringStyle = useMemo(() => ({ backgroundColor: color }), [color]);
  return (
    <View style={styles.dotBox}>
      <Animated.View style={[styles.dotRing, ringStyle, ring]} />
      <View style={[styles.dot, dotStyle]} />
    </View>
  );
}

function NumberScene({ scene }: { scene: Extract<LiveScene, { p: "number" }> }) {
  return (
    <>
      <CountText text={scene.v} style={styles.bigNumber} />
      <DrawLine />
      <Headline text={scene.t} size="title" />
      <Sub text={scene.s} after={3} />
    </>
  );
}

function CompareScene({ scene }: { scene: Extract<LiveScene, { p: "compare" }> }) {
  return (
    <>
      <Headline text={scene.t} size="title" />
      <View style={styles.compare}>
        {scene.items.map((item, index) => (
          <Animated.View
            key={item.l}
            entering={itemEntering(index + 1, "rise")}
            layout={itemLayout}
            style={[styles.compareItem, index > 0 ? styles.compareDivider : null]}
          >
            {parseCount(item.v) ? (
              <CountText text={item.v} style={styles.compareValue} />
            ) : (
              <Text style={styles.compareWord} numberOfLines={2}>
                {item.v}
              </Text>
            )}
            <Text style={styles.compareLabel} numberOfLines={2}>
              {item.l}
            </Text>
          </Animated.View>
        ))}
      </View>
    </>
  );
}

function ListScene({ scene }: { scene: Extract<LiveScene, { p: "list" }> }) {
  return (
    <>
      <Headline text={scene.t} size="title" />
      <View style={styles.listRows}>
        {scene.items.map((item, index) => (
          <Animated.View
            key={item}
            entering={itemEntering(index + 1, "left")}
            layout={itemLayout}
            style={[styles.listRow, index > 0 ? styles.listDivider : null]}
          >
            <Text style={styles.listText}>{item}</Text>
          </Animated.View>
        ))}
      </View>
    </>
  );
}

function StepsScene({
  scene,
}: {
  scene: Extract<LiveScene, { p: "steps" }> | Extract<LiveScene, { p: "status" }>;
}) {
  const rows =
    scene.p === "steps"
      ? scene.steps.map((step) => ({ label: step.l, state: step.s, detail: "" }))
      : scene.items.map((item) => ({ label: item.l, state: item.s, detail: item.d }));
  return (
    <>
      <Headline text={scene.t} size="title" />
      <View style={styles.rows}>
        {rows.map((row, index) => (
          <Animated.View
            key={row.label}
            entering={itemEntering(index + 1, "left")}
            layout={itemLayout}
            style={styles.row}
          >
            <StateDot state={row.state} />
            <View style={styles.rowBody}>
              <Text style={[styles.rowText, row.state === "todo" ? styles.rowTodo : null]}>
                {row.label}
              </Text>
              {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
            </View>
          </Animated.View>
        ))}
      </View>
    </>
  );
}

function TimelineScene({ scene }: { scene: Extract<LiveScene, { p: "timeline" }> }) {
  return (
    <>
      <Headline text={scene.t} size="title" />
      <View style={styles.rows}>
        {scene.items.map((item, index) => (
          <Animated.View
            key={`${item.w}:${item.l}`}
            entering={itemEntering(index + 1, "left")}
            layout={itemLayout}
            style={styles.row}
          >
            <Text style={styles.when}>{item.w}</Text>
            <Text style={styles.rowText}>{item.l}</Text>
          </Animated.View>
        ))}
      </View>
    </>
  );
}

function ChartScene({ scene, tab }: { scene: Extract<LiveScene, { p: "chart" }>; tab: StageTab }) {
  // The scene's headline names the chart: the chart block draws without its own title.
  const chart = useMemo(() => {
    const block = tabBlocks(tab).find((entry) => entry.type === "chart");
    return block ? { ...block, props: { ...block.props, title: "" } } : null;
  }, [tab]);
  return (
    <>
      <Headline text={scene.t} size="title" />
      {chart ? (
        <Animated.View entering={itemEntering(2, "rise")} style={styles.chart}>
          <ChartBlock block={chart} />
        </Animated.View>
      ) : null}
    </>
  );
}

function MomentScene({ win, title, sub }: { win: boolean; title: string; sub: string }) {
  return (
    <>
      <View style={styles.moment}>
        <LottiePlayer name={win ? "win" : "error"} url={null} size={120} />
      </View>
      <Headline text={title} size="display" delay={4} />
      <Sub text={sub} after={6} />
    </>
  );
}

function SceneBody({ scene, tab }: { scene: LiveScene; tab: StageTab }) {
  switch (scene.p) {
    case "hero":
      return (
        <>
          <Headline text={scene.t} size="display" />
          <Sub text={scene.s} after={4} />
        </>
      );
    case "number":
      return <NumberScene scene={scene} />;
    case "compare":
      return <CompareScene scene={scene} />;
    case "list":
      return <ListScene scene={scene} />;
    case "steps":
    case "status":
      return <StepsScene scene={scene} />;
    case "timeline":
      return <TimelineScene scene={scene} />;
    case "chart":
      return <ChartScene scene={scene} tab={tab} />;
    case "win":
    case "alert":
      return <MomentScene win={scene.p === "win"} title={scene.t} sub={scene.s} />;
  }
}

/** The last thing the scene shows: when it changes, the page glides to the end. */
function lastItem(scene: LiveScene): string {
  switch (scene.p) {
    case "compare":
    case "timeline":
    case "status":
      return JSON.stringify(scene.items.at(-1) ?? null);
    case "list":
      return scene.items.at(-1) ?? "";
    case "steps":
      return scene.steps.at(-1)?.l ?? "";
    default:
      return scene.t;
  }
}

export const LiveSceneView = memo(function LiveSceneView({
  scene,
  tab,
}: {
  scene: LiveScene;
  tab: StageTab;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const last = lastItem(scene);
  const lastRef = useRef(last);
  useEffect(() => {
    if (last === lastRef.current) return;
    lastRef.current = last;
    const timer = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      FOLLOW_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [last]);
  // A new topic or a new kind of scene replaces the scene; anything else changes it in place.
  const sceneKey = `${scene.p === "status" ? "steps" : scene.p}:${scene.k}`;
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      testID="live-scene"
    >
      <Animated.View
        key={sceneKey}
        entering={sceneEntering()}
        exiting={sceneExiting()}
        style={styles.scene}
        testID={`live-scene-${scene.p}`}
      >
        {scene.p === "win" || scene.p === "alert" ? null : <LiveMark />}
        <SceneBody scene={scene} tab={tab} />
      </Animated.View>
    </ScrollView>
  );
});

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingTop: theme.spacing[12],
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[16],
  },
  scene: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  mark: {
    marginBottom: theme.spacing[6],
  },
  words: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  wordsDisplay: {
    columnGap: theme.spacing[3],
  },
  wordsTitle: {
    columnGap: theme.spacing[2],
  },
  display: {
    color: theme.colors.foreground,
    fontSize: 40,
    lineHeight: 46,
    fontFamily: STAGE_FONT.light,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: STAGE_FONT.light,
  },
  sub: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xl,
    lineHeight: 26,
    marginTop: theme.spacing[4],
  },
  bigNumber: {
    color: theme.colors.foreground,
    fontSize: 88,
    lineHeight: 96,
    fontFamily: STAGE_FONT.monoLight,
    letterSpacing: -2,
    fontVariant: ["tabular-nums"],
  },
  lineTrack: {
    height: 3,
    width: 96,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[6],
    borderRadius: 2,
    overflow: "hidden",
  },
  line: {
    height: 3,
    borderRadius: 2,
  },
  compare: {
    marginTop: theme.spacing[8],
    gap: theme.spacing[6],
  },
  compareItem: {
    gap: theme.spacing[1],
  },
  compareDivider: {
    paddingTop: theme.spacing[6],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  compareValue: {
    color: theme.colors.foreground,
    fontSize: 48,
    lineHeight: 54,
    fontFamily: STAGE_FONT.monoLight,
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  compareWord: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["4xl"],
    lineHeight: 32,
    fontFamily: STAGE_FONT.regular,
  },
  compareLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
  rows: {
    marginTop: theme.spacing[8],
    gap: theme.spacing[6],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[4],
  },
  rowBody: {
    flex: 1,
    gap: theme.spacing[1],
  },
  listRows: {
    marginTop: theme.spacing[6],
  },
  listRow: {
    paddingVertical: theme.spacing[4],
  },
  listText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize["3xl"],
    lineHeight: 30,
  },
  listDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  when: {
    color: theme.colors.accentBright,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.lg,
    lineHeight: 30,
    width: 64,
  },
  rowText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize["3xl"],
    lineHeight: 30,
  },
  rowTodo: {
    color: theme.colors.foregroundMuted,
  },
  rowDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  dotBox: {
    width: 28,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  dotRing: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  chart: {
    marginTop: theme.spacing[6],
  },
  moment: {
    width: 120,
    marginBottom: theme.spacing[4],
  },
}));
