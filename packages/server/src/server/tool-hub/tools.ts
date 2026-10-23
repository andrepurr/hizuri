import { z } from "zod";
import type {
  PaseoToolConfig,
  PaseoToolExecutionContext,
  PaseoToolResult,
} from "../agent/tools/types.js";
import { ToolHubError, type RequestApproval, type ToolHub } from "./service.js";

// Hizuri (tool hub): the five hub_* tools every hizuri agent gets on the daemon's MCP server, plus
// one tool per command of every approved third-party tool (`hub_<id>__<command>`). Those come and
// go with installs and blocks; the agent MCP endpoint tells connected agents with
// notifications/tools/list_changed (bootstrap.ts).

export interface RegisterToolHubToolsOptions {
  registerTool: (
    name: string,
    config: PaseoToolConfig,
    handler: (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool inputs are validated by the catalog before execution.
      input: any,
      context: PaseoToolExecutionContext,
    ) => Promise<PaseoToolResult>,
  ) => void;
  hub: ToolHub;
  callerAgentId?: string;
  /** Asks the user through the caller agent's permission flow; null without a caller agent. */
  requestApproval: RequestApproval | null;
}

const toolParam = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("The tool's exact name as hub_find returned it, e.g. io.github.owner/server-name.");

const scoreParam = z.number().int().min(1).max(5);

function reply(text: string, structured: Record<string, unknown>): PaseoToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured };
}

function refuse(error: unknown): PaseoToolResult {
  const code = error instanceof ToolHubError ? error.code : "error";
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    structuredContent: { ok: false, code, message },
    isError: true,
  };
}

async function guarded(run: () => Promise<PaseoToolResult>): Promise<PaseoToolResult> {
  try {
    return await run();
  } catch (error) {
    return refuse(error);
  }
}

/** Plain JSON Schema → a Zod schema the MCP server can list; a loose object if it won't convert. */
function zodFromJsonSchema(schema: unknown): z.ZodType {
  if (schema && typeof schema === "object") {
    try {
      return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
    } catch {
      // fall through
    }
  }
  return z.object({}).passthrough();
}

export function registerToolHubTools(options: RegisterToolHubToolsOptions): void {
  const { registerTool, hub, callerAgentId, requestApproval } = options;

  registerTool(
    "hub_find",
    {
      title: "Find a tool",
      description:
        "Find a tool (MCP server) for a task. Searches hizuri's own installs and reviews (each backed by a signed receipt of a real call), the official MCP Registry, agent.reviews ratings and nohumans.directory paid APIs. Returns 3 picks with one-line reasons. Next: hub_reviews to read reviews, hub_add to install (the user approves), hub_call to run it, hub_review after. The first search can take up to a minute; results are cached.",
      inputSchema: {
        task: z.string().trim().min(3).max(500).describe("What the tool must do, in plain words."),
      },
    },
    async ({ task }: { task: string }) =>
      guarded(async () => {
        const found = await hub.find(task);
        const lines = found.picks.map(
          (pick) =>
            `${pick.rank}. ${pick.tool}${pick.installed ? " (installed)" : ""} — ${pick.reason}`,
        );
        const down = found.sources.filter((source) => source.status === "down");
        return reply(
          [
            lines.length ? lines.join("\n") : "No tool matched. Try other words.",
            down.length
              ? `Sources down: ${down.map((s) => `${s.source} (${s.note})`).join("; ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          { ok: true, ...found },
        );
      }),
  );

  registerTool(
    "hub_reviews",
    {
      title: "Tool reviews",
      description:
        "Reviews hizuri agents left for one tool. Each review carries the signed receipt of the real call it rates, and the install's public key to check it.",
      inputSchema: { tool: toolParam },
    },
    async ({ tool }: { tool: string }) =>
      guarded(async () => {
        const result = hub.reviews(tool);
        const lines = result.reviews.map(
          (review) =>
            `- ${review.scores.usefulness}/${review.scores.ease}/${review.scores.reliability} (usefulness/ease/reliability) by ${review.agentId}, receipt ${review.receiptId} ${review.receiptVerified ? "verified" : "NOT VERIFIED"}: ${review.text}`,
        );
        return reply(
          result.count
            ? `${result.tool}: ${result.count} review(s), average ${result.average}/5\n${lines.join("\n")}`
            : `${result.tool}: no hizuri reviews yet.`,
          { ok: true, ...result },
        );
      }),
  );

  registerTool(
    "hub_add",
    {
      title: "Install a tool",
      description:
        "Install a tool hub_find suggested. Asks the user first (a permission card in hizuri) and waits for the answer; installs only after a yes. The tool runs sandboxed, its keys stay in the daemon, and its descriptions are pinned by hash. Its commands then appear as hub_<id>__<command> tools; hub_call works too. Also re-approves a blocked tool.",
      inputSchema: {
        tool: toolParam,
        reason: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe("One line for the user: why you need it."),
      },
    },
    async ({ tool, reason }: { tool: string; reason?: string }) =>
      guarded(async () => {
        const result = await hub.add({ tool, ...(reason ? { reason } : {}), requestApproval });
        const commands = result.commands
          .map((c) => `- ${c.command} (tool ${c.exposedAs}): ${c.description}`)
          .join("\n");
        return reply(
          `${result.status}: ${result.install.name}, pinned ${result.install.fingerprint.hash.slice(0, 16)}…\nCommands:\n${commands}\nCall with hub_call {tool: "${result.install.name}", command, args}.`,
          {
            ok: true,
            status: result.status,
            tool: result.install.name,
            id: result.install.id,
            sandbox: result.install.sandbox,
            toolsHash: result.install.fingerprint.hash,
            commands: result.commands,
          },
        );
      }),
  );

  registerTool(
    "hub_call",
    {
      title: "Call a tool",
      description:
        "Run a command of an installed tool through the daemon. Every call gets a signed receipt (id in the answer); pass it to hub_review. A tool whose descriptions changed since approval is blocked until the user re-approves (hub_add).",
      inputSchema: {
        tool: toolParam,
        command: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe("The tool's command; may be left out when it has only one."),
        args: z.record(z.string(), z.unknown()).optional().describe("The command's arguments."),
      },
    },
    async ({
      tool,
      command,
      args,
    }: {
      tool: string;
      command?: string;
      args?: Record<string, unknown>;
    }) =>
      guarded(async () => {
        // No structuredContent: Claude Code shows it instead of content when both are present,
        // and the tool's own answer must reach the model.
        const { result, receipt } = await hub.call({
          tool,
          ...(command ? { command } : {}),
          ...(args ? { args } : {}),
          ...(callerAgentId ? { callerAgentId } : {}),
        });
        return {
          content: [
            ...(result.content as PaseoToolResult["content"]),
            {
              type: "text",
              text: `\n\nReceipt ${receipt.id} (${receipt.outcome}). Rate this tool with hub_review {receipt: "${receipt.id}", scores, text}.`,
            },
          ],
          ...(result.isError ? { isError: true } : {}),
        };
      }),
  );

  registerTool(
    "hub_review",
    {
      title: "Review a tool",
      description:
        "Rate a tool after using it. Needs the receipt id of your own hub_call (one review per receipt). Scores 1–5: usefulness (did it do what the task needed), ease (setup and use effort), reliability (did it behave as expected). Say plainly what worked and what got in the way.",
      inputSchema: {
        receipt: z.string().trim().min(1).max(100).describe("The receipt id hub_call returned."),
        scores: z.object({
          usefulness: scoreParam,
          ease: scoreParam,
          reliability: scoreParam,
        }),
        text: z.string().trim().min(10).max(2000).describe("What worked and what got in the way."),
      },
    },
    async ({
      receipt,
      scores,
      text,
    }: {
      receipt: string;
      scores: { usefulness: number; ease: number; reliability: number };
      text: string;
    }) =>
      guarded(async () => {
        const review = await hub.review({
          receiptId: receipt,
          scores,
          text,
          ...(callerAgentId ? { callerAgentId } : {}),
        });
        return reply(
          `Review ${review.id} stored for ${review.tool}, tied to receipt ${review.receiptId}.`,
          {
            ok: true,
            review,
          },
        );
      }),
  );

  for (const exposed of hub.exposedTools()) {
    registerTool(
      exposed.name,
      {
        title:
          exposed.tool.title ??
          `${exposed.install.title ?? exposed.install.name}: ${exposed.tool.name}`,
        description: `[hub tool ${exposed.install.name}, approved by the user, runs sandboxed; each call gets a receipt for hub_review] ${exposed.tool.description ?? ""}`,
        inputSchema: zodFromJsonSchema(exposed.tool.inputSchema),
      },
      async (args: Record<string, unknown>) =>
        guarded(async () => {
          const { result, receipt } = await hub.call({
            tool: exposed.install.name,
            command: exposed.tool.name,
            args,
            ...(callerAgentId ? { callerAgentId } : {}),
          });
          return {
            content: [
              ...(result.content as PaseoToolResult["content"]),
              { type: "text", text: `\n\nReceipt ${receipt.id} (${receipt.outcome}).` },
            ],
            ...(result.isError ? { isError: true } : {}),
          };
        }),
    );
  }
}
