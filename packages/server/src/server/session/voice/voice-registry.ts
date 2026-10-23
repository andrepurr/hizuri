import type { VoiceSession } from "./voice-session.js";

/** The connection a voice session talks through right now. */
export interface VoiceHolder {
  /** The voice goes on with another connection: stop routing it here, without ending it. */
  handOff(): void;
  /** Its agent was archived: the client hears its voice is gone, and the voice ends. */
  end(agentId: string): Promise<void>;
}

export interface VoiceRegistryEntry {
  voice: VoiceSession;
  /** null = parked: its connection went away and the voice waits for a client to ask for it. */
  holder: VoiceHolder | null;
}

/**
 * Hizuri (session persist): every voice session whose agent is in voice mode, by agent, across
 * the whole daemon. A voice session outlives the socket and the client session that started it:
 * a closed tab, a reload or a dropped connection parks it, and the next client that asks for
 * voice with that agent takes it over without reloading the agent. Voice mode turned off
 * without keepSession ends it, and so does archiving the agent.
 */
export class VoiceRegistry {
  private readonly byAgent = new Map<string, VoiceSession>();
  private readonly holders = new WeakMap<VoiceSession, VoiceHolder>();

  get(agentId: string): VoiceRegistryEntry | undefined {
    const voice = this.byAgent.get(agentId);
    return voice ? { voice, holder: this.holders.get(voice) ?? null } : undefined;
  }

  /**
   * Reserve an agent for a voice about to put it in voice mode, unless another voice has it. The
   * voice leaves the agent it had: archiving that chat during the ~20 s enable must not end the
   * voice that moved on (if the move fails, reconcile files it back).
   */
  claim(agentId: string, voice: VoiceSession): void {
    const owner = this.byAgent.get(agentId);
    if (owner && owner !== voice) return;
    for (const [other, entry] of this.byAgent) {
      if (entry === voice && other !== agentId) this.byAgent.delete(other);
    }
    this.byAgent.set(agentId, voice);
  }

  /** A voice that is ending: no agent is filed against it any more and nobody holds it. */
  forget(voice: VoiceSession): void {
    for (const [agentId, entry] of this.byAgent) {
      if (entry === voice) this.byAgent.delete(agentId);
    }
    this.holders.delete(voice);
  }

  agentOf(voice: VoiceSession): string | null {
    for (const [agentId, entry] of this.byAgent) {
      if (entry === voice) return agentId;
    }
    return null;
  }

  setHolder(voice: VoiceSession, holder: VoiceHolder | null): void {
    if (holder) this.holders.set(voice, holder);
    else this.holders.delete(voice);
  }

  /** Match the registry to the agent the voice has in voice mode now (none = forget the voice). */
  reconcile(voice: VoiceSession): void {
    const armed = voice.armedAgentId;
    for (const [agentId, entry] of this.byAgent) {
      if (entry === voice && agentId !== armed) this.byAgent.delete(agentId);
    }
    if (armed && !this.byAgent.has(armed)) this.byAgent.set(armed, voice);
  }

  /**
   * The agent was archived (by itself or with its workspace): its voice ends for good, held or
   * parked, so the microphone stream and the recogniser stop and no client can adopt it.
   */
  async end(agentId: string): Promise<boolean> {
    const voice = this.byAgent.get(agentId);
    if (!voice) return false;
    this.byAgent.delete(agentId);
    const holder = this.holders.get(voice);
    this.holders.delete(voice);
    if (holder) await holder.end(agentId);
    else await voice.cleanup({ restoreAgent: false });
    return true;
  }

  /** Every agent with a voice session, and whether a connection holds it now. */
  list(): { agentId: string; held: boolean }[] {
    return [...this.byAgent].map(([agentId, voice]) => ({
      agentId,
      held: this.holders.has(voice),
    }));
  }

  get parkedCount(): number {
    let count = 0;
    for (const voice of this.byAgent.values()) {
      if (!this.holders.has(voice)) count += 1;
    }
    return count;
  }
}
