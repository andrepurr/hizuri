// Hizuri: the secretary. A fast text model (Gemini 2.5 Flash-Lite) judges every phrase that reaches
// Zuri: who it is for, what kind it is, whether the thought is finished, and which fixed line it
// would say. Shadow mode only (PASEO_SECRETARY=shadow): the verdict goes to the voice journal and
// the daemon log; it never drops, delays or answers anything. The code phrase "call the main one"
// (the words after the call are PASEO_SECRETARY_HANDOFF_WORDS, else each language's own) hands the
// conversation straight to Zuri.
//
// The prompt, response schema, examples and generation settings live in a JSON file
// (PASEO_SECRETARY_CONFIG), re-read when it changes, so the setup is tuned without a restart.
// The key comes from GEMINI_API_KEY and is never logged.

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type pino from "pino";

import { envWordList, voiceTimeZone } from "../../voice-env.js";
import { LANGUAGES } from "../../voice-language/languages.js";
import { anyNameForm, withName } from "../../voice-language/assistant-name.js";
import type { VoiceLanguage } from "../../voice-language/types.js";
import type { VoiceJournal } from "./voice-journal.js";

/**
 * The role can live in a skill folder (SKILL.md + schema.json) so any model or agent can play
 * the secretary; the config then names the files instead of inlining them.
 */
export interface SecretaryConfigFile {
  model: string;
  systemInstruction?: string;
  systemInstructionFile?: string;
  responseSchema?: Record<string, unknown>;
  responseSchemaFile?: string;
  generationConfig?: Record<string, unknown>;
  examples?: { input: string; output: Record<string, unknown> }[];
}

interface SecretaryConfig {
  model: string;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  generationConfig?: Record<string, unknown>;
  examples?: { input: string; output: Record<string, unknown> }[];
}

export interface SecretaryInput {
  phrase: string;
  at: number;
  /** The user's earlier phrases with the secretary's own decisions, oldest first. */
  previous: { at: number; text: string; decision?: string }[];
  assistantLastLine: string | null;
  assistantSpeaking: boolean;
  /** The language the user speaks: the fixed line the verdict names is said in it. */
  language: VoiceLanguage;
}

export interface SecretaryVerdict {
  to?: string;
  kind?: string;
  finished?: string;
  attach_to?: string;
  action?: string;
  template?: string;
  [field: string]: unknown;
}

const handoffPatterns = new Map<string, RegExp>();

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** “Call the main one” in every language; configured words replace each language's. */
function handoffPattern(): RegExp {
  const own = envWordList("PASEO_SECRETARY_HANDOFF_WORDS");
  const name = own.length ? "" : anyNameForm();
  const key = `${own.join("|")}/${name}`;
  let pattern = handoffPatterns.get(key);
  if (!pattern) {
    const calls = LANGUAGES.map((language) => {
      const words = own.length
        ? own.map(escapeWord).join("|")
        : [name, ...language.handoffWords.map(escapeWord)].join("|");
      return `${language.handoffCall}(?:${words})`;
    });
    pattern = new RegExp(`(?:${calls.join("|")})`, "iu");
    handoffPatterns.set(key, pattern);
  }
  return pattern;
}
const TIMEOUT_MS = 4000;

function localClock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", {
    timeZone: voiceTimeZone(),
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * The assistant's line shortened like the validated layout: the first 140 and last 260 characters.
 */
function shortLine(text: string): string {
  const clean = text
    .replace(/\[[a-z:]+\]\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length <= 420 ? clean : `${clean.slice(0, 140)} … ${clean.slice(-260)}`;
}

/**
 * The text the model sees for one phrase: what a live secretary knows at that moment, in the
 * layout validated on test phrases.
 * The voice-print score is not known at this point of the pipeline yet: `voice_score="none"`.
 */
export function buildSecretaryInput(input: SecretaryInput): string {
  const recent = input.previous
    .slice(-4)
    .map(
      (p) =>
        `${localClock(p.at)} (-${Math.round((input.at - p.at) / 1000)} s) “${p.text}”${p.decision ? ` → ${p.decision}` : ""}`,
    )
    .join("\n");
  const last = input.previous[input.previous.length - 1];
  const gap = last ? Math.round((input.at - last.at) / 1000) : 0;
  const assistant = input.assistantLastLine
    ? `<assistant state="${input.assistantSpeaking ? "speaking" : "silent"}">${shortLine(input.assistantLastLine)}</assistant>`
    : '<assistant state="silent"></assistant>';
  return [
    `<situation>Local time ${localClock(input.at).slice(0, 5)}.</situation>`,
    assistant,
    "<open_items>\n</open_items>",
    `<recent_turns>\n${recent}\n</recent_turns>`,
    `<new_phrase gap_s="${gap}" voice_score="none" voice_verdict="accepted">${input.phrase}</new_phrase>`,
    "Classify the new phrase above.",
  ].join("\n");
}

export function isHandoffPhrase(text: string): boolean {
  return handoffPattern().test(text);
}

/** A skill file without its YAML front matter. */
function skillBody(text: string): string {
  return text.startsWith("---") ? text.split("---").slice(2).join("---").trim() : text.trim();
}

function resolvePath(file: string, configPath: string): string {
  if (file.startsWith("~/")) {
    return join(homedir(), file.slice(2));
  }
  return isAbsolute(file) ? file : join(dirname(configPath), file);
}

function mtimeOf(path: string | undefined): number {
  return path ? statSync(path).mtimeMs : 0;
}

export class Secretary {
  private config: SecretaryConfig | null = null;
  private configStamp = "";
  /** Called with each decision so the next calls see it in `<recent_turns>`. */
  onDecision: ((at: number, decision: string) => void) | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly configPath: string,
    private readonly journal: VoiceJournal | null,
    private readonly logger: pino.Logger,
  ) {}

  /** Fire and forget: judge one phrase and journal the verdict; never throws. */
  observe(input: SecretaryInput): void {
    if (isHandoffPhrase(input.phrase)) {
      this.journal?.write("secretary", input.phrase, "handoff to Zuri");
      this.logger.info({ phrase: input.phrase }, "secretary.handoff");
      return;
    }
    void this.judge(input).catch((error: unknown) => {
      this.logger.warn({ err: String(error) }, "secretary.failed");
    });
  }

  /** Re-read when the config or a file it names changes, so the role is tuned without a restart. */
  private loadConfig(): SecretaryConfig | null {
    try {
      const file = JSON.parse(readFileSync(this.configPath, "utf8")) as SecretaryConfigFile;
      const roleFile = file.systemInstructionFile
        ? resolvePath(file.systemInstructionFile, this.configPath)
        : undefined;
      const schemaFile = file.responseSchemaFile
        ? resolvePath(file.responseSchemaFile, this.configPath)
        : undefined;
      const stamp = [this.configPath, roleFile, schemaFile].map(mtimeOf).join("/");
      if (stamp !== this.configStamp) {
        const systemInstruction = roleFile
          ? skillBody(readFileSync(roleFile, "utf8"))
          : (file.systemInstruction ?? "");
        const responseSchema = schemaFile
          ? (JSON.parse(readFileSync(schemaFile, "utf8")) as Record<string, unknown>)
          : (file.responseSchema ?? {});
        this.config = { ...file, systemInstruction, responseSchema };
        this.configStamp = stamp;
      }
    } catch (error) {
      this.logger.warn({ err: String(error), path: this.configPath }, "secretary.config_failed");
    }
    return this.config;
  }

  private async judge(input: SecretaryInput): Promise<void> {
    const config = this.loadConfig();
    if (!config) {
      return;
    }
    const startedAt = Date.now();
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify(requestBody(config, input)),
      },
    );
    const ms = Date.now() - startedAt;
    if (!response.ok) {
      this.logger.warn({ status: response.status, ms }, "secretary.http_error");
      this.journal?.write("secretary", input.phrase, `error ${response.status}`);
      return;
    }
    const verdict = parseVerdict(await response.json());
    if (!verdict) {
      this.journal?.write("secretary", input.phrase, `unparsed ${ms}ms`);
      return;
    }
    this.journal?.write(
      "secretary",
      journalText(input.phrase, verdict, input.language),
      journalExtra(verdict, ms),
    );
    this.logger.info({ verdict, ms }, "secretary.verdict");
    this.onDecision?.(input.at, `${verdict.to ?? "?"} ${verdict.action ?? "?"}`);
  }
}

function requestBody(config: SecretaryConfig, input: SecretaryInput): Record<string, unknown> {
  const contents = [
    ...(config.examples ?? []).flatMap((example) => [
      { role: "user", parts: [{ text: example.input }] },
      { role: "model", parts: [{ text: JSON.stringify(example.output) }] },
    ]),
    { role: "user", parts: [{ text: buildSecretaryInput(input) }] },
  ];
  return {
    systemInstruction: { parts: [{ text: config.systemInstruction }] },
    contents,
    generationConfig: {
      ...config.generationConfig,
      responseMimeType: "application/json",
      responseJsonSchema: config.responseSchema,
    },
  };
}

function parseVerdict(body: unknown): SecretaryVerdict | null {
  const typed = body as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const raw = typed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    return JSON.parse(raw) as SecretaryVerdict;
  } catch {
    return null;
  }
}

/** The only lines the secretary may say: the model returns an id, code picks the line. */
function journalText(phrase: string, verdict: SecretaryVerdict, language: VoiceLanguage): string {
  const say = withName(language.secretaryLines[verdict.template ?? ""] ?? "", language);
  return say ? `${phrase} → “${say}”` : phrase;
}

function journalExtra(verdict: SecretaryVerdict, ms: number): string {
  return [
    `to=${verdict.to ?? "?"}`,
    `kind=${verdict.kind ?? "?"}`,
    `done=${verdict.finished ?? "?"}`,
    `action=${verdict.action ?? "?"}`,
    `${ms}ms`,
  ].join(" ");
}

/** GEMINI_API_KEY from the environment, or from the `GEMINI_API_KEY=` line of a .env-style file. */
function readApiKey(env: NodeJS.ProcessEnv): string | null {
  const direct = env.GEMINI_API_KEY?.trim();
  if (direct) {
    return direct;
  }
  const file = env.PASEO_SECRETARY_KEY_FILE?.trim();
  if (!file) {
    return null;
  }
  try {
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((row) => row.trim().startsWith("GEMINI_API_KEY="));
    const value = line
      ?.split("=")
      .slice(1)
      .join("=")
      .trim()
      .replace(/^["']|["']$/g, "");
    return value || null;
  } catch {
    return null;
  }
}

/**
 * PASEO_SECRETARY=shadow with PASEO_SECRETARY_CONFIG and a key (GEMINI_API_KEY, or
 * PASEO_SECRETARY_KEY_FILE pointing at a .env file, so the key never sits on a command line).
 */
export function createSecretaryFromEnv(
  journal: VoiceJournal | null,
  logger: pino.Logger,
  env: NodeJS.ProcessEnv = process.env,
): Secretary | null {
  const mode = env.PASEO_SECRETARY?.trim();
  const key = readApiKey(env);
  const configPath = env.PASEO_SECRETARY_CONFIG?.trim();
  if (mode !== "shadow" || !key || !configPath) {
    return null;
  }
  return new Secretary(key, configPath, journal, logger);
}
