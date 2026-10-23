import { z } from "zod";
import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import type { ListUsageReportsOptions } from "../plugins/usage-sources/index.js";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import {
  SHOW_TOOL_DESCRIPTIONS,
  SHOW_WIDGET_KINDS,
  defaultShowWidgetId,
  getUsageShape,
  showLimitsShape,
  showPageShape,
  showScreenShape,
  showWidgetShapes,
  showWindowShape,
} from "./vocabulary.js";
import type { ShowStageMirror } from "../stage/show-mirror.js";

// Show tools acknowledge, and with a stage they also write the caller's stage tab
// (stage/show-mirror.ts). The app still draws every show_* call straight from the agent timeline,
// where it already gets the tool name and input (packages/app/src/show/model.ts). show_limits and show_screen are the
// tools whose output the app reads: the usage numbers it fetched, the stream URL from config.
// show_page moves the user's phone app to one of its three pages the same way: the app reads the
// call from the timeline.

export interface ShowUsageSource {
  listUsageReports(options: ListUsageReportsOptions): Promise<UsageReportEntry[]>;
}

export interface RegisterShowToolsOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  usage?: ShowUsageSource | null;
  /** The live view of the agent's browser (features.show.screenUrl); no URL, no show_screen. */
  screen?: ShowScreenSource | null;
  /** Hizuri (stage): every show_* call also writes the caller's stage (stage/show-mirror.ts). */
  stage?: ShowStageMirror | null;
}

export interface ShowScreenSource {
  url: string;
}

export const SHOW_SCREEN_WINDOW = "Screen";

const UsageWindowSummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  usedPct: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

const UsageSourceSummarySchema = z.object({
  sourceId: z.string(),
  sourceLabel: z.string(),
  account: z.string().nullable(),
  plan: z.string().nullable(),
  fetchedAt: z.string(),
  windows: z.array(UsageWindowSummarySchema),
  error: z.string().nullable(),
});

export type ShowUsageSourceSummary = z.infer<typeof UsageSourceSummarySchema>;

function usedPercent(window: { usedPct?: number | null; remainingPct?: number | null }) {
  if (typeof window.usedPct === "number") return window.usedPct;
  if (typeof window.remainingPct === "number") return 100 - window.remainingPct;
  return null;
}

function describeUsageProblem(entry: UsageReportEntry): string | null {
  const report = entry.report;
  if (report.status === "error") return report.error;
  if (report.status !== "unavailable") return null;
  const problem = report.problem;
  switch (problem.kind) {
    case "expired":
      return "The login expired; sign in to the provider again";
    case "rejected":
      return `The provider rejected the request (HTTP ${problem.status})`;
    case "no_quota":
      return problem.detail;
    default:
      return "Usage is unavailable";
  }
}

/** One compact summary per usage source: the numbers Zuri speaks and the limits view draws. */
export function summarizeUsageReports(entries: UsageReportEntry[]): ShowUsageSourceSummary[] {
  return entries.map((entry) => ({
    sourceId: entry.sourceId,
    sourceLabel: entry.sourceLabel,
    account: entry.account.label ?? null,
    plan: entry.report.status === "available" ? (entry.report.planLabel ?? null) : null,
    fetchedAt: entry.fetchedAt,
    windows:
      entry.report.status === "available"
        ? entry.report.windows.map((window) => ({
            id: window.id,
            label: window.label,
            usedPct: usedPercent(window),
            resetsAt: window.resetsAt ?? null,
          }))
        : [],
    error: describeUsageProblem(entry),
  }));
}

async function readUsage(
  usage: ShowUsageSource | null | undefined,
  refresh: boolean | undefined,
): Promise<ShowUsageSourceSummary[]> {
  if (!usage) {
    throw new Error("Usage reports are unavailable: the plugin runtime is not running");
  }
  const reports = await usage.listUsageReports({ forceRefresh: refresh === true });
  return summarizeUsageReports(reports);
}

function acknowledge(text: string, structuredContent: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

export function registerShowTools(options: RegisterShowToolsOptions): void {
  for (const kind of SHOW_WIDGET_KINDS) {
    options.registerTool(
      `show_${kind}`,
      {
        title: `Show ${kind}`,
        description: SHOW_TOOL_DESCRIPTIONS[kind],
        inputSchema: showWidgetShapes[kind],
      },
      async (input: Record<string, unknown>) => {
        const id =
          typeof input.id === "string" && input.id ? input.id : defaultShowWidgetId(kind, input);
        const window = typeof input.window === "string" ? input.window : null;
        const where = window ? ` in window “${window}”` : "";
        await options.stage?.widget(kind, input, id);
        return acknowledge(`Shown ${kind}${where} (id: ${id}). It is on the user's screen now.`, {
          ok: true,
          id,
          window,
        });
      },
    );
  }

  options.registerTool(
    "show_window",
    {
      title: "Show window",
      description:
        "Open, switch to, or close one of the Show windows (the tabs in the user's Show menu). " +
        "Use it when the user asks to see a window again or to close one.",
      inputSchema: showWindowShape,
    },
    async (input: { window: string; action?: "open" | "close" }) => {
      const action = input.action ?? "open";
      await options.stage?.window({ window: input.window, action });
      return acknowledge(
        action === "close" ? `Closed “${input.window}”.` : `Opened “${input.window}”.`,
        { ok: true, window: input.window, action },
      );
    },
  );

  options.registerTool(
    "show_page",
    {
      title: "Show page",
      description:
        "Move the user's phone app to one of its three pages: face (only your avatar, full " +
        "screen, for talking), chat (the chat thread with the voice bar), show (the Show " +
        "window). Use it when the user asks to see your face, the chat or what you showed, or " +
        "when another page fits what you are doing. Any other show_* call opens the Show page " +
        "by itself. The user can still swipe between the pages.",
      inputSchema: showPageShape,
    },
    async (input: { page: "face" | "chat" | "show" }) => {
      await options.stage?.page(input.page);
      return acknowledge(`The user's app is on the ${input.page} page now.`, {
        ok: true,
        page: input.page,
      });
    },
  );

  options.registerTool(
    "show_limits",
    {
      title: "Show limits",
      description:
        "Show the user's subscription limits (Claude's 5-hour session and weekly windows, with " +
        "reset times) as rings in the Show window. Use it whenever the user asks about their " +
        "limits, usage or how much is left. The result has the same numbers, so you can say them.",
      inputSchema: showLimitsShape,
    },
    async (input: { window?: string; refresh?: boolean }) => {
      const sources = await readUsage(options.usage, input.refresh);
      await options.stage?.limits(input.window, sources);
      return acknowledge(JSON.stringify({ ok: true, sources }), {
        ok: true,
        window: input.window ?? null,
        sources,
      });
    },
  );

  const screen = options.screen;
  if (screen) {
    options.registerTool(
      "show_screen",
      {
        title: "Show screen",
        description:
          "Show the user your browser live, as a video stream in the Show window: the page you " +
          "are on, as you browse. Use it when the user asks to see your screen, your browser or " +
          "the site you are on. The user watches without touching it until they tap “Take over”.",
        inputSchema: showScreenShape,
      },
      async () => {
        await options.stage?.screen();
        return acknowledge(
          JSON.stringify({ ok: true, window: SHOW_SCREEN_WINDOW, screen: { url: screen.url } }),
          { ok: true, window: SHOW_SCREEN_WINDOW, screen: { url: screen.url } },
        );
      },
    );
  }

  options.registerTool(
    "get_usage",
    {
      title: "Get usage",
      description:
        "Read the user's subscription usage for every connected provider: each window's used " +
        "percent and reset time (Claude: 5-hour session, weekly, per-model weekly). To show it " +
        "on screen, call show_limits instead.",
      inputSchema: getUsageShape,
    },
    async (input: { refresh?: boolean }) => {
      const sources = await readUsage(options.usage, input.refresh);
      return acknowledge(JSON.stringify({ sources }), { sources });
    },
  );
}
