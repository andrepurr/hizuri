import { z } from "zod";
import { type NormalizedBlock, normalizeBlocks } from "./blocks.js";

// Hizuri (visual front): the bank of ready scenes for the live tab "Now". A fast
// model never lays out a screen; it picks one scene and fills its slots in a line of JSON, and
// code turns that into the tab. The app draws each scene natively from `data.scene` (designed
// compositions: big type, one idea per screen, motion that reads on a phone); the blocks built
// here are what an app without the scene renderer, and Zuri's stage_list, see instead.

export const LIVE_TAB_ID = "live";
/** The app shows the tab under its own name in the app's language (stage/model.ts). */
export const LIVE_TAB_TITLE = "Now";
/** The live tab's `createdBy`: the app knows it by this and never moves the pager for it. */
export const LIVE_TAB_AUTHOR = "visual-front";

export const LIVE_SCENES = [
  "hero",
  "number",
  "compare",
  "list",
  "steps",
  "timeline",
  "chart",
  "status",
  "win",
  "alert",
] as const;
export type LiveSceneName = (typeof LIVE_SCENES)[number];

const line = (max: number) => z.string().trim().min(1).max(max);
const kicker = line(28)
  .optional()
  .describe("1-3 words, the topic: a scene on the same topic changes in place.");

const heroSchema = z
  .object({ p: z.literal("hero"), k: kicker, t: line(70), s: line(120).optional() })
  .strict();
const numberSchema = z
  .object({
    p: z.literal("number"),
    k: kicker,
    v: line(16).describe("The number as shown: “43%”, “€4 980”, “22”."),
    t: line(60).describe("What the number is."),
    s: line(120).optional(),
  })
  .strict();
const compareSchema = z
  .object({
    p: z.literal("compare"),
    k: kicker,
    t: line(70),
    items: z
      .array(z.object({ l: line(40), v: line(40) }).strict())
      .min(2)
      .max(4),
  })
  .strict();
const listSchema = z
  .object({
    p: z.literal("list"),
    k: kicker,
    t: line(70),
    items: z.array(line(80)).min(1).max(6),
  })
  .strict();
const stepsSchema = z
  .object({
    p: z.literal("steps"),
    k: kicker,
    t: line(70),
    steps: z
      .array(z.object({ l: line(80), s: z.enum(["todo", "doing", "done", "failed"]) }).strict())
      .min(1)
      .max(6),
  })
  .strict();
const timelineSchema = z
  .object({
    p: z.literal("timeline"),
    k: kicker,
    t: line(70),
    items: z
      .array(z.object({ w: line(16), l: line(80) }).strict())
      .min(2)
      .max(6),
  })
  .strict();
const chartSchema = z
  .object({
    p: z.literal("chart"),
    k: kicker,
    t: line(70),
    kind: z.enum(["bar", "line"]),
    x: z.array(line(14)).min(2).max(8),
    y: z.array(z.number().finite()).min(2).max(8),
    u: line(10).optional().describe("The unit: “%”, “€”, “GB”."),
  })
  .strict()
  .refine((value) => value.x.length === value.y.length, { message: "x and y differ in length" });
const statusSchema = z
  .object({
    p: z.literal("status"),
    k: kicker,
    t: line(70),
    items: z
      .array(
        z
          .object({
            l: line(80),
            s: z.enum(["running", "done", "failed", "waiting"]),
            d: line(80).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
const winSchema = z
  .object({ p: z.literal("win"), k: kicker, t: line(70), s: line(120).optional() })
  .strict();
const alertSchema = z
  .object({ p: z.literal("alert"), k: kicker, t: line(70), s: line(120).optional() })
  .strict();

export const liveSceneSchema = z.union([
  heroSchema,
  numberSchema,
  compareSchema,
  listSchema,
  stepsSchema,
  timelineSchema,
  chartSchema,
  statusSchema,
  winSchema,
  alertSchema,
]);
export type LiveScene = z.infer<typeof liveSceneSchema>;

export type SceneAnswer =
  | { kind: "scene"; scene: LiveScene }
  | { kind: "skip" }
  | { kind: "keep" }
  | { kind: "invalid"; reason: string };

/** The model's answer: one line of scene JSON, SKIP (draw nothing) or KEEP (the screen fits). */
export function parseSceneAnswer(raw: string): SceneAnswer {
  const text = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^```(?:json)?|```$/gm, "")
    .trim();
  if (/^skip\b/i.test(text)) return { kind: "skip" };
  if (/^keep\b/i.test(text)) return { kind: "keep" };
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { kind: "invalid", reason: "no-json" };
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { kind: "invalid", reason: "bad-json" };
  }
  const parsed = liveSceneSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "invalid",
      reason: `schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")
        .slice(0, 200)}`,
    };
  }
  return { kind: "scene", scene: parsed.data };
}

/** Every string a scene shows, for the number check. */
export function sceneText(scene: LiveScene): string {
  const parts: string[] = [scene.k ?? "", scene.t];
  switch (scene.p) {
    case "hero":
    case "win":
    case "alert":
      parts.push(scene.s ?? "");
      break;
    case "number":
      parts.push(scene.v, scene.s ?? "");
      break;
    case "compare":
      for (const item of scene.items) parts.push(item.l, item.v);
      break;
    case "list":
      parts.push(...scene.items);
      break;
    case "steps":
      for (const step of scene.steps) parts.push(step.l);
      break;
    case "timeline":
      for (const item of scene.items) parts.push(item.w, item.l);
      break;
    case "chart":
      parts.push(...scene.x, scene.y.join(" "), scene.u ?? "");
      break;
    case "status":
      for (const item of scene.items) parts.push(item.l, item.d ?? "");
      break;
  }
  return parts.filter(Boolean).join(" \n ");
}

function textBlock(id: string, value: string, size: "title" | "body" | "small"): unknown {
  return { type: "text", id, props: { text: value, size } };
}

/** The scene as plain blocks with stable ids, so an update changes them in place. */
export function sceneBlocks(scene: LiveScene): NormalizedBlock[] {
  const blocks: unknown[] = [];
  switch (scene.p) {
    case "hero":
      blocks.push(textBlock("vf-head", scene.t, "title"));
      if (scene.s) blocks.push(textBlock("vf-sub", scene.s, "body"));
      break;
    case "number":
      blocks.push({
        type: "stat",
        id: "vf-number",
        props: { label: scene.t, value: scene.v, ...(scene.s ? { footer: scene.s } : {}) },
        emphasis: "count-up",
        enter: "scale",
      });
      break;
    case "compare":
      blocks.push(textBlock("vf-head", scene.t, "title"), {
        type: "row",
        id: "vf-compare",
        children: scene.items.map((item, index) => ({
          type: "stat",
          id: `vf-compare-${index}`,
          props: { label: item.l, value: item.v },
          emphasis: "count-up",
        })),
      });
      break;
    case "list":
      blocks.push({
        type: "list",
        id: "vf-list",
        props: { title: scene.t, items: scene.items.map((item) => ({ title: item })) },
      });
      break;
    case "steps":
      blocks.push({
        type: "steps",
        id: "vf-steps",
        props: {
          title: scene.t,
          steps: scene.steps.map((step) => ({ label: step.l, state: step.s })),
        },
      });
      break;
    case "timeline":
      blocks.push({
        type: "list",
        id: "vf-timeline",
        props: {
          title: scene.t,
          items: scene.items.map((item) => ({ title: item.l, value: item.w })),
        },
      });
      break;
    case "chart":
      blocks.push({
        type: "chart",
        id: "vf-chart",
        props: {
          title: scene.t,
          kind: scene.kind,
          x: scene.x,
          series: [{ name: scene.u ?? scene.t.slice(0, 20), values: scene.y }],
        },
        emphasis: "draw-on",
      });
      break;
    case "status":
      blocks.push({
        type: "status",
        id: "vf-status",
        props: {
          title: scene.t,
          items: scene.items.map((item) => ({
            label: item.l,
            state: item.s,
            ...(item.d ? { detail: item.d } : {}),
          })),
        },
      });
      break;
    case "win":
    case "alert":
      blocks.push(
        {
          type: "lottie",
          id: "vf-lottie",
          props: { name: scene.p === "win" ? "win" : "error", size: "medium" },
        },
        textBlock("vf-head", scene.t, "title"),
      );
      if (scene.s) blocks.push(textBlock("vf-sub", scene.s, "body"));
      break;
  }
  return normalizeBlocks(blocks);
}
