// Hizuri: while the voice agent compacts its context, the user's phrases wait here and reach the
// assistant as one message when the compaction ends; nothing steers into it or cancels it. The
// Claude provider refuses a steer while compacting, so each phrase fell back to replacing the turn:
// each interrupt restarted the compaction, so one compaction could run for minutes, and phrases
// whose draft and correction came milliseconds apart were dropped by Claude Code. The fast front tells the
// user once that the assistant is compacting (voice-session.ts). PASEO_VOICE_COMPACT_HOLD=0 turns
// it off.

import type pino from "pino";
import type { AgentManagerEvent } from "../../agent/agent-manager.js";
import { type SpokenInputMeta, wrapSpokenInput } from "../../voice-config.js";
import { envFlag, envPositive } from "../../voice-env.js";
import type { VoiceLanguage } from "../../voice-language/types.js";

export type HoldSendResult = { ok: true } | { ok: false; error: string };

/** Sends the merged message to the agent; steer = into the running turn. */
export type HoldSend = (text: string, steer: boolean) => Promise<HoldSendResult>;

export interface HeldPhrase {
  /** The message as the voice session built it, before the spoken-input wrapping. */
  text: string;
  meta: SpokenInputMeta | null;
  /** The voice session meant it as a steer into the assistant's running turn. */
  steer: boolean;
}

/** The agent's compaction, for the fast front. */
export interface CompactHoldState {
  /** When it started; one value per compaction. */
  since: number;
  /** Phrases already waiting. */
  held: number;
}

interface AgentCompaction {
  since: number;
  phrases: HeldPhrase[];
  send: HoldSend | null;
  /** The queue is going out; later phrases still wait so they keep their order. */
  flushing: boolean;
  settle: ReturnType<typeof setTimeout> | null;
  cap: ReturnType<typeof setTimeout> | null;
}

export interface CompactHoldDeps {
  subscribe(listener: (event: AgentManagerEvent) => void): () => void;
  hasActiveRun(agentId: string): boolean;
  logger: pino.Logger;
  /**
   * Wait after the compaction's end before the queue goes: the provider stays unsteerable until
   * the summary message that follows the boundary.
   */
  settleMs?: number;
}

export function compactHoldEnabled(): boolean {
  return envFlag("PASEO_VOICE_COMPACT_HOLD", true);
}

/** What the fast front says: once per compaction, then a short acknowledgement. */
export function compactHoldLine(first: boolean, language: VoiceLanguage): string {
  return first ? language.compactHoldFirst : language.compactHoldNext;
}

/** The held phrases as one message: every phrase keeps its own block, id and sign. */
export function heldMessage(phrases: HeldPhrase[], heldMs: number): string {
  const seconds = Math.max(1, Math.round(heldMs / 1000));
  const header = `[While you compacted your memory (${seconds} s) the user said ${phrases.length === 1 ? "this phrase" : `these ${phrases.length} phrases`}. They waited so nothing cut the compaction. Answer in one reply, in order; sign each id.]`;
  return [
    header,
    ...phrases.map((phrase) => wrapSpokenInput(phrase.text, phrase.meta ?? undefined)),
  ].join("\n\n");
}

export class CompactHold {
  private readonly agents = new Map<string, AgentCompaction>();
  private readonly logger: pino.Logger;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: CompactHoldDeps) {
    this.logger = deps.logger.child({ component: "compact-hold" });
    this.unsubscribe = deps.subscribe((event) => this.observe(event));
  }

  dispose(): void {
    this.unsubscribe();
    for (const entry of this.agents.values()) {
      clearEntryTimers(entry);
    }
    this.agents.clear();
  }

  /** The agent compacts now and phrases wait (null when off or not compacting). */
  state(agentId: string): CompactHoldState | null {
    const entry = this.agents.get(agentId);
    if (!compactHoldEnabled() || !entry || entry.flushing) {
      return null;
    }
    return { since: entry.since, held: entry.phrases.length };
  }

  /** True = held: the caller does not send it, and must not interrupt the agent either. */
  hold(agentId: string, phrase: HeldPhrase, send: HoldSend): boolean {
    const entry = this.agents.get(agentId);
    if (!compactHoldEnabled() || !entry) {
      return false;
    }
    entry.phrases.push(phrase);
    entry.send = send;
    this.logger.info(
      {
        agentId,
        phraseId: phrase.meta?.id,
        correction: phrase.meta?.correction === true,
        held: entry.phrases.length,
      },
      "voice.compact_hold.held",
    );
    return true;
  }

  private observe(event: AgentManagerEvent): void {
    if (event.type !== "agent_stream") {
      return;
    }
    const stream = event.event;
    if (stream.type === "timeline" && stream.item.type === "compaction") {
      if (stream.item.status === "loading") {
        this.started(event.agentId);
      } else {
        this.ended(event.agentId, "completed");
      }
      return;
    }
    // A compaction that fails or is stopped ends its turn without a boundary.
    if (
      stream.type === "turn_completed" ||
      stream.type === "turn_failed" ||
      stream.type === "turn_canceled"
    ) {
      this.ended(event.agentId, stream.type);
    }
  }

  private started(agentId: string): void {
    if (this.agents.has(agentId)) {
      return;
    }
    const entry: AgentCompaction = {
      since: Date.now(),
      phrases: [],
      send: null,
      flushing: false,
      settle: null,
      cap: null,
    };
    // A compaction that never reports its end must not keep the user's words forever.
    entry.cap = setTimeout(
      () => this.ended(agentId, "cap"),
      envPositive("PASEO_VOICE_COMPACT_HOLD_MAX_MS", 600_000),
    );
    this.agents.set(agentId, entry);
    this.logger.info({ agentId, enabled: compactHoldEnabled() }, "voice.compact_hold.started");
  }

  private ended(agentId: string, reason: string): void {
    const entry = this.agents.get(agentId);
    if (!entry || entry.flushing) {
      return;
    }
    clearEntryTimers(entry);
    if (reason === "completed") {
      entry.settle = setTimeout(() => void this.flush(agentId, reason), this.deps.settleMs ?? 500);
      return;
    }
    void this.flush(agentId, reason);
  }

  private async flush(agentId: string, reason: string): Promise<void> {
    const entry = this.agents.get(agentId);
    if (!entry || entry.flushing) {
      return;
    }
    clearEntryTimers(entry);
    entry.flushing = true;
    try {
      while (entry.phrases.length > 0) {
        const batch = entry.phrases.splice(0);
        await this.sendBatch(agentId, entry, batch, reason);
      }
      this.logger.info(
        { agentId, reason, compactedMs: Date.now() - entry.since },
        "voice.compact_hold.ended",
      );
    } finally {
      this.agents.delete(agentId);
    }
  }

  private async sendBatch(
    agentId: string,
    entry: AgentCompaction,
    batch: HeldPhrase[],
    reason: string,
  ): Promise<void> {
    const send = entry.send;
    if (!send) {
      return;
    }
    const text = heldMessage(batch, Date.now() - entry.since);
    const steer = batch.some((phrase) => phrase.steer) && this.deps.hasActiveRun(agentId);
    const ids = batch.map((phrase) => phrase.meta?.id ?? "");
    this.logger.info({ agentId, reason, ids, steer }, "voice.compact_hold.flushed");
    const result = await send(text, steer).catch(
      (error: unknown): HoldSendResult => ({ ok: false, error: String(error) }),
    );
    if (result.ok) {
      return;
    }
    // Once more as a plain message: a steer can lose a race with the turn that just ended.
    this.logger.warn({ agentId, ids, error: result.error }, "voice.compact_hold.flush_failed");
    const retry = await send(text, false).catch(
      (error: unknown): HoldSendResult => ({ ok: false, error: String(error) }),
    );
    if (!retry.ok) {
      this.logger.error({ agentId, ids, error: retry.error }, "voice.compact_hold.lost");
    }
  }
}

function clearEntryTimers(entry: AgentCompaction): void {
  if (entry.settle) {
    clearTimeout(entry.settle);
    entry.settle = null;
  }
  if (entry.cap) {
    clearTimeout(entry.cap);
    entry.cap = null;
  }
}

const shared = new WeakMap<object, CompactHold>();

/**
 * One hold per agent manager: the voice moves between client sessions on reconnects, and the
 * phrases it held must survive the session that held them.
 */
export function sharedCompactHold(owner: object, create: () => CompactHoldDeps): CompactHold {
  let hold = shared.get(owner);
  if (!hold) {
    hold = new CompactHold(create());
    shared.set(owner, hold);
  }
  return hold;
}
