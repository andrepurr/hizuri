import { spawn } from "node:child_process";
import { runWithInput } from "./bitwarden.js";

// Hizuri (secrets through Show): the two ways the daemon uses a secret for the agent without the
// agent seeing it. `type` types it into the focused field of the agent's browser display, through
// xdotool reading stdin (the way `bw get password … | xdotool type --file -` works by hand).
// `env` runs one shell command with the secret in an environment variable; its output comes back
// with every form of the value the daemon can spot blanked out.

export interface TypeTarget {
  display: string;
  /** Press Enter after it. */
  enter: boolean;
}

export interface EnvTarget {
  command: string;
  variable: string;
  cwd?: string;
  timeoutMs: number;
}

export interface EnvOutcome {
  exitCode: number;
  output: string;
}

export interface SecretRunner {
  type(value: string, target: TypeTarget): Promise<void>;
  env(value: string, target: EnvTarget): Promise<EnvOutcome>;
}

/** Output kept while a command runs; the answer keeps the last OUTPUT_TAIL after redaction. */
const OUTPUT_KEPT = 8000;
export const OUTPUT_TAIL = 2000;
export const REDACTED = "[secret]";

/** The value as it may appear in output: raw, base64, URL-encoded, hex. */
export function redact(text: string, secrets: readonly string[]): string {
  let result = text;
  const forms = new Set<string>();
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    forms.add(secret);
    forms.add(Buffer.from(secret).toString("base64").replace(/=+$/, ""));
    forms.add(encodeURIComponent(secret));
    forms.add(Buffer.from(secret).toString("hex"));
  }
  for (const form of [...forms].sort((a, b) => b.length - a.length)) {
    result = result.split(form).join(REDACTED);
  }
  return result;
}

export function createSecretRunner(
  options: { xdotool?: string; shell?: string } = {},
): SecretRunner {
  const xdotool = options.xdotool ?? "xdotool";
  return {
    async type(value, target) {
      const env = { ...process.env, DISPLAY: target.display };
      const typed = await runWithInput(
        xdotool,
        ["type", "--clearmodifiers", "--delay", "35", "--file", "-"],
        value,
        { env, timeoutMs: 60_000 },
      );
      if (typed.code !== 0) throw new Error(`xdotool failed: ${typed.stderr.trim().slice(0, 200)}`);
      if (target.enter) {
        const pressed = await runWithInput(xdotool, ["key", "Return"], "", { env });
        if (pressed.code !== 0) throw new Error("xdotool could not press Enter");
      }
    },
    env(value, target) {
      return new Promise((resolve, reject) => {
        const child = spawn(options.shell ?? "/bin/sh", ["-c", target.command], {
          cwd: target.cwd,
          env: { ...process.env, [target.variable]: value },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        const keep = (chunk: Buffer) => {
          output = (output + chunk.toString("utf8")).slice(-OUTPUT_KEPT);
        };
        child.stdout.on("data", keep);
        child.stderr.on("data", keep);
        const timer = setTimeout(() => child.kill("SIGKILL"), target.timeoutMs);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ exitCode: code ?? -1, output });
        });
      });
    },
  };
}
