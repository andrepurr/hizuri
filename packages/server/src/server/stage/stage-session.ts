import type { Logger } from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import { StageError, type StageStore } from "./store.js";

// Hizuri: one connection's side of the stage: it answers the stage.* requests and,
// through an owned subscription (docs/protocol-compatibility.md, "Owned observations"), forwards
// every change of a subscribed agent's stage as `stage.update`. Only a subscribed connection gets
// one, so an app that predates the stage never sees it; a release or a disconnect ends it.

type StageRequest = Extract<
  SessionInboundMessage,
  {
    type:
      | "stage.get_state.request"
      | "stage.close_tab.request"
      | "stage.report_focus.request"
      | "stage.send_action.request"
      | "stage.hide_perch.request";
  }
>;

/** An owned subscription of the current request (session delivery `begin`). */
export interface StageSubscriptionOwner {
  responseId: string;
  signal: AbortSignal;
  emit: (message: SessionOutboundMessage) => void;
  release: () => Promise<void>;
}

export interface StageSessionOptions {
  store: StageStore;
  emit: (message: SessionOutboundMessage) => void;
  /** Starts an owned subscription; must be called before the request's first await. */
  beginSubscription: (stop: () => void) => StageSubscriptionOwner;
  /** Delivers a message to the agent as if the user sent it (steered into a running turn). */
  sendToAgent: (
    agentId: string,
    text: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logger: Logger;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isStageRequest(msg: SessionInboundMessage): msg is StageRequest {
  return msg.type.startsWith("stage.");
}

export class StageSession {
  constructor(private readonly options: StageSessionOptions) {}

  async handle(msg: StageRequest): Promise<void> {
    switch (msg.type) {
      case "stage.get_state.request":
        return this.getState(msg);
      case "stage.close_tab.request":
        return this.closeTab(msg);
      case "stage.report_focus.request":
        return this.reportFocus(msg);
      case "stage.send_action.request":
        return this.sendAction(msg);
      case "stage.hide_perch.request":
        return this.hidePerch(msg);
    }
  }

  private async getState(
    msg: Extract<StageRequest, { type: "stage.get_state.request" }>,
  ): Promise<void> {
    const { store, emit } = this.options;
    let owner: StageSubscriptionOwner | null = null;
    try {
      // Subscribe before reading, so no change falls between the snapshot and the first update.
      if (msg.subscribe) {
        let unsubscribe = (): void => undefined;
        owner = this.options.beginSubscription(() => unsubscribe());
        const subscription = owner;
        unsubscribe = store.subscribe(msg.agentId, (change) =>
          subscription.emit({ type: "stage.update", payload: change }),
        );
      }
      const stage = await store.get(msg.agentId);
      const unchanged = msg.revision === stage.revision;
      emit({
        type: "stage.get_state.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          revision: stage.revision,
          unchanged,
          stage: unchanged ? null : stage,
          subscriptionId: owner?.responseId ?? null,
          error: null,
        },
      });
    } catch (error) {
      await owner?.release();
      emit({
        type: "stage.get_state.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          revision: 0,
          unchanged: false,
          stage: null,
          subscriptionId: null,
          error: errorText(error),
        },
      });
    }
  }

  private async closeTab(
    msg: Extract<StageRequest, { type: "stage.close_tab.request" }>,
  ): Promise<void> {
    const reply = (revision: number, error: string | null) =>
      this.options.emit({
        type: "stage.close_tab.response",
        payload: {
          requestId: msg.requestId,
          agentId: msg.agentId,
          tabId: msg.tabId,
          revision,
          error,
        },
      });
    try {
      const result = await this.options.store.close(msg.agentId, { tabId: msg.tabId, by: "user" });
      reply(result.revision, null);
    } catch (error) {
      reply(0, errorText(error));
    }
  }

  private async reportFocus(
    msg: Extract<StageRequest, { type: "stage.report_focus.request" }>,
  ): Promise<void> {
    let error: string | null = null;
    try {
      await this.options.store.reportFocus(msg.agentId, {
        focus: msg.focus,
        ...(msg.view ? { view: msg.view } : {}),
      });
    } catch (failure) {
      error = errorText(failure);
    }
    this.options.emit({
      type: "stage.report_focus.response",
      payload: { requestId: msg.requestId, error },
    });
  }

  private async hidePerch(
    msg: Extract<StageRequest, { type: "stage.hide_perch.request" }>,
  ): Promise<void> {
    const reply = (revision: number, error: string | null) =>
      this.options.emit({
        type: "stage.hide_perch.response",
        payload: { requestId: msg.requestId, revision, error },
      });
    try {
      const result = await this.options.store.perch(msg.agentId, null);
      reply(result.revision, null);
    } catch (error) {
      reply(0, errorText(error));
    }
  }

  private async sendAction(
    msg: Extract<StageRequest, { type: "stage.send_action.request" }>,
  ): Promise<void> {
    const reply = (delivered: boolean, error: string | null) =>
      this.options.emit({
        type: "stage.send_action.response",
        payload: { requestId: msg.requestId, delivered, error },
      });
    try {
      const stage = await this.options.store.get(msg.agentId);
      const tab = stage.tabs.find((candidate) => candidate.id === msg.tabId);
      if (!tab) throw new StageError("not_found", `no open tab “${msg.tabId}”`);
      const value = msg.value === undefined ? "" : ` value="${escapeAttribute(msg.value)}"`;
      const text =
        `<stage-action tab="${escapeAttribute(msg.tabId)}" block="${escapeAttribute(msg.blockId)}"${value}/>\n` +
        `<instruction>The user tapped this in tab “${escapeAttribute(tab.title)}” on their screen. Act on it as if they had said it.</instruction>`;
      const result = await this.options.sendToAgent(msg.agentId, text);
      if (!result.ok) {
        reply(false, result.error);
        return;
      }
      await this.options.store.reportFocus(msg.agentId, { focus: msg.tabId });
      reply(true, null);
    } catch (error) {
      this.options.logger.warn({ err: error, agentId: msg.agentId }, "Stage action not delivered");
      reply(false, errorText(error));
    }
  }
}
