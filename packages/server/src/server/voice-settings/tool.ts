import { z } from "zod";

import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import type {
  VoiceKnobChange,
  VoiceKnobState,
  VoiceSettingRequest,
  VoiceSettingsStore,
} from "./store.js";

// Hizuri: Zuri's own control of the voice knobs (store.ts), so it fixes what the user hears —
// interruptions, timing, volume — in seconds and without a restart.

const GROUPS = ["speech", "interrupt", "phrase", "filter", "mic", "modules"] as const;

const APPLIES_TEXT: Record<VoiceKnobState["applies"], string> = {
  now: "applies now",
  "next-reply": "applies from the assistant's next reply",
  "next-voice-session": "applies the next time voice mode is turned on",
};

const valueSchema = z.union([z.string(), z.number(), z.boolean()]);

const changeShape = {
  key: z
    .string()
    .trim()
    .min(1)
    .describe("Knob name, e.g. PASEO_TTS_GAIN_DB (the PASEO_ prefix may be left out; “volume”)."),
  value: valueSchema.optional().describe("New value: a number, on/off, or a string."),
  delta: z
    .number()
    .optional()
    .describe("Step a number knob by this much instead of a value: volume +3 = louder."),
  reset: z.boolean().optional().describe("Drop the override: back to the env value or default."),
};

export const voiceSettingsShape = {
  action: z
    .enum(["get", "set", "reset"])
    .default("get")
    .describe("get = read knobs; set = change one or more; reset = back to the env/default."),
  ...changeShape,
  key: changeShape.key.optional(),
  group: z
    .enum(GROUPS)
    .optional()
    .describe("For get: only this group (speech, interrupt, phrase, filter, mic, modules)."),
  changes: z
    .array(z.object(changeShape))
    .max(20)
    .optional()
    .describe("For set: several knobs in one call, written together."),
};

interface VoiceSettingsInput {
  action?: "get" | "set" | "reset";
  key?: string;
  value?: string | number | boolean;
  delta?: number;
  reset?: boolean;
  group?: (typeof GROUPS)[number];
  changes?: VoiceSettingRequest[];
}

function knobLine(state: VoiceKnobState): string {
  const origin =
    state.source === "default" ? "default" : `${state.source}; default ${state.default}`;
  return `${state.key} = ${state.value} (${origin}; ${state.accepts}) — ${state.meaning} [${state.applies}]`;
}

function changeLine(change: VoiceKnobChange): string {
  const note = change.source === "file" ? "" : ` (${change.source})`;
  return `${change.key}: ${change.from} → ${change.to}${note}, ${APPLIES_TEXT[change.applies]}`;
}

function result(text: string, structuredContent: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

function requestsOf(input: VoiceSettingsInput): VoiceSettingRequest[] {
  const requests: VoiceSettingRequest[] = [...(input.changes ?? [])];
  if (input.key) {
    requests.push({
      key: input.key,
      value: input.value,
      delta: input.delta,
      reset: input.reset,
    });
  }
  if (input.action === "reset") {
    return requests.map((request) => ({ key: request.key, reset: true }));
  }
  return requests;
}

export interface RegisterVoiceSettingsToolOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  store: VoiceSettingsStore;
}

export function registerVoiceSettingsTool(options: RegisterVoiceSettingsToolOptions): void {
  const { store } = options;
  options.registerTool(
    "voice_settings",
    {
      title: "Voice settings",
      description:
        "Read or change your voice knobs live, without a restart: the assistant's volume " +
        "(PASEO_TTS_GAIN_DB, dB: delta +3 = louder, -3 = quieter) and speed (PASEO_TTS_SPEED), " +
        "what may interrupt you while you speak (PASEO_BARGE_*), when the user's phrase ends and " +
        "reaches you (PASEO_VAD_*, PASEO_VOICE_MONOLOGUE_GAP_MS), the voice-print and echo " +
        "filters, and the microphone gain. Use it when the user complains about how the voice " +
        "behaves or asks to change it. action get lists every knob with its value, meaning and " +
        "when a change applies; set changes one knob (key + value or delta) or several " +
        "(changes); reset returns a knob to its env value or default. Say what you changed.",
      inputSchema: voiceSettingsShape,
    },
    async (input: VoiceSettingsInput) => {
      const action = input.action ?? "get";
      if (action === "get") {
        const states = input.key ? [store.get(input.key)] : store.list(input.group);
        return result(states.map(knobLine).join("\n"), { file: store.file, knobs: states });
      }
      const requests = requestsOf(input);
      if (requests.length === 0) {
        throw new Error(`voice_settings ${action}: name a key (or give changes)`);
      }
      const changes = store.update(requests);
      return result(changes.map(changeLine).join("\n"), { file: store.file, changes });
    },
  );
}
