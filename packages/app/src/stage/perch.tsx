import type { StagePerch } from "@getpaseo/protocol/stage";
import {
  createContext,
  memo,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppState,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { useRetainedPanelActive } from "@/components/retained-panel";
import type { FaceHostMessage, FacePageAudio, FacePageMessage } from "@/face/bridge";
import { FaceFrame } from "@/face/face-frame";
import { FACE_TRANSPARENT, type FacePoster } from "@/face/face-frame-shared";
import { useFaceAvailable, useFaceUrl } from "@/face/face-host";
import { useFaceActivity } from "@/face/use-face-activity";
import { useFaceVoiceFeed } from "@/face/use-face-voice-feed";
import { useFloatShown } from "@/float/float-bridge";
import type { StageBlockNode } from "./model";
import { blockLayout } from "./motion";
import {
  blockTypeOf,
  hopPoint,
  PERCH_HOP_MS,
  perchOnScreen,
  perchPose,
  perchScrollTarget,
  perchRoom,
  type PerchRect,
  perchWindow,
  type PerchWindow,
} from "./perch-model";
import { usePerchStore } from "./perch-store";

// Zuri perched on a block of the tab in front (stage_perch): its small see-through face
// page sits over the block's top edge inside the scroll view, so it scrolls with the block on
// the UI thread. It fades out (and stops drawing) once the block scrolls away and comes back
// with it; a new block is a hop in an arc, and a new perch on a block the user scrolled away from
// scrolls it back into view. The perch window takes no touches: the block under it
// still reads and taps. While perched, the assistant holds the only face page of the app
// (perch-store.ts): the face page and the face split let go of theirs.

export const PERCH_SCROLL_THROTTLE_MS = 64;
const PERCH_PAUSE_AFTER_MS = 320;

/** The scroll view's offset and height, read by the perch without re-rendering the tab. */
export interface PerchViewport {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  read: () => { scrollY: number; height: number };
  subscribe: (listener: () => void) => () => void;
  scrollTo: (y: number) => void;
}

export function usePerchViewport(scrollRef: RefObject<ScrollView | null>): PerchViewport {
  const [viewport] = useState((): PerchViewport => {
    let scrollY = 0;
    let height = 0;
    const listeners = new Set<() => void>();
    const emit = () => {
      for (const listener of listeners) listener();
    };
    return {
      onScroll: (event) => {
        scrollY = event.nativeEvent.contentOffset.y;
        emit();
      },
      onLayout: (event) => {
        height = event.nativeEvent.layout.height;
        emit();
      },
      read: () => ({ scrollY, height }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      scrollTo: (y) => scrollRef.current?.scrollTo({ y, animated: true }),
    };
  });
  return viewport;
}

interface PerchTarget {
  blockId: string;
  ref: (node: View | null) => void;
  onLayout: () => void;
}

const PerchTargetContext = createContext<PerchTarget | null>(null);

/**
 * For the block the assistant sits on: the ref and layout callback that measure it; null for the
 * rest.
 */
export function usePerchTarget(blockId: string): PerchTarget | null {
  const target = useContext(PerchTargetContext);
  return target?.blockId === blockId ? target : null;
}

export interface PerchInfo {
  serverId: string;
  agentId: string;
  perch: StagePerch;
}

/**
 * The tab's block list with the assistant perched over it. Always mounted around the list, so its
 * arrival never remounts the blocks; with no perch it is a plain wrapper.
 */
export function PerchArea({
  info,
  blocks,
  active,
  viewport,
  headerHeight,
  children,
}: {
  info: PerchInfo | null;
  blocks: readonly StageBlockNode[];
  /** The Show page is the page on screen. */
  active: boolean;
  viewport: PerchViewport;
  headerHeight: number;
  children: ReactNode;
}) {
  const perch = info?.perch ?? null;
  const blockId = perch?.block ?? null;
  const listRef = useRef<View>(null);
  const blockRef = useRef<View | null>(null);
  // The measured block, with its id: after a hop request the old block's box stays until the new
  // one is measured, so the assistant is placed (and hops) only once its new block's box is known.
  const [rect, setRect] = useState<(PerchRect & { block: string }) | null>(null);
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;
  const [list, setList] = useState<{ top: number; inset: number; width: number } | null>(null);
  const roomRef = useRef(0);

  const measure = useCallback(() => {
    const node = blockRef.current;
    const listNode = listRef.current;
    const block = blockIdRef.current;
    if (!node || !listNode || !block) return;
    node.measureLayout(
      listNode,
      (x, y, width, height) =>
        setRect((previous) =>
          previous &&
          previous.block === block &&
          previous.x === x &&
          previous.y === y &&
          previous.width === width &&
          previous.height === height
            ? previous
            : { block, x, y, width, height },
        ),
      () => setRect(null),
    );
  }, []);

  const target = useMemo((): PerchTarget | null => {
    if (!blockId) return null;
    return {
      blockId,
      ref: (node) => {
        blockRef.current = node;
        if (node) measure();
      },
      onLayout: measure,
    };
  }, [blockId, measure]);

  useEffect(() => {
    if (!blockId) setRect(null);
  }, [blockId]);

  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width } = event.nativeEvent.layout;
      // The list's top without the room made for the assistant's head: room changes must not feed
      // back.
      const top = y - roomRef.current;
      setList((previous) =>
        previous && previous.top === top && previous.inset === x && previous.width === width
          ? previous
          : { top, inset: x, width },
      );
      measure();
    },
    [measure],
  );

  const fresh = useMemo(() => {
    if (!perch || !rect || !list || rect.block !== perch.block) return null;
    const spot = perchWindow({
      pose: perchPose(perch.pose),
      side: perch.side,
      block: rect,
      blockType: blockTypeOf(blocks, perch.block),
      // The assistant may lean out into the page's side padding.
      bounds: { left: -list.inset, right: list.width + list.inset },
    });
    return { perch, spot };
  }, [perch, rect, list, blocks]);
  // While the new block is being measured the assistant stays as it was on the old one.
  const placedRef = useRef<{ perch: StagePerch; spot: PerchWindow } | null>(null);
  if (fresh || !perch || !rect) placedRef.current = fresh;
  const placed = placedRef.current;
  const spot = placed?.spot ?? null;

  const room = spot && list ? perchRoom({ window: spot, listTop: list.top, headerHeight }) : 0;
  roomRef.current = room;
  const listTop = list ? list.top + room : 0;

  // On screen while enough of the block shows; checked on every throttled scroll event.
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    if (!rect) {
      setOnScreen(false);
      return;
    }
    const check = () => {
      const { scrollY, height } = viewport.read();
      setOnScreen(
        height > 0 &&
          perchOnScreen({ block: rect, listTop, scrollY, viewportHeight: height, headerHeight }),
      );
    };
    check();
    return viewport.subscribe(check);
  }, [rect, listTop, headerHeight, viewport]);

  useBringBlockBack({
    perch,
    rect,
    spot,
    listTop,
    headerHeight,
    viewport,
  });

  return (
    <>
      {room > 0 ? <PerchRoom height={room} /> : null}
      <Animated.View ref={listRef} collapsable={false} onLayout={onListLayout} layout={blockLayout}>
        <PerchTargetContext.Provider value={target}>{children}</PerchTargetContext.Provider>
        {active && info && placed ? (
          <PerchGate info={info} perch={placed.perch} spot={placed.spot} onScreen={onScreen} />
        ) : null}
      </Animated.View>
    </>
  );
}

/** A new perch on a block the user scrolled away from brings the block back, once per perch. */
function useBringBlockBack(input: {
  perch: StagePerch | null;
  rect: (PerchRect & { block: string }) | null;
  /** The perch window; null until the block and the list are measured. */
  spot: PerchWindow | null;
  listTop: number;
  headerHeight: number;
  viewport: PerchViewport;
}) {
  const { perch, rect, listTop, headerHeight, viewport } = input;
  const above = input.spot?.above ?? null;
  const broughtRef = useRef<string | null>(null);
  const perchAt = perch?.at ?? null;
  const blockId = perch?.block ?? null;
  useEffect(() => {
    if (!perchAt || !rect || above === null || rect.block !== blockId) return;
    if (broughtRef.current === perchAt) return;
    broughtRef.current = perchAt;
    const { scrollY, height } = viewport.read();
    if (height <= 0) return;
    const y = perchScrollTarget({
      block: rect,
      above,
      listTop,
      scrollY,
      viewportHeight: height,
      headerHeight,
    });
    if (y !== null) viewport.scrollTo(y);
  }, [perchAt, blockId, rect, above, listTop, headerHeight, viewport]);
}

function PerchRoom({ height }: { height: number }) {
  const style = useMemo(() => ({ height }), [height]);
  return <View style={style} />;
}

/**
 * The perch window is mounted only where a face may show: served, switched on, on screen, not
 * floating.
 */
function PerchGate(props: {
  info: PerchInfo;
  perch: StagePerch;
  spot: PerchWindow;
  onScreen: boolean;
}) {
  const available = useFaceAvailable(props.info.serverId);
  const url = useFaceUrl(props.info.serverId);
  const active = useRetainedPanelActive();
  const floating = useFloatShown();
  if (!available || !url || !active || floating) return null;
  return <PerchWindowView {...props} url={url} />;
}

const PerchWindowView = memo(function PerchWindowView({
  info,
  perch,
  spot,
  onScreen,
  url,
}: {
  info: PerchInfo;
  perch: StagePerch;
  spot: PerchWindow;
  onScreen: boolean;
  url: string;
}) {
  const { serverId, agentId } = info;
  const posterRef = useRef<FacePoster | null>(null);
  const readyRef = useRef(false);
  const audioRef = useRef<FacePageAudio | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    usePerchStore.setState({ mounted: true });
    return () => usePerchStore.setState({ mounted: false });
  }, []);

  useFaceVoiceFeed({ serverId, agentId, posterRef, readyRef, audioRef });
  const post = useCallback((message: FaceHostMessage) => {
    if (readyRef.current) posterRef.current?.post(message);
  }, []);
  const handlePageMessage = useCallback((message: FacePageMessage) => {
    if (message.type === "face.ready") {
      readyRef.current = true;
      audioRef.current = message.audio ?? null;
      setReady(true);
    } else if (message.type === "face.error") {
      console.warn("[perch] page error:", message.message);
    }
  }, []);

  const activity = useFaceActivity(serverId, agentId);
  useEffect(() => {
    if (ready) post({ type: "face.activity", activity });
  }, [activity, ready, post]);

  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);
  const shown = onScreen && appActive;

  // Where the assistant's edge point is, and the hop between two blocks.
  const reduceMotion = useReducedMotion();
  const from = useSharedValue({ x: spot.x, y: spot.line });
  const to = useSharedValue({ x: spot.x, y: spot.line });
  const progress = useSharedValue(1);
  const size = useSharedValue({ half: spot.width / 2, above: spot.above });
  const placedRef = useRef<{ block: string; x: number; line: number } | null>(null);
  const hopRef = useRef(false);
  useEffect(() => {
    const placed = placedRef.current;
    size.value = { half: spot.width / 2, above: spot.above };
    if (placed && placed.x === spot.x && placed.line === spot.line) return;
    const hop = placed !== null && placed.block !== perch.block && !reduceMotion;
    placedRef.current = { block: perch.block, x: spot.x, line: spot.line };
    hopRef.current = hop;
    if (hop) {
      from.value = hopPoint(from.value, to.value, progress.value);
      to.value = { x: spot.x, y: spot.line };
      progress.value = 0;
      progress.value = withTiming(1, { duration: PERCH_HOP_MS });
    } else {
      from.value = { x: spot.x, y: spot.line };
      to.value = { x: spot.x, y: spot.line };
      progress.value = 1;
    }
  }, [perch.block, spot, reduceMotion, from, to, progress, size]);
  const placeStyle = useAnimatedStyle(() => {
    const point = hopPoint(from.value, to.value, progress.value);
    return {
      transform: [
        { translateX: point.x - size.value.half },
        { translateY: point.y - size.value.above },
      ],
    };
  });

  // The page draws the pose; off screen the assistant fades out and then stops drawing.
  const { pose, side } = perch;
  const { anchor, scale } = spot;
  const targetX = spot.target?.x ?? null;
  const targetY = spot.target?.y ?? null;
  useEffect(() => {
    if (!ready) return;
    if (!shown) {
      post({ type: "face.perch", pose: "off" });
      const timer = setTimeout(() => post({ type: "face.pause" }), PERCH_PAUSE_AFTER_MS);
      return () => clearTimeout(timer);
    }
    post({ type: "face.resume" });
    return undefined;
  }, [ready, shown, post]);
  useEffect(() => {
    if (!ready || !shown) return;
    post({
      type: "face.perch",
      pose: perchPose(pose),
      anchor,
      scale,
      side: side === "left" ? "left" : "right",
      target: targetX === null || targetY === null ? null : { x: targetX, y: targetY },
      hop: hopRef.current,
    });
    hopRef.current = false;
  }, [ready, shown, perch.at, perch.block, pose, side, anchor, scale, targetX, targetY, post]);

  // The URL is taken once: a pose's own window size and edge line reach the page as face.perch.
  const [pageUrl] = useState(
    () => `${url}&perch=1&anchor=${spot.anchor.toFixed(3)}&scale=${spot.scale}`,
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.window, { width: spot.width, height: spot.height }, placeStyle]}
      testID="stage-perch"
    >
      <FaceFrame
        url={pageUrl}
        background={FACE_TRANSPARENT}
        posterRef={posterRef}
        onPageMessage={handlePageMessage}
        testID="stage-perch-face"
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  window: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 10,
    elevation: 10,
    backgroundColor: "transparent",
  },
});
