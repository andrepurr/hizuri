import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentStreamEvent, AgentTimelineItem } from "../../agent-sdk-types.js";
import type { PaseoToolCatalog, PaseoToolDefinition } from "../../tools/types.js";
import { FreeBrainAgentClient } from "./agent.js";

type Reply = { kind: "sse"; chunks: unknown[] } | { kind: "status"; status: number; body: unknown };

interface RelayRequest {
  path: string;
  authorization: string | undefined;
  body: Record<string, unknown> | null;
}

function textReply(text: string, usage = { prompt_tokens: 50, completion_tokens: 5 }): Reply {
  return {
    kind: "sse",
    chunks: [
      { choices: [{ delta: { content: text.slice(0, 3) } }] },
      { choices: [{ delta: { content: text.slice(3) } }] },
      { choices: [], usage },
    ],
  };
}

function sseBody(chunks: unknown[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n";
}

function toolReply(name: string, args: unknown): Reply {
  const json = JSON.stringify(args);
  return {
    kind: "sse",
    chunks: [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call-1", function: { name, arguments: json.slice(0, 4) } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(4) } }] } },
        ],
      },
      { choices: [], usage: { prompt_tokens: 40, completion_tokens: 8 } },
    ],
  };
}

describe("hizuri free brain provider", () => {
  let relay: Server;
  let relayUrl: string;
  let replies: Reply[];
  let requests: RelayRequest[];
  let installs: number;
  let knownTokens: Set<string>;
  let home: string;
  let spoken: string[];

  const speakTool: PaseoToolDefinition = {
    name: "speak",
    description: "Speak text aloud",
    inputSchema: { text: z.string() },
    handler: async (input) => {
      spoken.push((input as { text: string }).text);
      return { content: [{ type: "text", text: "spoken" }] };
    },
  };
  const createAgentTool: PaseoToolDefinition = {
    name: "create_agent",
    description: "Create an agent",
    inputSchema: { prompt: z.string() },
    handler: async () => ({ content: [{ type: "text", text: "created" }] }),
  };

  function catalog(tools: PaseoToolDefinition[]): PaseoToolCatalog {
    const map = new Map(tools.map((tool) => [tool.name, tool]));
    return {
      tools: map,
      getTool: (name) => map.get(name),
      executeTool: async (name, input, context) => {
        const tool = map.get(name);
        if (!tool) throw new Error(`no tool ${name}`);
        return tool.handler(input, context ?? {});
      },
    };
  }

  function client(env: Record<string, string> = {}) {
    return new FreeBrainAgentClient({
      logger: pino({ level: "silent" }),
      env: { PASEO_HOME: home, PASEO_FREE_BRAIN_URL: relayUrl, ...env },
    });
  }

  async function runTurn(text: string, tools: PaseoToolDefinition[] = [speakTool]) {
    const session = await client().createSession(
      { provider: "hizuri-free", cwd: home },
      { paseoTools: catalog(tools) },
    );
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));
    const result = await session.run(text);
    return { session, events, result };
  }

  function items(events: AgentStreamEvent[]): AgentTimelineItem[] {
    return events.flatMap((event) => (event.type === "timeline" ? [event.item] : []));
  }

  beforeEach(async () => {
    replies = [];
    requests = [];
    installs = 0;
    knownTokens = new Set();
    spoken = [];
    home = mkdtempSync(path.join(tmpdir(), "free-brain-"));
    relay = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      requests.push({
        path: req.url ?? "",
        authorization: req.headers.authorization,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
      });
      if (req.url === "/health") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === "/v1/install") {
        installs += 1;
        const token = `hzf_token-${installs}`;
        knownTokens.add(token);
        res.end(JSON.stringify({ token }));
        return;
      }
      const token = (req.headers.authorization ?? "").replace("Bearer ", "");
      if (!knownTokens.has(token)) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "unknown_install" } }));
        return;
      }
      const reply = replies.shift();
      if (!reply) throw new Error("no scripted reply");
      if (reply.kind === "status") {
        res.writeHead(reply.status, { "content-type": "application/json" });
        res.end(JSON.stringify(reply.body));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(sseBody(reply.chunks));
    });
    await new Promise<void>((resolve) => relay.listen(0, "127.0.0.1", resolve));
    relayUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => relay.close(() => resolve()));
    rmSync(home, { recursive: true, force: true });
  });

  it("is available only with a relay address and not switched off; the diagnostic probes it", async () => {
    expect(await client().isAvailable()).toBe(true);
    expect(await client({ PASEO_FREE_BRAIN: "0" }).isAvailable()).toBe(false);
    expect(await client({ PASEO_FREE_BRAIN_URL: "" }).isAvailable()).toBe(false);
    expect((await client().getDiagnostic()).diagnostic).toContain("reachable");
    expect(
      (await client({ PASEO_FREE_BRAIN_URL: "http://127.0.0.1:9" }).getDiagnostic()).diagnostic,
    ).toContain("not reachable");
  });

  it("streams a reply, sends its role and only the allowed tools, and counts tokens", async () => {
    replies.push(textReply("Hello there"));
    const { events, result } = await runTurn("hi", [speakTool, createAgentTool]);

    expect(result.finalText).toBe("Hello there");
    const assistantText = items(events)
      .filter((item) => item.type === "assistant_message")
      .map((item) => (item as { text: string }).text)
      .join("");
    expect(assistantText).toBe("Hello there");
    expect(events.at(-1)).toMatchObject({
      type: "turn_completed",
      usage: { inputTokens: 50, outputTokens: 5 },
    });

    const chat = requests.find((request) => request.path === "/v1/chat/completions")!;
    const body = chat.body as {
      messages: Array<{ role: string; content: string }>;
      tools: Array<{ function: { name: string; parameters: unknown } }>;
      stream: boolean;
    };
    expect(body.stream).toBe(true);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("Claude Code");
    expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
    expect(body.tools.map((tool) => tool.function.name)).toEqual(["speak"]);
    expect(body.tools[0].function.parameters).toMatchObject({
      type: "object",
      properties: { text: { type: "string" } },
    });
  });

  it("takes its role from PASEO_FREE_BRAIN_ROLE_FILE and offers no tools when told none", async () => {
    const roleFile = path.join(home, "role.md");
    writeFileSync(roleFile, "You are the hosted demo's trial brain.");
    replies.push(textReply("Hi"));
    const session = await client({
      PASEO_FREE_BRAIN_ROLE_FILE: roleFile,
      PASEO_FREE_BRAIN_TOOLS: "",
    }).createSession({ provider: "hizuri-free", cwd: home }, { paseoTools: catalog([speakTool]) });
    await session.run("hi");

    const body = requests.find((request) => request.path === "/v1/chat/completions")!.body as {
      messages: Array<{ role: string; content: string }>;
      tools?: unknown[];
    };
    expect(body.messages[0].content).toBe("You are the hosted demo's trial brain.");
    expect(body.tools).toBeUndefined();
  });

  it("runs a tool call through the Paseo tool catalog and feeds the result back", async () => {
    replies.push(toolReply("speak", { text: "Hello!" }), textReply("done"));
    const { events } = await runTurn("say hello");

    expect(spoken).toEqual(["Hello!"]);
    const speakItems = items(events).filter((item) => item.type === "tool_call");
    expect(speakItems.at(-1)).toMatchObject({
      name: "speak",
      status: "completed",
      detail: { type: "unknown", input: "Hello!" },
    });

    const second = requests.filter((request) => request.path === "/v1/chat/completions")[1];
    const messages = (second.body as { messages: Array<Record<string, unknown>> }).messages;
    expect(messages.at(-2)).toMatchObject({
      role: "assistant",
      tool_calls: [{ id: "call-1", function: { name: "speak" } }],
    });
    expect(messages.at(-1)).toEqual({ role: "tool", tool_call_id: "call-1", content: "spoken" });
  });

  it("refuses a tool it did not offer", async () => {
    replies.push(toolReply("create_agent", { prompt: "x" }), textReply("ok"));
    const { events } = await runTurn("make an agent", [speakTool, createAgentTool]);
    expect(
      items(events).find((item) => item.type === "tool_call" && item.status === "failed"),
    ).toMatchObject({ name: "create_agent", error: { message: "Unknown tool create_agent" } });
  });

  it("says the relay's limit message, aloud when voice is on", async () => {
    const limit = {
      error: { code: "free_limit_reached", message: "Connect Claude Code to keep going." },
    };
    replies.push({ kind: "status", status: 429, body: limit });
    const voice = await runTurn("hello");
    expect(spoken).toEqual(["Connect Claude Code to keep going."]);
    expect(voice.events.at(-1)).toMatchObject({ type: "turn_completed" });

    replies.push({ kind: "status", status: 429, body: limit });
    const text = await runTurn("hello", []);
    expect(items(text.events).at(-1)).toMatchObject({
      type: "assistant_message",
      text: "Connect Claude Code to keep going.",
    });
  });

  it("takes one install token, keeps it private on disk, and takes a new one if the relay forgot it", async () => {
    replies.push(textReply("one"), textReply("two"));
    await runTurn("a");
    await runTurn("b");
    expect(installs).toBe(1);
    const file = path.join(home, "free-brain", "install.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ token: "hzf_token-1" });

    knownTokens.clear();
    replies.push(textReply("three"));
    await runTurn("c");
    expect(installs).toBe(2);
  });

  it("resumes a conversation with its history", async () => {
    replies.push(toolReply("speak", { text: "Hi" }), textReply("all set"));
    const { session } = await runTurn("hello");
    const handle = session.describePersistence()!;

    const resumed = await client().resumeSession(handle, undefined, {
      paseoTools: catalog([speakTool]),
    });
    const history: AgentTimelineItem[] = [];
    for await (const event of resumed.streamHistory()) {
      if (event.type === "timeline") history.push(event.item);
    }
    expect(history.map((item) => item.type)).toEqual([
      "user_message",
      "tool_call",
      "assistant_message",
    ]);

    replies.push(textReply("again"));
    await resumed.run("more");
    const last = requests.findLast((request) => request.path === "/v1/chat/completions")!;
    const messages = (last.body as { messages: Array<{ role: string }> }).messages;
    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "assistant",
      "user",
    ]);
  });
});
