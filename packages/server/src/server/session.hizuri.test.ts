import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Session, type SessionOptions } from "./session.js";
import { OWNER_PERMISSIONS } from "./authorization/index.js";
import type { AgentManagerEvent } from "./agent/agent-manager.js";
import type { SessionInboundMessage, SessionOutboundMessage } from "./messages.js";
import type { SecretService } from "./secrets/service.js";
import type { VoiceOwnerOptions } from "./session/voice/voice-owner.js";
import { VoiceRegistry } from "./session/voice/voice-registry.js";
import type { VoiceSessionHost } from "./session/voice/voice-session.js";
import { StageStore } from "./stage/store.js";
import {
  asAgentManager,
  asAgentStorage,
  asCheckoutDiffManager,
  asDaemonConfigStore,
  asDownloadTokenStore,
  asGitHubService,
  asPushNotifications,
  asScheduleService,
  asWorkspaceGitService,
  createAgentMessageDeliveryStub,
  createMessageReceiptsStub,
  createProviderSnapshotManagerStub,
  createTestCreationService,
} from "./test-utils/session-stubs.js";

/**
 * Hizuri's part of the session (session/hizuri-session.ts) as a client and the voice session see
 * it through Session: the stage, the vault, the voice session list, app log uploads and the voice
 * host's extra powers.
 */

const homes: string[] = [];
const sessions: Session[] = [];

const prompts = vi.hoisted(() => ({ sent: [] as Array<Record<string, unknown>> }));

// The prompt goes nowhere: these tests read what Session hands to the agent.
vi.mock("./agent/agent-prompt.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent/agent-prompt.js")>();
  return {
    ...actual,
    sendPromptToAgent: vi.fn(async (input: Record<string, unknown>) => {
      prompts.sent.push(input);
    }),
  };
});

afterEach(async () => {
  prompts.sent.splice(0);
  vi.unstubAllEnvs();
  await Promise.all(sessions.splice(0).map((session) => session.cleanup()));
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

interface HizuriTestSession {
  session: Session;
  messages: SessionOutboundMessage[];
  paseoHome: string;
  /** Feeds an agent manager event to everything that subscribed (the compact hold). */
  emitAgentEvent(event: AgentManagerEvent): void;
  /** Every log line, when the session was made with `captureLog`. */
  logLines: string[];
}

function createHizuriSession(
  input: {
    stage?: boolean;
    archived?: boolean;
    running?: (agentId: string) => boolean;
    secrets?: Pick<SecretService, "submit">;
    voiceRegistry?: VoiceRegistry;
    captureLog?: boolean;
  } = {},
): HizuriTestSession {
  const paseoHome = mkdtempSync(join(tmpdir(), "hizuri-session-"));
  homes.push(paseoHome);
  const logLines: string[] = [];
  const logger = input.captureLog
    ? pino(
        { level: "trace" },
        new Writable({
          write(chunk: Buffer, _encoding, done) {
            logLines.push(chunk.toString());
            done();
          },
        }),
      )
    : pino({ level: "silent" });
  const listeners: Array<(event: AgentManagerEvent) => void> = [];
  const messages: SessionOutboundMessage[] = [];
  const options: SessionOptions = {
    messageReceipts: createMessageReceiptsStub(),
    agentMessages: createAgentMessageDeliveryStub(),
    creationService: createTestCreationService(),
    clientId: "hizuri-test-client",
    onMessage: (message) => messages.push(message),
    onMessageToSource: (_source, message) => messages.push(message),
    onBinaryMessage: () => {},
    logger,
    downloadTokenStore: asDownloadTokenStore(),
    pushNotifications: asPushNotifications(),
    paseoHome,
    agentManager: asAgentManager({
      listAgents: vi.fn(() => []),
      listProviderSubagentActivity: vi.fn(() => []),
      subscribe: vi.fn((listener: (event: AgentManagerEvent) => void) => {
        listeners.push(listener);
        return () => {};
      }),
      hasInFlightRun: vi.fn((agentId: string) => input.running?.(agentId) ?? false),
      getAgent: vi.fn(() => undefined),
    }),
    agentStorage: asAgentStorage({
      get: vi
        .fn()
        .mockResolvedValue(input.archived ? { archivedAt: "2026-10-21T00:00:00.000Z" } : undefined),
      list: vi.fn().mockResolvedValue([]),
    }),
    projectRegistry: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      getOrCreateActiveByRoot: vi.fn(),
      upsert: vi.fn(),
      archive: vi.fn(),
      remove: vi.fn(),
      initialize: vi.fn(),
      existsOnDisk: vi.fn(),
    },
    workspaceRegistry: { get: vi.fn(), list: vi.fn().mockResolvedValue([]) },
    scheduleService: asScheduleService(),
    checkoutDiffManager: asCheckoutDiffManager({ scheduleRefreshForCwd: vi.fn() }),
    github: asGitHubService({ invalidate: vi.fn() }),
    workspaceGitService: asWorkspaceGitService({}),
    daemonConfigStore: asDaemonConfigStore({
      get: vi.fn(() => ({ mcp: { injectIntoAgents: false }, providers: {} })),
      onChange: vi.fn(() => () => {}),
    }),
    stt: null,
    tts: null,
    terminalManager: null,
    providerSnapshotManager: createProviderSnapshotManagerStub().manager,
    permissions: OWNER_PERMISSIONS,
    stage: input.stage ? new StageStore({ paseoHome, logger }) : null,
    secrets: (input.secrets as SecretService | undefined) ?? null,
    ...(input.voiceRegistry ? { voiceRegistry: input.voiceRegistry } : {}),
  };
  const session = new Session(options);
  sessions.push(session);
  return {
    session,
    messages,
    paseoHome,
    emitAgentEvent: (event) => listeners.forEach((listener) => listener(event)),
    logLines,
  };
}

interface SessionInternals {
  voiceSessions: {
    options: { host: VoiceSessionHost; owner?: VoiceOwnerOptions };
    registry: VoiceRegistry;
  };
  handleSendAgentMessage(...args: unknown[]): Promise<{ ok: true } | { ok: false; error: string }>;
  interruptAgentIfRunning(agentId: string): Promise<void>;
  hizuri: {
    typedInput(text: string, sender: { clientType: string | null; sourceAgentId?: string }): string;
  };
}

function internals(session: Session): SessionInternals {
  return session as unknown as SessionInternals;
}

function voiceHost(session: Session): VoiceSessionHost {
  return internals(session).voiceSessions.options.host;
}

function ofType<T extends SessionOutboundMessage["type"]>(
  messages: SessionOutboundMessage[],
  type: T,
): Extract<SessionOutboundMessage, { type: T }>[] {
  return messages.filter(
    (message): message is Extract<SessionOutboundMessage, { type: T }> => message.type === type,
  );
}

async function send(session: Session, message: SessionInboundMessage): Promise<void> {
  await session.handleMessage(message);
}

describe("hizuri requests", () => {
  test("a secret form on a host without a vault is refused", async () => {
    const { session, messages } = createHizuriSession();
    await send(session, {
      type: "secret.store.request",
      requestId: "secret-1",
      agentId: "agent-1",
      form: "form-1",
      values: { token: "value" },
    });
    expect(ofType(messages, "secret.store.response")).toEqual([
      {
        type: "secret.store.response",
        payload: {
          requestId: "secret-1",
          stored: false,
          name: null,
          error: "This host has no vault.",
        },
      },
    ]);
    expect(ofType(messages, "rpc_error")).toEqual([]);
  });

  test("the voice session list answers once", async () => {
    const { session, messages } = createHizuriSession();
    await send(session, { type: "voice.session.list.request", requestId: "list-1" });
    expect(ofType(messages, "voice.session.list.response")).toEqual([
      { type: "voice.session.list.response", payload: { requestId: "list-1", sessions: [] } },
    ]);
    expect(ofType(messages, "rpc_error")).toEqual([]);
  });

  test("a stage request reads the stage", async () => {
    const { session, messages } = createHizuriSession({ stage: true });
    await send(session, {
      type: "stage.get_state.request",
      requestId: "stage-1",
      agentId: "agent-1",
    });
    const [response] = ofType(messages, "stage.get_state.response");
    expect(response?.payload).toMatchObject({ requestId: "stage-1", agentId: "agent-1" });
  });

  test("a stage request on a daemon without a stage gets no answer and no error", async () => {
    const { session, messages } = createHizuriSession();
    await send(session, {
      type: "stage.get_state.request",
      requestId: "stage-2",
      agentId: "agent-1",
    });
    expect(ofType(messages, "stage.get_state.response")).toEqual([]);
    expect(ofType(messages, "rpc_error")).toEqual([]);
  });

  test("app logs are stored", async () => {
    const { session, messages } = createHizuriSession();
    await send(session, {
      type: "app.logs.upload.request",
      requestId: "logs-1",
      entries: [{ ts: "2026-10-21T00:00:00.000Z", level: "info", message: "started" }],
      platform: "android",
    });
    expect(ofType(messages, "app.logs.upload.response")).toEqual([
      {
        type: "app.logs.upload.response",
        payload: { requestId: "logs-1", accepted: 1, error: null },
      },
    ]);
  });
});

describe("hizuri voice host", () => {
  test("a spoken phrase reaches the companion first, then the voice agent", async () => {
    const { session, paseoHome } = createHizuriSession();
    writeFileSync(join(paseoHome, "voice-companion.json"), JSON.stringify({ main: "companion" }));
    const sendSpy = vi
      .spyOn(internals(session), "handleSendAgentMessage")
      .mockResolvedValue({ ok: true });

    const result = await voiceHost(session).sendSpokenInput("main", "hello", false);

    expect(result).toEqual({ ok: true });
    expect(sendSpy.mock.calls).toEqual([
      [
        "companion",
        "hello",
        undefined,
        undefined,
        undefined,
        undefined,
        { spokenInput: true, steer: false },
      ],
      [
        "main",
        "hello",
        undefined,
        undefined,
        undefined,
        undefined,
        { spokenInput: true, steer: false },
      ],
    ]);
    expect(voiceHost(session).companionOf?.("main")).toBe("companion");
    expect(voiceHost(session).companionOf?.("companion")).toBeNull();
  });

  test("a steered phrase carries a message id", async () => {
    const { session } = createHizuriSession();
    const sendSpy = vi
      .spyOn(internals(session), "handleSendAgentMessage")
      .mockResolvedValue({ ok: true });

    await voiceHost(session).sendSpokenInput("main", "by the way", true);

    const [call] = sendSpy.mock.calls;
    expect(call?.[0]).toBe("main");
    expect(typeof call?.[2]).toBe("string");
    expect(call?.[6]).toEqual({ spokenInput: true, steer: true });
  });

  test("interrupting with no compaction running reaches the agent", async () => {
    const { session } = createHizuriSession();
    const interruptSpy = vi
      .spyOn(internals(session), "interruptAgentIfRunning")
      .mockResolvedValue(undefined);

    await voiceHost(session).interruptAgentIfRunning("main");

    expect(interruptSpy).toHaveBeenCalledWith("main");
    expect(voiceHost(session).compactHold?.("main")).toBeNull();
  });

  test("an archived agent is reported archived", async () => {
    expect(
      await voiceHost(createHizuriSession({ archived: true }).session).isAgentArchived?.("a"),
    ).toBe(true);
    expect(await voiceHost(createHizuriSession().session).isAgentArchived?.("a")).toBe(false);
  });

  test("the live tab is drawn only when the daemon has a stage", () => {
    expect(voiceHost(createHizuriSession({ stage: true }).session).showLive).toBeTypeOf("function");
    expect(voiceHost(createHizuriSession().session).showLive).toBeUndefined();
  });
});

function compaction(agentId: string, status: "loading" | "completed"): AgentManagerEvent {
  return {
    type: "agent_stream",
    agentId,
    event: { type: "timeline", item: { type: "compaction", status } },
  } as unknown as AgentManagerEvent;
}

describe("hizuri voice host: what reaches the agent", () => {
  test("a steered phrase goes into the running turn with its phrase id", async () => {
    const { session } = createHizuriSession({ running: () => true });

    const result = await voiceHost(session).sendSpokenInput("main", "by the way", true, {
      id: "p1",
    });

    expect(result).toEqual({ ok: true });
    expect(prompts.sent).toHaveLength(1);
    const [sent] = prompts.sent;
    expect(sent?.agentId).toBe("main");
    expect(sent?.activeTurnBehavior).toBe("steer");
    expect(typeof sent?.messageId).toBe("string");
    expect(JSON.stringify(sent?.prompt)).toContain('<spoken-input id=\\"p1\\">');
  });

  test("a plain phrase is wrapped as spoken input and does not steer", async () => {
    const { session } = createHizuriSession();

    await voiceHost(session).sendSpokenInput("main", "hello", false, { id: "p2" });

    const [sent] = prompts.sent;
    expect(sent?.activeTurnBehavior).toBeUndefined();
    expect(sent?.messageId).toBeUndefined();
    expect(JSON.stringify(sent?.prompt)).toContain('<spoken-input id=\\"p2\\">');
  });

  test("a busy companion is steered with its own message id and never decides main's result", async () => {
    const { session, paseoHome } = createHizuriSession({ running: (id) => id === "companion" });
    writeFileSync(join(paseoHome, "voice-companion.json"), JSON.stringify({ main: "companion" }));
    const sendSpy = vi
      .spyOn(internals(session), "handleSendAgentMessage")
      .mockImplementation(async (agentId) =>
        agentId === "companion" ? { ok: false, error: "companion down" } : { ok: true },
      );

    const result = await voiceHost(session).sendSpokenInput("main", "hello", false, { id: "p3" });

    expect(result).toEqual({ ok: true });
    const [companionCall, mainCall] = sendSpy.mock.calls;
    expect(companionCall?.[0]).toBe("companion");
    expect(typeof companionCall?.[2]).toBe("string");
    expect(companionCall?.[6]).toEqual({
      spokenInput: true,
      steer: true,
      spokenMeta: { id: "p3" },
    });
    expect(mainCall?.[0]).toBe("main");
    expect(mainCall?.[2]).toBeUndefined();
    expect(mainCall?.[6]).toEqual({ spokenInput: true, steer: false, spokenMeta: { id: "p3" } });
  });

  test("while the agent compacts, phrases wait, interrupts are skipped, and they go as one message", async () => {
    vi.stubEnv("PASEO_VOICE_COMPACT_HOLD", "1");
    const { session, emitAgentEvent } = createHizuriSession();
    const interruptSpy = vi
      .spyOn(internals(session), "interruptAgentIfRunning")
      .mockResolvedValue(undefined);
    const host = voiceHost(session);

    emitAgentEvent(compaction("main", "loading"));
    expect(host.compactHold?.("main")).toMatchObject({ held: 0 });

    await host.interruptAgentIfRunning("main");
    expect(interruptSpy).not.toHaveBeenCalled();

    expect(await host.sendSpokenInput("main", "first", false, { id: "p4" })).toEqual({ ok: true });
    expect(await host.sendSpokenInput("main", "second", true, { id: "p5" })).toEqual({ ok: true });
    expect(prompts.sent).toHaveLength(0);
    expect(host.compactHold?.("main")).toMatchObject({ held: 2 });

    emitAgentEvent(compaction("main", "completed"));
    await vi.waitFor(() => expect(prompts.sent).toHaveLength(1), { timeout: 3000 });
    const text = JSON.stringify(prompts.sent[0]?.prompt);
    expect(text).toContain("While you compacted");
    expect(text).toContain('<spoken-input id=\\"p4\\">');
    expect(text).toContain('<spoken-input id=\\"p5\\">');
    expect(host.compactHold?.("main")).toBeNull();
  });
});

describe("hizuri voice wiring", () => {
  test("the voice gets the user's options from PASEO_HOME and the daemon's shared registry", () => {
    const voiceRegistry = new VoiceRegistry();
    const { session, paseoHome } = createHizuriSession({ voiceRegistry });

    const voice = internals(session).voiceSessions;

    expect(voice.registry).toBe(voiceRegistry);
    expect(voice.options.owner?.floorFile).toBe(join(paseoHome, "voice-floor.json"));
  });

  test("the voice host reads the agent's timeline and provider", () => {
    const { session } = createHizuriSession();

    expect(voiceHost(session).agentTimeline?.("missing")).toEqual([]);
    expect(voiceHost(session).agentProvider?.("missing")).toBeNull();
  });
});

describe("hizuri vault", () => {
  test("a form reaches the vault, is answered, sends the late note, and its values stay out of the log", async () => {
    const submit = vi.fn(async () => ({
      stored: true,
      name: "token",
      error: null,
      lateNote: "The form came after the wait.",
    }));
    const { session, messages, logLines } = createHizuriSession({
      secrets: { submit },
      captureLog: true,
    });
    const sendSpy = vi
      .spyOn(internals(session), "handleSendAgentMessage")
      .mockResolvedValue({ ok: true });

    await send(session, {
      type: "secret.store.request",
      requestId: "secret-2",
      agentId: "agent-1",
      form: "form-2",
      values: { token: "value-never-logged" },
    });

    expect(submit).toHaveBeenCalledWith({
      agentId: "agent-1",
      form: "form-2",
      values: { token: "value-never-logged" },
    });
    expect(ofType(messages, "secret.store.response")).toEqual([
      {
        type: "secret.store.response",
        payload: { requestId: "secret-2", stored: true, name: "token", error: null },
      },
    ]);
    expect(sendSpy.mock.calls[0]?.slice(0, 2)).toEqual([
      "agent-1",
      "The form came after the wait.",
    ]);
    expect(logLines.join("")).not.toContain("value-never-logged");
  });
});

describe("hizuri typed messages", () => {
  function graphLines(paseoHome: string): Record<string, unknown>[] {
    const dir = join(paseoHome, "voice-graph");
    return readdirSync(dir).flatMap((name) =>
      readFileSync(join(dir, name), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    );
  }

  test("a message typed in the app gets a phrase id and its graph line", () => {
    const { session, paseoHome } = createHizuriSession();
    const sent = internals(session).hizuri.typedInput("Check the build", { clientType: "mobile" });

    expect(sent).toMatch(
      /^<spoken-input id="p1">\nCheck the build\n<\/spoken-input>\n<instruction>/,
    );
    expect(sent).toContain("The user typed this message in the chat.");
    expect(graphLines(paseoHome)).toEqual([
      expect.objectContaining({
        type: "phrase",
        id: "p1",
        text: "Check the build",
        delivery: "normal",
        message: "p1",
      }),
    ]);
  });

  test("agents, the CLI and pastes stay plain text", () => {
    const { session } = createHizuriSession();
    const { typedInput } = internals(session).hizuri;
    const paste = Array.from({ length: 21 }, (_, i) => `line ${i}`).join("\n");

    expect(typedInput.call(internals(session).hizuri, "status?", { clientType: "cli" })).toBe(
      "status?",
    );
    expect(
      typedInput.call(internals(session).hizuri, "done", {
        clientType: "mobile",
        sourceAgentId: "helper",
      }),
    ).toBe("done");
    expect(typedInput.call(internals(session).hizuri, paste, { clientType: "mobile" })).toBe(paste);
  });
});
