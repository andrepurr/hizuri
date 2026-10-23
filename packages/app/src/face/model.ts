import { parseHostPort } from "@getpaseo/protocol/daemon-endpoints";
import { isSpeakToolName } from "@getpaseo/protocol/tool-name-normalization";
import type { ActiveConnection } from "@/runtime/host-runtime";
import type { StreamItem } from "@/types/stream";

// What the face needs from the app's state: which page to load, and what Zuri is saying right now.
// The mouth comes from the audio itself (audio/voice-output.ts); the speak call gives the
// emotion, gesture and outfit tags the assistant put in front of the words.

const EMOTIONS = new Set(["happy", "sad", "angry", "relaxed", "surprised", "neutral", "intimate"]);
const EMOTION_TAG = /^\s*\[\s*(\w+)\s*\]\s*/;
const MOTION_TAG = /^\s*\[\s*(?:motion|gesture)\s*:\s*([a-z]+)\s*\]\s*/i;
const OUTFIT_TAG = /^\s*\[\s*outfit\s*:\s*([a-z0-9_-]+)\s*\]\s*/i;
/** The page reads at most this much text (for greeting words); the avatar server cuts at the same length. */
const REPLY_TEXT_LIMIT = 400;

/** One spoken reply as the avatar page takes it (the avatar server's /avatar/events "reply" fields). */
export interface FaceReply {
  emotion: string;
  intimate: boolean;
  motion: string;
  outfit: string;
  text: string;
}

/**
 * The leading tags of a speak text, read the way the avatar server reads them: an emotion first, then
 * `[motion:…]` and `[outfit:…]` in either order. `[intimate]` shows as the relaxed face.
 */
export function splitSpeechTags(input: string): FaceReply {
  let text = input;
  let emotion = "neutral";
  let motion = "";
  let outfit = "";
  const emotionMatch = EMOTION_TAG.exec(text);
  if (emotionMatch && EMOTIONS.has(emotionMatch[1].toLowerCase())) {
    emotion = emotionMatch[1].toLowerCase();
    text = text.slice(emotionMatch[0].length);
    for (let i = 0; i < 2; i += 1) {
      const motionMatch = motion ? null : MOTION_TAG.exec(text);
      if (motionMatch) {
        motion = motionMatch[1].toLowerCase();
        text = text.slice(motionMatch[0].length);
        continue;
      }
      const outfitMatch = outfit ? null : OUTFIT_TAG.exec(text);
      if (outfitMatch) {
        outfit = outfitMatch[1].toLowerCase();
        text = text.slice(outfitMatch[0].length);
      }
    }
  }
  const intimate = emotion === "intimate";
  return {
    emotion: intimate ? "relaxed" : emotion,
    intimate,
    motion,
    outfit,
    text: text.trim().slice(0, REPLY_TEXT_LIMIT),
  };
}

export interface SpeakCall {
  id: string;
  text: string;
}

function readSpeakText(input: unknown): string | null {
  // The daemon hands a speak call's input over as the text itself (agent-stream/view.tsx draws it
  // as the assistant's message); a raw `{ text }` input is read too.
  if (typeof input === "string") return input;
  if (typeof input !== "object" || input === null) return null;
  const text = (input as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

function readSpeakCall(item: StreamItem): SpeakCall | null {
  if (item.kind !== "tool_call" || item.payload.source !== "agent") return null;
  const data = item.payload.data;
  if (!isSpeakToolName(data.name) || data.detail.type !== "unknown") return null;
  const text = readSpeakText(data.detail.input);
  return text?.trim() ? { id: data.callId, text } : null;
}

/** The assistant's latest speak call: the reply the next sound belongs to. */
export function selectLatestSpeak(
  session: { agentStreamTail: Map<string, StreamItem[]> } | undefined,
  agentId: string,
): SpeakCall | null {
  const items = session?.agentStreamTail.get(agentId);
  if (!items) return null;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const call = readSpeakCall(items[index]);
    if (call) return call;
  }
  return null;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/**
 * The avatar page on the daemon's own origin. Only a direct TCP connection has an HTTP origin the
 * WebView can load; through the relay there is no face. `secure` follows the page the app runs in
 * (web over https), so the browser never blocks it as mixed content.
 */
export function faceAvatarUrl(
  connection: ActiveConnection | null,
  options: { secure: boolean },
): string | null {
  if (connection?.type !== "directTcp") return null;
  try {
    const { host, port, isIpv6 } = parseHostPort(connection.endpoint);
    let base = host;
    if (isLoopbackHost(host)) base = "localhost";
    else if (isIpv6) base = `[${host}]`;
    return `${options.secure ? "https" : "http"}://${base}:${port}/avatar/?host=app`;
  } catch {
    return null;
  }
}

/** How long after a stretch of voice began its speak call may still arrive and be told to the page. */
const LATE_REPLY_MS = 8000;
/** A chunk that starts this long after the queued voice ran out begins a new stretch of voice. */
const NEW_STRETCH_GAP_MS = 250;

/**
 * Which speak call each stretch of the assistant's voice belongs to. The voice can reach the app
 * before its speak call does (the call comes over the agent stream, the sound over the voice
 * stream): the first chunk then has no new call to announce, and the next stretch of voice would
 * get this one's call. `chunk` returns the call to send with a chunk; `speak`, fed every newly
 * seen latest call, returns the call of a stretch already playing without one, with the moment
 * that stretch became audible.
 */
export function createReplyAnnouncer(announcedId: string | null) {
  let announced = announcedId;
  let queuedUntil = Number.NEGATIVE_INFINITY;
  let pending: { audibleAt: number; startedAt: number } | null = null;
  return {
    chunk(
      speak: SpeakCall | null,
      chunk: { startedAt: number; durationMs: number; audibleAt: number },
    ): SpeakCall | null {
      const startsStretch = chunk.startedAt > queuedUntil + NEW_STRETCH_GAP_MS;
      queuedUntil = Math.max(queuedUntil, chunk.startedAt + chunk.durationMs);
      if (speak !== null && speak.id !== announced) {
        announced = speak.id;
        pending = null;
        return speak;
      }
      if (startsStretch) pending = { audibleAt: chunk.audibleAt, startedAt: chunk.startedAt };
      return null;
    },
    speak(speak: SpeakCall | null, now: number): { speak: SpeakCall; audibleAt: number } | null {
      if (speak === null || speak.id === announced || pending === null) return null;
      // A stretch already heard out is not the call's: its own voice is still to come.
      if (now - pending.startedAt > LATE_REPLY_MS || now > queuedUntil + NEW_STRETCH_GAP_MS) {
        pending = null;
        return null;
      }
      const late = { speak, audibleAt: pending.audibleAt };
      announced = speak.id;
      pending = null;
      return late;
    },
    stop(): void {
      queuedUntil = Number.NEGATIVE_INFINITY;
      pending = null;
    },
  };
}
