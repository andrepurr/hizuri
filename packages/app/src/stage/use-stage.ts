import type { Stage, StageChange } from "@getpaseo/protocol/stage";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { StoreSecret } from "./blocks/block-context";
import { applyStageChange, frontTabOfChange } from "./model";
import { loadCachedStage, saveCachedStage } from "./stage-cache";

// Show reads Zuri's stage: one owned subscription per agent page, which the
// client renews after every reconnect with a fresh snapshot. The last stage is cached, so a cold
// start, airplane mode or a daemon restart still paints its tabs. User closes made offline wait
// and go out when the host answers again (closing twice is harmless on the daemon).

const SAVE_DELAY_MS = 400;

/** Whether this host keeps the stage; undefined until its server_info arrives. */
export function useStageSupported(serverId: string): boolean | undefined {
  return useSessionStore((state) => {
    const serverInfo = state.sessions[serverId]?.serverInfo;
    return serverInfo ? serverInfo.features?.stage !== undefined : undefined;
  });
}

export interface StageFront {
  tabId: string;
  /** Goes up with every change that brings a tab forward, so the same tab can come again. */
  seq: number;
}

export interface StageView {
  stage: Stage | null;
  /** The subscription answered on this connection; false while offline or painting the cache. */
  live: boolean;
  /** The tab the assistant's latest change brought forward; never set by a snapshot. */
  front: StageFront | null;
  closeTab: (tabId: string) => void;
  reportFocus: (tabId: string | null) => void;
  sendAction: (input: { tabId: string; blockId: string; value?: string }) => void;
  /** The user hides Zuri from the block it sits on (stage_perch); it leaves at once, here first. */
  hidePerch: () => void;
  /** A secure form's values go to the daemon's vault; null on a host without features.secrets. */
  storeSecret: StoreSecret | null;
}

interface StageObserverHandlers {
  agentId: string;
  current: () => Stage | null;
  onStage: (stage: Stage, live: boolean) => void;
  onFront: (tabId: string) => void;
  onGap: () => void;
}

function observeStage(client: DaemonClient, handlers: StageObserverHandlers): () => void {
  const observation = client.observeStage({ agentId: handlers.agentId });
  const applyChange = (change: StageChange) => {
    const before = handlers.current();
    const result = applyStageChange(before, change);
    if (result.kind === "gap") {
      handlers.onGap();
      return;
    }
    if (result.kind === "ignored") return;
    handlers.onStage(result.stage, true);
    const tabId = frontTabOfChange(before, change);
    if (tabId) handlers.onFront(tabId);
  };
  const unsubscribe = observation.subscribe({
    snapshot: (payload) => {
      if (payload.stage) handlers.onStage(payload.stage, true);
    },
    update: (message) => {
      if (message.type === "stage.update" && message.payload.agentId === handlers.agentId) {
        applyChange(message.payload);
      }
    },
  });
  return () => {
    unsubscribe();
    void observation.release().catch((error: unknown) => {
      console.warn("[Stage] release failed", error);
    });
  };
}

export function useStage(input: {
  serverId: string;
  agentId: string;
  enabled: boolean;
}): StageView {
  const { serverId, agentId, enabled } = input;
  const runtime = useHostRuntimeSnapshot(serverId);
  const client = runtime?.client ?? null;
  const online = runtime?.connectionStatus === "online";
  const supported = useStageSupported(serverId) === true;
  const [stage, setStage] = useState<Stage | null>(null);
  const [live, setLive] = useState(false);
  const [front, setFront] = useState<StageFront | null>(null);
  const [pendingCloses, setPendingCloses] = useState<ReadonlySet<string>>(() => new Set());
  const [epoch, setEpoch] = useState(0);
  const stageRef = useRef<Stage | null>(null);
  const pendingRef = useRef(pendingCloses);
  pendingRef.current = pendingCloses;

  // The cached stage paints first; the daemon's copy replaces it as soon as it arrives.
  useEffect(() => {
    let cancelled = false;
    loadCachedStage(serverId, agentId)
      .then((cached) => {
        if (!cancelled && cached && !stageRef.current) {
          stageRef.current = cached;
          setStage(cached);
        }
        return undefined;
      })
      .catch((error: unknown) => console.warn("[Stage] cache read failed", error));
    return () => {
      cancelled = true;
    };
  }, [serverId, agentId]);

  const subscribed = enabled && supported && online && client !== null;
  useEffect(() => {
    if (!subscribed || !client) {
      setLive(false);
      return;
    }
    const stop = observeStage(client, {
      agentId,
      current: () => stageRef.current,
      onStage: (next, isLive) => {
        stageRef.current = next;
        setStage(next);
        setLive(isLive);
      },
      onFront: (tabId) => setFront((previous) => ({ tabId, seq: (previous?.seq ?? 0) + 1 })),
      onGap: () => setEpoch((value) => value + 1),
    });
    return () => {
      stop();
      setLive(false);
    };
  }, [subscribed, client, agentId, epoch]);

  useEffect(() => {
    if (!stage) return;
    const timer = setTimeout(() => {
      saveCachedStage(serverId, stage).catch((error: unknown) =>
        console.warn("[Stage] cache write failed", error),
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [serverId, stage]);

  const sendClose = useCallback(
    (tabId: string) => {
      if (!client) return;
      client
        .closeStageTab({ agentId, tabId })
        .then(() => {
          setPendingCloses((previous) => {
            const next = new Set(previous);
            next.delete(tabId);
            return next;
          });
          return undefined;
        })
        .catch((error: unknown) => console.warn("[Stage] close not sent yet", error));
    },
    [client, agentId],
  );

  // The user's closes made offline go out once the host answers again.
  useEffect(() => {
    if (!live) return;
    for (const tabId of pendingRef.current) sendClose(tabId);
  }, [live, sendClose]);

  const closeTab = useCallback(
    (tabId: string) => {
      setPendingCloses((previous) => new Set(previous).add(tabId));
      if (live) sendClose(tabId);
    },
    [live, sendClose],
  );

  const reportFocus = useCallback(
    (tabId: string | null) => {
      if (!live || !client) return;
      client
        .reportStageFocus({ agentId, focus: tabId })
        .catch((error: unknown) => console.warn("[Stage] focus report failed", error));
    },
    [live, client, agentId],
  );

  const sendAction = useCallback(
    (action: { tabId: string; blockId: string; value?: string }) => {
      if (!client) return;
      client
        .sendStageAction({ agentId, ...action })
        .catch((error: unknown) => console.warn("[Stage] action not delivered", error));
    },
    [client, agentId],
  );

  // The user's values go to the vault only; nothing here logs them, even when sending fails.
  const secretsSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.secrets === true,
  );
  const storeSecret = useCallback<StoreSecret>(
    async (request) => {
      if (!client) throw new Error("not connected");
      const response = await client.storeSecret({ agentId, ...request });
      return { stored: response.stored, error: response.error };
    },
    [client, agentId],
  );

  // The user's hide goes out now or once the host answers again; the perch it names is gone here at
  // once.
  const [hiddenPerchAt, setHiddenPerchAt] = useState<string | null>(null);
  const hidePerchPendingRef = useRef(false);
  const sendHidePerch = useCallback(() => {
    if (!client) return;
    client
      .hideStagePerch({ agentId })
      .then(() => {
        hidePerchPendingRef.current = false;
        return undefined;
      })
      .catch((error: unknown) => console.warn("[Stage] hide not sent yet", error));
  }, [client, agentId]);
  useEffect(() => {
    if (live && hidePerchPendingRef.current) sendHidePerch();
  }, [live, sendHidePerch]);
  const perchAt = stage?.main.perch?.at ?? null;
  const hidePerch = useCallback(() => {
    if (!perchAt) return;
    setHiddenPerchAt(perchAt);
    hidePerchPendingRef.current = true;
    if (live) sendHidePerch();
  }, [perchAt, live, sendHidePerch]);

  const visibleStage = useMemo(() => {
    if (!stage) return stage;
    const closing = pendingCloses.size > 0;
    const hiding = hiddenPerchAt !== null && stage.main.perch?.at === hiddenPerchAt;
    if (!closing && !hiding) return stage;
    const { perch: _hidden, ...main } = stage.main;
    return {
      ...stage,
      tabs: closing ? stage.tabs.filter((tab) => !pendingCloses.has(tab.id)) : stage.tabs,
      main: hiding ? main : stage.main,
    };
  }, [stage, pendingCloses, hiddenPerchAt]);

  return {
    stage: visibleStage,
    live,
    front,
    closeTab,
    reportFocus,
    sendAction,
    hidePerch,
    storeSecret: secretsSupported ? storeSecret : null,
  };
}
