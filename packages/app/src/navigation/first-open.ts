import type { PersistedVoiceSession } from "@/voice/voice-session-store";

// Hizuri (first open): opening the app goes straight into the chat of the agent
// the user talks to, with its voice session, instead of the project list. The host index asks this
// policy once per app run before the remembered-workspace restore (docs/expo-router.md).

/** How long the first open waits for the host before it falls back to the usual restore. */
export const FIRST_OPEN_WAIT_MS = 6000;

export interface FirstOpenAgent {
  id: string;
  workspaceId?: string;
  title: string | null;
  labels: Record<string, string>;
  lastUserMessageAt: Date | null;
  lastActivityAt: Date;
  archivedAt?: Date | null;
  parentAgentId: string | null;
}

export interface HostVoiceSession {
  agentId: string;
  held: boolean;
}

export type HostVoiceSessions =
  | { kind: "loading" }
  /** An older host, a failed request, or no answer in time. */
  | { kind: "unavailable" }
  | { kind: "ready"; sessions: readonly HostVoiceSession[] };

export type FirstOpenDecision =
  | { kind: "wait" }
  /** The usual host index: the remembered workspace, else the project list. */
  | { kind: "default" }
  | {
      kind: "agent";
      agentId: string;
      workspaceId: string | null;
      /** A host session this device takes over; null when the device has its own or none exists. */
      adopt: PersistedVoiceSession | null;
    };

/**
 * Throwaway agents from app tests: the `purpose: app-test` label, or a title that starts with
 * "TEST " (the app tests' naming convention). The first open never lands on one.
 */
export function isTestAgent(agent: { title: string | null; labels: Record<string, string> }) {
  return agent.labels.purpose === "app-test" || (agent.title?.startsWith("TEST ") ?? false);
}

function activityTime(agent: FirstOpenAgent): number {
  return (agent.lastUserMessageAt ?? agent.lastActivityAt).getTime();
}

export function byActivity(left: FirstOpenAgent, right: FirstOpenAgent): number {
  return activityTime(right) - activityTime(left);
}

/** A top-level agent the user talks to: not archived, not a subagent, not an app-test agent. */
export function isUserFacingAgent(agent: FirstOpenAgent): boolean {
  return !agent.archivedAt && agent.parentAgentId === null && !isTestAgent(agent);
}

function agentDecision(
  agentId: string,
  agents: readonly FirstOpenAgent[] | null,
  adopt: PersistedVoiceSession | null,
): FirstOpenDecision {
  const workspaceId = agents?.find((agent) => agent.id === agentId)?.workspaceId ?? null;
  return { kind: "agent", agentId, workspaceId, adopt };
}

function pickVoiceSession(input: {
  serverId: string;
  sessions: readonly HostVoiceSession[];
  agents: readonly FirstOpenAgent[] | null;
}): FirstOpenDecision | null {
  const { serverId, sessions, agents } = input;
  if (sessions.length === 0) return null;
  let chosen: HostVoiceSession | undefined;
  if (agents) {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const ranked = sessions
      .map((session) => ({ session, agent: byId.get(session.agentId) }))
      .filter(
        (entry): entry is { session: HostVoiceSession; agent: FirstOpenAgent } =>
          entry.agent !== undefined && isUserFacingAgent(entry.agent),
      )
      .sort((left, right) => byActivity(left.agent, right.agent));
    chosen = ranked[0]?.session;
  } else {
    chosen = sessions[0];
  }
  if (!chosen) return null;
  // A voice another device holds right now opens here in text: one tap on the toggle takes it.
  const adopt: PersistedVoiceSession = {
    serverId,
    agentId: chosen.agentId,
    mode: chosen.held ? "text" : "voice",
  };
  return agentDecision(chosen.agentId, agents, adopt);
}

export function resolveFirstOpenTarget(input: {
  serverId: string;
  /** undefined while this device's saved session is still being read. */
  localSession: PersistedVoiceSession | null | undefined;
  hostVoiceSessions: HostVoiceSessions;
  /** null until the host's agent list has arrived. */
  agents: readonly FirstOpenAgent[] | null;
  hasRestorableWorkspace: boolean;
  /** FIRST_OPEN_WAIT_MS passed: decide with what has arrived. */
  gaveUp: boolean;
}): FirstOpenDecision {
  const { serverId, localSession, hostVoiceSessions, agents, hasRestorableWorkspace, gaveUp } =
    input;
  const pending: FirstOpenDecision = gaveUp ? { kind: "default" } : { kind: "wait" };

  if (localSession === undefined) return pending;
  if (localSession) {
    // This device's own session wins; the voice runtime resumes it by itself.
    return localSession.serverId === serverId
      ? agentDecision(localSession.agentId, agents, null)
      : { kind: "default" };
  }

  if (hostVoiceSessions.kind === "loading" && !gaveUp) return pending;
  if (hostVoiceSessions.kind === "ready" && hostVoiceSessions.sessions.length > 0) {
    if (!agents && !gaveUp) return pending;
    const voice = pickVoiceSession({ serverId, sessions: hostVoiceSessions.sessions, agents });
    if (voice) return voice;
  }

  if (hasRestorableWorkspace) return { kind: "default" };
  if (!agents) return pending;
  const recent = agents.filter(isUserFacingAgent).sort(byActivity)[0];
  return recent ? agentDecision(recent.id, agents, null) : { kind: "default" };
}
