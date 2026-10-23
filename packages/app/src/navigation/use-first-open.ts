import { useEffect, useMemo, useRef, useState } from "react";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { PersistedVoiceSession } from "@/voice/voice-session-store";
import {
  FIRST_OPEN_WAIT_MS,
  resolveFirstOpenTarget,
  type FirstOpenDecision,
  type HostVoiceSessions,
} from "./first-open";

// One first open per app run: later visits to a host index (a missing agent sends the agent
// route back there) take the usual restore, so they can never loop into the same agent.
let firstOpenDone = false;

const DEFAULT_DECISION: FirstOpenDecision = { kind: "default" };
const UNAVAILABLE: HostVoiceSessions = { kind: "unavailable" };

function useLocalVoiceSession(): PersistedVoiceSession | null | undefined {
  const runtime = useVoiceRuntimeOptional();
  const [session, setSession] = useState<PersistedVoiceSession | null | undefined>(
    runtime ? undefined : null,
  );
  useEffect(() => {
    if (!runtime) return;
    let cancelled = false;
    void runtime.loadedSession().then((loaded) => {
      if (!cancelled) setSession(loaded);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [runtime]);
  return session;
}

function useHostVoiceSessions(serverId: string, enabled: boolean): HostVoiceSessions {
  const snapshot = useHostRuntimeSnapshot(serverId);
  const client = snapshot?.client ?? null;
  const status = snapshot?.connectionStatus ?? "connecting";
  const online = status === "online";
  // A host that cannot be reached right now does not hold the first open for the full wait.
  const unreachable = status === "offline" || status === "error";
  // undefined until the host's server_info arrives; an older host simply lacks the feature.
  const supported = useSessionStore((state) => {
    const serverInfo = state.sessions[serverId]?.serverInfo;
    return serverInfo ? serverInfo.features?.voiceSessionList === true : undefined;
  });
  const [result, setResult] = useState<HostVoiceSessions>({ kind: "loading" });
  useEffect(() => {
    if (enabled && unreachable) setResult((prev) => (prev.kind === "loading" ? UNAVAILABLE : prev));
  }, [enabled, unreachable]);
  useEffect(() => {
    if (!enabled || !client || !online || supported === undefined) return;
    if (!supported) {
      setResult(UNAVAILABLE);
      return;
    }
    let cancelled = false;
    client
      .listVoiceSessions()
      .then((payload) => {
        if (!cancelled) setResult({ kind: "ready", sessions: payload.sessions });
        return undefined;
      })
      .catch((error) => {
        console.warn("[FirstOpen] The host did not list its voice sessions:", error);
        if (!cancelled) setResult(UNAVAILABLE);
      });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, online, supported]);
  return result;
}

/**
 * Hizuri (first open): where the host index goes the first time this app run reaches it — the
 * agent with the voice session or the most recently active one — and the host session this
 * device takes over on the way. `default` hands over to the remembered-workspace restore.
 */
export function useFirstOpenDecision(input: {
  serverId: string | null;
  hasRestorableWorkspace: boolean;
}): FirstOpenDecision {
  const serverId = input.serverId ?? "";
  const [active] = useState(() => !firstOpenDone);
  const runtime = useVoiceRuntimeOptional();
  const localSession = useLocalVoiceSession();
  const hostVoiceSessions = useHostVoiceSessions(serverId, active && Boolean(serverId));
  const agentsMap = useSessionStore((state) => state.sessions[serverId]?.agents);
  const agentsHydrated = useSessionStore(
    (state) => state.sessions[serverId]?.hasHydratedAgents ?? false,
  );
  const agents = useMemo(
    () => (agentsHydrated && agentsMap ? [...agentsMap.values()] : null),
    [agentsHydrated, agentsMap],
  );
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setGaveUp(true), FIRST_OPEN_WAIT_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const decision =
    active && serverId
      ? resolveFirstOpenTarget({
          serverId,
          localSession,
          hostVoiceSessions,
          agents,
          hasRestorableWorkspace: input.hasRestorableWorkspace,
          gaveUp,
        })
      : DEFAULT_DECISION;

  const adoptedRef = useRef(false);
  useEffect(() => {
    if (!active || decision.kind === "wait") return;
    firstOpenDone = true;
    if (decision.kind === "agent" && decision.adopt && !adoptedRef.current) {
      adoptedRef.current = true;
      void runtime?.adoptHostSession(decision.adopt);
    }
  }, [active, decision, runtime]);

  return decision;
}
