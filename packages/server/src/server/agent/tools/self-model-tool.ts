import { z } from "zod";
import type { AgentModelDefinition, AgentProviderNotice } from "../agent-sdk-types.js";
import {
  PaseoToolInputError,
  type PaseoToolConfig,
  type PaseoToolExecutionContext,
  type PaseoToolResult,
} from "./types.js";

// Hizuri: the phone app shows no model or effort any more, so the agent the user
// talks to switches its own. update_agent can do the same, but it needs the agent's own id and
// exact option ids; this tool always targets the caller and reads names loosely. A model switch
// is live (the provider swaps it in place); an effort switch may apply from the next turn. Neither
// touches the voice session, which belongs to the app and the daemon's voice runtime.

export interface SelfModelAgents {
  getAgent(agentId: string): {
    provider: string;
    cwd: string;
    config: { model?: string; thinkingOptionId?: string };
  } | null;
  setAgentModel(agentId: string, modelId: string | null): Promise<void>;
  setAgentThinkingOption(
    agentId: string,
    thinkingOptionId: string | null,
  ): Promise<AgentProviderNotice | null>;
}

export interface SelfModelCatalog {
  listModels(input: {
    provider: string;
    cwd?: string | null;
    wait?: boolean;
  }): Promise<AgentModelDefinition[]>;
}

export interface RegisterSelfModelToolOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      input: { model?: string; effort?: string },
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  callerAgentId: string | undefined;
  /**
   * The agent tool manifest: listed even before a caller exists (Paseo builds it once for the
   * OpenCode bridge), while each call runs through the calling agent's own catalog.
   */
  agentScope?: boolean;
  agents: SelfModelAgents;
  models: SelfModelCatalog;
}

const selfModelShape = {
  model: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Model id, alias or name, for example 'claude-opus-5-5', 'opus' or 'Sonnet 5.5'."),
  effort: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Effort (thinking level) id or name, for example 'high' or 'xhigh'."),
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
}

function family(model: AgentModelDefinition): string {
  return normalize(model.label).split("-")[0] ?? "";
}

/**
 * The model a loose name points at: its id, an alias or its label; else the parts of names that
 * match, when they are all one family ("sonnet" is the newest Sonnet: providers list newest first).
 */
export function findModel(
  models: readonly AgentModelDefinition[],
  query: string,
): AgentModelDefinition | null {
  const wanted = normalize(query);
  const exact = models.find(
    (model) =>
      normalize(model.id) === wanted ||
      normalize(model.label) === wanted ||
      (model.aliases ?? []).some((alias) => normalize(alias) === wanted),
  );
  if (exact) return exact;
  const partial = models.filter(
    (model) => normalize(model.id).includes(wanted) || normalize(model.label).includes(wanted),
  );
  const first = partial[0];
  if (!first) return null;
  return partial.every((model) => family(model) === family(first)) ? first : null;
}

function findEffort(model: AgentModelDefinition | null, query: string): string | null {
  const wanted = normalize(query);
  const option = (model?.thinkingOptions ?? []).find(
    (candidate) => normalize(candidate.id) === wanted || normalize(candidate.label) === wanted,
  );
  return option?.id ?? null;
}

function describeChoices(models: readonly AgentModelDefinition[]): string {
  return models
    .map((model) => {
      const efforts = (model.thinkingOptions ?? []).map((option) => option.id).join(", ");
      return `- ${model.id} (${model.label})${efforts ? `, effort: ${efforts}` : ""}`;
    })
    .join("\n");
}

function answer(text: string, structuredContent: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

function resolveModel(available: readonly AgentModelDefinition[], query: string) {
  const target = findModel(available, query);
  if (!target) {
    throw new Error(`Unknown model “${query}”. Choices:\n${describeChoices(available)}`);
  }
  return target;
}

function resolveEffort(model: AgentModelDefinition | null, modelId: string | null, query: string) {
  const effortId = findEffort(model, query);
  if (!effortId) {
    const choices = (model?.thinkingOptions ?? []).map((option) => option.id).join(", ");
    throw new Error(
      `Unknown effort “${query}” for ${modelId ?? "the default model"}. Choices: ${choices || "none"}`,
    );
  }
  return effortId;
}

function describeOwnModel(input: {
  config: { model?: string; thinkingOptionId?: string };
  modelId: string | null;
  notice: AgentProviderNotice | null;
  changed: boolean;
  available: readonly AgentModelDefinition[];
}): PaseoToolResult {
  const { config, notice, changed } = input;
  const model = config.model ?? input.modelId;
  const effort = config.thinkingOptionId ?? null;
  const lead =
    `${changed ? "Now" : "Current"}: model ${model ?? "default"}, ` +
    `effort ${effort ?? "default"}.${notice ? ` ${notice.message}.` : ""}`;
  const text = changed ? lead : `${lead}\nChoices:\n${describeChoices(input.available)}`;
  return answer(text, { ok: true, model, effort, ...(notice ? { notice: notice.message } : {}) });
}

/** Checks both names first, so a bad effort never leaves a half-made switch behind. */
async function switchOwnModel(options: {
  agentId: string;
  agents: SelfModelAgents;
  models: SelfModelCatalog;
  input: { model?: string; effort?: string };
}): Promise<PaseoToolResult> {
  const { agentId, agents, models, input } = options;
  const agent = agents.getAgent(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);
  const available = await models.listModels({
    provider: agent.provider,
    cwd: agent.cwd,
    wait: true,
  });
  const target = input.model === undefined ? null : resolveModel(available, input.model);
  const modelId = target?.id ?? agent.config.model ?? null;
  const current = available.find((model) => model.id === modelId) ?? null;
  const effortId =
    input.effort === undefined ? null : resolveEffort(current, modelId, input.effort);

  if (target && target.id !== agent.config.model) await agents.setAgentModel(agentId, target.id);
  const notice = effortId ? await agents.setAgentThinkingOption(agentId, effortId) : null;

  return describeOwnModel({
    config: agents.getAgent(agentId)?.config ?? {},
    modelId,
    notice,
    changed: target !== null || effortId !== null,
    available,
  });
}

export function registerSelfModelTool(options: RegisterSelfModelToolOptions): void {
  const { callerAgentId, agents, models } = options;
  if (!callerAgentId && !options.agentScope) return;

  options.registerTool(
    "set_my_model",
    {
      title: "Set my model",
      description:
        "Switch your own model and/or effort (thinking level). The user's app no longer shows " +
        "them, so choose yourself: a stronger model or higher effort for hard work, a faster one " +
        "for quick talk. Call it without arguments to see your current model, effort and the " +
        "choices. The voice session and the chat keep running; a new effort may apply from your " +
        "next turn.",
      inputSchema: selfModelShape,
    },
    async (input) => {
      if (!callerAgentId) {
        throw new PaseoToolInputError("set_my_model switches the calling agent's own model");
      }
      return switchOwnModel({ agentId: callerAgentId, agents, models, input });
    },
  );
}
