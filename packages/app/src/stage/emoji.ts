import type { StageTone } from "./palette";

// The brand draws with dots and thin line icons, never with emoji (docs/brand.md: nothing that
// cannot be traced back to it). Zuri's tabs carry emoji in titles and row icons, so the stage reads
// them instead of drawing them: a status emoji (🟢 🟡 🔴 ✅ ⚠️ ❌) becomes the tone it meant, any
// other emoji becomes a dot of the field. Old stage files keep their emoji; nothing is rewritten.

const TONE_EMOJI: Record<number, StageTone> = {
  0x1f7e2: "success", // 🟢
  0x2705: "success", // ✅
  0x2714: "success", // ✔
  0x1f44d: "success", // 👍
  0x1f7e1: "warning", // 🟡
  0x1f7e0: "warning", // 🟠
  0x26a0: "warning", // ⚠
  0x1f534: "danger", // 🔴
  0x274c: "danger", // ❌
  0x26d4: "danger", // ⛔
  0x1f6ab: "danger", // 🚫
  0x1f6d1: "danger", // 🛑
  0x1f535: "accent", // 🔵
  0x2139: "accent", // ℹ
};

function isEmojiPart(codePoint: number): boolean {
  return (
    (codePoint >= 0x1f000 && codePoint <= 0x1faff) ||
    (codePoint >= 0x2600 && codePoint <= 0x27bf) ||
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2b00 && codePoint <= 0x2bff) ||
    (codePoint >= 0xe0020 && codePoint <= 0xe007f) ||
    codePoint === 0x2139 ||
    codePoint === 0xfe0f ||
    codePoint === 0x200d ||
    codePoint === 0x20e3
  );
}

export interface LeadingMark {
  /** The tone a status emoji meant, or null. */
  tone: StageTone | null;
  /** The emoji that led the text, or "". */
  emoji: string;
  /** The text without it. */
  text: string;
}

/** Splits a leading emoji (“🟢 Ours is better”) off a title and reads the tone it meant. */
export function leadingMark(raw: string): LeadingMark {
  let end = 0;
  let first: number | null = null;
  while (end < raw.length) {
    const codePoint = raw.codePointAt(end) ?? 0;
    if (!isEmojiPart(codePoint)) break;
    first ??= codePoint;
    end += codePoint > 0xffff ? 2 : 1;
  }
  if (end === 0) return { tone: null, emoji: "", text: raw };
  return {
    tone: first === null ? null : (TONE_EMOJI[first] ?? null),
    emoji: raw.slice(0, end),
    text: raw.slice(end).trimStart(),
  };
}

/** True when the whole string is emoji (an old row icon), so it is read, not drawn. */
export function isEmoji(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && leadingMark(trimmed).text === "";
}
