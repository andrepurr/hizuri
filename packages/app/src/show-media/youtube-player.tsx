import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { YoutubePlan } from "./model";
import type { MediaPlayerHandle } from "./player-handle";
import {
  buildYoutubePageUrl,
  commandScript,
  isEmbedRefused,
  parseYoutubePageEvent,
  type YoutubePageEvent,
} from "./youtube-bridge";

// Lane 2 on Android/iOS: YouTube's IFrame player on a daemon-served page in a WebView, drawn by
// the player tab (stage/blocks/player.tsx). It plays while hizuri is open; YouTube's rules forbid
// background play of embeds, so music that must keep going in the background goes to lane 3.

const ORIGIN_WHITELIST = ["http://*", "https://*"];

export const YoutubeLanePlayer = forwardRef<
  MediaPlayerHandle,
  {
    plan: YoutubePlan;
    baseUrl: string;
    autoplay?: boolean;
    onEmbedRefused?: (plan: YoutubePlan) => void;
    onEvent?: (event: YoutubePageEvent) => void;
    testID?: string;
  }
>(function YoutubeLanePlayer(
  { plan, baseUrl, autoplay = true, onEmbedRefused, onEvent, testID },
  ref,
) {
  const webViewRef = useRef<WebView>(null);
  // The page loads once per plan: a later change of `autoplay` must not reload it.
  const [startsPlaying] = useState(autoplay);
  const pageUrl = useMemo(
    () => buildYoutubePageUrl(baseUrl, plan, { autoplay: startsPlaying }),
    [baseUrl, plan, startsPlaying],
  );
  const pageOrigin = useMemo(() => new URL(pageUrl).origin, [pageUrl]);
  const source = useMemo(() => ({ uri: pageUrl }), [pageUrl]);

  useImperativeHandle(
    ref,
    () => ({
      apply(command) {
        webViewRef.current?.injectJavaScript(commandScript(command));
      },
    }),
    [],
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseYoutubePageEvent(event.nativeEvent.data);
      if (!message) return;
      onEvent?.(message);
      if (message.type === "media.error" && isEmbedRefused(message.code)) {
        onEmbedRefused?.(plan);
      }
    },
    [onEmbedRefused, onEvent, plan],
  );

  // The page and the player frames it embeds load here; a tap on the YouTube logo or a title
  // opens the YouTube app instead of turning the player into a browser.
  const keepPlayerPage = useCallback(
    (request: { url: string; isTopFrame?: boolean }) => {
      if (request.isTopFrame === false) return true;
      if (request.url.startsWith(pageOrigin)) return true;
      void Linking.openURL(request.url);
      return false;
    },
    [pageOrigin],
  );

  return (
    <WebView
      ref={webViewRef}
      testID={testID}
      style={styles.webview}
      source={source}
      originWhitelist={ORIGIN_WHITELIST}
      onShouldStartLoadWithRequest={keepPlayerPage}
      onMessage={handleMessage}
      mediaPlaybackRequiresUserAction={false}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      allowsPictureInPictureMediaPlayback
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
    />
  );
});

const styles = StyleSheet.create((theme) => ({
  webview: {
    flex: 1,
    backgroundColor: theme.colors.palette.black,
  },
}));
