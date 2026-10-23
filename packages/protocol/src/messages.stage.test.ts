import { describe, expect, it } from "vitest";
import { validateWSOutboundMessage } from "./validation/ws-outbound.js";
import {
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

const tab = {
  id: "lamps",
  title: "Lamps",
  blocks: [
    {
      type: "offer",
      id: "orbit",
      props: { title: "Orbit", price: "€89" },
      fallback: "Orbit — €89",
    },
    // A block type a newer daemon adds still parses here; the app draws its fallback.
    { type: "hologram", id: "b2", props: { anything: [1, 2] }, fallback: "Hologram" },
  ],
  data: { percent: 40 },
  createdAt: "2026-10-18T17:00:00.000Z",
  updatedAt: "2026-10-18T17:00:00.000Z",
  version: 1,
};

describe("stage protocol", () => {
  it("parses the stage requests an app sends", () => {
    for (const message of [
      {
        type: "stage.get_state.request",
        requestId: "r",
        agentId: "zuri",
        revision: 3,
        subscribe: true,
      },
      { type: "stage.close_tab.request", requestId: "r", agentId: "zuri", tabId: "lamps" },
      {
        type: "stage.report_focus.request",
        requestId: "r",
        agentId: "zuri",
        focus: null,
        view: "face",
      },
      {
        type: "stage.send_action.request",
        requestId: "r",
        agentId: "zuri",
        tabId: "lamps",
        blockId: "pick",
        value: "2",
      },
    ]) {
      expect(SessionInboundMessageSchema.parse(message)).toEqual(message);
    }
  });

  it("keeps unknown block types and their props in a stage update", () => {
    const message = {
      type: "stage.update",
      payload: {
        agentId: "zuri",
        revision: 2,
        previousRevision: 1,
        upserted: [tab],
        removed: [],
        order: ["lamps"],
        closed: [
          {
            id: "old",
            title: "Old",
            closedAt: "2026-10-18T17:00:00.000Z",
            closedBy: "user",
            exit: "fly-out",
          },
        ],
        main: {
          view: "chat",
          bubble: false,
          slides: { lamps: { slide: 3, version: 1, at: "2026-10-18T17:00:00.000Z" } },
        },
        focus: "lamps",
        depth: "deep",
        chrome: { tabStrip: "strip" },
        updatedAt: "2026-10-18T17:00:00.000Z",
        subscriptionId: "sub-1",
      },
    };
    expect(SessionOutboundMessageSchema.parse(message)).toEqual(message);
    // The app validates with the generated validator, not Zod: it must keep the open block shape.
    const envelope = { type: "session", message };
    expect(validateWSOutboundMessage(envelope)).toEqual({ success: true, data: envelope });
  });

  it("parses a full stage snapshot", () => {
    const message = {
      type: "stage.get_state.response",
      payload: {
        requestId: "r",
        agentId: "zuri",
        revision: 2,
        unchanged: false,
        subscriptionId: "sub-1",
        error: null,
        stage: {
          v: 1,
          agentId: "zuri",
          revision: 2,
          tabs: [tab],
          closed: [],
          main: { view: "face" },
          focus: null,
          depth: "simple",
          chrome: {},
          viewing: { focus: "lamps", at: "2026-10-18T17:00:00.000Z" },
          updatedAt: "2026-10-18T17:00:00.000Z",
        },
      },
    };
    expect(SessionOutboundMessageSchema.parse(message)).toEqual(message);
  });

  it("advertises the stage as an optional feature", () => {
    const parsed = ServerInfoStatusPayloadSchema.safeParse({
      status: "server_info",
      serverId: "srv",
      features: { stage: { version: 1 }, stagePerch: true, stageSlide: true },
    });
    expect(parsed.success).toBe(true);
  });
});
