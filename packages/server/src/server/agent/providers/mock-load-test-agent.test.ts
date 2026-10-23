import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { AgentManager } from "../agent-manager.js";
import type { AgentStreamEvent, AgentTimelineItem } from "../agent-sdk-types.js";
import {
  MOCK_LOAD_TEST_DEFAULT_MODEL_ID,
  MockLoadTestAgentClient,
  mockStreamedInputs,
  parseMockPaseoToolsPrompt,
} from "./mock-load-test-agent.js";

type PermissionRequestedEvent = Extract<AgentStreamEvent, { type: "permission_requested" }>;

function expectSinglePermissionRequest(events: AgentStreamEvent[]): PermissionRequestedEvent {
  const permissions = events.filter(
    (event): event is PermissionRequestedEvent => event.type === "permission_requested",
  );
  expect(permissions).toHaveLength(1);
  const [permission] = permissions;
  if (!permission) {
    throw new Error("permission request missing");
  }
  return permission;
}

describe("MockLoadTestAgentClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("default model is a five minute foreground stream with token-rate intervals", async () => {
    const client = new MockLoadTestAgentClient();

    const { models } = await client.fetchCatalog({
      scope: "workspace",
      cwd: "/tmp/mock-models",
      force: false,
    });

    expect(models[0]).toMatchObject({
      id: MOCK_LOAD_TEST_DEFAULT_MODEL_ID,
      isDefault: true,
      metadata: {
        durationMs: 300_000,
        intervalMs: 40,
      },
    });
  });

  test("rejects the configured number of prompts before starting a retry", async () => {
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
      featureValues: { mockPromptRejections: 1 },
    });

    await expect(session.startTurn("Reject this prompt.")).rejects.toThrow(
      "Requested mock prompt rejection",
    );

    await expect(session.startTurn("Accept this retry.")).resolves.toEqual({
      turnId: expect.any(String),
    });
    await session.interrupt();
  });

  test("streams a configured assistant response through the normal timeline", async () => {
    vi.useFakeTimers();
    const response = [
      "```mermaid",
      "flowchart LR",
      "  Start --> Middle",
      '  Middle --> End["<i>Done</i>"]',
      "```",
    ].join("\n");
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
      featureValues: {
        mockStreamingAssistantResponse: response,
        mockStreamingAssistantIntervalMs: 20,
      },
    });
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));

    const resultPromise = session.run("Render a diagram while streaming.");
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({ finalText: response, canceled: false });
    const streamedText = events
      .flatMap((event) =>
        event.type === "timeline" && event.item.type === "assistant_message"
          ? [event.item.text]
          : [],
      )
      .join("");
    expect(streamedText).toBe(response);
    expect(
      events.filter((event) => event.type === "timeline" && event.item.type === "assistant_message")
        .length,
    ).toBeGreaterThan(5);
    expect(events.at(-1)).toMatchObject({ type: "turn_completed", provider: "mock" });
  });

  test("can withhold the provider user-message echo until an immediate interrupt", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));

    await session.startTurn("Withhold synthetic user message until interrupted.", {
      clientMessageId: "client-message-1",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events.some((event) => event.type === "timeline")).toBe(false);

    await session.interrupt();
    expect(events.map((event) => event.type)).toEqual(["turn_canceled"]);
  });

  test("can emit the provider user-message echo before accepting the turn", async () => {
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));

    await session.startTurn("Emit synthetic user message before accepting turn.", {
      clientMessageId: "client-message-1",
    });

    expect(events).toContainEqual({
      type: "timeline",
      provider: "mock",
      turnId: expect.any(String),
      item: {
        type: "user_message",
        text: "Emit synthetic user message before accepting turn.",
        messageId: expect.any(String),
        clientMessageId: "client-message-1",
      },
    });
    await session.interrupt();
  });

  test("can place the provider echo beyond a bounded timeline tail", async () => {
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    session.subscribe((event) => events.push(event));

    await session.run("Emit 205 assistant messages before synthetic user message.", {
      clientMessageId: "client-message-1",
    });

    const timelineItems = events.flatMap((event) =>
      event.type === "timeline" ? [event.item] : [],
    );
    expect(timelineItems.filter((item) => item.type === "assistant_message")).toHaveLength(205);
    expect(timelineItems.at(-1)).toMatchObject({
      type: "user_message",
      clientMessageId: "client-message-1",
    });
  });

  test("returns schema-shaped JSON for structured branch-name generation", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });

    const resultPromise = session.run(
      [
        "Generate a title and a git branch name for a coding agent from the user prompt and attachments.",
        "Title: a short human-readable sentence-case label for the task (no slug rules, max 80 characters).",
        "Branch: concise lowercase slug using letters, numbers, hyphens, and slashes only.",
        "Return JSON only with fields 'title' and 'branch'.",
        "",
        "<user-prompt>",
        "Fix login bug",
        "</user-prompt>",
      ].join("\n"),
    );
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toMatchObject({
      sessionId: session.id,
      finalText: JSON.stringify({ title: "Fix login bug", branch: "fix-login-bug" }),
      canceled: false,
    });
  });

  test("reads the paseo tool calls a QA prompt asks for", () => {
    expect(
      parseMockPaseoToolsPrompt(
        '[p12] mock paseo tools: [{"name":"show_page","input":{"page":"face"}},{"name":"speak","input":{"text":"Hi"},"pauseMs":90000,"streamMs":400,"background":true}]',
      ),
    ).toEqual([
      {
        name: "show_page",
        input: { page: "face" },
        pauseMs: 0,
        streamMs: 0,
        early: false,
        background: false,
      },
      {
        name: "speak",
        input: { text: "Hi" },
        pauseMs: 60_000,
        streamMs: 400,
        early: false,
        background: true,
      },
    ]);
    expect(parseMockPaseoToolsPrompt("mock paseo tools: not json")).toBeNull();
    expect(parseMockPaseoToolsPrompt('mock paseo tools: [{"name":"Bash; rm"}]')).toBeNull();
    expect(parseMockPaseoToolsPrompt("say hello")).toBeNull();
  });

  test("calls the daemon's paseo tools over its MCP server and shows each call", async () => {
    const requests: Array<{ url: string; auth: string | undefined; body: unknown }> = [];
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw) as { params: { name: string } };
      requests.push({ url: req.url ?? "", auth: req.headers.authorization, body });
      res.setHeader("content-type", "text/event-stream");
      const result =
        body.params.name === "show_page"
          ? { content: [{ type: "text", text: "page face" }], structuredContent: { page: "face" } }
          : { content: [{ type: "text", text: "nope" }], isError: true };
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result })}\n\n`);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const client = new MockLoadTestAgentClient();
      const session = await client.createSession({
        provider: "mock",
        cwd: process.cwd(),
        model: "ten-second-stream",
        mcpServers: {
          paseo: {
            type: "http",
            url: `http://127.0.0.1:${port}/mcp/agents?callerAgentId=a1`,
            headers: { Authorization: "Bearer t" },
          },
        },
      });
      const events: AgentStreamEvent[] = [];
      session.subscribe((event) => events.push(event));

      const result = await session.run(
        'mock paseo tools: [{"name":"show_page","input":{"page":"face"}},{"name":"set_my_model","input":{"model":"x"}}]',
      );

      expect(requests).toEqual([
        {
          url: "/mcp/agents?callerAgentId=a1",
          auth: "Bearer t",
          body: expect.objectContaining({
            method: "tools/call",
            params: { name: "show_page", arguments: { page: "face" } },
          }),
        },
        expect.objectContaining({ url: "/mcp/agents?callerAgentId=a1" }),
      ]);
      const calls = events
        .filter((event) => event.type === "timeline" && event.item.type === "tool_call")
        .map((event) => (event as Extract<AgentStreamEvent, { type: "timeline" }>).item);
      expect(calls).toMatchObject([
        { name: "mcp__paseo__show_page", status: "running", detail: { input: { page: "face" } } },
        {
          name: "mcp__paseo__show_page",
          status: "completed",
          detail: { input: { page: "face" }, output: { page: "face" } },
        },
        { name: "mcp__paseo__set_my_model", status: "running" },
        { name: "mcp__paseo__set_my_model", status: "failed", error: "nope" },
      ]);
      expect(result.finalText).toBe("show_page: ok\nset_my_model: failed");
    } finally {
      server.close();
    }
  });

  test("a background paseo tool call lets the next call run while it is still in flight", async () => {
    let releaseSpeak: () => void = () => {};
    const order: string[] = [];
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const tool = (JSON.parse(raw) as { params: { name: string } }).params.name;
      order.push(`start ${tool}`);
      if (tool === "speak") await new Promise<void>((resolve) => (releaseSpeak = resolve));
      order.push(`end ${tool}`);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [], structuredContent: {} } }),
      );
      if (tool === "show_card") releaseSpeak();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const client = new MockLoadTestAgentClient();
      const session = await client.createSession({
        provider: "mock",
        cwd: process.cwd(),
        model: "ten-second-stream",
        mcpServers: { paseo: { type: "http", url: `http://127.0.0.1:${port}/mcp` } },
      });
      const result = await session.run(
        'mock paseo tools: [{"name":"speak","input":{"text":"Hi"},"background":true},{"name":"show_card","input":{"title":"t","body":"b"}}]',
      );
      expect(order).toEqual(["start speak", "start show_card", "end show_card", "end speak"]);
      expect(result.finalText).toBe("speak: ok\nshow_card: ok");
    } finally {
      server.close();
    }
  });

  test("an agent with a voice reply speaks it back to every ordinary prompt", async () => {
    const spoken: unknown[] = [];
    const server = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      spoken.push((JSON.parse(raw) as { params: unknown }).params);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [], structuredContent: {} } }),
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const client = new MockLoadTestAgentClient();
      const session = await client.createSession({
        provider: "mock",
        cwd: process.cwd(),
        model: "ten-second-stream",
        featureValues: { mockVoiceReply: "Agent B here" },
        mcpServers: { paseo: { type: "http", url: `http://127.0.0.1:${port}/mcp` } },
      });
      const result = await session.run("<spoken-input>hello there</spoken-input>");
      expect(spoken).toEqual([{ name: "speak", arguments: { text: "Agent B here" } }]);
      expect(result.finalText).toBe("speak: ok");
    } finally {
      server.close();
    }
  });

  test("streams a paseo tool call's input one top-level key at a time, as Claude does", async () => {
    const server = createServer(async (req, res) => {
      for await (const _chunk of req) void _chunk;
      const result = { content: [{ type: "text", text: "ok" }], structuredContent: { ok: true } };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const client = new MockLoadTestAgentClient();
      const session = await client.createSession({
        provider: "mock",
        cwd: process.cwd(),
        model: "ten-second-stream",
        mcpServers: { paseo: { type: "http", url: `http://127.0.0.1:${port}/mcp` } },
      });
      const events: AgentStreamEvent[] = [];
      session.subscribe((event) => events.push(event));

      const startedAt = Date.now();
      await session.run(
        'mock paseo tools: [{"name":"show_table","input":{"window":"W","id":"t","rows":[["a"]]},"streamMs":90}]',
      );

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(80);
      const calls = events
        .filter((event) => event.type === "timeline" && event.item.type === "tool_call")
        .map((event) => (event as Extract<AgentStreamEvent, { type: "timeline" }>).item);
      expect(calls.map((call) => [call.status, call.detail])).toEqual([
        ["running", { type: "unknown", input: {}, output: null }],
        ["running", { type: "unknown", input: { window: "W" }, output: null }],
        ["running", { type: "unknown", input: { window: "W", id: "t" }, output: null }],
        [
          "running",
          { type: "unknown", input: { window: "W", id: "t", rows: [["a"]] }, output: null },
        ],
        [
          "completed",
          {
            type: "unknown",
            input: { window: "W", id: "t", rows: [["a"]] },
            output: { ok: true },
          },
        ],
      ]);
      expect(mockStreamedInputs({})).toEqual([]);

      events.length = 0;
      await session.run(
        'mock paseo tools: [{"name":"show_window","input":{"window":"W","action":"close"}},{"name":"show_table","input":{"window":"W","rows":[]},"streamMs":20,"early":true}]',
      );
      const overlapped = events
        .filter((event) => event.type === "timeline" && event.item.type === "tool_call")
        .map((event) => (event as Extract<AgentStreamEvent, { type: "timeline" }>).item)
        .map(
          (call) =>
            `${call.name.slice(12)} ${call.status} ${JSON.stringify((call.detail as { input?: unknown }).input)}`,
        );
      expect(overlapped).toEqual([
        'show_window running {"window":"W","action":"close"}',
        "show_table running {}",
        'show_window completed {"window":"W","action":"close"}',
        'show_table running {"window":"W"}',
        'show_table running {"window":"W","rows":[]}',
        'show_table completed {"window":"W","rows":[]}',
      ]);
    } finally {
      server.close();
    }
  });

  test("emits sub-word tokens, reasoning, and sequential tool calls during a foreground turn", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    const resultPromise = session.run("Exercise the app while terminals are busy.");

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;
    unsubscribe();

    expect(
      events.map((event) => event.type).filter((type) => type === "turn_started"),
    ).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      type: "turn_completed",
      provider: "mock",
    });
    expect(result).toMatchObject({
      sessionId: session.id,
      finalText: "Synthetic load test complete",
      canceled: false,
    });

    const timelineItems = events.flatMap((event): AgentTimelineItem[] =>
      event.type === "timeline" ? [event.item] : [],
    );

    const assistantTokens = timelineItems.filter((item) => item.type === "assistant_message");
    const reasoningTokens = timelineItems.filter((item) => item.type === "reasoning");
    const toolCalls = timelineItems.filter((item) => item.type === "tool_call");

    // Many small token deltas, not a few big chunks.
    expect(assistantTokens.length).toBeGreaterThan(200);
    expect(reasoningTokens.length).toBeGreaterThan(20);

    // Average token length should be sub-word (a few characters).
    const avgTokenLength =
      assistantTokens.reduce(
        (sum, item) => sum + (item.type === "assistant_message" ? item.text.length : 0),
        0,
      ) / assistantTokens.length;
    expect(avgTokenLength).toBeLessThan(10);

    // First assistant token starts the cycle header.
    expect(assistantTokens[0]).toMatchObject({
      type: "assistant_message",
      text: expect.stringContaining("##"),
    });

    // Sequential tool calls fire: read, grep, edit, bash.
    const toolNames = toolCalls
      .filter((item) => item.type === "tool_call" && item.status === "running")
      .map((item) => (item.type === "tool_call" ? item.name : ""));
    expect(toolNames.slice(0, 4)).toEqual(["read", "grep", "edit", "bash"]);

    // Each tool transitions running → completed.
    const completedNames = toolCalls
      .filter((item) => item.type === "tool_call" && item.status === "completed")
      .map((item) => (item.type === "tool_call" ? item.name : ""));
    expect(completedNames).toContain("read");
    expect(completedNames).toContain("grep");
    expect(completedNames).toContain("edit");
    expect(completedNames).toContain("bash");
  });

  test("interrupt cancels the active foreground turn and stops future chunks", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    await session.startTurn("Cancel the synthetic stream.");
    await vi.advanceTimersByTimeAsync(0);

    await session.interrupt();
    const eventCountAfterInterrupt = events.length;
    await vi.advanceTimersByTimeAsync(10_000);
    unsubscribe();

    expect(events.at(-1)).toMatchObject({
      type: "turn_canceled",
      provider: "mock",
      reason: "Interrupted",
    });
    expect(events).toHaveLength(eventCountAfterInterrupt);
  });

  test("emits a terminal failure without an assistant provider message", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    await session.startTurn("Emit a synthetic turn failure.");
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "timeline",
        item: expect.objectContaining({ type: "user_message" }),
      }),
    );
    expect(
      events.filter(
        (event) => event.type === "timeline" && event.item.type === "assistant_message",
      ),
    ).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({
      type: "turn_failed",
      error: "Requested mock provider failure",
    });
  });

  test("emits turn_started before the submitted user message", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    await session.startTurn("Order the submitted prompt.", {
      clientMessageId: "client-message-1",
    });
    await vi.advanceTimersByTimeAsync(0);
    unsubscribe();

    expect(
      events
        .slice(0, 2)
        .map((event) =>
          event.type === "timeline" ? `${event.type}:${event.item.type}` : event.type,
        ),
    ).toEqual(["turn_started", "timeline:user_message"]);
  });

  test("emits the free-write question scenario selected by prompt", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    const resultPromise = session.run("Emit synthetic questions: two free-write questions.");
    await vi.advanceTimersByTimeAsync(0);

    const permission = expectSinglePermissionRequest(events);
    expect(permission.request).toMatchObject({
      provider: "mock",
      name: "MockQuestions",
      kind: "question",
      input: {
        questions: [
          {
            question: "What is the GitHub private repo URL to push to?",
            header: "repoUrl",
            options: [],
            multiSelect: false,
          },
          {
            question: "What should the first commit message be?",
            header: "commitMessage",
            options: [],
            multiSelect: false,
          },
        ],
      },
    });

    await session.respondToPermission(permission.request.id, {
      behavior: "allow",
      updatedInput: {
        answers: {
          repoUrl: "git@github.com:user/private-repo.git",
          commitMessage: "Initialize private repo",
        },
      },
    });
    await expect(resultPromise).resolves.toMatchObject({
      sessionId: session.id,
      finalText: "Synthetic questions resolved",
      canceled: false,
    });
    unsubscribe();
  });

  test("uses one continuous assistant stream for bursty rendering measurements", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "bursty-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));

    await session.startTurn("Measure paced rendering.");
    await vi.advanceTimersByTimeAsync(0);

    const timelineItems = events.flatMap((event) =>
      event.type === "timeline" ? [event.item] : [],
    );
    expect(timelineItems.filter((item) => item.type === "assistant_message")).not.toHaveLength(0);
    expect(
      timelineItems.filter((item) => item.type === "reasoning" || item.type === "tool_call"),
    ).toEqual([]);
    await session.interrupt();
    unsubscribe();
  });

  test("emits distinct configured responses across consecutive fixture turns", async () => {
    const session = await new MockLoadTestAgentClient().createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "e2e-fast-stream",
      featureValues: { mockAssistantResponses: ["First response", "![Second](second.png)"] },
    });
    await session.run("Emit a synthetic turn failure.");
    expect((await session.run("First prompt")).finalText).toBe("First response");
    expect((await session.run("Second prompt")).finalText).toBe("![Second](second.png)");
  });

  test("emits a settled assistant Markdown image path selected by prompt", async () => {
    vi.useFakeTimers();
    const client = new MockLoadTestAgentClient();
    const session = await client.createSession({
      provider: "mock",
      cwd: process.cwd(),
      model: "ten-second-stream",
    });
    const events: AgentStreamEvent[] = [];
    const unsubscribe = session.subscribe((event) => events.push(event));
    const markdown = "![Fixture image](screenshots/fixture.png)";

    const resultPromise = session.run(`Emit settled assistant image Markdown: ${markdown}`);
    await vi.advanceTimersByTimeAsync(0);

    expect(
      events.flatMap((event): AgentTimelineItem[] =>
        event.type === "timeline" && event.item.type === "assistant_message" ? [event.item] : [],
      ),
    ).toEqual([
      expect.objectContaining({
        type: "assistant_message",
        text: markdown,
      }),
    ]);
    await expect(resultPromise).resolves.toMatchObject({
      sessionId: session.id,
      finalText: markdown,
      canceled: false,
    });
    unsubscribe();
  });

  test("agent manager coalesces adjacent assistant tokens into fewer messages", async () => {
    vi.useFakeTimers();
    const workdir = mkdtempSync(join(tmpdir(), "paseo-mock-load-test-"));
    try {
      const client = new MockLoadTestAgentClient();
      const manager = new AgentManager({
        clients: { mock: client },
        idFactory: () => "00000000-0000-4000-8000-000000000001",
        logger: createTestLogger(),
      });
      const agent = await manager.createAgent(
        {
          provider: "mock",
          cwd: workdir,
          model: "ten-second-stream",
        },
        "00000000-0000-4000-8000-000000000001",
        { workspaceId: undefined },
      );

      const resultPromise = manager.runAgent(
        agent.id,
        "Stress the agent stream while terminal panes are active.",
      );
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10_000);
      await resultPromise;

      const timeline = manager.getTimeline(agent.id);
      const assistantMessages = timeline.filter((item) => item.type === "assistant_message");
      const toolCalls = timeline.filter((item) => item.type === "tool_call");

      // The provider streams sub-word tokens; the coalescer batches them within
      // its flush window, so the timeline must contain materially fewer messages
      // than the underlying token deltas would suggest, and each message must
      // hold multiple tokens worth of text.
      expect(assistantMessages.length).toBeGreaterThan(0);
      const totalAssistantChars = assistantMessages.reduce(
        (sum, item) => sum + (item.type === "assistant_message" ? item.text.length : 0),
        0,
      );
      const avgMessageLength = totalAssistantChars / assistantMessages.length;
      expect(avgMessageLength).toBeGreaterThan(8);
      const longestMessage = assistantMessages
        .map((item) => (item.type === "assistant_message" ? item.text.length : 0))
        .reduce((max, length) => Math.max(max, length), 0);
      expect(longestMessage).toBeGreaterThan(20);

      // The cycle header is at the start of the stream. It can straddle the first
      // two messages, because the coalescer flushes the leading token of a burst
      // on its own before batching the rest.
      const assistantText = assistantMessages
        .map((item) => (item.type === "assistant_message" ? item.text : ""))
        .join("");
      expect(assistantText).toContain("## Cycle 1");

      // Tool calls land in expected order at least once.
      const runningTools = toolCalls
        .filter((item) => item.type === "tool_call" && item.status === "completed")
        .map((item) => (item.type === "tool_call" ? item.name : ""));
      expect(runningTools).toEqual(expect.arrayContaining(["read", "grep", "edit", "bash"]));
    } finally {
      rmSync(workdir, { recursive: true, force: true });
    }
  });
});
