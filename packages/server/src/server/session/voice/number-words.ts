import { foldLetters, LANGUAGES } from "../../voice-language/languages.js";
import type { NumberWords } from "../../voice-language/types.js";

// Hizuri (visual front): the numbers a text holds, written in digits or in words. Zuri speaks
// numbers as words, because its voice reads them ("two hundred fifty thousand stars"), so a
// picture that shows "250 000" is grounded only when code can read those words back. The reader is
// small on purpose and reads every language's number words (voice-language/*.ts): cardinals and
// ordinals in any case, thousand/million multipliers, one and a half, and "two point five" as 2.5.
// What it cannot read stays unknown, and an unknown number is never drawn.

function lookup(table: readonly (readonly [RegExp, number])[], word: string): number | null {
  for (const [pattern, value] of table) {
    if (pattern.test(word)) return value;
  }
  return null;
}

function wordOrder(words: NumberWords, word: string): { value: number; order: number } | null {
  const hundreds = lookup(words.hundreds, word);
  if (hundreds !== null) return { value: hundreds, order: 3 };
  const tens = lookup(words.tens, word);
  if (tens !== null) return { value: tens, order: 2 };
  // A teen fills the tens and the units: nothing smaller may follow it.
  const teen = lookup(words.teens, word);
  if (teen !== null) return { value: teen, order: 1.5 };
  const unit = lookup(words.units, word);
  return unit !== null ? { value: unit, order: 1 } : null;
}

/** Reads number words one by one and keeps the value of every run, and its parts. */
class WordRun {
  readonly found: number[] = [];
  private total = 0;
  private group = 0;
  private minOrder = Number.POSITIVE_INFINITY;
  private inRun = false;
  private decimalOf: number | null = null;
  private halfOf: number | null = null;

  constructor(private readonly words: NumberWords) {}

  read(word: string): void {
    if (this.connector(word)) return;
    this.halfOf = null;
    // “two hundred”: the units read so far become hundreds of the same group.
    if (this.words.hundredWord?.test(word) && this.inRun && this.group > 0 && this.group < 10) {
      this.group *= 100;
      this.minOrder = 3;
      return;
    }
    const multiplier = lookup(this.words.multipliers, word);
    if (multiplier !== null && this.inRun) {
      this.found.push(this.group || 1);
      this.total += (this.group || 1) * multiplier;
      this.group = 0;
      this.minOrder = Number.POSITIVE_INFINITY;
      return;
    }
    const number = wordOrder(this.words, word);
    if (number === null) {
      this.decimalOf = null;
      this.close();
      return;
    }
    if (this.decimalOf !== null && number.order === 1) {
      this.found.push(Number(`${this.decimalOf}.${number.value}`));
    }
    this.decimalOf = null;
    if (this.inRun && number.order >= this.minOrder) this.close();
    this.inRun = true;
    this.group += number.value;
    this.minOrder = number.order === 1.5 ? 1 : number.order;
  }

  close(): void {
    if (this.inRun) {
      this.found.push(this.total + this.group);
      if (this.total > 0 && this.group > 0) this.found.push(this.total, this.group);
    }
    this.total = 0;
    this.group = 0;
    this.minOrder = Number.POSITIVE_INFINITY;
    this.inRun = false;
  }

  /** One and a half, “two point five” and “two and a half”: Zuri and the recogniser say these. */
  private connector(word: string): boolean {
    const { oneAndHalf, decimalJoin, halfJoin, halfFiller, half } = this.words;
    if (oneAndHalf?.test(word)) {
      this.close();
      this.found.push(1.5);
      return true;
    }
    if (
      decimalJoin?.test(word) &&
      this.inRun &&
      this.total === 0 &&
      this.group > 0 &&
      this.group < 10
    ) {
      this.decimalOf = this.group;
      return true;
    }
    if (halfJoin?.test(word) && this.inRun) {
      this.halfOf = this.total + this.group;
      return true;
    }
    if (this.halfOf !== null && halfFiller?.test(word)) {
      return true;
    }
    if (this.halfOf !== null && half?.test(word)) {
      this.found.push(this.halfOf + 0.5);
      this.halfOf = null;
      return true;
    }
    return false;
  }
}

/** Numbers spelled out in words: the value of every run of number words, and its parts. */
function wordNumbers(text: string): number[] {
  const words = foldLetters(text).match(/\p{L}+|\d+(?:[.,]\d+)?/gu);
  if (!words) return [];
  const found: number[] = [];
  for (const language of LANGUAGES) {
    const run = new WordRun(language.numbers);
    for (const word of words) run.read(word);
    run.close();
    found.push(...run.found);
  }
  return found;
}

/** Numbers written in digits: “250 000”, “4,98”, “43%”, “10:30”. */
function digitNumbers(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/\d[\d\s  ]*(?:[.,]\d+)?/g)) {
    const compact = match[0].trim();
    const joined = compact.replace(/[\s  ]/g, "");
    // “10 30” may be two numbers: keep the joined value and each part.
    for (const part of [joined, ...compact.split(/[\s  ]+/)]) {
      const value = Number(part.replace(",", "."));
      if (Number.isFinite(value)) found.push(value);
    }
  }
  return found;
}

/** Every number the text holds, in digits or words. */
export function numbersIn(text: string): Set<number> {
  return new Set([...digitNumbers(text), ...wordNumbers(text)]);
}

/**
 * The numbers a picture would show: digits only (a picture writes numbers in digits); a unit after
 * it (“250K”) does not change it.
 */
export function shownNumbers(text: string): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(\d[\d\s  ]*(?:[.,]\d+)?)/gu)) {
    const joined = match[1]!.trim().replace(/[\s  ]/g, "");
    const value = Number(joined.replace(",", "."));
    if (!Number.isFinite(value)) continue;
    found.push(value);
  }
  return found;
}

/**
 * The numbers of `shown` that none of the sources holds; [] = every number is grounded. 0 and 1
 * always count as said: "in a minute" is one minute without the word "one".
 */
export function ungroundedNumbers(shown: string, sources: readonly string[]): number[] {
  const known = new Set<number>([0, 1]);
  for (const source of sources) {
    for (const value of numbersIn(source)) known.add(value);
  }
  return shownNumbers(shown).filter((value) => !known.has(value));
}
