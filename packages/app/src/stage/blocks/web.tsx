import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { htmlPreviewNavigationKind } from "@/file-panels/html-preview-navigation";
import type { StageBlockNode } from "../model";
import { useStageBlockContext } from "./block-context";
import { useHoldPagesStill } from "./hold-still";
import { Panel } from "./primitives";
import { slideCommand, stagePageDocument } from "./stage-media";

// A page Zuri opened (show_file, or its own HTML in a web block) in a WebView locked down like the
// HTML file preview (file-pane/html-preview.tsx): the preview's CSP (no network), storage and cache
// off, only the page itself loads and every later navigation is refused. Its own scripts run. The
// user scrolls it and pinches it bigger; while they pinch it or have it bigger, the agent pages and
// the edge panels hold still so a sideways drag pans the page. Alone in its tab it fills the tab
// and scrolls itself; among other blocks it gets the height Zuri gave it and scrolls inside the
// tab's list. Only there may it keep its touches from its parents (`nestedScrollEnabled` asks that
// on every touch), or a sideways drag on a page alone could never turn the agent pages. Only the
// tab on screen holds a live WebView: the assistant's pages run near 300 KB with animations, and
// the neighbours, the deck's glimpses and the Show page while the user is on the face would each
// keep one more page alive. When Android kills the page's renderer (memory), the page comes back in
// a fresh WebView instead of staying blank. Zuri flips a live page in place: its new slide runs in
// the open page (stage-media.ts, slideCommand), and a page that loads later opens on it.

const ORIGIN_WHITELIST = ["*"];
const BASE_URL = "about:blank";
const DEFAULT_HEIGHT = 480;
/** A page whose renderer keeps dying stops coming back after this many tries. */
const MAX_RENDERER_RESTARTS = 3;

/** The page whole: cutting HTML short would break it. */
function pageHtml(block: StageBlockNode): string {
  return typeof block.props.html === "string" ? block.props.html : "";
}

function StagePage({ html, nested, testID }: { html: string; nested: boolean; testID: string }) {
  const { active, slide } = useStageBlockContext();
  const [held, setHeld] = useState(false);
  const [restarts, setRestarts] = useState(0);
  useHoldPagesStill(active && held);
  const document = useMemo(() => stagePageDocument(html, { reportZoom: true }), [html]);
  const source = useMemo(() => ({ html: document, baseUrl: BASE_URL }), [document]);
  const loadedDocumentRef = useRef<string | null>(null);
  const allowOnlyThePage = useCallback(
    ({ url }: { url: string }) => {
      const kind = htmlPreviewNavigationKind(url);
      if (kind === "fragment") return true;
      if (kind === "blocked" || loadedDocumentRef.current === document) return false;
      loadedDocumentRef.current = document;
      return true;
    },
    [document],
  );
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { hold?: unknown };
      if (typeof message.hold === "boolean") setHeld(message.hold);
    } catch {
      // The page's own postMessage calls are not for the app.
    }
  }, []);
  const webRef = useRef<WebView>(null);
  const loadedRef = useRef(false);
  const slideRef = useRef(slide);
  slideRef.current = slide;
  const flip = useCallback(() => {
    const wanted = slideRef.current;
    if (wanted && loadedRef.current) webRef.current?.injectJavaScript(slideCommand(wanted.slide));
  }, []);
  const handleLoadEnd = useCallback(() => {
    loadedRef.current = true;
    flip();
  }, [flip]);
  // The assistant's flip moves the open page; it never reloads it.
  const flipAt = slide?.at;
  useEffect(() => {
    if (flipAt) flip();
  }, [flipAt, flip]);
  const restart = useCallback(() => {
    loadedDocumentRef.current = null;
    setRestarts((count) => count + 1);
  }, []);
  // A WebView mounted again loads the page again: it must pass the one-load lock once more.
  useEffect(() => {
    if (!active) loadedDocumentRef.current = null;
    loadedRef.current = false;
  }, [active, restarts]);
  if (!active || restarts > MAX_RENDERER_RESTARTS) {
    return <View style={styles.webview} testID={testID} />;
  }
  return (
    <WebView
      key={restarts}
      ref={webRef}
      testID={testID}
      style={styles.webview}
      source={source}
      originWhitelist={ORIGIN_WHITELIST}
      onShouldStartLoadWithRequest={allowOnlyThePage}
      onMessage={handleMessage}
      onLoadEnd={handleLoadEnd}
      onRenderProcessGone={restart}
      onContentProcessDidTerminate={restart}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      thirdPartyCookiesEnabled={false}
      cacheEnabled={false}
      setBuiltInZoomControls
      setDisplayZoomControls={false}
      nestedScrollEnabled={nested}
      overScrollMode="content"
      incognito
    />
  );
}

/** The page alone in its tab, filling it. */
export function WebPageFill({ block }: { block: StageBlockNode }) {
  return (
    <View style={styles.fill} testID={`stage-block-${block.id}`}>
      <StagePage html={pageHtml(block)} nested={false} testID={`stage-web-${block.id}`} />
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
        <StagePage html={pageHtml(block)} nested testID={`stage-web-${block.id}`} />
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
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
}));
