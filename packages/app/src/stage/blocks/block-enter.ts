import { createContext, useContext } from "react";

// When the block around a row comes in: rows, steps and lines inside a block start after their
// block, so a tab that arrives whole unfolds top to bottom. Null once the tab has arrived: a
// change Zuri makes later appears in place without a cascade.

export const BlockEnterContext = createContext<number | null>(null);

export function useBlockEnterDelay(): number | null {
  return useContext(BlockEnterContext);
}
