import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { YoutubePlan } from "./model";
import type { MediaPlayerHandle } from "./player-handle";
import {
  buildYoutubePageUrl,
  commandMessage,
  isEmbedRefused,
  parseYoutubePageEvent,
  type YoutubePageEvent,
} from "./youtube-bridge";

// Lane 2 on web: the same daemon page in an iframe; commands and events travel by postMessage.
// The page is ours, and it needs its real origin (allow-same-origin) for YouTube to see a
// Referer; popups let a tap on the YouTube logo open youtube.com in a normal tab.
const SANDBOX =
  "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox";

const IFRAME_STYLE = {
  flex: 1,
  width: "100%",
  height: "100%",
  minHeight: 0,
  border: "none",
  backgroundColor: "black",
} as const;

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [startsPlaying] = useState(autoplay);
  const pageUrl = useMemo(
    () => buildYoutubePageUrl(baseUrl, plan, { autoplay: startsPlaying }),
    [baseUrl, plan, startsPlaying],
  );
  const pageOrigin = useMemo(() => new URL(pageUrl).origin, [pageUrl]);

  useImperativeHandle(
    ref,
    () => ({
      apply(command) {
        frameRef.current?.contentWindow?.postMessage(commandMessage(command), pageOrigin);
      },
    }),
    [pageOrigin],
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parseYoutubePageEvent(event.data);
      if (!message) return;
      onEvent?.(message);
      if (message.type === "media.error" && isEmbedRefused(message.code)) {
        onEmbedRefused?.(plan);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onEmbedRefused, onEvent, plan]);

  return (
    <iframe
      ref={frameRef}
      data-testid={testID}
      title="YouTube"
      src={pageUrl}
      sandbox={SANDBOX}
      style={IFRAME_STYLE}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
});
