import { create } from "zustand";

/**
 * True while Zuri's perch window (stage/perch.tsx) holds a face page: the face page and the face
 * split let go of theirs meanwhile, so the phone keeps one WebGL page per screen.
 */
export const usePerchStore = create<{ mounted: boolean }>()(() => ({ mounted: false }));

export function usePerching(): boolean {
  return usePerchStore((state) => state.mounted);
}
