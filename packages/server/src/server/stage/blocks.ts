// The stage's block catalogue: every block type Zuri may put in a tab, its props, its tags (it
// picks blocks by tag), the depth it needs and the plain text an app that cannot draw it shows
// instead. The descriptions are model-visible prompt surface — write them for the agent.
//
// The first five content blocks carry the Show widgets' props unchanged (show-tools/vocabulary.ts),
// so a show_* call becomes a block without translation. The vocabulary is additive-only: an app
// draws these props, so never rename or narrow one.

import { z } from "zod";
import { showWidgetShapes } from "../show-tools/vocabulary.js";

export const STAGE_DEPTHS = ["simple", "standard", "deep"] as const;
export type StageDepth = (typeof STAGE_DEPTHS)[number];

// Transitions move; nothing blinks (fly in and out). Each preset has a
// reduced-motion form in the app. An app that does not know a name plays rise, so a new entrance
// is additive (bloom: the brand's dot field opening from its core, made for the verdict).
export const BLOCK_ENTRANCES = [
  "rise",
  "fly-left",
  "fly-right",
  "scale",
  "flip",
  "drop",
  "bloom",
] as const;
export const TAB_ENTRANCES = ["slide", "fly-in", "zoom-from-face"] as const;
export const TAB_EXITS = ["fly-out", "fold-into-face"] as const;
export const BLOCK_EMPHASES = ["count-up", "draw-on", "pulse-once", "glow"] as const;
/** The animations the app carries (packages/app/src/stage/lottie-library.ts). */
export const LOTTIE_NAMES = ["success", "loading", "win", "error"] as const;

export const MAX_BLOCKS_PER_TAB = 80;
export const MAX_BLOCK_DEPTH = 4;
export const MAX_WEB_HTML_BYTES = 512 * 1024;
/** Where the daemon serves the copies show_file makes of pictures and videos (show-file.ts). */
export const STAGE_MEDIA_ROUTE = "/stage-media";
const STAGE_MEDIA_PATH = /^\/stage-media\/[0-9a-f]{64}\.[a-z0-9]{2,5}$/;
/** The links show_media grants to films on this machine (show-media/files.ts). */
const SHOW_MEDIA_FILE_PATH = /^\/hizuri-media\/file\/[A-Za-z0-9_-]{20,}\/[^/]+$/;

const { window: _window, id: _id, ...statProps } = showWidgetShapes.stat;
const { window: _w2, id: _i2, ...progressProps } = showWidgetShapes.progress;
const { window: _w3, id: _i3, ...cardProps } = showWidgetShapes.card;
const { window: _w4, id: _i4, ...tableProps } = showWidgetShapes.table;
const { window: _w5, id: _i5, ...chartProps } = showWidgetShapes.chart;

const short = (max: number) => z.string().trim().min(1).max(max);
const httpsOrDataImage = z
  .string()
  .max(400_000)
  .refine(
    (value) =>
      value.startsWith("https://") ||
      /^data:image\/(png|jpeg|webp|gif);base64,/.test(value) ||
      STAGE_MEDIA_PATH.test(value),
    {
      message: "must be an https:// link or a data:image/... URI (show_file opens a local picture)",
    },
  );
const httpsOrStageMedia = z
  .string()
  .max(2000)
  .refine(
    (value) =>
      STAGE_MEDIA_PATH.test(value) ||
      SHOW_MEDIA_FILE_PATH.test(value) ||
      (/^https?:\/\//.test(value) && URL.canParse(value)),
    { message: "must be an https:// link (show_file opens a local file)" },
  );

const actionSchema = z
  .object({
    value: short(200).describe(
      "What reaches you as <stage-action value=...> when the user taps it.",
    ),
    label: short(40).optional().describe("Button text; defaults to the row's title."),
    confirm: z
      .boolean()
      .optional()
      .describe("Ask the user to confirm first. Always true when money moves."),
  })
  .strict();

const statusStates = ["running", "done", "failed", "waiting"] as const;

// The app draws icons from a curated Lucide set (packages/app/src/stage/blocks/marks.tsx); any
// other name or an emoji becomes a spectrum dot, and a leading 🟢/🟡/🔴 in a title becomes its tone.
const iconDescription =
  "A Lucide icon name in kebab case: check, x, plus, minus, star, heart, shield, lock, key, " +
  "fingerprint, mail, phone, mic, user, users, globe, git-branch, code, terminal, server, database, " +
  "cloud, zap, clock, calendar, wallet, coins, chart, trending-up, trending-down, target, " +
  "rocket, sparkles, lightbulb, book, file, image, video, music, home, car, map-pin, heart-pulse, " +
  "gift, shopping-cart, package, truck, settings, link, eye, help, warning, info. " +
  "Anything else, emoji included, draws as a coloured dot.";

export interface StageBlockDefinition {
  type: string;
  title: string;
  description: string;
  tags: readonly string[];
  /** Layout blocks hold children and have no content of their own. */
  layout: boolean;
  minDepth: StageDepth;
  props: z.ZodObject<z.ZodRawShape>;
  /** Checks across props that a schema cannot say, as one sentence for Zuri. */
  check?: (props: Record<string, unknown>) => string | null;
  /** The plain text an app that cannot draw this block shows. */
  fallback: (props: Record<string, unknown>) => string;
  example: Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === "number") return String(value);
  return typeof value === "string" ? value : "";
}

function chartCheck(props: Record<string, unknown>): string | null {
  const x = Array.isArray(props.x) ? props.x : [];
  const series = Array.isArray(props.series) ? props.series : [];
  for (const [index, entry] of series.entries()) {
    const values = (entry as { values?: unknown[] }).values ?? [];
    if (values.length !== x.length) {
      return `series[${index}].values has ${values.length} values, x has ${x.length}`;
    }
  }
  if (props.kind === "pie" && series.length !== 1) {
    return `a pie takes exactly one series, got ${series.length}`;
  }
  return null;
}

function tableCheck(props: Record<string, unknown>): string | null {
  const columns = Array.isArray(props.columns) ? props.columns.length : 0;
  const rows = Array.isArray(props.rows) ? props.rows : [];
  for (const [index, row] of rows.entries()) {
    if (Array.isArray(row) && row.length > columns) {
      return `rows[${index}] has ${row.length} cells, columns has ${columns}`;
    }
  }
  return null;
}

const compareSide = z
  .object({
    title: short(80).describe("The column's name."),
    kind: z
      .enum(["plus", "minus", "neutral"])
      .optional()
      .describe("plus warm, minus rose, neutral violet."),
    items: z.array(short(160)).min(1).max(12).describe("Short points, a few words each."),
  })
  .strict();

const DEFINITIONS: StageBlockDefinition[] = [
  {
    type: "stat",
    title: "Number tile",
    description:
      "One number with its label and an optional change (a balance, a count, a percent), in " +
      "Geist Mono over a line of dots. Two side by side in a row compare two numbers; one alone " +
      "draws as a figure. Use emphasis count-up to make it count.",
    tags: ["number", "metric", "money", "kpi", "balance"],
    layout: false,
    minDepth: "simple",
    props: z.object(statProps).strict(),
    fallback: (p) => `${text(p.label)}: ${text(p.value)}`,
    example: { type: "stat", id: "balance", props: { label: "Balance", value: "€4,210" } },
  },
  {
    type: "progress",
    title: "Progress",
    description: "A bar or a ring that moves in place. Update its percent with stage_update.",
    tags: ["progress", "build", "status", "gauge", "ring"],
    layout: false,
    minDepth: "simple",
    props: z.object(progressProps).strict(),
    fallback: (p) => `${text(p.label)}: ${text(p.percent)}%`,
    example: { type: "progress", id: "build", props: { label: "Build", percent: 40 } },
  },
  {
    type: "card",
    title: "Card",
    description:
      "A heading and one short paragraph: a highlight, a summary. kind gives it a colour of the " +
      "brand's spectrum: success warm, warning orchid, error rose, info violet; no kind stays " +
      "neutral. The first card of a tab with a kind draws as the verdict; for a real answer " +
      "prefer the verdict block.",
    tags: ["text", "summary", "verdict", "note", "result"],
    layout: false,
    minDepth: "simple",
    props: z.object(cardProps).strict(),
    fallback: (p) => `${text(p.title)} — ${text(p.body)}`,
    example: {
      type: "card",
      props: { title: "Done", body: "The desk lamp is ordered.", kind: "success" },
    },
  },
  {
    type: "table",
    title: "Table",
    description: "Rows and columns, instead of reading rows out loud.",
    tags: ["data", "rows", "compare", "list"],
    layout: false,
    minDepth: "standard",
    props: z.object(tableProps).strict(),
    check: tableCheck,
    fallback: (p) => text(p.title) || "Table",
    example: {
      type: "table",
      props: { columns: ["Model", "Price"], rows: [["Orbit 2", "€89"]] },
    },
  },
  {
    type: "chart",
    title: "Chart",
    description:
      "line for trends, bar for comparing categories (stacked for part-to-whole), pie for one " +
      "part-of-whole split. Lines draw themselves (emphasis draw-on).",
    tags: ["chart", "trend", "compare", "money", "data"],
    layout: false,
    minDepth: "standard",
    props: z.object(chartProps).strict(),
    check: chartCheck,
    fallback: (p) => text(p.title) || "Chart",
    example: {
      type: "chart",
      props: { kind: "line", x: ["Mon", "Tue", "Wed"], series: [{ name: "€", values: [3, 5, 4] }] },
    },
  },
  {
    type: "limits",
    title: "Subscription limits",
    description:
      "The user's subscription limits as rings with reset times. Bind `sources` to the usage data " +
      "(the limits template does it).",
    tags: ["limits", "usage", "subscription", "claude"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: z.string().max(80).optional(),
        sources: z.array(z.record(z.string(), z.unknown())).max(12).optional(),
      })
      .strict(),
    fallback: (p) => text(p.title) || "Limits",
    example: { type: "limits", id: "limits", bind: { sources: "/usage" } },
  },
  {
    type: "text",
    title: "Text",
    description: "A heading or a short paragraph; **bold**, *italic*, lists and links only.",
    tags: ["text", "heading", "paragraph"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        text: short(8000),
        size: z.enum(["title", "body", "small"]).optional().describe("Default body."),
      })
      .strict(),
    fallback: (p) => text(p.text),
    example: { type: "text", props: { text: "Three lamps under €100", size: "title" } },
  },
  {
    type: "list",
    title: "List",
    description:
      "Rows with an icon, a title, a subtitle and a value or status; a row may act. Rows enter " +
      "one after another and their markers walk the spectrum. For pros and cons side by side " +
      "use compare; never put emoji in titles.",
    tags: ["list", "rows", "options", "items"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: z.string().max(120).optional(),
        items: z
          .array(
            z
              .object({
                id: short(64).optional(),
                icon: z.string().max(40).optional().describe(iconDescription),
                title: short(160),
                subtitle: z.string().max(240).optional(),
                value: z.string().max(60).optional(),
                status: z.enum(statusStates).optional(),
                action: actionSchema.optional(),
              })
              .strict(),
          )
          .max(100),
      })
      .strict(),
    fallback: (p) => text(p.title) || "List",
    example: {
      type: "list",
      props: { items: [{ icon: "package", title: "Parcel", value: "today" }] },
    },
  },
  {
    type: "status",
    title: "Live status",
    description:
      "Job and agent rows: running (pulses), done (a tick draws itself), failed (one shake), " +
      "waiting. For the user's status tab.",
    tags: ["status", "agents", "jobs", "progress", "developer"],
    layout: false,
    minDepth: "standard",
    props: z
      .object({
        title: z.string().max(120).optional(),
        items: z
          .array(
            z
              .object({
                id: short(64).optional(),
                label: short(160),
                state: z.enum(statusStates),
                detail: z.string().max(240).optional(),
                startedAt: z.string().max(40).optional().describe("ISO time; the app ticks it."),
                finishedAt: z.string().max(40).optional(),
              })
              .strict(),
          )
          .max(60),
      })
      .strict(),
    fallback: (p) => text(p.title) || "Status",
    example: {
      type: "status",
      props: {
        items: [{ label: "APK build", state: "running", startedAt: "2026-10-18T16:30:00Z" }],
      },
    },
  },
  {
    type: "steps",
    title: "Steps",
    description:
      "What you are doing or did, as numbered nodes on a line that draws itself as steps get " +
      "done. The simple user's view of a plan in motion; for a plan in time use timeline.",
    tags: ["plan", "steps", "progress", "simple", "checklist"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: z.string().max(120).optional(),
        steps: z
          .array(
            z
              .object({
                label: short(160),
                state: z.enum(["todo", "doing", "done", "failed"]),
              })
              .strict(),
          )
          .min(1)
          .max(30),
      })
      .strict(),
    fallback: (p) => text(p.title) || "Steps",
    example: {
      type: "steps",
      props: {
        steps: [
          { label: "Find machines", state: "done" },
          { label: "Compare", state: "doing" },
        ],
      },
    },
  },
  {
    type: "image",
    title: "Picture",
    description: "One picture or a gallery the user swipes (“show me the photos”).",
    tags: ["picture", "photo", "gallery", "product"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        images: z
          .array(
            z.object({ url: httpsOrDataImage, caption: z.string().max(200).optional() }).strict(),
          )
          .min(1)
          .max(20),
        fit: z.enum(["cover", "contain"]).optional(),
      })
      .strict(),
    fallback: (p) => {
      const images = Array.isArray(p.images) ? p.images : [];
      return text((images[0] as { caption?: unknown } | undefined)?.caption) || "Picture";
    },
    example: { type: "image", props: { images: [{ url: "https://example.com/car.jpg" }] } },
  },
  {
    type: "choice",
    title: "Choice",
    description:
      "Two to five options the user taps or says. The pick reaches you as " +
      "<stage-action tab=... block=... value=...>.",
    tags: ["question", "decision", "options", "action"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        prompt: short(240),
        options: z
          .array(
            z
              .object({
                value: short(200),
                label: short(80),
                detail: z.string().max(200).optional(),
              })
              .strict(),
          )
          .min(2)
          .max(5),
      })
      .strict(),
    fallback: (p) => text(p.prompt),
    example: {
      type: "choice",
      id: "pick",
      props: {
        prompt: "Which one?",
        options: [
          { value: "1", label: "Orbit" },
          { value: "2", label: "Halo" },
        ],
      },
    },
  },
  {
    type: "offer",
    title: "Offer",
    description:
      "A product or service: picture, price, rating, shop, one “why this one” line and a " +
      "confirm action. Money never moves without the user's confirm.",
    tags: ["shopping", "product", "money", "offer", "action"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: short(160),
        price: short(40),
        image: httpsOrDataImage.optional(),
        rating: z.number().min(0).max(5).optional(),
        shop: z.string().max(80).optional(),
        why: z.string().max(240).optional(),
        url: z.string().url().max(2000).optional(),
        action: actionSchema.optional(),
      })
      .strict(),
    fallback: (p) => `${text(p.title)} — ${text(p.price)}`,
    example: {
      type: "offer",
      props: {
        title: "Orbit Desk 2",
        price: "€89",
        why: "Brightest under €100",
        action: { value: "buy-orbit", label: "Buy", confirm: true },
      },
    },
  },
  {
    type: "media",
    title: "Audio or video",
    description:
      "Plays audio or video from an https link (show_file opens a local file). For a film, " +
      "YouTube or music the user watches or listens to, call show_media instead: it opens the player tab.",
    tags: ["video", "audio", "music", "media"],
    layout: false,
    minDepth: "simple",
    // `player` and the props after it are what show_media writes (show-media/tools.ts): the full
    // player with sound, controls, picture-in-picture and background play, instead of a muted clip.
    props: z
      .object({
        kind: z.enum(["audio", "video", "youtube"]),
        url: httpsOrStageMedia,
        title: z.string().max(160).optional(),
        poster: httpsOrDataImage.optional(),
        player: z.boolean().optional(),
        playId: z.string().max(64).optional(),
        contentType: z.enum(["auto", "hls", "dash", "progressive"]).optional(),
        startAt: z.number().min(0).optional(),
        queue: z.array(z.string().max(2000)).max(50).optional(),
        videoId: z.string().max(20).optional(),
        playlistId: z.string().max(64).optional(),
      })
      .strict(),
    fallback: (p) => text(p.title) || "Media",
    example: { type: "media", props: { kind: "video", url: "https://example.com/clip.mp4" } },
  },
  {
    type: "lottie",
    title: "Animation",
    description:
      "A short vector animation: success (a tick draws itself), loading (a spinning arc), win " +
      "(confetti and a star), error (a cross and a shake); or your own Lottie JSON from an " +
      "https link. Put it where the moment lands: a job done, a purchase made, a wait.",
    tags: ["animation", "lottie", "success", "loading", "celebrate", "win", "error"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        name: z.enum(LOTTIE_NAMES).optional().describe("One of the built-in animations."),
        url: z.string().url().startsWith("https://").max(2000).optional(),
        caption: z.string().max(160).optional().describe("A line under it."),
        size: z.enum(["small", "medium", "large"]).optional().describe("Default medium."),
        loop: z.boolean().optional().describe("Default: loading loops, the others play once."),
      })
      .strict(),
    check: (p) =>
      (typeof p.name === "string") === (typeof p.url === "string")
        ? "give exactly one of name or url"
        : null,
    fallback: (p) => text(p.caption) || text(p.name) || "Animation",
    example: { type: "lottie", props: { name: "success", caption: "Ordered" } },
  },
  {
    type: "web",
    title: "Free-form page",
    description:
      "Your own HTML in a sandbox (no network, no storage), for what no block can draw yet; " +
      "or screen: true for your browser live. Prefer real blocks.",
    tags: ["custom", "html", "free-form", "web", "screen"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        html: z.string().max(MAX_WEB_HTML_BYTES).optional(),
        screen: z.boolean().optional().describe("Your browser, streamed live (show_screen)."),
        height: z.number().int().min(80).max(4000).optional(),
      })
      .strict(),
    check: (p) =>
      (typeof p.html === "string") === (p.screen === true)
        ? "give exactly one of html or screen: true"
        : null,
    fallback: () => "Page",
    example: { type: "web", props: { html: "<h1>Hi</h1>" } },
  },
  {
    type: "verdict",
    title: "Verdict",
    description:
      "The answer first: one line the user hears and sees, why in a sentence, where it comes from. " +
      "It blooms out of the brand's dot field in the colour of what it says. Put it at the top " +
      "of every tab that answers a question, then the evidence under it.",
    tags: ["verdict", "answer", "summary", "result", "decision", "hero"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        answer: short(160).describe("The answer itself, 3–12 words, the user's language."),
        says: z
          .enum(["yes", "no", "careful", "note"])
          .optional()
          .describe("Its colour: yes warm, no rose, careful orchid, note violet; default neutral."),
        why: z.string().max(600).optional().describe("One or two sentences of why."),
        source: z.string().max(200).optional().describe("Small mono line: the source or the date."),
      })
      .strict(),
    fallback: (p) => [text(p.answer), text(p.why)].filter(Boolean).join(" — "),
    example: {
      type: "verdict",
      id: "verdict",
      props: { answer: "Yes, Orbit 2 is the one", says: "yes", why: "Brightest and in budget." },
    },
  },
  {
    type: "figure",
    title: "Figure",
    description:
      "One big number as the hero of the tab: Geist Mono over a warm glow, a line of dots, an " +
      "optional change. For the single number the tab is about; several numbers are stat tiles " +
      "in a row. Use emphasis count-up.",
    tags: ["number", "metric", "money", "kpi", "hero", "big"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        value: short(40).describe("The number with its unit, e.g. '€4,210', '98%', '3 h'."),
        label: short(120).describe("What it is, a few words."),
        caption: z.string().max(240).optional().describe("A muted line: period, source, baseline."),
        delta: statProps.delta,
      })
      .strict(),
    fallback: (p) => `${text(p.label)}: ${text(p.value)}`,
    example: {
      type: "figure",
      id: "runway",
      emphasis: "count-up",
      props: { value: "99.9%", label: "Uptime", caption: "this month" },
    },
  },
  {
    type: "compare",
    title: "Compare",
    description:
      "Two columns side by side: ours vs theirs, pros vs cons, before vs after, each a short list " +
      "of points, with an optional one-line verdict under them. Better than two lists or a " +
      "table of words.",
    tags: ["compare", "versus", "pros", "cons", "choice", "tradeoff"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: z.string().max(120).optional(),
        left: compareSide,
        right: compareSide,
        verdict: z.string().max(240).optional().describe("The conclusion, one line."),
      })
      .strict(),
    fallback: (p) => {
      const side = (value: unknown) => {
        const record = (value ?? {}) as { title?: unknown; items?: unknown };
        const items = Array.isArray(record.items) ? record.items.map(text) : [];
        return `${text(record.title)}: ${items.join(", ")}`;
      };
      return [text(p.title), side(p.left), side(p.right), text(p.verdict)]
        .filter(Boolean)
        .join(" — ");
    },
    example: {
      type: "compare",
      props: {
        left: { title: "hizuri", kind: "plus", items: ["Voice first", "Runs at home"] },
        right: { title: "Hermes", kind: "minus", items: ["Text only"] },
        verdict: "hizuri wins on voice",
      },
    },
  },
  {
    type: "timeline",
    title: "Timeline",
    description:
      "Events or a plan in time: a mono date column, a line that draws through what is past, a " +
      "breathing node on now, hollow nodes for what comes next. For a roadmap, a history, the " +
      "week ahead.",
    tags: ["timeline", "plan", "roadmap", "history", "schedule", "dates"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: z.string().max(120).optional(),
        items: z
          .array(
            z
              .object({
                when: z.string().max(40).optional().describe("Short: 'Mon', '12 Oct', 'Q1'."),
                label: short(160),
                detail: z.string().max(240).optional(),
                state: z.enum(["past", "now", "next"]).optional().describe("Default next."),
              })
              .strict(),
          )
          .min(1)
          .max(30),
      })
      .strict(),
    fallback: (p) => text(p.title) || "Timeline",
    example: {
      type: "timeline",
      props: {
        items: [
          { when: "Mon", label: "Prototype", state: "past" },
          { when: "Wed", label: "Test with Sam", state: "now" },
          { when: "Fri", label: "Ship", state: "next" },
        ],
      },
    },
  },
  {
    type: "divider",
    title: "Divider",
    description: "A quiet break between parts of a long tab: a hairline with an optional label.",
    tags: ["layout", "divider", "separator"],
    layout: false,
    minDepth: "simple",
    props: z.object({ label: z.string().max(60).optional() }).strict(),
    fallback: (p) => text(p.label),
    example: { type: "divider", props: { label: "Details" } },
  },
  {
    type: "cover",
    title: "Cover",
    description:
      "A tab's opening picture: a large light title over a photo (show_file opens a local one) " +
      "or, without one, over the brand's dot field. For a how-it-works, a story, a product.",
    tags: ["cover", "hero", "picture", "title", "intro"],
    layout: false,
    minDepth: "simple",
    props: z
      .object({
        title: short(120),
        kicker: z.string().max(60).optional().describe("A small mono line above the title."),
        subtitle: z.string().max(240).optional(),
        image: httpsOrDataImage.optional(),
      })
      .strict(),
    fallback: (p) => [text(p.title), text(p.subtitle)].filter(Boolean).join(" — "),
    example: {
      type: "cover",
      props: { kicker: "How it works", title: "Voice login", subtitle: "Your voice is the key" },
    },
  },
  {
    type: "stack",
    title: "Stack",
    description: "Children one under another.",
    tags: ["layout"],
    layout: true,
    minDepth: "simple",
    props: z.object({ gap: z.number().int().min(0).max(48).optional() }).strict(),
    fallback: () => "",
    example: { type: "stack", children: [] },
  },
  {
    type: "row",
    title: "Row",
    description: "Children side by side; wraps to two columns on a phone.",
    tags: ["layout", "grid"],
    layout: true,
    minDepth: "simple",
    props: z.object({ gap: z.number().int().min(0).max(48).optional() }).strict(),
    fallback: () => "",
    example: { type: "row", children: [] },
  },
  {
    type: "section",
    title: "Section",
    description: "A titled group of children that can fold.",
    tags: ["layout", "group"],
    layout: true,
    minDepth: "simple",
    props: z.object({ title: short(120), collapsed: z.boolean().optional() }).strict(),
    fallback: (p) => text(p.title),
    example: { type: "section", props: { title: "Details" }, children: [] },
  },
  {
    type: "carousel",
    title: "Carousel",
    description: "Children as pages the user swipes inside the tab.",
    tags: ["layout", "pages", "gallery"],
    layout: true,
    minDepth: "simple",
    props: z.object({}).strict(),
    fallback: () => "",
    example: { type: "carousel", children: [] },
  },
];

export const STAGE_BLOCKS: ReadonlyMap<string, StageBlockDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.type, definition]),
);

const blockShape = z
  .object({
    type: z.string().min(1).max(40),
    id: z.string().trim().min(1).max(64).optional(),
    props: z.record(z.string(), z.unknown()).optional(),
    children: z.array(z.unknown()).max(40).optional(),
    bind: z
      .record(z.string(), z.string().regex(/^\//, "a data path starts with /"))
      .optional()
      .describe("Prop name → JSON pointer into the tab's data, e.g. { value: '/balance' }."),
    enter: z.enum(BLOCK_ENTRANCES).optional(),
    emphasis: z.enum(BLOCK_EMPHASES).optional(),
    delay: z.number().int().min(0).max(5000).optional(),
    stagger: z.number().int().min(0).max(1000).optional(),
    lottie: z.string().url().startsWith("https://").max(2000).optional(),
    minDepth: z.enum(STAGE_DEPTHS).optional(),
    fallback: z.string().max(400).optional(),
  })
  .strict();

/** A block as Zuri sends it; children are checked recursively by normalizeBlocks. */
export const stageBlockInputSchema = z
  .object({ type: z.string() })
  .passthrough()
  .describe(
    "A block: { type, id?, props?, children?, bind?, enter?, emphasis?, minDepth?, fallback? }. " +
      "Call stage_blocks for the types and their props.",
  );

export interface NormalizedBlock {
  [key: string]: unknown;
  type: string;
  id: string;
  props?: Record<string, unknown>;
  children?: NormalizedBlock[];
  bind?: Record<string, string>;
  enter?: string;
  emphasis?: string;
  delay?: number;
  stagger?: number;
  lottie?: string;
  minDepth?: StageDepth;
  fallback: string;
}

export class StageBlockError extends Error {
  constructor(
    public readonly path: string,
    public readonly detail: string,
  ) {
    super(`${path}: ${detail}`);
    this.name = "StageBlockError";
  }
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const where = issue.path.length
    ? issue.path
        .map((part, index) =>
          typeof part === "number" ? `[${part}]` : `${index === 0 ? "" : "."}${String(part)}`,
        )
        .join("")
    : "";
  return where ? `${where}: ${issue.message}` : issue.message;
}

type ParsedBlockShape = z.infer<typeof blockShape>;

interface ParsedBlock {
  block: ParsedBlockShape;
  definition: StageBlockDefinition;
  label: string;
  props: Record<string, unknown>;
}

function parseBlock(raw: unknown, path: string): ParsedBlock {
  const parsed = blockShape.safeParse(raw);
  if (!parsed.success) {
    throw new StageBlockError(path, parsed.error.issues.map(describeIssue).join("; "));
  }
  const block = parsed.data;
  const definition = STAGE_BLOCKS.get(block.type);
  if (!definition) {
    throw new StageBlockError(
      path,
      `unknown block type “${block.type}”; known: ${[...STAGE_BLOCKS.keys()].join(", ")}`,
    );
  }
  const label = `${path} (${block.type})`;
  if (block.children && !definition.layout) {
    throw new StageBlockError(
      label,
      `${block.type} takes no children; wrap them in a stack or row`,
    );
  }
  const result = definition.props.safeParse(block.props ?? {});
  if (result.success) {
    const props = result.data as Record<string, unknown>;
    const problem = definition.check?.(props) ?? null;
    if (problem) throw new StageBlockError(label, problem);
    return { block, definition, label, props };
  }
  // A bound prop may be missing from props: the tab's data fills it.
  const bound = new Set(Object.keys(block.bind ?? {}));
  const issues = result.error.issues.filter(
    (issue) => !(issue.path.length === 1 && bound.has(String(issue.path[0]))),
  );
  if (issues.length > 0) throw new StageBlockError(label, issues.map(describeIssue).join("; "));
  return { block, definition, label, props: block.props ?? {} };
}

/** Motion, data binding and depth, copied only when set. */
function presentationOf(
  block: ParsedBlockShape,
  definition: StageBlockDefinition,
): Partial<NormalizedBlock> {
  const minDepth = block.minDepth ?? definition.minDepth;
  const fields: Partial<NormalizedBlock> = {
    bind: block.bind,
    enter: block.enter,
    emphasis: block.emphasis,
    delay: block.delay,
    stagger: block.stagger,
    lottie: block.lottie,
    minDepth: minDepth === "simple" ? undefined : minDepth,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<NormalizedBlock>;
}

/**
 * Checks Zuri's blocks against the catalogue and gives every block an id (b1, b2, … in tree order
 * where it gave none), so any block can be updated in place later. Throws StageBlockError with
 * the exact place and reason, which goes back to the assistant as the tool error.
 */
export function normalizeBlocks(
  blocks: readonly unknown[],
  options: { takenIds?: Set<string>; path?: string } = {},
): NormalizedBlock[] {
  const taken = options.takenIds ?? new Set<string>();
  const seen = new Set<string>();
  let counter = 0;
  let total = 0;
  const nextId = () => {
    let id: string;
    do {
      counter += 1;
      id = `b${counter}`;
    } while (taken.has(id) || seen.has(id));
    return id;
  };
  const visit = (raw: unknown, path: string, depth: number): NormalizedBlock => {
    total += 1;
    if (total > MAX_BLOCKS_PER_TAB) {
      throw new StageBlockError(path, `a tab holds at most ${MAX_BLOCKS_PER_TAB} blocks`);
    }
    const { block, definition, label, props } = parseBlock(raw, path);
    if (definition.layout && depth >= MAX_BLOCK_DEPTH) {
      throw new StageBlockError(label, `layouts nest at most ${MAX_BLOCK_DEPTH} deep`);
    }
    if (block.id !== undefined && (seen.has(block.id) || taken.has(block.id))) {
      throw new StageBlockError(label, `id “${block.id}” is used twice in this tab`);
    }
    const id = block.id ?? nextId();
    seen.add(id);
    const children = block.children?.map((child, index) =>
      visit(child, `${path}.children[${index}]`, depth + 1),
    );
    return {
      type: block.type,
      id,
      ...(Object.keys(props).length > 0 ? { props } : {}),
      ...(children ? { children } : {}),
      ...presentationOf(block, definition),
      fallback: block.fallback ?? definition.fallback(props),
    };
  };
  const prefix = options.path ?? "blocks";
  return blocks.map((block, index) => visit(block, `${prefix}[${index}]`, 0));
}

/** Every block id in a tree. */
export function collectBlockIds(blocks: readonly { id?: string; children?: unknown }[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly { id?: string; children?: unknown }[]) => {
    for (const block of list) {
      if (block.id) ids.push(block.id);
      if (Array.isArray(block.children)) walk(block.children as { id?: string }[]);
    }
  };
  walk(blocks);
  return ids;
}

export interface StageBlockSummary {
  type: string;
  title: string;
  description: string;
  tags: readonly string[];
  layout: boolean;
  minDepth: StageDepth;
  props: unknown;
  example: Record<string, unknown>;
}

/** The catalogue for stage_blocks: all blocks, or those matching any of the tags. */
export function describeBlocks(
  filter: { tags?: string[]; types?: string[] } = {},
): StageBlockSummary[] {
  const tags = filter.tags?.map((tag) => tag.toLowerCase());
  return DEFINITIONS.filter(
    (definition) =>
      (!filter.types?.length || filter.types.includes(definition.type)) &&
      (!tags?.length || definition.tags.some((tag) => tags.includes(tag))),
  ).map((definition) => ({
    type: definition.type,
    title: definition.title,
    description: definition.description,
    tags: definition.tags,
    layout: definition.layout,
    minDepth: definition.minDepth,
    props: z.toJSONSchema(definition.props, { unrepresentable: "any" }),
    example: definition.example,
  }));
}
