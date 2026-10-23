/** Hizuri (phrase graph): what a speak call did with the reply. */
export interface VoiceSpeakResult {
  /** The reply's id in the phrase graph (r…). */
  replyId?: string;
  /** Held = not played because the user's phrase holds the floor; text-only = voice mode off. */
  outcome?: string;
}

export type VoiceSpeakHandler = (params: {
  text: string;
  callerAgentId: string;
  signal?: AbortSignal;
  /** Hizuri: ids of the user's phrases this reply answers (the id of <spoken-input>). */
  replyTo?: string[];
  /** Hizuri: earlier replies (r…) whose unheard part this reply says again, and pending items it folds in. */
  carries?: string[];
}) => Promise<void | VoiceSpeakResult>;

export interface VoiceCallerContext {
  childAgentDefaultLabels?: Record<string, string>;
  lockedCwd?: string;
  allowCustomCwd?: boolean;
  enableVoiceTools?: boolean;
}
