import { z } from "zod";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import {
  BLOCK_EMPHASES,
  BLOCK_ENTRANCES,
  STAGE_DEPTHS,
  TAB_ENTRANCES,
  TAB_EXITS,
  collectBlockIds,
  describeBlocks,
  normalizeBlocks,
  stageBlockInputSchema,
  type NormalizedBlock,
} from "./blocks.js";
import {
  PERCH_POSES,
  StageError,
  assertTabId,
  tabIdFromTitle,
  type StageStore,
  type StageTemplate,
} from "./store.js";
import { BUILTIN_STAGE_TEMPLATES } from "./templates.js";

// Hizuri: Zuri's tools for the stage — the tabs on the user's screen. The assistant opens,
// rewrites, focuses and closes tabs; the daemon keeps them (store.ts) and every connected app draws
// the change at once. The main tab — the assistant's face and the chat, with “Start session” — is
// not a stage tab: no tool can close it.

/** Ids the main tab answers to; a stage tab can never take them. */
const MAIN_TAB_NAMES = new Set(["main", "chat", "face", "zuri"]);

export interface RegisterStageToolsOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  store: StageStore;
  /** The agent whose stage the caller writes: its root agent, so a child's work shows too. */
  owner: string | null;
  callerAgentId?: string;
}

const tabParam = z
  .string()
  .trim()
  .min(1)
  .max(48)
  .describe("The tab's id (stage_list shows them); stage_open returns it.");

const blocksParam = z
  .array(stageBlockInputSchema)
  .max(80)
  .describe(
    "The tab's blocks, top to bottom. Give an id to every block you will update. " +
      "Types and props: stage_blocks.",
  );

export const stageOpenShape = {
  title: z.string().trim().min(1).max(60).describe("Tab title, 1–4 words, the user's language."),
  tab: tabParam
    .optional()
    .describe(
      "Id to open or replace; defaults to one made from the title, so the same title replaces the same tab.",
    ),
  blocks: blocksParam.optional(),
  template: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .optional()
    .describe(
      "Open a saved composition instead of blocks (stage_blocks lists them); fill it with data.",
    ),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Values blocks bind to: { usage: [...] } feeds bind { sources: '/usage' }."),
  icon: z.string().max(40).optional().describe("A Lucide icon name or an emoji."),
  pin: z.boolean().optional().describe("Pinned tabs never close by themselves."),
  focus: z
    .boolean()
    .optional()
    .describe("Bring it to the front (default true). false = open quietly behind."),
  enter: z.enum(TAB_ENTRANCES).optional().describe("How it arrives; default slide."),
};

export const stageUpdateShape = {
  tab: tabParam,
  set: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Data path → new value: { '/percent': 64 } moves a bound number in place."),
  unset: z.array(z.string()).max(50).optional().describe("Data paths to remove."),
  replace: z
    .array(stageBlockInputSchema)
    .max(80)
    .optional()
    .describe("Whole blocks that take the place of the blocks with the same id."),
  append: z.array(stageBlockInputSchema).max(80).optional().describe("Blocks added at the end."),
  appendTo: z
    .string()
    .max(64)
    .optional()
    .describe("A layout block's id to append into, instead of the end of the tab."),
  remove: z.array(z.string()).max(80).optional().describe("Block ids to take out."),
  title: z.string().trim().min(1).max(60).optional(),
  icon: z.string().max(40).optional(),
  pin: z.boolean().optional(),
  focus: z.boolean().optional().describe("Also bring it to the front."),
};

export const stageCloseShape = {
  tab: tabParam,
  delete: z
    .boolean()
    .optional()
    .describe(
      "Forget it completely; without it the tab stays in the closed list for stage_restore.",
    ),
  exit: z
    .enum(TAB_EXITS)
    .optional()
    .describe("How it leaves; fold-into-face for a result the user has seen."),
};

export const stageFocusShape = {
  tab: tabParam.optional().describe("The tab to bring to the front; omit for the main tab."),
  view: z
    .enum(["face", "chat"])
    .optional()
    .describe("The main tab's view: your face or the chat. Brings the main tab to the front."),
  bubble: z
    .boolean()
    .optional()
    .describe("Your face floats small over the tab in front while you work."),
  slide: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe(
      "Flip the tab's live page (a slides deck opened with show_file) to this slide, 1-based. " +
        "The open page moves there with its own animation, no reload; needs tab.",
    ),
};

const PERCH_VERBS: Record<(typeof PERCH_POSES)[number], string> = {
  sit: "sit on",
  point: "sit on and point at",
  lean: "lean on",
};

export const stagePerchShape = {
  tab: tabParam.optional().describe("The tab of the block; omit only with off."),
  block: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .optional()
    .describe("The block's id (stage_open and stage_list name them)."),
  pose: z
    .enum(PERCH_POSES)
    .optional()
    .describe(
      "sit (default): on its top edge, legs over it, swinging a little; point: sit there and " +
        "point at the block (its number, its chart); lean: stand behind it, arms on the edge.",
    ),
  side: z
    .enum(["left", "right"])
    .optional()
    .describe("Which end of the top edge; default right, so a number on the left stays clear."),
  focus: z.boolean().optional().describe("Bring the tab to the front (default true)."),
  off: z.boolean().optional().describe("Leave the block: your small self goes away."),
};

export const stageRestoreShape = {
  tab: tabParam,
  version: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Go back to this version of an open tab (stage_list shows the kept ones)."),
};

export const stageBlocksShape = {
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(10)
    .optional()
    .describe("Only blocks with any of these tags, e.g. ['summary', 'compare']."),
  types: z.array(z.string().max(40)).max(20).optional().describe("Only these block types."),
};

export const stageSettingsShape = {
  depth: z
    .enum(STAGE_DEPTHS)
    .optional()
    .describe(
      "How much interface the user wants: simple (your face and results), standard (a few tabs), " +
        "deep (tab strip with live statuses, details). “show details” → deeper, “simpler” → up.",
    ),
  chrome: z
    .object({
      tabStrip: z.enum(["none", "dots", "strip"]).optional(),
      edges: z.boolean().optional().describe("Agent list and file explorer behind the edges."),
      theme: z.string().max(40).optional(),
    })
    .strict()
    .optional(),
  saveTemplate: z
    .object({
      name: z.string().trim().min(1).max(48).describe("lowercase-with-dashes"),
      fromTab: tabParam.describe("Save this open tab's blocks and data as the template."),
      description: z.string().max(240).optional(),
      tags: z.array(z.string().max(30)).max(10).optional(),
    })
    .strict()
    .optional(),
  deleteTemplate: z.string().trim().min(1).max(48).optional(),
};

const STAGE_TOOL_DESCRIPTIONS = {
  stage_open:
    "Open a tab on the user's screen, or replace one, built from blocks (or a saved template " +
    "filled with data). It slides in at once on every device the user has. Use it for anything they " +
    "should see: a result, a comparison, a status, pictures, a choice. The main tab — your face " +
    "and the chat — is always there and is not a tab. Look at stage_list before reopening " +
    "something the user closed.",
  stage_update:
    "Change part of an open tab in place: set data values (a number that moves), replace, add or " +
    "remove blocks by id, rename. Nothing blanks; only what changed moves. The cheap call for " +
    "live progress.",
  stage_close:
    "Close a tab (it stays in the closed list for stage_restore), or forget it with delete. " +
    "The main tab cannot be closed.",
  stage_focus:
    "Bring a tab to the front, or the main tab with your face or the chat, and turn your " +
    "floating face bubble on or off. With slide, flip that tab's live page (a slides deck) to " +
    "slide N in place — use this, not reopening the file with --at, to walk the user through a deck.",
  stage_perch:
    "Sit your small self on a block of an open tab: on its top edge with your legs over it, " +
    "pointing at it, or leaning on it. Call it again with another block to hop there; off: true " +
    "to leave. The user still reads and taps the block under you; you leave by yourself when the " +
    "block scrolls away or closes, and the user can hide you (stage_list shows main.perch while you sit).",
  stage_list:
    "What is on the user's screen: open tabs with versions, which one is in front, what they look at " +
    "now and when they last saw each tab, what they or you closed and when, the depth.",
  stage_blocks:
    "The block library: every block type with its tags, props, the depth it needs and an " +
    "example, plus the templates. Pick blocks by tag. Lead with the answer (verdict), then the " +
    "evidence: figure for the one number, stat tiles in a row for several, compare for two " +
    "sides, timeline for time, steps for work in motion, cover to open a story. Icons are " +
    "Lucide names; emoji are not drawn. Transitions: block enter " +
    `${BLOCK_ENTRANCES.join(", ")}; emphasis ${BLOCK_EMPHASES.join(", ")}.`,
  stage_restore:
    "Reopen a tab that was closed, or bring an open tab back to an older version (“put it back as it was”).",
  stage_settings:
    "Set how deep the interface goes (depth) and its chrome, or save an open tab as a template " +
    "and delete one.",
};

function reply(text: string, structured: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

function refuse(error: unknown): PaseoToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}

function checkTabName(tabId: string): string {
  if (MAIN_TAB_NAMES.has(tabId)) {
    throw new StageError(
      "invalid_tab",
      `“${tabId}” is the main tab (your face and the chat). It is always there and cannot be ` +
        "opened, replaced or closed; use stage_focus with view face or chat.",
    );
  }
  return assertTabId(tabId);
}

async function findTemplate(store: StageStore, name: string): Promise<StageTemplate> {
  const saved = (await store.listTemplates()).find((template) => template.name === name);
  const template = saved ?? BUILTIN_STAGE_TEMPLATES.find((candidate) => candidate.name === name);
  if (!template) {
    const names = [
      ...new Set([
        ...BUILTIN_STAGE_TEMPLATES.map((candidate) => candidate.name),
        ...(await store.listTemplates()).map((candidate) => candidate.name),
      ]),
    ];
    throw new StageError("not_found", `no template “${name}”; templates: ${names.join(", ")}`);
  }
  return template;
}

function blockIdList(blocks: readonly NormalizedBlock[]): string {
  return collectBlockIds(blocks).join(", ");
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

/**
 * Checks and ids the blocks of an update: a replacement keeps the id of the block it replaces,
 * new blocks get ids no other block in the tab has.
 */
function prepareUpdateBlocks(
  tabId: string,
  existing: Set<string>,
  input: { replace?: unknown[]; append?: unknown[]; remove?: string[] },
): { replace?: NormalizedBlock[]; append?: NormalizedBlock[] } {
  const replacedIds = new Set<string>();
  for (const [index, raw] of (input.replace ?? []).entries()) {
    const id = (raw as { id?: unknown }).id;
    if (typeof id !== "string" || !existing.has(id)) {
      throw new StageError(
        "invalid",
        `replace[${index}] needs the id of a block in tab “${tabId}”; its blocks: ${[...existing].join(", ") || "none"}`,
      );
    }
    replacedIds.add(id);
  }
  const taken = new Set([...existing].filter((id) => !replacedIds.has(id)));
  for (const id of input.remove ?? []) taken.delete(id);
  const replace = input.replace
    ? normalizeBlocks(input.replace, { path: "replace", takenIds: new Set(taken) })
    : undefined;
  for (const id of replace ? collectBlockIds(replace) : []) taken.add(id);
  const append = input.append
    ? normalizeBlocks(input.append, { path: "append", takenIds: taken })
    : undefined;
  return { replace, append };
}

export function registerStageTools(options: RegisterStageToolsOptions): void {
  const { store, registerTool } = options;
  const owner = (): string => {
    if (!options.owner) {
      throw new StageError(
        "invalid_agent",
        "stage tools need a calling agent: the stage is per agent",
      );
    }
    return options.owner;
  };
  const guarded =
    <T>(run: (input: T) => Promise<PaseoToolResult>) =>
    async (input: T): Promise<PaseoToolResult> => {
      try {
        return await run(input);
      } catch (error) {
        if (error instanceof StageError || error instanceof Error) return refuse(error);
        throw error;
      }
    };

  registerTool(
    "stage_open",
    {
      title: "Stage open",
      description: STAGE_TOOL_DESCRIPTIONS.stage_open,
      inputSchema: stageOpenShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageOpenShape>>) => {
      if (Boolean(input.blocks) === Boolean(input.template)) {
        throw new StageError("invalid", "give exactly one of blocks or template");
      }
      const template = input.template ? await findTemplate(store, input.template) : null;
      const title = input.title;
      const tabId = checkTabName(input.tab ?? tabIdFromTitle(title));
      const blocks = normalizeBlocks(template ? template.blocks : (input.blocks ?? []));
      const data = template?.data || input.data ? { ...template?.data, ...input.data } : undefined;
      const result = await store.open(owner(), {
        tabId,
        title,
        blocks,
        ...(data ? { data } : {}),
        ...(input.icon ? { icon: input.icon } : {}),
        ...(input.pin !== undefined ? { pin: input.pin } : {}),
        ...(input.focus !== undefined ? { focus: input.focus } : {}),
        ...(input.enter ? { enter: input.enter } : {}),
        ...(options.callerAgentId ? { createdBy: options.callerAgentId } : {}),
      });
      const closedNote = result.autoClosed.length
        ? ` To keep at most 12 open tabs, these closed: ${result.autoClosed.join(", ")}.`
        : "";
      return reply(
        `${result.replaced ? "Replaced" : "Opened"} tab “${title}” (id ${tabId}, version ` +
          `${result.tab.version})${input.focus === false ? " behind" : ", in front"}. ` +
          `Block ids: ${blockIdList(blocks)}.${closedNote}`,
        {
          ok: true,
          tab: tabId,
          version: result.tab.version,
          replaced: result.replaced,
          blockIds: collectBlockIds(blocks),
          autoClosed: result.autoClosed,
          revision: result.revision,
        },
      );
    }),
  );

  registerTool(
    "stage_update",
    {
      title: "Stage update",
      description: STAGE_TOOL_DESCRIPTIONS.stage_update,
      inputSchema: stageUpdateShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageUpdateShape>>) => {
      const agentId = owner();
      const tabId = checkTabName(input.tab);
      const stage = await store.get(agentId);
      const current = stage.tabs.find((tab) => tab.id === tabId);
      const { replace, append } = prepareUpdateBlocks(
        tabId,
        new Set(current ? collectBlockIds(current.blocks) : []),
        input,
      );
      const result = await store.update(agentId, {
        tabId,
        ...withoutUndefined({
          title: input.title,
          icon: input.icon,
          pin: input.pin,
          focus: input.focus,
          set: input.set,
          unset: input.unset,
          replace,
          append,
          appendTo: input.appendTo,
          remove: input.remove,
        }),
      });
      return reply(
        `Updated tab “${result.tab.title}” in place (version ${result.tab.version}).` +
          (append ? ` New block ids: ${blockIdList(append)}.` : ""),
        {
          ok: true,
          tab: tabId,
          version: result.tab.version,
          ...(append ? { blockIds: collectBlockIds(append) } : {}),
          revision: result.revision,
        },
      );
    }),
  );

  registerTool(
    "stage_close",
    {
      title: "Stage close",
      description: STAGE_TOOL_DESCRIPTIONS.stage_close,
      inputSchema: stageCloseShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageCloseShape>>) => {
      const tabId = checkTabName(input.tab);
      const result = await store.close(owner(), {
        tabId,
        by: "agent",
        ...(input.delete ? { delete: true } : {}),
        ...(input.exit ? { exit: input.exit } : {}),
      });
      return reply(
        input.delete
          ? `Tab ${tabId} is gone for good.`
          : `Closed tab ${tabId}; stage_restore brings it back.`,
        {
          ok: true,
          tab: tabId,
          closed: result.closed,
          deleted: result.deleted,
          revision: result.revision,
        },
      );
    }),
  );

  registerTool(
    "stage_focus",
    {
      title: "Stage focus",
      description: STAGE_TOOL_DESCRIPTIONS.stage_focus,
      inputSchema: stageFocusShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageFocusShape>>) => {
      const main = input.tab === undefined || MAIN_TAB_NAMES.has(input.tab);
      const view =
        input.view ?? (input.tab === "chat" || input.tab === "face" ? input.tab : undefined);
      if (input.slide !== undefined) {
        if (main) throw new StageError("invalid", "slide needs the tab whose page to flip");
        const tabId = assertTabId(input.tab!);
        const flipped = await store.slide(owner(), { tabId, slide: input.slide });
        if (input.bubble !== undefined) await store.focus(owner(), { bubble: input.bubble });
        return reply(`In front now: tab ${tabId}, on slide ${input.slide}.`, {
          ok: true,
          revision: flipped.revision,
        });
      }
      const result = await store.focus(owner(), {
        tabId: main ? null : assertTabId(input.tab!),
        ...(view ? { view } : {}),
        ...(input.bubble !== undefined ? { bubble: input.bubble } : {}),
      });
      const where = main ? `the main tab${view ? ` (${view})` : ""}` : `tab ${input.tab}`;
      return reply(`In front now: ${where}.`, { ok: true, revision: result.revision });
    }),
  );

  registerTool(
    "stage_perch",
    {
      title: "Stage perch",
      description: STAGE_TOOL_DESCRIPTIONS.stage_perch,
      inputSchema: stagePerchShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stagePerchShape>>) => {
      if (input.off) {
        const result = await store.perch(owner(), null);
        return reply("You left the block.", { ok: true, perch: null, revision: result.revision });
      }
      if (!input.tab || !input.block) {
        throw new StageError("invalid", "give tab and block, or off: true");
      }
      const tabId = checkTabName(input.tab);
      const pose = input.pose ?? "sit";
      const result = await store.perch(owner(), {
        tabId,
        blockId: input.block,
        pose,
        ...(input.side ? { side: input.side } : {}),
        ...(input.focus !== undefined ? { focus: input.focus } : {}),
      });
      return reply(`You ${PERCH_VERBS[pose]} block ${input.block} of tab ${tabId}.`, {
        ok: true,
        perch: { tab: tabId, block: input.block, pose, side: input.side ?? null },
        revision: result.revision,
      });
    }),
  );

  registerTool(
    "stage_list",
    { title: "Stage list", description: STAGE_TOOL_DESCRIPTIONS.stage_list, inputSchema: {} },
    guarded(async () => {
      const stage = await store.get(owner());
      const summary = {
        revision: stage.revision,
        focus: stage.focus ?? "main",
        main: stage.main,
        depth: stage.depth,
        chrome: stage.chrome,
        viewing: stage.viewing ?? null,
        tabs: stage.tabs.map((tab) => ({
          id: tab.id,
          title: tab.title,
          version: tab.version,
          blocks: collectBlockIds(tab.blocks),
          pinned: tab.pinned === true,
          updatedAt: tab.updatedAt,
          seenAt: tab.seenAt ?? null,
        })),
        closed: stage.closed,
      };
      return reply(JSON.stringify(summary), summary);
    }),
  );

  registerTool(
    "stage_blocks",
    {
      title: "Stage blocks",
      description: STAGE_TOOL_DESCRIPTIONS.stage_blocks,
      inputSchema: stageBlocksShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageBlocksShape>>) => {
      const blocks = describeBlocks({
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.types ? { types: input.types } : {}),
      });
      const saved = await store.listTemplates();
      const templates = [
        ...saved,
        ...BUILTIN_STAGE_TEMPLATES.filter(
          (builtin) => !saved.some((own) => own.name === builtin.name),
        ),
      ].map((template) => ({
        name: template.name,
        title: template.title,
        description: template.description ?? "",
        tags: template.tags ?? [],
      }));
      const result = { blocks, templates };
      return reply(JSON.stringify(result), result);
    }),
  );

  registerTool(
    "stage_restore",
    {
      title: "Stage restore",
      description: STAGE_TOOL_DESCRIPTIONS.stage_restore,
      inputSchema: stageRestoreShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageRestoreShape>>) => {
      const tabId = checkTabName(input.tab);
      const result = await store.restore(owner(), {
        tabId,
        ...(input.version !== undefined ? { version: input.version } : {}),
      });
      return reply(`Tab “${result.tab.title}” is back (version ${result.tab.version}), in front.`, {
        ok: true,
        tab: tabId,
        version: result.tab.version,
        revision: result.revision,
      });
    }),
  );

  registerTool(
    "stage_settings",
    {
      title: "Stage settings",
      description: STAGE_TOOL_DESCRIPTIONS.stage_settings,
      inputSchema: stageSettingsShape,
    },
    guarded(async (input: z.infer<z.ZodObject<typeof stageSettingsShape>>) => {
      const agentId = owner();
      const done: string[] = [];
      if (input.depth || input.chrome) {
        await store.settings(agentId, {
          ...(input.depth ? { depth: input.depth } : {}),
          ...(input.chrome ? { chrome: input.chrome } : {}),
        });
        done.push(`depth ${input.depth ?? "unchanged"}${input.chrome ? ", chrome set" : ""}`);
      }
      if (input.saveTemplate) {
        const stage = await store.get(agentId);
        const tab = stage.tabs.find((candidate) => candidate.id === input.saveTemplate!.fromTab);
        if (!tab) throw new StageError("not_found", `no open tab “${input.saveTemplate.fromTab}”`);
        await store.saveTemplate({
          name: assertTabId(input.saveTemplate.name),
          title: tab.title,
          blocks: tab.blocks,
          ...(tab.data ? { data: tab.data } : {}),
          ...(input.saveTemplate.description
            ? { description: input.saveTemplate.description }
            : {}),
          ...(input.saveTemplate.tags ? { tags: input.saveTemplate.tags } : {}),
        });
        done.push(`template ${input.saveTemplate.name} saved`);
      }
      if (input.deleteTemplate) {
        const removed = await store.deleteTemplate(input.deleteTemplate);
        done.push(
          removed
            ? `template ${input.deleteTemplate} deleted`
            : `no saved template ${input.deleteTemplate}`,
        );
      }
      if (done.length === 0) throw new StageError("invalid", "nothing to set");
      return reply(`${done.join("; ")}.`, { ok: true });
    }),
  );
}
