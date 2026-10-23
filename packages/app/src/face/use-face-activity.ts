import { useEffect, useState, useSyncExternalStore } from "react";
import { useVoiceRuntimeOptional } from "@/contexts/voice-context";
import { selectAgentTurnPresentation, useSessionStore } from "@/stores/session-store";
import { selectLiveWords, useVoiceLiveWordsStore } from "@/stores/voice-live-words-store";
import { liveWordsUpdatedAt } from "@/voice/live-words";
import { type FaceActivity, faceActivity, selectToolRunning } from "./activity";

/**
 * Live words arrive about once a second while the user speaks (voice/live-words.ts); Zuri keeps
 * listening this long after the last ones, so the gaps between them and a short pause inside a
 * phrase do not flick it to idle and back.
 */
const LISTEN_HOLD_MS = 2_500;

/**
 * The daemon sends `isSpeaking` only as a short pulse when the user's phrase cuts the reply (it
 * never reports the detector's speech start: noise must not stop the assistant's voice); it turns
 * to the user for this long.
 */
const CUT_IN_HOLD_MS = 1_500;

const noopSubscribe = () => () => {};

/** True while `value` is true and for `holdMs` after it turns false. */
function useHeld(value: boolean, holdMs: number): boolean {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (value) {
      setHeld(true);
      return;
    }
    const timer = setTimeout(() => setHeld(false), holdMs);
    return () => clearTimeout(timer);
  }, [value, holdMs]);
  return value || held;
}

/** True from the moment `at` until `holdMs` after it. */
function useRecent(at: number | null, holdMs: number): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const left = at + holdMs - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left);
    return () => clearTimeout(timer);
  }, [at, holdMs]);
  return at !== null && at + holdMs > now;
}

/**
 * Zuri's activity in this agent's conversation, from the voice runtime and its stream. The user's
 * voice counts only while the voice session is with this agent: live words and the playing phase
 * belong to the session, not to every agent on the server.
 */
export function useFaceActivity(serverId: string, agentId: string): FaceActivity {
  const runtime = useVoiceRuntimeOptional();
  const voicePhase = useSyncExternalStore(runtime ? runtime.subscribe : noopSubscribe, () => {
    const snapshot = runtime?.getSnapshot();
    const here =
      snapshot?.isVoiceMode === true &&
      snapshot.activeServerId === serverId &&
      snapshot.activeAgentId === agentId;
    return here ? snapshot.phase : null;
  });
  const cutIn = useSyncExternalStore(
    runtime ? runtime.subscribeTelemetry : noopSubscribe,
    () => runtime?.getTelemetrySnapshot().isSpeaking === true,
  );
  const wordsAt = useVoiceLiveWordsStore((state) =>
    liveWordsUpdatedAt(selectLiveWords(serverId)(state)),
  );
  const turnActive = useSessionStore(
    (state) => selectAgentTurnPresentation(state.sessions[serverId], agentId).isActive,
  );
  const toolRunning = useSessionStore((state) =>
    selectToolRunning(state.sessions[serverId], agentId),
  );
  const voiceHere = voicePhase !== null;
  const wordsArriving = useRecent(voiceHere ? wordsAt : null, LISTEN_HOLD_MS);
  const cutInHeld = useHeld(voiceHere && cutIn, CUT_IN_HOLD_MS);
  return faceActivity({
    hearing: wordsArriving || cutInHeld,
    speaking: voicePhase === "playing",
    answering: turnActive || voicePhase === "waiting",
    toolRunning,
  });
}
