import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ShowHostMessage } from "./bridge";
import { useShowFrameSync, type ShowFrameProps } from "./frame-sync";
import { SHOW_PAGE_HTML } from "./page";

// `allow-scripts` alone, as for the HTML file preview (file-pane/html-preview.web.tsx): the page
// gets an opaque origin, so it cannot reach the app's DOM, cookies or storage. Messages from the
// frame are accepted only when they come from this iframe's window.
const SANDBOX = "allow-scripts";

const iframeStyle = {
  flex: 1,
  width: "100%",
  height: "100%",
  minHeight: 0,
  border: "none",
  backgroundColor: "transparent",
} as const;

export function ShowFrame({ palette, strings, render, testID }: ShowFrameProps) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const post = useCallback((message: ShowHostMessage) => {
    // The sandboxed page has an opaque origin, so "*" is the only target origin that reaches it.
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);
  const onPageMessage = useShowFrameSync({ post, palette, strings, render });

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      onPageMessage(event.data);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onPageMessage]);

  return (
    <iframe
      ref={iframeRef}
      data-testid={testID}
      title={t("show.title")}
      srcDoc={SHOW_PAGE_HTML}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      style={iframeStyle}
    />
  );
}
