import { describe, expect, test } from "vitest";
import { z } from "zod";
import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import type { ListUsageReportsOptions } from "../plugins/usage-sources/index.js";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { registerShowTools, summarizeUsageReports, type ShowUsageSource } from "./tools.js";

interface RegisteredTool {
  config: PaseoToolConfig;
  handler: (args: unknown, context: PaseoToolExecutionContext) => Promise<PaseoToolResult>;
}

const CLAUDE_REPORT: UsageReportEntry = {
  id: "claude:acct",
  account: { label: "owner@example.com" },
  fetchedAt: "2026-10-17T20:00:00.000Z",
  sourceId: "claude",
  sourceLabel: "Claude",
  report: {
    status: "available",
    planLabel: "Max",
    windows: [
      {
        id: "five_hour",
        label: "Session",
        usedPct: 34,
        resetsAt: "2026-10-17T22:10:00.000Z",
      },
      { id: "weekly", label: "Weekly", remainingPct: 41, resetsAt: "2026-10-21T08:00:00.000Z" },
    ],
  },
};

const EXPIRED_REPORT: UsageReportEntry = {
  id: "codex:acct",
  account: {},
  fetchedAt: "2026-10-17T20:00:00.000Z",
  sourceId: "codex",
  sourceLabel: "Codex",
  report: {
    status: "unavailable",
    problem: { kind: "expired", expiresAt: "2026-10-16T00:00:00.000Z" },
  },
};

class FakeUsage implements ShowUsageSource {
  public readonly calls: ListUsageReportsOptions[] = [];

  public async listUsageReports(options: ListUsageReportsOptions): Promise<UsageReportEntry[]> {
    this.calls.push(options);
    return [CLAUDE_REPORT, EXPIRED_REPORT];
  }
}

function schemaFor(inputSchema: PaseoToolConfig["inputSchema"]): z.ZodType {
  if (!inputSchema) return z.object({}).passthrough();
  if (typeof (inputSchema as { safeParse?: unknown }).safeParse === "function") {
    return inputSchema as z.ZodType;
  }
  return z.object(inputSchema as z.ZodRawShape).passthrough();
}

class ShowToolHarness {
  public readonly usage = new FakeUsage();
  private readonly tools = new Map<string, RegisteredTool>();

  public constructor(options: { withUsage?: boolean; screenUrl?: string } = {}) {
    registerShowTools({
      registerTool: (name, config, handler) => {
        this.tools.set(name, { config, handler });
      },
      usage: options.withUsage === false ? null : this.usage,
      screen: options.screenUrl ? { url: options.screenUrl } : null,
    });
  }

  public toolNames(): string[] {
    return [...this.tools.keys()];
  }

  public validate(name: string, input: unknown) {
    return schemaFor(this.get(name).config.inputSchema).safeParse(input);
  }

  public async execute(name: string, input: unknown): Promise<PaseoToolResult> {
    const parsed = schemaFor(this.get(name).config.inputSchema).parse(input);
    return this.get(name).handler(parsed, {});
  }

  private get(name: string): RegisteredTool {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not registered: ${name}`);
    return tool;
  }
}

describe("show tools", () => {
  test("registers the widget vocabulary, the window switcher and the usage tools", () => {
    expect(new ShowToolHarness().toolNames()).toEqual([
      "show_stat",
      "show_progress",
      "show_card",
      "show_table",
      "show_chart",
      "show_window",
      "show_page",
      "show_limits",
      "get_usage",
    ]);
  });

  test("a widget without an id is acknowledged under its kind and label", async () => {
    const result = await new ShowToolHarness().execute("show_progress", {
      label: "Tests",
      percent: 40,
      window: "Build",
    });
    expect(result.structuredContent).toEqual({ ok: true, id: "progress:tests", window: "Build" });
  });

  test("an explicit id wins over the label", async () => {
    const result = await new ShowToolHarness().execute("show_stat", {
      id: "balance",
      label: "Balance",
      value: "€4.10",
    });
    expect(result.structuredContent).toEqual({ ok: true, id: "balance", window: null });
  });

  test("rejects a percent outside 0–100 and a pie without labels", () => {
    const harness = new ShowToolHarness();
    expect(harness.validate("show_progress", { label: "x", percent: 140 }).success).toBe(false);
    expect(
      harness.validate("show_chart", { kind: "pie", x: [], series: [{ name: "a", values: [] }] })
        .success,
    ).toBe(false);
  });

  test("show_page acknowledges one of the three pages and rejects any other", async () => {
    const harness = new ShowToolHarness();
    const result = await harness.execute("show_page", { page: "face" });
    expect(result.structuredContent).toEqual({ ok: true, page: "face" });
    expect(harness.validate("show_page", { page: "settings" }).success).toBe(false);
  });

  test("show_limits returns every source's windows as used percent with reset times", async () => {
    const harness = new ShowToolHarness();
    const result = await harness.execute("show_limits", { refresh: true });
    expect(harness.usage.calls).toEqual([{ forceRefresh: true }]);
    expect(result.structuredContent).toEqual({
      ok: true,
      window: null,
      sources: [
        {
          sourceId: "claude",
          sourceLabel: "Claude",
          account: "owner@example.com",
          plan: "Max",
          fetchedAt: "2026-10-17T20:00:00.000Z",
          windows: [
            {
              id: "five_hour",
              label: "Session",
              usedPct: 34,
              resetsAt: "2026-10-17T22:10:00.000Z",
            },
            { id: "weekly", label: "Weekly", usedPct: 59, resetsAt: "2026-10-21T08:00:00.000Z" },
          ],
          error: null,
        },
        {
          sourceId: "codex",
          sourceLabel: "Codex",
          account: null,
          plan: null,
          fetchedAt: "2026-10-17T20:00:00.000Z",
          windows: [],
          error: "The login expired; sign in to the provider again",
        },
      ],
    });
    // The app parses the text the agent sees, so it must be the same JSON.
    const text = result.content[0]?.text ?? "";
    expect(JSON.parse(text).sources).toEqual(
      (result.structuredContent as { sources: unknown }).sources,
    );
  });

  test("get_usage uses the five-minute cache unless asked to refresh", async () => {
    const harness = new ShowToolHarness();
    await harness.execute("get_usage", {});
    expect(harness.usage.calls).toEqual([{ forceRefresh: false }]);
  });

  test("usage tools fail explicitly without the plugin runtime", async () => {
    await expect(
      new ShowToolHarness({ withUsage: false }).execute("get_usage", {}),
    ).rejects.toThrow("Usage reports are unavailable");
  });

  test("show_screen exists only with a configured stream and hands the app its URL", async () => {
    expect(new ShowToolHarness().toolNames()).not.toContain("show_screen");
    const harness = new ShowToolHarness({ screenUrl: "http://192.0.2.1:8481/" });
    expect(harness.toolNames()).toContain("show_screen");
    const result = await harness.execute("show_screen", {});
    const expected = { ok: true, window: "Screen", screen: { url: "http://192.0.2.1:8481/" } };
    expect(result.structuredContent).toEqual(expected);
    expect(JSON.parse(result.content[0]?.text ?? "")).toEqual(expected);
  });

  test("summarizeUsageReports keeps a source's error instead of dropping it", () => {
    expect(summarizeUsageReports([EXPIRED_REPORT])[0]?.error).toBe(
      "The login expired; sign in to the provider again",
    );
  });
});
