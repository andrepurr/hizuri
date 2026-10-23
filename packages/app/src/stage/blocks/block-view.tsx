import { ChevronRight } from "lucide-react-native";
import { memo, type ReactElement, useCallback, useMemo, useState } from "react";
// oxlint-disable-next-line paseo/no-raw-pressable -- hizuri: these surfaces draw their own press states
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { isWeb } from "@/constants/platform";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { type StageBlockNode, layoutRows } from "../model";
import { CASCADE_STAGGER_MS, blockEntering, blockLayout, cascadeDelay } from "../motion";
import { usePerchTarget } from "../perch";
import { STAGE_FONT, useStageFonts } from "../type";
import { CARD_TONES, CardBlock, ProgressBlock, StatBlock } from "./basic";
import { BlockEnterContext } from "./block-enter";
import { useStageBlockContext } from "./block-context";
import {
  CompareBlock,
  CoverBlock,
  DividerBlock,
  FigureBlock,
  FigureFromStat,
  TimelineBlock,
  VerdictBlock,
  VerdictFromCard,
} from "./brand";
import { ChartBlock } from "./chart";
import {
  ChoiceBlock,
  FallbackBlock,
  ListBlock,
  OfferBlock,
  StatusBlock,
  StepsBlock,
  TextBlock,
  useReveal,
} from "./content";
import { LimitsBlock } from "./limits";
import { ImageBlock, LottieBlock, MediaBlock } from "./media";
import { str } from "./primitives";
import { SecretBlock } from "./secret";
import { TableBlock } from "./table";
import { WebBlock } from "./web";

// Draws one block by type, with its entrance. Blocks of a tab that arrives whole come in one
// after another, and the rows inside a block after it; a block Zuri adds later flies in alone, and
// the blocks around it glide aside. An unknown type (a newer daemon) draws the plain text the
// daemon sent with it. At the top of a tab, the first card with a kind is drawn as the tab's
// verdict and a number tile alone in its row as a big figure (blocks/brand.tsx).

type BlockComponent = (props: { block: StageBlockNode }) => ReactElement | null;

const CONTENT_BLOCKS: Record<string, BlockComponent> = {
  stat: StatBlock,
  progress: ProgressBlock,
  card: CardBlock,
  chart: ChartBlock,
  limits: LimitsBlock,
  text: TextBlock,
  list: ListBlock,
  status: StatusBlock,
  steps: StepsBlock,
  image: ImageBlock,
  choice: ChoiceBlock,
  offer: OfferBlock,
  media: MediaBlock,
  lottie: LottieBlock,
  web: WebBlock,
  secret: SecretBlock,
  verdict: VerdictBlock,
  figure: FigureBlock,
  compare: CompareBlock,
  timeline: TimelineBlock,
  divider: DividerBlock,
  cover: CoverBlock,
};

/** How a top-level block may be drawn in a larger form than its type. */
type BlockLook = "verdict" | "figure";

const LOOK_BLOCKS: Record<BlockLook, BlockComponent> = {
  verdict: VerdictFromCard,
  figure: FigureFromStat,
};

/** The entrance a look takes when Zuri left the default rise. */
const LOOK_ENTRANCES: Record<BlockLook, string> = {
  verdict: "bloom",
  figure: "scale",
};

/** The first card of a tab with a kind, among its first two blocks, is the tab's verdict. */
export function verdictCardId(blocks: readonly StageBlockNode[]): string | null {
  const card = blocks
    .slice(0, 2)
    .find((block) => block.type === "card" && CARD_TONES[String(block.props.kind)] !== undefined);
  return card?.id ?? null;
}

function TableEntry({ block }: { block: StageBlockNode }) {
  const { animate } = useStageBlockContext();
  return <TableBlock block={block} animate={animate} />;
}

function Section({ block }: { block: StageBlockNode }) {
  const [collapsed, setCollapsed] = useState(block.props.collapsed === true);
  const toggle = useCallback(() => setCollapsed((value) => !value), []);
  return (
    <View style={styles.section}>
      <Pressable onPress={toggle} accessibilityRole="button" style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{str(block.props.title, 120)}</Text>
        <View style={collapsed ? null : styles.chevronOpen}>
          <ThemedChevron size={16} strokeWidth={1.5} uniProps={mutedIconColorMapping} />
        </View>
      </Pressable>
      {collapsed ? null : <BlockList blocks={block.children} nested />}
    </View>
  );
}

function Carousel({ block }: { block: StageBlockNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={styles.carousel}
    >
      {block.children.map((child, index) => (
        <View key={child.id} style={styles.carouselItem}>
          <BlockView block={child} index={index} />
        </View>
      ))}
    </ScrollView>
  );
}

function RowGroup({ block }: { block: StageBlockNode }) {
  return (
    <View style={styles.pair}>
      {block.children.map((child, index) => (
        <View key={child.id} style={styles.pairCell}>
          <BlockView block={child} index={index} />
        </View>
      ))}
    </View>
  );
}

function StackGroup({ block }: { block: StageBlockNode }) {
  return <BlockList blocks={block.children} nested />;
}

const ThemedChevron = withUnistyles(ChevronRight);

const LAYOUT_BLOCKS: Record<string, BlockComponent> = {
  table: TableEntry,
  section: Section,
  carousel: Carousel,
  row: RowGroup,
  stack: StackGroup,
};

function blockComponent(type: string): BlockComponent {
  return CONTENT_BLOCKS[type] ?? LAYOUT_BLOCKS[type] ?? FallbackBlock;
}

export const BlockView = memo(function BlockView({
  block,
  index,
  look,
}: {
  block: StageBlockNode;
  index: number;
  look?: BlockLook;
}) {
  const { animate } = useStageBlockContext();
  const delay = animate
    ? cascadeDelay(index, block.stagger || CASCADE_STAGGER_MS) + block.delay
    : block.delay;
  const enter =
    look && (block.enter === null || block.enter === "rise") ? LOOK_ENTRANCES[look] : block.enter;
  const entering = useMemo(() => blockEntering(enter, delay), [enter, delay]);
  const webRise = useReveal(isWeb && animate ? delay : null);
  const Component = look ? LOOK_BLOCKS[look] : blockComponent(block.type);
  // The block Zuri sits on (stage/perch.tsx) is measured; the wrapper stays on every block, so its
  // arrival or hop never remounts one.
  const perch = usePerchTarget(block.id);
  return (
    <Animated.View entering={entering} layout={blockLayout} style={isWeb ? webRise : undefined}>
      <View
        ref={perch?.ref}
        collapsable={perch ? false : undefined}
        onLayout={perch?.onLayout}
        testID={perch ? "stage-perch-block" : undefined}
      >
        <BlockEnterContext.Provider value={animate ? delay : null}>
          <Component block={block} />
        </BlockEnterContext.Provider>
      </View>
    </Animated.View>
  );
});

/**
 * A tab's blocks: number tiles and rings pair up two to a row on a phone. The top level waits for
 * the stage's fonts (a few milliseconds, bundled) so text never jumps from the system font.
 */
// On web the app points every text at the user's interface font unless a subtree carries
// `data-pmono` (appearance/apply-root-font.web.ts); the stage keeps the brand's Geist the same way
// code keeps its monospace.
const OWN_FONT = CODE_SURFACE_DATASET;

export function BlockList({
  blocks,
  nested = false,
}: {
  blocks: StageBlockNode[];
  nested?: boolean;
}) {
  const fontsReady = useStageFonts();
  const rows = useMemo(() => layoutRows(blocks), [blocks]);
  const verdictId = useMemo(() => (nested ? null : verdictCardId(blocks)), [nested, blocks]);
  if (!fontsReady) return <View style={styles.list} />;
  let index = 0;
  return (
    <View style={styles.list} dataSet={OWN_FONT}>
      {rows.map((row) => {
        if (row.kind === "full") {
          index += 1;
          const look = row.block.id === verdictId ? "verdict" : undefined;
          return <BlockView key={row.key} block={row.block} index={index - 1} look={look} />;
        }
        const first = index;
        index += row.blocks.length;
        const [lone] = row.blocks;
        if (!nested && row.blocks.length === 1 && lone.type === "stat") {
          return <BlockView key={row.key} block={lone} index={first} look="figure" />;
        }
        return (
          <Animated.View key={row.key} style={styles.pair} layout={blockLayout}>
            {row.blocks.map((block, offset) => (
              <View key={block.id} style={styles.pairCell}>
                <BlockView block={block} index={first + offset} />
              </View>
            ))}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[4],
  },
  pair: {
    flexDirection: "row",
    gap: theme.spacing[3],
  },
  pairCell: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[1],
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontFamily: STAGE_FONT.medium,
    fontSize: theme.fontSize.lg,
  },
  chevronOpen: {
    transform: [{ rotate: "90deg" }],
  },
  carousel: {
    gap: theme.spacing[3],
  },
  carouselItem: {
    width: 280,
  },
}));
