import { Buffer } from "buffer";
import { type RefObject, useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { subscribeVoiceOutput } from "@/audio/voice-output";
import { useSessionStore } from "@/stores/session-store";
import type { FacePageAudio } from "./bridge";
import type { FacePoster } from "./face-frame-shared";
import { createReplyAnnouncer, selectLatestSpeak, splitSpeechTags } from "./model";
import { MOUTH_FRAME_MS, mouthFrames } from "./mouth";

/**
 * Feeds a face page the mouth frames of every voice chunk the app plays, and the face, gesture and
 * outfit of the assistant's latest speak call with the first chunk of each reply (or right after,
 * as face.reply, when the call comes after its voice). A page whose
 * face.ready asked for `pcm16` (`audioRef`) also gets the chunk's PCM. Shared by the face page in
 * the app, floating Zuri over other apps (float/) and Zuri perched on Show (stage/perch.tsx).
 */
export function useFaceVoiceFeed(input: {
  serverId: string;
  agentId: string;
  posterRef: RefObject<FacePoster | null>;
  readyRef: RefObject<boolean>;
  /** What the page's latest face.ready asked for besides the frames. */
  audioRef: RefObject<FacePageAudio | null>;
}): void {
  const { serverId, agentId, posterRef, readyRef, audioRef } = input;
  // The reply the next sound belongs to: the assistant's latest speak call, sent once with its
  // first chunk, or as face.reply when the call reaches the app after its voice (model.ts).
  const latestSpeak = useStoreWithEqualityFn(
    useSessionStore,
    (state) => selectLatestSpeak(state.sessions[serverId], agentId),
    shallow,
  );
  // One announcer per agent, seeded with its latest call (already spoken).
  const announcer = useMemo(
    () =>
      createReplyAnnouncer(
        selectLatestSpeak(useSessionStore.getState().sessions[serverId], agentId)?.id ?? null,
      ),
    [agentId, serverId],
  );

  useEffect(() => {
    const poster = posterRef.current;
    if (!poster || !readyRef.current) return;
    const late = announcer.speak(latestSpeak, Date.now());
    if (late)
      poster.post({
        type: "face.reply",
        audibleAt: late.audibleAt,
        reply: splitSpeechTags(late.speak.text),
      });
  }, [announcer, latestSpeak, posterRef, readyRef]);

  useEffect(
    () =>
      subscribeVoiceOutput((event) => {
        const poster = posterRef.current;
        if (!poster || !readyRef.current) return;
        if (event.type === "stop") {
          announcer.stop();
          poster.post({ type: "face.stop" });
          return;
        }
        const { chunk } = event;
        const audibleAt = chunk.audibleAt ?? chunk.startedAt + chunk.latencyMs;
        // Read from the store at the chunk, not from the last render: the call may have arrived
        // since.
        const speak = announcer.chunk(
          selectLatestSpeak(useSessionStore.getState().sessions[serverId], agentId),
          {
            startedAt: chunk.startedAt,
            durationMs: (chunk.pcm.byteLength / 2 / chunk.sampleRate) * 1000,
            audibleAt,
          },
        );
        poster.post({
          type: "face.voice",
          audibleAt,
          delayMs: Math.max(0, audibleAt - Date.now()),
          frameMs: MOUTH_FRAME_MS,
          frames: mouthFrames(chunk.pcm, chunk.sampleRate),
          ...(audioRef.current === "pcm16"
            ? {
                pcm: Buffer.from(
                  chunk.pcm.buffer,
                  chunk.pcm.byteOffset,
                  chunk.pcm.byteLength,
                ).toString("base64"),
                sampleRate: chunk.sampleRate,
              }
            : {}),
          ...(speak ? { reply: splitSpeechTags(speak.text) } : {}),
        });
      }),
    [agentId, announcer, audioRef, posterRef, readyRef, serverId],
  );
}
