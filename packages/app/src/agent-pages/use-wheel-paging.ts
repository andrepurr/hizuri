import type { RefObject } from "react";
import type { View } from "react-native";

/** Native pages move by finger only; the trackpad version is use-wheel-paging.web.ts. */
export function useWheelPaging(
  _viewport: RefObject<View | null>,
  _onStep: (step: -1 | 1) => void,
  _enabled: boolean,
): void {}
