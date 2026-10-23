import { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type FaceHostMessage, parseFacePageMessage } from "./bridge";
import {
  faceOrigin,
  useFacePageSync,
  useFacePageUrl,
  type FaceFrameProps,
} from "./face-frame-shared";

// The avatar page in an iframe on the daemon's origin. Unlike the Show page it needs its own origin
// (`allow-same-origin`): it loads ES modules and keeps its model in IndexedDB, and an opaque origin
// gets neither. It is our own page from the user's machine, not agent content. Messages are
// accepted only from this iframe's window.
const SANDBOX = "allow-scripts allow-same-origin";

export function FaceFrame({ url, background, posterRef, onPageMessage, testID }: FaceFrameProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const origin = faceOrigin(url);
  const pageUrl = useFacePageUrl(url, background);
  const post = useCallback(
    (message: FaceHostMessage) => iframeRef.current?.contentWindow?.postMessage(message, origin),
    [origin],
  );
  useImperativeHandle(posterRef, () => ({ post }), [post]);
  const onMessage = useFacePageSync({ post, background, onPageMessage });

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      if (event.origin !== origin) return;
      const message = parseFacePageMessage(event.data);
      if (message) onMessage(message);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onMessage, origin]);

  const style = useMemo(
    () => ({
      flex: 1,
      width: "100%",
      height: "100%",
      minHeight: 0,
      border: "none",
      display: "block",
      backgroundColor: background,
    }),
    [background],
  );

  return (
    <iframe
      ref={iframeRef}
      data-testid={testID}
      title={t("face.title")}
      src={pageUrl}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      style={style}
    />
  );
}
