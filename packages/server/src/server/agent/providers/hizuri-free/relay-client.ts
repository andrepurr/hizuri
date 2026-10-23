import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** OpenAI chat message as the relay takes it. */
export type FreeBrainMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: FreeBrainToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface FreeBrainToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface FreeBrainTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** One streamed chunk, reduced to what the session reads. */
export interface FreeBrainChunk {
  text?: string;
  toolCalls?: Array<{ index: number; id?: string; name?: string; arguments?: string }>;
  usage?: { inputTokens: number; outputTokens: number; costUsd?: number };
}

/** A cap on the relay stopped the call; `message` is meant for the user. */
export class FreeBrainLimitError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FreeBrainLimitError";
  }
}

interface InstallFile {
  relayUrl: string;
  token: string;
}

export interface FreeBrainRelayClientOptions {
  relayUrl: string;
  /** Where the install token lives ($PASEO_HOME/free-brain). */
  stateDir: string;
  fetch?: typeof fetch;
}

/**
 * hizuri: talks to our brain relay. The daemon holds only an anonymous install token the relay
 * issued; the model key stays on the relay.
 */
export class FreeBrainRelayClient {
  private readonly relayUrl: string;
  private readonly doFetch: typeof fetch;
  private token: string | null = null;

  constructor(private readonly options: FreeBrainRelayClientOptions) {
    this.relayUrl = options.relayUrl.replace(/\/+$/, "");
    this.doFetch = options.fetch ?? fetch;
  }

  private get installFile(): string {
    return path.join(this.options.stateDir, "install.json");
  }

  async health(signal?: AbortSignal): Promise<boolean> {
    try {
      const response = await this.doFetch(`${this.relayUrl}/health`, { signal });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async readToken(): Promise<string | null> {
    if (this.token) return this.token;
    try {
      const saved = JSON.parse(await readFile(this.installFile, "utf8")) as InstallFile;
      // A token belongs to the relay that issued it.
      if (saved.relayUrl === this.relayUrl && saved.token) {
        this.token = saved.token;
      }
    } catch {
      // no token yet
    }
    return this.token;
  }

  private async install(signal?: AbortSignal): Promise<string> {
    const response = await this.doFetch(`${this.relayUrl}/v1/install`, { method: "POST", signal });
    if (!response.ok) throw await this.toError(response);
    const { token } = (await response.json()) as { token: string };
    await mkdir(this.options.stateDir, { recursive: true });
    const tmp = `${this.installFile}.tmp`;
    await writeFile(tmp, JSON.stringify({ relayUrl: this.relayUrl, token }), { mode: 0o600 });
    await rename(tmp, this.installFile);
    this.token = token;
    return token;
  }

  private async toError(response: Response): Promise<Error> {
    let code = `http_${response.status}`;
    let message = `The free brain answered HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // not JSON
    }
    return response.status === 429
      ? new FreeBrainLimitError(code, message)
      : Object.assign(new Error(message), { code });
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<Response> {
    const send = (token: string) =>
      this.doFetch(`${this.relayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal,
      });
    let response = await send((await this.readToken()) ?? (await this.install(signal)));
    if (response.status === 401) {
      // The relay forgot this install (its state was reset): take a new token once.
      await response.body?.cancel().catch(() => undefined);
      response = await send(await this.install(signal));
    }
    if (!response.ok || !response.body) throw await this.toError(response);
    return response;
  }

  async *streamChat(
    input: { messages: FreeBrainMessage[]; tools: FreeBrainTool[] },
    signal?: AbortSignal,
  ): AsyncGenerator<FreeBrainChunk> {
    const response = await this.post(
      {
        messages: input.messages,
        ...(input.tools.length > 0 ? { tools: input.tools } : {}),
        stream: true,
      },
      signal,
    );
    const decoder = new TextDecoder();
    let pending = "";
    for await (const bytes of response.body as unknown as AsyncIterable<Uint8Array>) {
      pending += decoder.decode(bytes, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const chunk = parseSseLine(line);
        if (chunk) yield chunk;
      }
    }
    const last = parseSseLine(pending);
    if (last) yield last;
  }
}

interface RawChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null;
}

export function parseSseLine(line: string): FreeBrainChunk | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  let raw: RawChunk;
  try {
    raw = JSON.parse(data) as RawChunk;
  } catch {
    return null;
  }
  const delta = raw.choices?.[0]?.delta;
  const chunk: FreeBrainChunk = {};
  if (delta?.content) chunk.text = delta.content;
  if (delta?.tool_calls?.length) {
    chunk.toolCalls = delta.tool_calls.map((call, position) => {
      const piece: { index: number; id?: string; name?: string; arguments?: string } = {
        index: call.index ?? position,
      };
      if (call.id) piece.id = call.id;
      if (call.function?.name) piece.name = call.function.name;
      if (call.function?.arguments) piece.arguments = call.function.arguments;
      return piece;
    });
  }
  if (raw.usage) {
    chunk.usage = {
      inputTokens: raw.usage.prompt_tokens ?? 0,
      outputTokens: raw.usage.completion_tokens ?? 0,
      ...(typeof raw.usage.cost === "number" ? { costUsd: raw.usage.cost } : {}),
    };
  }
  return chunk.text || chunk.toolCalls || chunk.usage ? chunk : null;
}
