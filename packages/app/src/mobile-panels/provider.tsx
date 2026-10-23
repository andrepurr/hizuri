import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Keyboard, useWindowDimensions } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";
import { isNative } from "@/constants/platform";
import {
  usePanelStore,
  type MobilePanelSelection,
  type MobilePanelView,
} from "@/stores/panel-store";
import {
  canBeginMobilePanelGesture,
  createMobilePanelMotionState,
  getMobilePanelAnchor,
  isMobilePanelGestureCurrent,
  transitionMobilePanel,
  type MobilePanelCommit,
  type MobilePanelMotionState,
  type MobilePanelTransition,
} from "./model";

const ANIMATION_DURATION = 220;
const ANIMATION_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);

interface MobilePanelsRuntime {
  beginGesture: (input: BeginGestureInput) => number;
  finishGesture: (input: FinishGestureInput) => MobilePanelCommit | null;
  leftCloseGestureRef: RefObject<GestureType | undefined>;
  leftOpenGestureRef: RefObject<GestureType | undefined>;
  motionState: SharedValue<MobilePanelMotionState>;
  agentListOpenBlocked: SharedValue<boolean>;
  fileExplorerOpenBlocked: SharedValue<boolean>;
  /** Set on the UI thread while a finger is down on a control that owns its drag (Show's tab
   * switchers); both opening swipes fail for that touch. */
  openTouchHeld: SharedValue<boolean>;
  position: SharedValue<number>;
  rightOpenGestureRef: RefObject<GestureType | undefined>;
  updateGesture: (startedRevision: number, nextPosition: number) => boolean;
  setOpenGestureBlocked: (owner: symbol, side: MobilePanelOpenSide | null) => void;
  windowWidth: number;
}

interface BeginGestureInput {
  origin: MobilePanelView;
}

interface FinishGestureInput {
  startedRevision: number;
  success: boolean;
  target: MobilePanelView;
}

/** Which panel-opening swipe a surface takes over: toward the agent list, the explorer, or both. */
export type MobilePanelOpenSide = "agent-list" | "file-explorer" | "both";

const MobilePanelsContext = createContext<MobilePanelsRuntime | null>(null);
const MobilePanelActiveContext = createContext<MobilePanelView>("agent");

export function MobilePanelsProvider({ children }: { children: ReactNode }) {
  const { width: windowWidth } = useWindowDimensions();
  const initialSelection = useRef(usePanelStore.getState().mobilePanel).current;
  const position = useSharedValue(getMobilePanelAnchor(initialSelection.target));
  const motionState = useSharedValue(createMobilePanelMotionState(initialSelection));
  const agentListOpenBlocked = useSharedValue(false);
  const fileExplorerOpenBlocked = useSharedValue(false);
  const openTouchHeld = useSharedValue(false);
  const openGestureBlockersRef = useRef(new Map<symbol, MobilePanelOpenSide>());
  const leftOpenGestureRef = useRef<GestureType | undefined>(undefined);
  const leftCloseGestureRef = useRef<GestureType | undefined>(undefined);
  const rightOpenGestureRef = useRef<GestureType | undefined>(undefined);
  const [activePanel, setActivePanel] = useState(initialSelection.target);

  const setOpenGestureBlocked = useCallback(
    (owner: symbol, side: MobilePanelOpenSide | null) => {
      if (side) {
        openGestureBlockersRef.current.set(owner, side);
      } else {
        openGestureBlockersRef.current.delete(owner);
      }
      const sides = [...openGestureBlockersRef.current.values()];
      agentListOpenBlocked.value = sides.some((blocked) => blocked !== "file-explorer");
      fileExplorerOpenBlocked.value = sides.some((blocked) => blocked !== "agent-list");
    },
    [agentListOpenBlocked, fileExplorerOpenBlocked],
  );

  const publishActivePanel = useCallback((panel: MobilePanelView, revision: number) => {
    const selection = usePanelStore.getState().mobilePanel;
    if (selection.revision !== revision || selection.target !== panel) {
      return;
    }
    if (isNative && panel !== "agent") {
      Keyboard.dismiss();
    }
    setActivePanel(panel);
  }, []);

  useAnimatedReaction(
    () => ({ motionState: motionState.value, position: position.value }),
    ({ motionState: currentState, position: currentPosition }) => {
      const settled = transitionMobilePanel(currentState, {
        type: "position.changed",
        position: currentPosition,
      });
      if (settled.state === currentState) {
        return;
      }
      motionState.value = settled.state;
      scheduleOnRN(publishActivePanel, settled.state.settledTarget, settled.state.revision);
    },
    [motionState, position, publishActivePanel],
  );

  const animateTransition = useCallback(
    (transition: MobilePanelTransition) => {
      "worklet";
      if (!transition.animationTarget) {
        return;
      }
      const target = transition.animationTarget;
      position.value = withTiming(getMobilePanelAnchor(target), {
        duration: ANIMATION_DURATION,
        easing: ANIMATION_EASING,
      });
    },
    [position],
  );

  const applySelection = useCallback(
    (selection: MobilePanelSelection) => {
      "worklet";
      const currentState = motionState.value;
      const transition = transitionMobilePanel(currentState, {
        type: "command",
        selection,
      });
      if (transition.state === currentState) {
        return;
      }
      motionState.value = transition.state;
      animateTransition(transition);
    },
    [animateTransition, motionState],
  );

  useEffect(() => {
    return usePanelStore.subscribe((state, previousState) => {
      const selection = state.mobilePanel;
      if (selection === previousState.mobilePanel) {
        return;
      }
      scheduleOnUI(applySelection, selection);
    });
  }, [applySelection]);

  const beginGesture = useCallback(
    ({ origin }: BeginGestureInput): number => {
      "worklet";
      const currentState = motionState.value;
      if (!canBeginMobilePanelGesture(currentState, origin, position.value)) {
        return -1;
      }
      const transition = transitionMobilePanel(currentState, {
        type: "gesture.begin",
        origin,
      });
      motionState.value = transition.state;
      cancelAnimation(position);
      return transition.state.gesture?.startedRevision ?? -1;
    },
    [motionState, position],
  );

  const updateGesture = useCallback(
    (startedRevision: number, nextPosition: number): boolean => {
      "worklet";
      if (!isMobilePanelGestureCurrent(motionState.value, startedRevision)) {
        return false;
      }
      position.value = Math.max(-1, Math.min(1, nextPosition));
      return true;
    },
    [motionState, position],
  );

  const finishGesture = useCallback(
    ({ startedRevision, target, success }: FinishGestureInput): MobilePanelCommit | null => {
      "worklet";
      const currentState = motionState.value;
      const transition = transitionMobilePanel(currentState, {
        type: "gesture.finish",
        startedRevision,
        success,
        target,
      });
      if (transition.state === currentState) {
        return null;
      }
      motionState.value = transition.state;
      animateTransition(transition);
      return transition.commit ?? null;
    },
    [animateTransition, motionState],
  );

  const value = useMemo<MobilePanelsRuntime>(
    () => ({
      beginGesture,
      finishGesture,
      leftCloseGestureRef,
      leftOpenGestureRef,
      motionState,
      agentListOpenBlocked,
      fileExplorerOpenBlocked,
      openTouchHeld,
      position,
      rightOpenGestureRef,
      updateGesture,
      setOpenGestureBlocked,
      windowWidth,
    }),
    [
      beginGesture,
      finishGesture,
      motionState,
      agentListOpenBlocked,
      fileExplorerOpenBlocked,
      openTouchHeld,
      position,
      setOpenGestureBlocked,
      updateGesture,
      windowWidth,
    ],
  );

  return (
    <MobilePanelsContext.Provider value={value}>
      <MobilePanelActiveContext.Provider value={activePanel}>
        {children}
      </MobilePanelActiveContext.Provider>
    </MobilePanelsContext.Provider>
  );
}

/** Internal to the mobile-panels module. Callers use gesture and presentation adapters. */
export function useMobilePanelsRuntime(): MobilePanelsRuntime {
  const context = useContext(MobilePanelsContext);
  if (!context) {
    throw new Error("useMobilePanelsRuntime must be used within MobilePanelsProvider");
  }
  return context;
}

/**
 * The touch-down hold for the panel-opening swipes, or null outside the compact panels. A control
 * that owns its drag sets it in its gesture's onTouchesDown and clears it when the touch ends:
 * unlike useBlockMobilePanelOpenGestures it acts on the UI thread before the first move.
 */
export function useMobilePanelOpenTouchHold(): SharedValue<boolean> | null {
  return useContext(MobilePanelsContext)?.openTouchHeld ?? null;
}

export function useIsMobilePanelActive(panel: MobilePanelView): boolean {
  return useContext(MobilePanelActiveContext) === panel;
}

/**
 * While `blocked`, the panel-opening swipe toward `side` belongs to the calling surface: a terminal
 * selection takes both, the agent pages take the side they can still page toward.
 */
export function useBlockMobilePanelOpenGestures(
  blocked: boolean,
  side: MobilePanelOpenSide = "both",
): void {
  const { setOpenGestureBlocked } = useMobilePanelsRuntime();
  const owner = useRef(Symbol("mobile-panel-open-gesture-blocker")).current;

  useLayoutEffect(() => {
    setOpenGestureBlocked(owner, blocked ? side : null);
    return () => setOpenGestureBlocked(owner, null);
  }, [blocked, owner, setOpenGestureBlocked, side]);
}
