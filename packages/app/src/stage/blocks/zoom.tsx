import { Image, type ImageLoadEventData } from "expo-image";
import { useCallback, useMemo, useState } from "react";
import { type LayoutChangeEvent, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import {
  fitContentSize,
  isActivePinchUpdate,
  type ViewportSize,
} from "@/components/zoomable-viewport/geometry";
import { useStageBlockContext } from "./block-context";
import { useImageAnimation } from "./use-image-animation";
import { useHoldPagesStill } from "./hold-still";

// A picture alone in its tab (show_file): it fills the tab, the user pinches it bigger around their
// fingers, drags it while it is bigger and double-taps to zoom in or back. A one-finger drag on a
// picture at its normal size still turns the agent pages; while the user pinches it or has it
// bigger, the pages and the edge panels hold still.

const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const ZOOMED_ABOVE = 1.02;
const SETTLE_MS = 220;

export function ZoomablePicture({
  uri,
  caption,
  testID,
}: {
  uri: string;
  caption: string;
  testID: string;
}) {
  const { active } = useStageBlockContext();
  const [viewport, setViewport] = useState<ViewportSize | null>(null);
  const [natural, setNatural] = useState<ViewportSize | null>(null);
  const [zoomed, setZoomed] = useState(false);
  useHoldPagesStill(active && zoomed);
  const imageRef = useImageAnimation(active);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const pinchReady = useSharedValue(false);
  const touches = useSharedValue(0);

  const fitted = useMemo(() => {
    if (!viewport) return null;
    return natural ? fitContentSize(natural, viewport) : viewport;
  }, [natural, viewport]);

  const gesture = useMemo(() => {
    const width = viewport?.width ?? 0;
    const height = viewport?.height ?? 0;
    const fittedWidth = fitted?.width ?? 0;
    const fittedHeight = fitted?.height ?? 0;
    const clamp = (offset: number, nextScale: number, fittedSize: number, size: number) => {
      "worklet";
      const max = Math.max(0, (fittedSize * nextScale - size) / 2);
      return Math.min(max, Math.max(-max, offset));
    };
    const settle = () => {
      "worklet";
      const isZoomed = scale.value > ZOOMED_ABOVE;
      if (!isZoomed) {
        scale.value = withTiming(1, { duration: SETTLE_MS });
        translateX.value = withTiming(0, { duration: SETTLE_MS });
        translateY.value = withTiming(0, { duration: SETTLE_MS });
      }
      scheduleOnRN(setZoomed, isZoomed);
    };
    const zoomAt = (x: number, y: number, nextScale: number) => {
      "worklet";
      const pointX = (x - width / 2 - translateX.value) / scale.value;
      const pointY = (y - height / 2 - translateY.value) / scale.value;
      scale.value = withTiming(nextScale, { duration: SETTLE_MS });
      translateX.value = withTiming(
        clamp(x - width / 2 - pointX * nextScale, nextScale, fittedWidth, width),
        { duration: SETTLE_MS },
      );
      translateY.value = withTiming(
        clamp(y - height / 2 - pointY * nextScale, nextScale, fittedHeight, height),
        { duration: SETTLE_MS },
      );
      scheduleOnRN(setZoomed, nextScale > ZOOMED_ABOVE);
    };

    const pinch = Gesture.Pinch()
      .onTouchesDown((event) => {
        touches.value = event.numberOfTouches;
      })
      .onTouchesUp((event) => {
        touches.value = event.numberOfTouches;
      })
      .onBegin((event) => {
        touches.value = event.numberOfPointers;
        startScale.value = scale.value;
        startX.value = translateX.value;
        startY.value = translateY.value;
        pinchReady.value = false;
      })
      .onStart(() => {
        scheduleOnRN(setZoomed, true);
      })
      .onUpdate((event) => {
        // Android sends one last update after a finger lifts, with the other finger's focal point.
        if (!isActivePinchUpdate(touches.value, event.numberOfPointers)) return;
        if (!pinchReady.value) {
          focalX.value = event.focalX;
          focalY.value = event.focalY;
          pinchReady.value = true;
        }
        const nextScale = Math.min(MAX_SCALE, Math.max(1, startScale.value * event.scale));
        const pointX = (focalX.value - width / 2 - startX.value) / startScale.value;
        const pointY = (focalY.value - height / 2 - startY.value) / startScale.value;
        scale.value = nextScale;
        translateX.value = clamp(
          event.focalX - width / 2 - pointX * nextScale,
          nextScale,
          fittedWidth,
          width,
        );
        translateY.value = clamp(
          event.focalY - height / 2 - pointY * nextScale,
          nextScale,
          fittedHeight,
          height,
        );
      })
      .onFinalize(() => {
        touches.value = 0;
        settle();
      });

    const pan = Gesture.Pan()
      .enabled(zoomed)
      .maxPointers(1)
      .onBegin(() => {
        startX.value = translateX.value;
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        translateX.value = clamp(
          startX.value + event.translationX,
          scale.value,
          fittedWidth,
          width,
        );
        translateY.value = clamp(
          startY.value + event.translationY,
          scale.value,
          fittedHeight,
          height,
        );
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((event, success) => {
        if (!success) return;
        zoomAt(event.x, event.y, scale.value > ZOOMED_ABOVE ? 1 : DOUBLE_TAP_SCALE);
      });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [
    fitted,
    focalX,
    focalY,
    pinchReady,
    scale,
    startScale,
    startX,
    startY,
    touches,
    translateX,
    translateY,
    viewport,
    zoomed,
  ]);

  const transformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setViewport({ width, height });
  }, []);
  const handleLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setNatural({ width, height });
  }, []);
  const source = useMemo(() => ({ uri }), [uri]);

  return (
    <View style={styles.root} onLayout={handleLayout} testID={testID}>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.canvas, transformStyle]}>
          <Image
            ref={imageRef}
            source={source}
            style={styles.image}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={350}
            onLoad={handleLoad}
            autoplay={active}
            accessibilityLabel={caption || undefined}
          />
        </Animated.View>
      </GestureDetector>
      {caption && !zoomed ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  canvas: {
    flex: 1,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  caption: {
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    bottom: theme.spacing[4],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
