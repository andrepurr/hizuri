// The retro log: one Markdown file per ISO week in the user's personal folder, one dated line per
// complaint or broken rule. The weekly retro reads it; `last-retro` holds the day it last ran.
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PERSONAL, ensureDir, timeZone } from "./hizuri.mjs";

export const RETRO_DIR = path.join(PERSONAL, "retro");
const LAST = path.join(RETRO_DIR, "last-retro");
const RETRO_EVERY_DAYS = 7;

export function localStamp(date = new Date(), tz = timeZone()) {
  return date.toLocaleString("sv-SE", { timeZone: tz, hour12: false }).slice(0, 16);
}

/** ISO week in the user's zone: the week that holds this week's Thursday, as 2026-W43. */
export function isoWeek(date = new Date(), tz = timeZone()) {
  const d = new Date(`${localStamp(date, tz).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function weekFile(week = isoWeek()) {
  return path.join(RETRO_DIR, `${week}.md`);
}

export function addLine(text, by = "agent") {
  ensureDir(RETRO_DIR);
  const file = weekFile();
  if (!existsSync(file)) writeFileSync(file, `# Retro log ${isoWeek()}\n\n`);
  appendFileSync(file, `- ${localStamp()} · ${text.replace(/\s+/g, " ").trim()} · by ${by}\n`);
  return file;
}

/** Lines logged since the last retro, oldest first. */
export function linesSinceRetro() {
  if (!existsSync(RETRO_DIR)) return [];
  const since = lastRetro();
  const lines = [];
  for (const name of readdirSync(RETRO_DIR)
    .filter((n) => /^\d{4}-W\d{2}\.md$/.test(n))
    .sort()) {
    for (const line of readFileSync(path.join(RETRO_DIR, name), "utf8").split("\n")) {
      const at = /^- (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · /.exec(line)?.[1];
      if (at && (!since || at > since)) lines.push(line);
    }
  }
  return lines;
}

export function lastRetro() {
  return existsSync(LAST) ? readFileSync(LAST, "utf8").trim() : null;
}

/** Due when lines wait and the last retro is a week old (or never ran). */
export function retroDue() {
  const waiting = linesSinceRetro().length;
  const last = lastRetro();
  const age = last
    ? (Date.now() - Date.parse(`${last.slice(0, 10)}T00:00:00Z`)) / 86400000
    : Infinity;
  return { due: waiting > 0 && age >= RETRO_EVERY_DAYS, waiting, last };
}

export function markRetroDone() {
  ensureDir(RETRO_DIR);
  // The minute, not the day: lines logged later on a retro day wait for the next retro.
  const at = localStamp();
  writeFileSync(LAST, `${at}\n`);
  return at;
}
