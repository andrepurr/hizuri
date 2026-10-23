import { describe, expect, it } from "vitest";
import { validateWSOutboundMessage } from "./validation/ws-outbound.js";
import {
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
  WSInboundMessageSchema,
} from "./messages.js";

const VALUE = "correct-horse-battery-staple-7731";

describe("secrets protocol", () => {
  it("parses a secret form's values and a decline", () => {
    for (const message of [
      {
        type: "secret.store.request",
        requestId: "r",
        agentId: "zuri",
        form: "f-1",
        values: { password: VALUE },
      },
      { type: "secret.store.request", requestId: "r", agentId: "zuri", form: "f-1", decline: true },
    ]) {
      expect(SessionInboundMessageSchema.parse(message)).toEqual(message);
    }
  });

  it("never echoes a value in the validation error the daemon logs", () => {
    const parsed = WSInboundMessageSchema.safeParse({
      type: "session",
      message: {
        type: "secret.store.request",
        requestId: "r",
        agentId: "zuri",
        form: "f-1",
        values: { password: VALUE.repeat(200), other: 42 },
      },
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.message).not.toContain(VALUE);
  });

  it("an older app still parses the response and the feature flag", () => {
    const response = {
      type: "secret.store.response",
      payload: { requestId: "r", stored: true, name: "github", error: null },
    };
    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
    const envelope = { type: "session", message: response };
    expect(validateWSOutboundMessage(envelope)).toEqual({ success: true, data: envelope });
    const info = ServerInfoStatusPayloadSchema.safeParse({
      status: "server_info",
      serverId: "srv",
      features: { secrets: true },
    });
    expect(info.success).toBe(true);
  });
});
