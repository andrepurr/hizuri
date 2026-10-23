import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { StageBlockNode } from "../model";
import { Panel } from "./primitives";
import { useStageBlockContext } from "./block-context";
import { stagePageDocument } from "./stage-media";

// A page Zuri opened, on web: a sandboxed frame like the HTML file preview
// (file-pane/html-preview.web.tsx). `allow-scripts` alone gives it an opaque origin, so its own
// scripts run but it cannot reach the app, its storage or the network (the preview's CSP). Zuri's
// slide flips reach it as a posted message (stage-media.ts, the slide driver).

const SANDBOX = "allow-scripts";
const DEFAULT_HEIGHT = 480;

const iframeStyle = {
  flex: 1,
  minHeight: 0,
  width: "100%",
  border: "none",
  backgroundColor: "transparent",
} as const;

function pageHtml(block: StageBlockNode): string {
  return typeof block.props.html === "string" ? block.props.html : "";
}

function StagePage({ html, testID }: { html: string; testID: string }) {
  const { slide } = useStageBlockContext();
  const document = useMemo(() => stagePageDocument(html, { reportZoom: false }), [html]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const flip = useCallback(() => {
    const wanted = slideRef.current;
    if (wanted) frameRef.current?.contentWindow?.postMessage({ hizuriSlide: wanted.slide }, "*");
  }, []);
  const flipAt = slide?.at;
  useEffect(() => {
    if (flipAt) flip();
  }, [flipAt, flip]);
  return (
    <iframe
      ref={frameRef}
      onLoad={flip}
      data-testid={testID}
      title="Page"
      srcDoc={document}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      style={iframeStyle}
    />
  );
}

export function WebPageFill({ block }: { block: StageBlockNode }) {
  return (
    <View style={styles.fill} testID={`stage-block-${block.id}`}>
      <StagePage html={pageHtml(block)} testID={`stage-web-${block.id}`} />
    </View>
  );
}

export function WebBlock({ block }: { block: StageBlockNode }) {
  const height = typeof block.props.height === "number" ? block.props.height : DEFAULT_HEIGHT;
  const frameStyle = useMemo(() => [styles.frame, { height }], [height]);
  if (typeof block.props.html !== "string") return null;
  return (
    <Panel testID={`stage-block-${block.id}`}>
      <View style={frameStyle}>
        <StagePage html={pageHtml(block)} testID={`stage-web-${block.id}`} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: {
    flex: 1,
  },
  frame: {
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
}));
