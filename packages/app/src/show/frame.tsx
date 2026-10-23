import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native-unistyles";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { htmlPreviewNavigationKind } from "@/file-panels/html-preview-navigation";
import type { ShowHostMessage } from "./bridge";
import { useShowFrameSync, type ShowFrameProps } from "./frame-sync";
import { SHOW_PAGE_HTML } from "./page";

// The Show page in a WebView, locked down like the HTML file preview
// (file-pane/html-preview.tsx): only the page itself loads, every later navigation is refused,
// and nothing is stored. The page talks to the app only through onMessage, and the app talks to
// it only by calling the one function the page exposes. When Android kills the page's renderer
// (memory), the page comes back in a fresh WebView instead of staying blank.
const ORIGIN_WHITELIST = ["*"];
const SOURCE = { html: SHOW_PAGE_HTML, baseUrl: "about:blank" };

export function ShowFrame({ palette, strings, render, testID }: ShowFrameProps) {
  const webViewRef = useRef<WebView>(null);
  const loadedRef = useRef(false);
  const post = useCallback((message: ShowHostMessage) => {
    webViewRef.current?.injectJavaScript(
      `window.__hizuriShow && window.__hizuriShow(${JSON.stringify(message)}); true;`,
    );
  }, []);
  const onPageMessage = useShowFrameSync({ post, palette, strings, render });
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => onPageMessage(event.nativeEvent.data),
    [onPageMessage],
  );
  const allowOnlyThePage = useCallback(({ url }: { url: string }) => {
    const kind = htmlPreviewNavigationKind(url);
    if (kind === "fragment") return true;
    if (kind === "blocked" || loadedRef.current) return false;
    loadedRef.current = true;
    return true;
  }, []);
  const style = useMemo(() => [styles.webview], []);
  const [restarts, setRestarts] = useState(0);
  const restart = useCallback(() => {
    loadedRef.current = false;
    setRestarts((count) => count + 1);
  }, []);

  return (
    <WebView
      key={restarts}
      ref={webViewRef}
      testID={testID}
      style={style}
      source={SOURCE}
      originWhitelist={ORIGIN_WHITELIST}
      onShouldStartLoadWithRequest={allowOnlyThePage}
      onMessage={handleMessage}
      onRenderProcessGone={restart}
      onContentProcessDidTerminate={restart}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled={false}
      thirdPartyCookiesEnabled={false}
      cacheEnabled={false}
      overScrollMode="never"
      incognito
    />
  );
}

const styles = StyleSheet.create(() => ({
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
}));
