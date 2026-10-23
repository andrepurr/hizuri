import { View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import type { CanvasPane } from "../model";
import { blockEntering, blockLayout, cascadeDelay } from "../motion";
import { useStageBlockContext } from "./block-context";
import { MediaBlock, PictureFill, VideoFill } from "./media";
import { WebPageFill } from "./web";

// One canvas: a tab of several files — live pages, videos, pictures, an audio track — shares the
// screen instead of scrolling a list. Each pane is the same fill a file alone in its tab gets, so a
// page scrolls and flips itself, a video plays with its sound button and a picture zooms; an audio
// track keeps its own height. The panes cascade in when the tab arrives and glide when one is added
// or goes. Every page on the canvas holds a live WebView while the tab is on screen (model.ts caps
// a canvas at four panes).

function Pane({ pane }: { pane: CanvasPane }) {
  const { block, kind } = pane;
  if (kind === "page") return <WebPageFill block={block} />;
  if (kind === "picture") return <PictureFill block={block} />;
  if (kind === "video") return <VideoFill block={block} />;
  return <MediaBlock block={block} />;
}

export function CanvasFill({ panes }: { panes: readonly CanvasPane[] }) {
  const { animate } = useStageBlockContext();
  return (
    <View style={styles.canvas} testID="stage-canvas">
      {panes.map((pane, index) => (
        <Animated.View
          key={pane.block.id}
          style={pane.weight === null ? styles.own : [styles.pane, { flex: pane.weight }]}
          entering={animate ? blockEntering(pane.block.enter, cascadeDelay(index)) : undefined}
          layout={blockLayout}
          testID={`stage-canvas-${pane.kind}-${pane.block.id}`}
        >
          <Pane pane={pane} />
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  canvas: {
    flex: 1,
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  pane: {
    minHeight: 0,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  own: {
    flexShrink: 0,
  },
}));
