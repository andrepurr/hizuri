import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FaceHostMessage, FacePageMessage } from "./bridge";

export interface FacePoster {
  post(message: FaceHostMessage): void;
}

export interface FaceFrameProps {
  url: string;
  background: string;
  posterRef: RefObject<FacePoster | null>;
  onPageMessage: (message: FacePageMessage) => void;
  testID?: string;
}

/** The background of floating Zuri: the page clears to zero alpha and paints no still. */
export const FACE_TRANSPARENT = "transparent";

/**
 * The page URL with the app's background (`bg`, hex without '#', or `transparent`), so the page
 * paints it before its code loads. Taken once per mount: a theme change reaches the page as
 * face.theme, not as a reload.
 */
export function useFacePageUrl(url: string, background: string): string {
  const [initialBackground] = useState(background);
  return useMemo(() => {
    if (initialBackground === FACE_TRANSPARENT) return `${url}&bg=${FACE_TRANSPARENT}`;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(initialBackground)?.[1];
    return hex ? `${url}&bg=${hex}` : url;
  }, [initialBackground, url]);
}

/**
 * How long the face waits before it loads the page again after the page itself failed to load
 * (the daemon restarting or briefly unreachable): 2 s, then twice as long each time, at most 30 s.
 */
export function faceReloadDelayMs(failures: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, failures - 1));
}

/**
 * Loads the page again while it fails to load: `generation` changes for each new try (the frame
 * uses it as its key, so the try is a fresh page), and a page that loads resets the delay.
 */
export function useFacePageRetry(): {
  generation: number;
  onFailed: () => void;
  onLoaded: () => void;
} {
  const [generation, setGeneration] = useState(0);
  const failuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );
  const onFailed = useCallback(() => {
    if (timerRef.current) return;
    failuresRef.current += 1;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setGeneration((current) => current + 1);
    }, faceReloadDelayMs(failuresRef.current));
  }, []);
  const onLoaded = useCallback(() => {
    failuresRef.current = 0;
  }, []);
  return { generation, onFailed, onLoaded };
}

/** The scheme, host and port of the avatar page: the only origin the frame may load or answer from. */
export function faceOrigin(url: string): string {
  const match = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return match ? match[1] : "";
}

/** Sends the theme once the page is up and on every theme change; passes page messages on. */
export function useFacePageSync(input: {
  post: (message: FaceHostMessage) => void;
  background: string;
  onPageMessage: (message: FacePageMessage) => void;
}): (message: FacePageMessage) => void {
  const { post, background, onPageMessage } = input;
  const readyRef = useRef(false);
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  useEffect(() => {
    if (readyRef.current) post({ type: "face.theme", background });
  }, [background, post]);
  return useCallback(
    (message: FacePageMessage) => {
      if (message.type === "face.ready") {
        readyRef.current = true;
        post({ type: "face.theme", background: backgroundRef.current });
      }
      onPageMessage(message);
    },
    [onPageMessage, post],
  );
}
