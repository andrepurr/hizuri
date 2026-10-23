import { isUserFacingAgent, type FirstOpenAgent } from "@/navigation/first-open";
import type { PersistedVoiceSession } from "./voice-session-store";

// Hizuri: with voice on, opening another agent's chat moves the voice
// there, like calling another person. The old chat hangs up by itself; nothing to confirm, no
// “End session” first.

export interface VoiceFollowTarget {
  serverId: string;
  agentId: string;
}

export interface VoiceFollowAgent extends FirstOpenAgent {
  status: string;
  /** A turn is running: a reload to add the voice prompt would cut it. */
  isBusy: boolean;
}

export interface VoiceFollowState {
  isVoiceMode: boolean;
  isVoiceSwitching: boolean;
  session: PersistedVoiceSession | null;
}

/**
 * Whether voice moves into the chat just opened. Only live voice moves (a text session stays
 * with its agent), only into a user-facing agent. An agent this device never held voice with
 * has no voice prompt yet: the move reloads it, so it moves only while that agent is idle.
 */
export function shouldVoiceFollow(input: {
  voice: VoiceFollowState;
  target: VoiceFollowTarget;
  agent: VoiceFollowAgent | undefined;
  isVoiceContact: boolean;
}): boolean {
  const { voice, target, agent, isVoiceContact } = input;
  const session = voice.session;
  if (!voice.isVoiceMode || voice.isVoiceSwitching || session?.mode !== "voice") return false;
  if (session.serverId === target.serverId && session.agentId === target.agentId) return false;
  if (!agent || !isUserFacingAgent(agent)) return false;
  if (isVoiceContact) return true;
  return agent.status === "idle" && !agent.isBusy;
}
