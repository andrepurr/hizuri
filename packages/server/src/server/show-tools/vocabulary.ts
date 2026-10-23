// The Show window's widget vocabulary: which widgets Zuri may put on the Show page and what
// props each accepts. The .describe() strings are model-visible prompt surface — write them for
// the agent, not for humans.
//
// Adapted from mirafold/mirafold server/registry-spec.ts and server/render-mcp.ts @ main
// (MIT, Copyright (c) Mirafold contributors). Copied and trimmed; no dependency on Mirafold.
// The app reads these props back from the tool call input (packages/app/src/show/model.ts), so
// the vocabulary is additive-only: never rename or narrow a prop the app already renders.

import { z } from "zod";

export const SHOW_WIDGET_KINDS = ["stat", "progress", "card", "table", "chart"] as const;
export type ShowWidgetKind = (typeof SHOW_WIDGET_KINDS)[number];

const windowParam = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .optional()
  .describe(
    "The Show window to put this in: a short title such as 'Limits', 'Agents' or 'Build'. " +
      "Each window is a tab in the user's Show menu; the same title reuses the same window and " +
      "switches to it. Omit to use the window you used last.",
  );

const idParam = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .optional()
  .describe(
    "Stable id of this widget inside its window. Calling again with the same id replaces the " +
      "widget in place (live progress, a number that moves) instead of adding a second one. " +
      "Defaults to the widget kind plus its label or title, so re-sending the same label also " +
      "updates in place.",
  );

const common = { window: windowParam, id: idParam };

export const showWidgetShapes = {
  stat: {
    ...common,
    label: z.string().trim().min(1).max(80).describe("What the number is, 1–4 words."),
    value: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe("The number itself, formatted with its unit, e.g. '98%', '212 ms', '€4.10'."),
    delta: z
      .object({
        value: z.string().max(40).describe("The change, formatted and signed, e.g. '+2.1%'."),
        direction: z.enum(["up", "down"]).describe("Which way the number moved."),
        good: z
          .boolean()
          .describe("Whether this move is good news — colours the change. Up is not always good."),
      })
      .optional()
      .describe("Change since a prior reading. Omit when there is no comparison."),
    footer: z
      .string()
      .max(200)
      .optional()
      .describe("Small muted line under the value: the source, period or baseline."),
  },

  progress: {
    ...common,
    label: z.string().trim().min(1).max(80).describe("What is in progress, a few words."),
    percent: z
      .number()
      .min(0)
      .max(100)
      .describe("Completion, 0–100. Re-call with the same label or id to move it."),
    detail: z
      .string()
      .max(200)
      .optional()
      .describe("Optional status line under the bar: the current step, a reset time, an ETA."),
    style: z
      .enum(["bar", "ring"])
      .optional()
      .describe("bar (default) for work in progress; ring for a headline gauge."),
  },

  card: {
    ...common,
    title: z.string().trim().min(1).max(120).describe("Card heading, a few words."),
    body: z.string().max(4000).describe("Main card content, one short paragraph. Plain text."),
    footer: z
      .string()
      .max(200)
      .optional()
      .describe("Small muted footer line: a source, timestamp or caveat."),
    kind: z
      .enum(["info", "success", "warning", "error"])
      .optional()
      .describe("Optional tint: success, warning, error or info. Omit for a plain card."),
  },

  table: {
    ...common,
    title: z.string().max(120).optional().describe("Optional heading above the table."),
    columns: z.array(z.string().max(80)).min(1).max(12).describe("Column headers, in order."),
    rows: z
      .array(z.array(z.union([z.string().max(400), z.number()])).max(12))
      .max(200)
      .describe("Table body: one array per row, cells aligned to `columns` by index."),
  },

  chart: {
    ...common,
    title: z.string().max(120).optional().describe("Optional heading above the chart."),
    kind: z
      .enum(["line", "bar", "pie"])
      .describe(
        "line for change over an ordered axis; bar for comparing categories (pre-bin " +
          "distributions into labelled buckets yourself); pie for ONE part-of-whole split — " +
          "exactly one series, six slices or fewer read best.",
      ),
    x: z
      .array(z.string().max(40))
      .min(1)
      .max(60)
      .describe("X-axis labels (time points or categories) in order. For pie: the slice names."),
    series: z
      .array(
        z.object({
          name: z.string().max(40).describe("Series name, shown in the legend."),
          values: z.array(z.number()).max(60).describe("One value per x label, by index."),
        }),
      )
      .min(1)
      .max(6)
      .describe("1–6 series sharing the x axis. pie takes exactly one series."),
    yLabel: z.string().max(20).optional().describe("Optional y-axis unit, e.g. 'ms' or '€'."),
    stacked: z
      .boolean()
      .optional()
      .describe("Bar charts only: stack the series into one column per x label."),
  },
} as const;

export const SHOW_TOOL_DESCRIPTIONS: Record<ShowWidgetKind, string> = {
  stat:
    "Show the user a single-number tile (a balance, a count, a percent) with an optional up/down " +
    "change, in the Show window on their phone. Re-call with the same label or id to update it.",
  progress:
    "Show the user a progress bar or ring in the Show window. Re-call with the same label or id " +
    "to move it in place.",
  card: "Show the user a card in the Show window: one highlight, summary or verdict with a heading.",
  table: "Show the user a table in the Show window instead of reading rows out loud.",
  chart:
    "Show the user a chart in the Show window for any plot: line for trends, bar for comparing " +
    "categories (stacked=true for part-to-whole), pie for one part-of-whole split. Never describe " +
    "a chart in words when you can show it.",
};

export const showWindowShape = {
  window: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .describe("Title of the Show window to open, switch to or close."),
  action: z
    .enum(["open", "close"])
    .optional()
    .describe("open (default) brings the window to the front; close removes it from the menu."),
};

/** The three pages of the phone app in simple mode, left to right. */
export const SHOW_PAGES = ["face", "chat", "show"] as const;

export const showPageShape = {
  page: z
    .enum(SHOW_PAGES)
    .describe(
      "face: only your avatar, full screen. chat: the chat with the voice bar. show: the Show window.",
    ),
};

export const showLimitsShape = {
  window: windowParam,
  refresh: z
    .boolean()
    .optional()
    .describe("Fetch fresh numbers instead of the ones cached for up to five minutes."),
};

export const showScreenShape = {};

export const getUsageShape = {
  refresh: z
    .boolean()
    .optional()
    .describe("Fetch fresh numbers instead of the ones cached for up to five minutes."),
};

/** The id a widget gets when the agent passes none — mirrored by the app (show/model.ts). */
export function defaultShowWidgetId(kind: ShowWidgetKind, input: Record<string, unknown>): string {
  const label = input.label ?? input.title;
  const name = typeof label === "string" ? label.trim().toLowerCase() : "";
  return name ? `${kind}:${name}` : kind;
}
