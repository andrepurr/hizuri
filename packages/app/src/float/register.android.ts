import { AppRegistry } from "react-native";
import { FloatingZuri } from "./floating-zuri";

// Must match FloatService.SURFACE and KEEP_ALIVE_TASK in modules/hizuri-float.
const SURFACE = "HizuriFloat";
const KEEP_ALIVE_TASK = "HizuriFloatKeepAlive";

let finishKeepAliveTask: (() => void) | null = null;

/** The assistant's window root component and keep-alive task, registered once at startup. */
export function registerFloat(): void {
  AppRegistry.registerComponent(SURFACE, () => FloatingZuri);
  // React Native pauses JS timers while the activity is paused unless a headless task runs; the
  // assistant's strolls run on timers. The native module starts this task while the window is up.
  AppRegistry.registerHeadlessTask(
    KEEP_ALIVE_TASK,
    () => () =>
      new Promise<void>((resolve) => {
        finishKeepAliveTask?.();
        finishKeepAliveTask = resolve;
      }),
  );
}
