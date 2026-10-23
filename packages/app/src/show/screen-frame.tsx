import { useCallback, useMemo } from "react";
import { StyleSheet } from "react-native-unistyles";
import { WebView } from "react-native-webview";

// The live stream of the agent's browser (Selkies over WebRTC) in a WebView. Unlike the Show
// page, this is a remote page: it plays video and sound as soon as it connects, so media must
// start without a tap, and it stores its own settings. Navigation stays on the stream's origin.
// Two fixes are injected into the page:
// - the watch-only viewer still mounts Selkies' touch-gamepad toggle on touch screens; it is
//   hidden;
// - the full viewer stretches the picture to the viewport (`object-fit: fill`) because it expects
//   the desktop to resize to the phone, and resizing Zuri's display is off. The video is switched
//   back to `contain` whenever Selkies resets it. Selkies maps taps through the letterboxed box
//   when the inline object-fit is not `fill`, so taps still land where they are drawn.
const ORIGIN_WHITELIST = ["http://*", "https://*"];
const PAGE_FIXES = `(function () {
  var style = document.createElement("style");
  style.textContent = ".player-gamepad-button { display: none !important; }";
  (document.head || document.documentElement).appendChild(style);
  function contain(video) {
    if (video.style.objectFit === "fill") video.style.objectFit = "contain";
  }
  function keepContained(video) {
    contain(video);
    new MutationObserver(function () {
      contain(video);
    }).observe(video, { attributes: true, attributeFilter: ["style"] });
  }
  var video = document.getElementById("stream");
  if (video) {
    keepContained(video);
    return;
  }
  var waiting = new MutationObserver(function () {
    var found = document.getElementById("stream");
    if (!found) return;
    waiting.disconnect();
    keepContained(found);
  });
  waiting.observe(document.documentElement, { childList: true, subtree: true });
})();
true;`;

export interface ShowScreenFrameProps {
  url: string;
  title: string;
  testID?: string;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function ShowScreenFrame({ url, title, testID }: ShowScreenFrameProps) {
  const source = useMemo(() => ({ uri: url }), [url]);
  const streamOrigin = useMemo(() => originOf(url), [url]);
  const allowStreamOrigin = useCallback(
    (request: { url: string }) =>
      request.url === "about:blank" || originOf(request.url) === streamOrigin,
    [streamOrigin],
  );

  return (
    <WebView
      testID={testID}
      accessibilityLabel={title}
      style={styles.webview}
      source={source}
      originWhitelist={ORIGIN_WHITELIST}
      onShouldStartLoadWithRequest={allowStreamOrigin}
      injectedJavaScript={PAGE_FIXES}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      domStorageEnabled
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      overScrollMode="never"
      bounces={false}
    />
  );
}

const styles = StyleSheet.create(() => ({
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
}));
