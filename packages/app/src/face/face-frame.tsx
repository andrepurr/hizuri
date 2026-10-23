import { useCallback, useImperativeHandle, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { parseFacePageMessage } from "./bridge";
import type { FaceHostMessage } from "./bridge";
import {
  faceOrigin,
  useFacePageRetry,
  useFacePageSync,
  useFacePageUrl,
  type FaceFrameProps,
} from "./face-frame-shared";

// The avatar page in a WebView on the daemon's origin. Plain http works here because the page
// needs no secure context in host mode (no AudioWorklet: the app sends the mouth frames).
// Navigation is pinned to the page itself. Storage stays on, and the WebView is not incognito:
// the page keeps the 23 MB model in IndexedDB, because Android WebView's HTTP cache (about
// 20 MB) never stores a file that large. A page that fails to load (the daemon restarting) is
// loaded again by itself, so the face comes back without a tap.

export function FaceFrame({ url, background, posterRef, onPageMessage, testID }: FaceFrameProps) {
  const webViewRef = useRef<WebView>(null);
  const pagePrefix = `${faceOrigin(url)}/avatar/`;
  const post = useCallback((message: FaceHostMessage) => {
    webViewRef.current?.injectJavaScript(
      `window.__hizuriFace && window.__hizuriFace(${JSON.stringify(message)}); true;`,
    );
  }, []);
  useImperativeHandle(posterRef, () => ({ post }), [post]);
  const onMessage = useFacePageSync({ post, background, onPageMessage });
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseFacePageMessage(event.nativeEvent.data);
      if (message) onMessage(message);
    },
    [onMessage],
  );
  const allowOnlyThePage = useCallback(
    ({ url: next }: { url: string }) => next.startsWith(pagePrefix),
    [pagePrefix],
  );
  const pageUrl = useFacePageUrl(url, background);
  const source = useMemo(() => ({ uri: pageUrl }), [pageUrl]);
  const originWhitelist = useMemo(() => [faceOrigin(url)], [url]);
  const style = useMemo(() => ({ flex: 1, backgroundColor: background }), [background]);
  const { generation, onFailed, onLoaded } = useFacePageRetry();
  // While it waits to try again the frame shows the app's background, not the system error page.
  const renderError = useCallback(() => <View style={style} />, [style]);

  return (
    <WebView
      key={generation}
      ref={webViewRef}
      testID={testID}
      style={style}
      source={source}
      originWhitelist={originWhitelist}
      onShouldStartLoadWithRequest={allowOnlyThePage}
      onMessage={handleMessage}
      onLoad={onLoaded}
      onError={onFailed}
      onHttpError={onFailed}
      renderError={renderError}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      domStorageEnabled
      thirdPartyCookiesEnabled={false}
      overScrollMode="never"
      scrollEnabled={false}
      bounces={false}
    />
  );
}
