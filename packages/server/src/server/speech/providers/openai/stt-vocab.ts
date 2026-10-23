import { readFileSync, statSync } from "node:fs";

// Hizuri: turns the user's English terms back into English after speech-to-text. An STT for a
// language with another script writes them in its own letters or garbles them ("Docker" and "MCP"
// spelled by sound); the rules file maps those forms back ("Docker", "MCP"). The file is re-read
// when it changes, so new words need no restart. A phrase that would end up with no non-Latin
// letter at all is left alone: the speaker gate drops short all-Latin phrases as noise in a session
// in a non-Latin language.
//
// File format: { "endings": "<regex of case endings>", "rules": [{ "from": ["<regex>", ...], "to": "Term" }] }

export interface TranscriptFix {
  text: string;
  changed: boolean;
}

interface VocabRule {
  to: string;
  re: RegExp;
}

interface VocabFile {
  endings?: string;
  rules?: Array<{ from: string[]; to: string }>;
}

export interface VocabFixer {
  fix(text: string): TranscriptFix;
}

export function compileVocabRules(data: VocabFile): VocabRule[] {
  const endings = data.endings ? `(?:${data.endings})?` : "";
  return (data.rules ?? []).map((rule) => ({
    to: rule.to,
    re: new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${rule.from.join("|")})${endings}(?![\\p{L}\\p{N}])`,
      "giu",
    ),
  }));
}

export function applyVocabRules(text: string, rules: VocabRule[]): TranscriptFix {
  if (!text) {
    return { text, changed: false };
  }
  let out = text;
  for (const rule of rules) {
    out = out.replace(rule.re, rule.to);
  }
  if (out === text || !/(?=\p{L})\P{Script=Latin}/u.test(out)) {
    return { text, changed: false };
  }
  return { text: out, changed: true };
}

export function createVocabFixer(file: string): VocabFixer {
  let loadedMtime = -1;
  let rules: VocabRule[] = [];

  function load(): void {
    let mtime: number;
    try {
      mtime = statSync(file).mtimeMs;
    } catch {
      rules = [];
      loadedMtime = -1;
      return;
    }
    if (mtime === loadedMtime) {
      return;
    }
    loadedMtime = mtime;
    try {
      rules = compileVocabRules(JSON.parse(readFileSync(file, "utf8")) as VocabFile);
    } catch {
      rules = []; // A broken file must never break speech recognition.
    }
  }

  return {
    fix(text) {
      load();
      return applyVocabRules(text, rules);
    },
  };
}
