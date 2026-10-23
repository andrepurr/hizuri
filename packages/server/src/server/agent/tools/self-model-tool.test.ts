import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { AgentModelDefinition, AgentProviderNotice } from "../agent-sdk-types.js";
import type { PaseoToolConfig, PaseoToolResult } from "./types.js";
import {
  findModel,
  registerSelfModelTool,
  type SelfModelAgents,
  type SelfModelCatalog,
} from "./self-model-tool.js";

const EFFORTS = [
  { id: "low", label: "Low" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
];

const MODELS: AgentModelDefinition[] = [
  {
    provider: "claude",
    id: "claude-opus-5-5",
    aliases: ["opus"],
    label: "Opus 5.5",
    thinkingOptions: EFFORTS,
  },
  {
    provider: "claude",
    id: "claude-sonnet-5-5",
    aliases: ["sonnet"],
    label: "Sonnet 5.5",
    thinkingOptions: EFFORTS,
  },
  { provider: "claude", id: "claude-haiku-5-5", label: "Haiku 5.5" },
];

class FakeAgents implements SelfModelAgents {
  public readonly calls: string[] = [];
  public config: { model?: string; thinkingOptionId?: string } = {
    model: "claude-opus-5-5",
    thinkingOptionId: "xhigh",
  };
  public notice: AgentProviderNotice | null = null;

  public getAgent(agentId: string) {
    return agentId === "zuri"
      ? { provider: "claude", cwd: "/home/dev", config: this.config }
      : null;
  }

  public async setAgentModel(agentId: string, modelId: string | null): Promise<void> {
    this.calls.push(`model:${agentId}:${modelId}`);
    this.config = { ...this.config, model: modelId ?? undefined };
  }

  public async setAgentThinkingOption(
    agentId: string,
    thinkingOptionId: string | null,
  ): Promise<AgentProviderNotice | null> {
    this.calls.push(`effort:${agentId}:${thinkingOptionId}`);
    this.config = { ...this.config, thinkingOptionId: thinkingOptionId ?? undefined };
    return this.notice;
  }
}

const catalog: SelfModelCatalog = { listModels: async () => MODELS };

function harness(callerAgentId: string | undefined, agentScope = false) {
  const agents = new FakeAgents();
  let registered: {
    config: PaseoToolConfig;
    handler: (input: { model?: string; effort?: string }) => Promise<PaseoToolResult>;
  } | null = null;
  registerSelfModelTool({
    registerTool: (name, config, handler) => {
      expect(name).toBe("set_my_model");
      registered = { config, handler: (input) => handler(input, {}) };
    },
    callerAgentId,
    agentScope,
    agents,
    models: catalog,
  });
  const run = (input: unknown) => {
    if (!registered) throw new Error("set_my_model is not registered");
    const schema = z.object(registered.config.inputSchema as z.ZodRawShape);
    return registered.handler(schema.parse(input));
  };
  return { agents, run, registered: () => registered !== null };
}

describe("set_my_model", () => {
  test("exists only for a calling agent", () => {
    expect(harness(undefined).registered()).toBe(false);
    expect(harness("zuri").registered()).toBe(true);
  });

  // Paseo 0.12 builds the agent tool manifest (the OpenCode bridge advertises it) before any caller
  // exists; each call then runs through the agent's own catalog.
  test("is listed in the agent manifest before a caller exists, and runs only for one", async () => {
    const { registered, run } = harness(undefined, true);
    expect(registered()).toBe(true);
    await expect(run({})).rejects.toThrow(/agent/);
  });

  test("without arguments reports the current model, effort and the choices", async () => {
    const { agents, run } = harness("zuri");
    const result = await run({});
    expect(agents.calls).toEqual([]);
    expect(result.structuredContent).toEqual({
      ok: true,
      model: "claude-opus-5-5",
      effort: "xhigh",
    });
    expect(result.content[0]?.text).toContain("claude-sonnet-5-5 (Sonnet 5.5), effort: low");
  });

  test("switches the caller's own model and effort from loose names", async () => {
    const { agents, run } = harness("zuri");
    agents.notice = { type: "warning", message: "Thinking level applies next turn" };
    const result = await run({ model: "Sonnet 5.5", effort: "HIGH" });
    expect(agents.calls).toEqual(["model:zuri:claude-sonnet-5-5", "effort:zuri:high"]);
    expect(result.structuredContent).toEqual({
      ok: true,
      model: "claude-sonnet-5-5",
      effort: "high",
      notice: "Thinking level applies next turn",
    });
  });

  test("an unknown model or effort fails with the choices and changes nothing", async () => {
    const { agents, run } = harness("zuri");
    await expect(run({ model: "gpt" })).rejects.toThrow("Unknown model “gpt”");
    await expect(run({ effort: "turbo" })).rejects.toThrow("Choices: low, high, xhigh");
    await expect(run({ model: "sonnet", effort: "turbo" })).rejects.toThrow("Unknown effort");
    expect(agents.calls).toEqual([]);
  });

  test("findModel takes an id, an alias, a label or a family", () => {
    const models: AgentModelDefinition[] = [
      ...MODELS,
      { provider: "claude", id: "claude-sonnet-5", label: "Sonnet 5" },
      { provider: "claude", id: "claude-sonnet-4-6[1m]", label: "Sonnet 4.6 1M" },
      { provider: "claude", id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
    ];
    expect(findModel(models, "opus")?.id).toBe("claude-opus-5-5");
    expect(findModel(models, "Sonnet")?.id).toBe("claude-sonnet-5-5");
    expect(findModel(models, "sonnet 4.6")?.id).toBe("claude-sonnet-4-6");
    expect(findModel(models, "claude-sonnet-5")?.id).toBe("claude-sonnet-5");
    expect(findModel(models, "5-5")).toBeNull();
  });
});
