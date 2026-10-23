import { useEffect } from "react";
import { create } from "zustand";

/**
 * One avatar at a time: with two agent chats open, both face pages stay loaded — two live 3-D pages
 * overload the phone. The holder is the agent the user talks with: the voice session's agent first,
 * else the face page in front. Every other agent's page shows the mark and keeps no WebView.
 */

export interface FaceClaim {
  voice: boolean;
  shown: boolean;
}

const claims = new Map<string, FaceClaim>();

export const useFaceOwnerStore = create<{ owner: string | null }>()(() => ({ owner: null }));

function scoreOf(claim: FaceClaim): number {
  return (claim.voice ? 2 : 0) + (claim.shown ? 1 : 0);
}

/** On a tie the holder keeps the face: a swipe off its page must not reload it elsewhere. */
function recompute() {
  const current = useFaceOwnerStore.getState().owner;
  const currentClaim = current === null ? undefined : claims.get(current);
  let best: string | null = currentClaim ? current : null;
  let bestScore = currentClaim ? scoreOf(currentClaim) : -1;
  for (const [key, claim] of claims) {
    const score = scoreOf(claim);
    if (score > bestScore) {
      bestScore = score;
      best = key;
    }
  }
  if (best !== current) useFaceOwnerStore.setState({ owner: best });
}

/** Test seam: drive the claim table without React. */
export function claimFace(key: string, claim: FaceClaim): void {
  claims.set(key, claim);
  recompute();
}

export function releaseFace(key: string): void {
  claims.delete(key);
  recompute();
}

/** Test seam: forget every claim. */
export function resetFaceOwner(): void {
  claims.clear();
  useFaceOwnerStore.setState({ owner: null });
}

/**
 * Register this agent's claim on the only face page while `eligible` (served and switched on), and
 * return whether it holds the face now. A background panel claims too, so the agent the user talks
 * with by voice keeps the face even while the user looks at another chat.
 */
export function useFaceOwner(
  key: string,
  eligible: boolean,
  voice: boolean,
  shown: boolean,
): boolean {
  useEffect(() => {
    if (!eligible) return undefined;
    claims.set(key, { voice, shown });
    recompute();
    return () => {
      claims.delete(key);
      recompute();
    };
    // voice/shown move in their own effect below, so this one only mounts the claim
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, eligible]);
  useEffect(() => {
    const claim = claims.get(key);
    if (claim && (claim.voice !== voice || claim.shown !== shown)) {
      claim.voice = voice;
      claim.shown = shown;
      recompute();
    }
  });
  return useFaceOwnerStore((state) => state.owner === key);
}
