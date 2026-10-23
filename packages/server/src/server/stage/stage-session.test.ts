import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { SessionOutboundMessage } from "../messages.js";
import { normalizeBlocks } from "./blocks.js";
import { StageSession } from "./stage-session.js";
import { StageStore } from "./store.js";

const logger = pino({ level: "silent" });
const AGENT = "zuri";

let home: string;
let store: StageStore;
let sent: SessionOutboundMessage[];
let delivered: Array<{ agentId: string; text: string }>;
let session: StageSession;
let releases: Array<() => Promise<void>>;

function payloads(type: string): unknown[] {
  return sent
    .filter((message) => message.type === type)
    .map((message) => (message as { payload: unknown }).payload);
}

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "stage-session-"));
  store = new StageStore({ paseoHome: home, logger });
  sent = [];
  delivered = [];
  releases = [];
  let subscriptions = 0;
  session = new StageSession({
    store,
    emit: (message) => sent.push(message),
    // Stands in for the session's owned delivery: tags updates, release stops them.
    beginSubscription: (stop) => {
      const responseId = `sub-${(subscriptions += 1)}`;
      const controller = new AbortController();
      const release = async () => {
        if (controller.signal.aborted) return;
        controller.abort();
        stop();
      };
      releases.push(release);
      return {
        responseId,
        signal: controller.signal,
        emit: (message) => {
          if (controller.signal.aborted) return;
          sent.push({
            ...message,
            payload: { ...(message as { payload: object }).payload, subscriptionId: responseId },
          } as SessionOutboundMessage);
        },
        release,
      };
    },
    sendToAgent: async (agentId, text) => {
      delivered.push({ agentId, text });
      return { ok: true };
    },
    logger,
  });
});

afterEach(async () => {
  for (const release of releases) await release();
  await rm(home, { recursive: true, force: true });
});

describe("stage session", () => {
  test("a subscribed connection gets the snapshot, then every change, until it releases", async () => {
    await store.open(AGENT, { title: "Limits", blocks: normalizeBlocks([{ type: "limits" }]) });
    await session.handle({
      type: "stage.get_state.request",
      requestId: "r1",
      agentId: AGENT,
      subscribe: true,
    });
    expect(payloads("stage.get_state.response")).toEqual([
      expect.objectContaining({
        requestId: "r1",
        revision: 1,
        unchanged: false,
        subscriptionId: "sub-1",
        stage: expect.objectContaining({ tabs: [expect.objectContaining({ id: "limits" })] }),
      }),
    ]);

    await store.update(AGENT, { tabId: "limits", set: { "/usage": [] } });
    expect(payloads("stage.update")).toEqual([
      expect.objectContaining({
        previousRevision: 1,
        revision: 2,
        upserted: [expect.objectContaining({ version: 2 })],
      }),
    ]);

    await releases[0]!();
    await store.close(AGENT, { tabId: "limits", by: "agent" });
    expect(payloads("stage.update")).toHaveLength(1);
  });

  test("a client that holds the current revision gets no stage back", async () => {
    await store.open(AGENT, {
      title: "One",
      blocks: normalizeBlocks([{ type: "text", props: { text: "x" } }]),
    });
    await session.handle({
      type: "stage.get_state.request",
      requestId: "r",
      agentId: AGENT,
      revision: 1,
    });
    expect(payloads("stage.get_state.response")).toEqual([
      expect.objectContaining({ unchanged: true, stage: null, subscriptionId: null, error: null }),
    ]);
  });

  test("the user's close goes into the closed list as the user's, and closing again is harmless", async () => {
    await store.open(AGENT, {
      title: "Pics",
      blocks: normalizeBlocks([{ type: "text", props: { text: "x" } }]),
    });
    await session.handle({
      type: "stage.close_tab.request",
      requestId: "c1",
      agentId: AGENT,
      tabId: "pics",
    });
    await session.handle({
      type: "stage.close_tab.request",
      requestId: "c2",
      agentId: AGENT,
      tabId: "pics",
    });
    expect(payloads("stage.close_tab.response")).toEqual([
      expect.objectContaining({ requestId: "c1", revision: 2, error: null }),
      expect.objectContaining({ requestId: "c2", error: null }),
    ]);
    expect((await store.get(AGENT)).closed).toEqual([
      expect.objectContaining({ id: "pics", closedBy: "user" }),
    ]);
  });

  test("the user's hide takes Zuri off its block and keeps the tab", async () => {
    await store.open(AGENT, {
      title: "Money",
      blocks: normalizeBlocks([{ type: "stat", id: "cash", props: { label: "Cash", value: "1" } }]),
    });
    await store.perch(AGENT, { tabId: "money", blockId: "cash", pose: "sit" });
    expect((await store.get(AGENT)).main.perch).toEqual(expect.objectContaining({ block: "cash" }));
    await session.handle({ type: "stage.hide_perch.request", requestId: "h1", agentId: AGENT });
    expect(payloads("stage.hide_perch.response")).toEqual([
      expect.objectContaining({ requestId: "h1", revision: 3, error: null }),
    ]);
    const after = await store.get(AGENT);
    expect(after.main.perch).toBeUndefined();
    expect(after.tabs.map((tab) => tab.id)).toEqual(["money"]);
  });

  test("a tap on a block reaches the agent as a stage-action", async () => {
    await store.open(AGENT, {
      title: "Lamps",
      tabId: "lamps",
      blocks: normalizeBlocks([
        {
          type: "choice",
          id: "pick",
          props: {
            prompt: "Which?",
            options: [
              { value: "1", label: "A" },
              { value: "2", label: "B" },
            ],
          },
        },
      ]),
    });
    await session.handle({
      type: "stage.send_action.request",
      requestId: "a1",
      agentId: AGENT,
      tabId: "lamps",
      blockId: "pick",
      value: '2"><x',
    });
    expect(payloads("stage.send_action.response")).toEqual([
      expect.objectContaining({ delivered: true, error: null }),
    ]);
    expect(delivered[0]?.text).toContain(
      '<stage-action tab="lamps" block="pick" value="2&quot;&gt;&lt;x"/>',
    );
    expect((await store.get(AGENT)).viewing).toMatchObject({ focus: "lamps" });
  });

  test("a bad agent id is answered with an error, not a crash", async () => {
    await session.handle({ type: "stage.get_state.request", requestId: "r", agentId: "../x" });
    expect(payloads("stage.get_state.response")).toEqual([
      expect.objectContaining({ error: "invalid agent id “../x”", stage: null }),
    ]);
  });
});
