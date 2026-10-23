import type { StageTemplate } from "./store.js";

// Compositions that ship with hizuri. Zuri opens one with stage_open({ template, data }) and
// fills its data; it saves its own with stage_settings, which take precedence by name.
export const BUILTIN_STAGE_TEMPLATES: readonly StageTemplate[] = [
  {
    name: "limits",
    title: "Limits",
    description:
      "The user's subscription limits as rings. Fill data.usage with get_usage's sources.",
    tags: ["limits", "usage", "subscription"],
    blocks: [{ type: "limits", id: "limits", bind: { sources: "/usage" }, enter: "rise" }],
  },
  {
    name: "status",
    title: "Status",
    description:
      "What runs now: data.jobs as status items, data.steps as steps. For the user's status tab.",
    tags: ["status", "agents", "jobs", "developer"],
    blocks: [
      { type: "status", id: "jobs", bind: { items: "/jobs" }, props: { title: "Running" } },
      { type: "steps", id: "steps", bind: { steps: "/steps" }, minDepth: "simple" },
    ],
  },
  {
    name: "result",
    title: "Result",
    description: "One finished result: data.title, data.body, an optional data.images list.",
    tags: ["result", "summary", "done"],
    blocks: [
      {
        type: "card",
        id: "result",
        bind: { title: "/title", body: "/body" },
        props: { kind: "success" },
        enter: "scale",
      },
      { type: "image", id: "pictures", bind: { images: "/images" } },
    ],
  },
  {
    name: "compare",
    title: "Compare options",
    description:
      "Options side by side and a pick: data.columns + data.rows (table), data.options (choice), data.prompt.",
    tags: ["compare", "decision", "shopping", "options"],
    blocks: [
      { type: "table", id: "table", bind: { columns: "/columns", rows: "/rows" } },
      {
        type: "choice",
        id: "pick",
        bind: { options: "/options", prompt: "/prompt" },
        enter: "rise",
      },
    ],
  },
];
