import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { controlExternalMedia, openMediaAccessSettings, openMediaApp } from "./app-lane";
import {
  EMPTY_MEDIA_HOST_STATE,
  applyMediaCall,
  selectMediaItems,
  takeFreshMediaCalls,
  type MediaCommand,
  type MediaEffect,
  type MediaHostState,
} from "./model";
import type { MediaPlayerHandle } from "./player-handle";

// Runs Zuri's media calls for one agent: opens the user's apps, steers their sessions, and hands
// its commands to the player tab's player (stage/blocks/player.tsx), which attaches with
// `attachPlayer`. The tab itself comes on the stage, so this hook draws nothing.

export interface ShowMediaController {
  attachPlayer: (handle: MediaPlayerHandle | null) => void;
}

export function useShowMedia({
  serverId,
  agentId,
  enabled,
  hasPlayer,
}: {
  serverId: string;
  agentId: string;
  /** The host has the media tools (COMPAT(showMedia)). */
  enabled: boolean;
  /** The stage has a player tab (it may still be mounting). */
  hasPlayer: boolean;
}): ShowMediaController {
  const { t } = useTranslation();
  const items = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectMediaItems(state.sessions[serverId], agentId),
    shallow,
  );
  const stateRef = useRef<MediaHostState>(EMPTY_MEDIA_HOST_STATE);
  const seenRef = useRef(new Set<string>());
  const playerRef = useRef<MediaPlayerHandle | null>(null);
  const pendingRef = useRef<MediaCommand[]>([]);
  const askedAccessRef = useRef(false);
  const hasPlayerRef = useRef(hasPlayer);
  hasPlayerRef.current = hasPlayer;
  const mountedAtRef = useRef(Date.now());

  const askForMediaAccess = useCallback(async () => {
    if (askedAccessRef.current) return;
    askedAccessRef.current = true;
    const allow = await confirmDialog({
      title: t("showMedia.accessTitle"),
      message: t("showMedia.accessMessage"),
      confirmLabel: t("showMedia.accessConfirm"),
      cancelLabel: t("showMedia.accessCancel"),
    });
    if (allow) openMediaAccessSettings();
  }, [t]);

  const runEffect = useCallback(
    (effect: MediaEffect) => {
      switch (effect.type) {
        case "open-app":
          void openMediaApp(effect.plan);
          return;
        case "player-command":
          if (playerRef.current) {
            playerRef.current.apply(effect.command);
          } else {
            pendingRef.current.push(effect.command);
          }
          return;
        case "external-command":
          if (controlExternalMedia(effect) === "needs-access") void askForMediaAccess();
          return;
      }
    },
    [askForMediaAccess],
  );

  useEffect(() => {
    if (!enabled) return;
    const calls = takeFreshMediaCalls({ items, seen: seenRef.current, now: Date.now() });
    if (calls.length === 0) return;
    let next = stateRef.current;
    let hasTab = hasPlayerRef.current;
    const effects: MediaEffect[] = [];
    for (const call of calls) {
      // A command from before this screen came (the app restarted, the user came back to the chat)
      // has been played already; replayed before the player tab loads, it would steer the user's
      // other apps.
      if (call.kind === "control" && call.at < mountedAtRef.current) continue;
      if (call.kind === "show") {
        // The daemon opened the player tab (or closed it for an external app): commands after it in
        // the same batch wait for the new player, not the one about to unmount.
        hasTab = call.plan.lane !== "app";
        pendingRef.current = [];
      }
      const result = applyMediaCall(next, call, hasTab);
      next = result.state;
      effects.push(...result.effects);
    }
    stateRef.current = next;
    effects.forEach(runEffect);
  }, [enabled, items, runEffect]);

  // The tab closed: commands left waiting would land on the next film.
  useEffect(() => {
    if (!hasPlayer) pendingRef.current = [];
  }, [hasPlayer]);

  const attachPlayer = useCallback((handle: MediaPlayerHandle | null) => {
    playerRef.current = handle;
    if (handle) pendingRef.current.splice(0).forEach((command) => handle.apply(command));
  }, []);

  return { attachPlayer };
}
