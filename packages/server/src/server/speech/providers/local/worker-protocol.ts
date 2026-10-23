import type {
  StreamingTranscriptionCommittedEvent,
  StreamingTranscriptionEvent,
  TranscriptionResult,
} from "../../speech-provider.js";
import type { DroppedSpeech } from "../../turn-detection-provider.js";
import type { LocalSpeechWorkerBytes } from "./worker-bytes.js";

export interface LocalSpeechWorkerConfig {
  modelsDir: string;
  voiceSttModel: string;
  dictationSttModel: string;
  voiceTtsModel: string;
  voiceTtsSpeakerId?: number;
  voiceTtsSpeed?: number;
}

export type LocalSpeechSessionKind = "voiceStt" | "dictationStt" | "vad";

export type LocalSpeechWorkerRequest =
  | {
      type: "tts.synthesize";
      requestId: string;
      config: LocalSpeechWorkerConfig;
      text: string;
    }
  | {
      type: "stt.transcribe";
      requestId: string;
      config: LocalSpeechWorkerConfig;
      model: "voice" | "dictation";
      audio: LocalSpeechWorkerBytes;
      format: string;
    }
  | {
      type: "session.create";
      requestId: string;
      config: LocalSpeechWorkerConfig;
      sessionId: string;
      kind: LocalSpeechSessionKind;
    }
  | {
      type: "session.append";
      requestId: string;
      sessionId: string;
      audio: LocalSpeechWorkerBytes;
    }
  | {
      type: "session.commit";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "session.clear";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "session.flush";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "session.reset";
      requestId: string;
      sessionId: string;
    }
  | {
      type: "session.close";
      requestId: string;
      sessionId: string;
    };

export type LocalSpeechWorkerResponse =
  | {
      type: "response";
      requestId: string;
      ok: true;
      result?: unknown;
    }
  | {
      type: "response";
      requestId: string;
      ok: false;
      error: string;
    };

export type LocalSpeechWorkerEvent =
  | {
      type: "session.committed";
      sessionId: string;
      payload: StreamingTranscriptionCommittedEvent;
    }
  | {
      type: "session.transcript";
      sessionId: string;
      payload: StreamingTranscriptionEvent;
    }
  | {
      type: "session.speech_started";
      sessionId: string;
    }
  | {
      type: "session.speech_stopped";
      sessionId: string;
    }
  | {
      // Hizuri: voice that never opened a phrase.
      type: "session.speech_dropped";
      sessionId: string;
      dropped: DroppedSpeech;
    }
  | {
      // Hizuri: VAD windows for the barge-in hold, merged into runs of [state, ms]
      // (0 no voice, 1 voice too quiet to be the user's, 2 loud voice).
      type: "session.vad_frames";
      sessionId: string;
      frames: Array<[VadFrameState, number]>;
    }
  | {
      type: "session.error";
      sessionId: string;
      error: string;
    };

export type VadFrameState = 0 | 1 | 2;

/** Hizuri: the worker applied a change of voice-settings.json (voice-settings/store.ts). */
export interface LocalSpeechWorkerSettingsApplied {
  type: "voice_settings.applied";
  changes: Array<{ key: string; from: string; to: string }>;
}

export type LocalSpeechWorkerToParentMessage =
  | LocalSpeechWorkerResponse
  | LocalSpeechWorkerEvent
  | LocalSpeechWorkerSettingsApplied;

export interface LocalSpeechCreateSessionResult {
  requiredSampleRate: number;
}

export interface LocalSpeechTtsResult {
  audio: LocalSpeechWorkerBytes;
  format: string;
}

export type LocalSpeechTranscriptionResult = TranscriptionResult;
