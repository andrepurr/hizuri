#!/usr/bin/env node
// Hizuri: the files map. Scope: for users. FILES.md at the repo root lists every tracked file on its own line: what
// it holds, why the repo needs it, and the mark that a person checked it holds nothing personal.
// A file without a good line does not ship: the personal guard refuses the commit and the
// publishing scripts drop the path from the published history.
//
//   --check                 the whole map against the index (FILES.md from the working tree)
//   --check --ref <ref>     the same for a commit's tree and its FILES.md
//   --staged                the commit about to be made: FILES.md and the paths from the index
//   --update                adds lines for new files, drops lines of deleted ones, sorts by folder
//   --list-unlisted         paths of the tree (--ref) without a good line, one per line
//   --list-unlisted --history [range]
//                           every path ever committed in range (default: every ref except
//                           Paseo's, refs/remotes/upstream/*) that the map at --ref (default HEAD)
//                           does not describe; Paseo's own paths are left out
//
// A line is one of:
//   - `path` — <what it holds>. Why: <what uses it>. checked: nothing personal
//   - `path` — Paseo, unchanged. checked: nothing personal   (the folder's note gives the reason)
//   - `path` — <what it holds>. personal: must leave the repo
//   - `path` — not checked: ...                              (a stub --update wrote)
// Lines sit under a heading for their folder, "## `dir/`" ("## `./`" for the root). A "Paseo,
// unchanged" line holds only while the file equals Paseo's at that path: upstream/main, its merge
// base with HEAD, or MERGE_HEAD while Paseo's own commit is merged in. Without an upstream ref that
// part is skipped.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MAP_FILE = "FILES.md";
export const CHECKED = "checked: nothing personal";
export const PASEO_LINE = `Paseo, unchanged. ${CHECKED}`;
export const PERSONAL = "personal: must leave the repo";
export const STUB = "not checked: write what it holds, why it is needed, and the check mark";
export const PASEO_NOTE = "Paseo's files here:";
const UPSTREAM_REMOTES = "--remotes=upstream";
export const ENTRY = /^- `([^`]+)` — (.*)$/;
export const HEADING = /^## `([^`]*)`\s*$/;
const PLACEHOLDER = /<what it holds>|<what uses it>/;
const ROOT_HEADING = "./";
const WHY = /^(.{3,}?)\.\s+Why:\s+(.{3,})\.\s+checked: nothing personal$/;

function git(repo, args, { allowFail = false } = {}) {
  const result = spawnSync("git", ["-C", repo, ...args], { maxBuffer: 1024 * 1024 * 1024 });
  if (result.status !== 0) {
    if (allowFail) return null;
    throw new Error(`git ${args[0]} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout;
}

function nulList(buffer) {
  return buffer ? buffer.toString("utf8").split("\0").filter(Boolean) : [];
}

/** The heading a path belongs under: its folder with a trailing slash, "./" at the root. */
export function folderOf(rel) {
  const dir = path.posix.dirname(rel);
  return dir === "." ? ROOT_HEADING : `${dir}/`;
}

/** What a line's text says: own, paseo, personal, stub, or bad (with why). */
export function classify(text) {
  if (text === PASEO_LINE) return { kind: "paseo" };
  if (text.startsWith("not checked")) return { kind: "stub" };
  if (text.endsWith(PERSONAL)) return { kind: "personal" };
  if (PLACEHOLDER.test(text)) return { kind: "bad", why: "still holds the <placeholders>" };
  if (WHY.test(text)) return { kind: "own" };
  if (!text.endsWith(CHECKED)) return { kind: "bad", why: `does not end with "${CHECKED}"` };
  return { kind: "bad", why: 'needs "<what it holds>. Why: <what uses it>." before the mark' };
}

/**
 * Splits FILES.md into the preamble (everything before the first folder heading), each folder's
 * note (its lines that are not entries) and the entries in file order.
 */
export function parseMap(text) {
  const preamble = [];
  const notes = new Map();
  const entries = [];
  const problems = [];
  let folder = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const heading = HEADING.exec(line);
    if (heading) {
      folder = heading[1];
      if (!notes.has(folder)) notes.set(folder, []);
      return;
    }
    if (folder === null) {
      preamble.push(line);
      return;
    }
    const entry = ENTRY.exec(line);
    if (entry) {
      entries.push({ rel: entry[1], text: entry[2].trim(), folder, line: index + 1 });
    } else if (line.startsWith("- `")) {
      problems.push({ line: index + 1, message: "a line that looks like an entry but is not one" });
    } else if (line.trim()) {
      notes.get(folder).push(line);
    }
  });
  while (preamble.length > 0 && preamble.at(-1).trim() === "") preamble.pop();
  return { preamble, notes, entries, problems };
}

function hasPaseoNote(note = []) {
  return note.some((line) => line.startsWith(PASEO_NOTE) && line.slice(PASEO_NOTE.length).trim());
}

/** Writes the map back: preamble, then folders in path order, each with its note and entries. */
export function renderMap({ preamble, notes, entries }) {
  const byFolder = new Map();
  for (const entry of entries) {
    const folder = folderOf(entry.rel);
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder).push(entry);
  }
  const folders = [...byFolder.keys()].sort(comparePaths);
  const out = [...preamble, ""];
  for (const folder of folders) {
    out.push(`## \`${folder}\``, "");
    const note = notes.get(folder) ?? [];
    if (note.length > 0) out.push(...note, "");
    const lines = byFolder.get(folder).sort((a, b) => comparePaths(a.rel, b.rel));
    for (const entry of lines) out.push(`- \`${entry.rel}\` — ${entry.text}`);
    out.push("");
  }
  return out.join("\n");
}

/** Byte order, with the root folder first. */
function comparePaths(a, b) {
  if (a === ROOT_HEADING) return b === ROOT_HEADING ? 0 : -1;
  if (b === ROOT_HEADING) return 1;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function verified(repo, ref) {
  return (
    git(repo, ["rev-parse", "--verify", "-q", `${ref}^{commit}`], { allowFail: true }) !== null
  );
}

/** Is commit an upstream commit: does one of Paseo's refs contain it? */
function isPaseoCommit(repo, commit) {
  const refs = git(repo, [
    "for-each-ref",
    "--count=1",
    "--contains",
    commit,
    "refs/remotes/upstream",
  ]);
  return refs.toString().trim() !== "";
}

/**
 * Paseo's refs a file may equal: upstream/main, its merge base with HEAD, and MERGE_HEAD when the
 * merge brings in Paseo's own commit (a merged hizuri branch is no proof a file is Paseo's).
 */
export function paseoBases(repo, { ref = null, merge = false } = {}) {
  if (!verified(repo, "upstream/main")) return [];
  const bases = ["upstream/main"];
  const fork = git(repo, ["merge-base", ref ?? "HEAD", "upstream/main"], { allowFail: true });
  if (fork) bases.push(fork.toString().trim());
  if (merge && verified(repo, "MERGE_HEAD") && isPaseoCommit(repo, "MERGE_HEAD")) {
    bases.push("MERGE_HEAD");
  }
  return bases;
}

/** Tracked paths: the index, or the tree of ref. */
function trackedPaths(repo, ref) {
  return ref
    ? nulList(git(repo, ["ls-tree", "-r", "-z", "--name-only", ref]))
    : nulList(git(repo, ["ls-files", "-z"]));
}

/**
 * Paths that equal Paseo's file at the same path in at least one base. Index mode compares the
 * index with each base, ref mode the ref's tree.
 */
function paseoIdentical(repo, paths, bases, ref) {
  if (bases.length === 0) return null;
  const differs = bases.map(
    (base) =>
      new Set(
        nulList(
          git(
            repo,
            ref
              ? ["diff", "--name-only", "-z", "--no-renames", base, ref]
              : ["diff", "--cached", "--name-only", "-z", "--no-renames", base],
          ),
        ),
      ),
  );
  return new Set(paths.filter((rel) => differs.some((set) => !set.has(rel))));
}

/** FILES.md's text from the working tree, the index (":") or a ref; null when it is not there. */
function readMap(repo, source) {
  if (source === "worktree") {
    try {
      return readFileSync(path.join(repo, MAP_FILE), "utf8");
    } catch {
      return null;
    }
  }
  const blob = git(repo, ["show", `${source}:${MAP_FILE}`], { allowFail: true });
  return blob ? blob.toString("utf8") : null;
}

function lineToAdd(rel) {
  return `- \`${rel}\` — <what it holds>. Why: <what uses it>. ${CHECKED}`;
}

/**
 * Every problem of the map against the tracked paths, as { rel, message }: the path it is about
 * (null for a broken line) and what to write. Nothing is fixed here.
 */
export function checkMap({ text, tracked, identical }) {
  const problems = [];
  const add = (rel, message, kind, line = null) => problems.push({ rel, message, kind, line });
  const map = parseMap(text);
  for (const problem of map.problems) {
    add(null, `${MAP_FILE}:${problem.line}: ${problem.message}`, "bad", problem.line);
  }
  const trackedSet = new Set(tracked);
  const seen = new Map();
  for (const entry of map.entries) {
    const where = `${MAP_FILE}:${entry.line}: ${entry.rel}`;
    if (seen.has(entry.rel)) {
      add(
        entry.rel,
        `${where} is listed twice (also line ${seen.get(entry.rel)})`,
        "twice",
        entry.line,
      );
      continue;
    }
    seen.set(entry.rel, entry.line);
    if (!trackedSet.has(entry.rel)) {
      add(entry.rel, `${where} is not in the repo: delete its line`, "gone", entry.line);
      continue;
    }
    if (entry.folder !== folderOf(entry.rel)) {
      add(
        entry.rel,
        `${where} belongs under "## \`${folderOf(entry.rel)}\`"`,
        "folder",
        entry.line,
      );
    }
    const { kind, why } = classify(entry.text);
    if (kind === "bad") add(entry.rel, `${where}: the line ${why}`, "bad", entry.line);
    else if (kind === "stub") {
      add(entry.rel, `${where} is not checked: write its line`, "stub", entry.line);
    } else if (kind === "personal") {
      add(entry.rel, `${where} is personal and must leave the repo`, "personal", entry.line);
    } else if (kind === "paseo") {
      if (!hasPaseoNote(map.notes.get(entry.folder))) {
        add(
          entry.rel,
          `${where}: folder ${entry.folder} needs a note "${PASEO_NOTE} <what they do, why hizuri keeps them>"`,
          "bad",
          entry.line,
        );
      }
      if (identical && !identical.has(entry.rel)) {
        add(
          entry.rel,
          `${where} differs from Paseo's, so "Paseo, unchanged" is false: write its own line`,
          "bad",
          entry.line,
        );
      }
    }
  }
  for (const rel of tracked) {
    if (!seen.has(rel)) {
      add(
        rel,
        `${MAP_FILE}: no line for ${rel}; add under "## \`${folderOf(rel)}\`": ${lineToAdd(rel)}`,
        "missing",
      );
    }
  }
  return problems;
}

/**
 * Checks a repo: `source` is "worktree" (FILES.md on disk, paths from the index), "index" (both
 * from the index, for a commit) or a ref. Returns { problems, notes }.
 */
export function checkRepo(repo, source = "worktree") {
  const ref = source === "worktree" || source === "index" ? null : source;
  const text = readMap(repo, source === "index" ? "" : source);
  const notes = [];
  if (text === null) {
    const message = `${MAP_FILE} is missing at the repo root`;
    return { problems: [{ rel: MAP_FILE, message, kind: "missing", line: null }], notes };
  }
  const tracked = trackedPaths(repo, ref);
  const bases = paseoBases(repo, { ref, merge: source === "index" });
  if (bases.length === 0 && text.includes(PASEO_LINE)) {
    notes.push('no upstream/main: "Paseo, unchanged" lines not compared');
  }
  const identical = paseoIdentical(repo, tracked, bases, ref);
  return { problems: checkMap({ text, tracked, identical }), notes };
}

/** Does this tree use the map? It does once FILES.md or this checker is in it. */
export function usesMap(repo, source) {
  const spec = (rel) => (source === "index" ? `:${rel}` : `${source}:${rel}`);
  return ["FILES.md", "scripts/files-map.mjs"].some(
    (rel) => git(repo, ["cat-file", "-e", spec(rel)], { allowFail: true }) !== null,
  );
}

/**
 * The lines of FILES.md the commit writes or removes: the numbers of the new ones, and the paths
 * both kinds name (a removed line of an untouched file must not pass unseen).
 */
function changedMapLines(repo) {
  const diff = git(repo, [
    "diff",
    "--cached",
    "-U0",
    "--no-color",
    "--no-ext-diff",
    "HEAD",
    "--",
    MAP_FILE,
  ]);
  const lines = new Set();
  const paths = new Set();
  let next = 0;
  for (const line of diff.toString("utf8").split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) next = Number(hunk[1]);
    else if (line.startsWith("+") && !line.startsWith("+++ ")) {
      lines.add(next);
      const entry = ENTRY.exec(line.slice(1));
      if (entry) paths.add(entry[1]);
      next += 1;
    } else if (line.startsWith("-") && !line.startsWith("--- ")) {
      const entry = ENTRY.exec(line.slice(1));
      if (entry) paths.add(entry[1]);
    }
  }
  return { lines, paths };
}

/**
 * The staged commit's map problems. An added file needs a finished line and a deleted file must
 * lose its line. A changed file, and every line of FILES.md the commit writes, needs a line that
 * is well formed and true; a "not checked" or personal line of an older file is left to --check,
 * the way the guard judges new lines only, so old files wait for their rewrite. Empty when the
 * commit's tree does not use the map at all (an old branch, another repo).
 */
export function stagedMapHits(repo) {
  if (!usesMap(repo, "index")) return { problems: [], notes: [] };
  const { problems, notes } = checkRepo(repo, "index");
  if (!verified(repo, "HEAD")) return { problems, notes };
  const status = nulList(
    git(repo, ["diff", "--cached", "--name-status", "-z", "--no-renames", "HEAD"]),
  );
  const added = new Set();
  const touched = new Set();
  for (let index = 0; index + 1 < status.length; index += 2) {
    if (status[index] === "A") added.add(status[index + 1]);
    touched.add(status[index + 1]);
  }
  const changed = changedMapLines(repo);
  const waits = (problem) => problem.kind === "stub" || problem.kind === "personal";
  const counts = (problem) =>
    problem.rel === MAP_FILE ||
    added.has(problem.rel) ||
    ((touched.has(problem.rel) ||
      changed.paths.has(problem.rel) ||
      (problem.line !== null && changed.lines.has(problem.line))) &&
      !waits(problem));
  return { problems: problems.filter(counts), notes };
}

/**
 * Brings the map in line with the index: drops lines of paths that are gone, adds a line for each
 * new path ("Paseo, unchanged" when it equals Paseo's and its folder has a Paseo note, else a
 * stub), turns a false "Paseo, unchanged" into a stub, and sorts everything by folder.
 */
export function updateMap({ text, tracked, identical }) {
  const map = parseMap(text);
  const trackedSet = new Set(tracked);
  const kept = new Map();
  const changes = { added: [], dropped: [], stubbed: [] };
  for (const entry of map.entries) {
    if (!trackedSet.has(entry.rel)) {
      changes.dropped.push(entry.rel);
      continue;
    }
    if (kept.has(entry.rel)) continue;
    if (classify(entry.text).kind === "paseo" && identical && !identical.has(entry.rel)) {
      entry.text = STUB;
      changes.stubbed.push(entry.rel);
    }
    kept.set(entry.rel, entry);
  }
  for (const rel of tracked) {
    if (kept.has(rel)) continue;
    const paseo = identical?.has(rel) && hasPaseoNote(map.notes.get(folderOf(rel)));
    kept.set(rel, { rel, text: paseo ? PASEO_LINE : STUB });
    changes.added.push(rel);
  }
  return { text: renderMap({ ...map, entries: [...kept.values()] }), changes };
}

/** Paths of a commit range, merges by their own changes only (git's combined diff). */
function pathsInRange(repo, range) {
  const out = git(repo, [
    "log",
    "--format=",
    "--name-only",
    "-z",
    "--no-renames",
    "--cc",
    ...range,
  ]);
  return new Set(nulList(out).map((rel) => rel.replace(/^\n+/, "")));
}

/**
 * Paths the map at ref does not describe with a good line (own or Paseo). With history, every
 * path ever committed in range instead of the tree, minus the paths of Paseo's own history; a path
 * marked personal is listed even when Paseo once had it.
 */
export function listUnlisted({ repo, ref = "HEAD", history = null }) {
  const text = readMap(repo, ref);
  const described = new Set();
  const personal = new Set();
  if (text !== null) {
    for (const entry of parseMap(text).entries) {
      const { kind } = classify(entry.text);
      if (kind === "own" || kind === "paseo") described.add(entry.rel);
      if (kind === "personal") personal.add(entry.rel);
    }
  }
  if (!history) return trackedPaths(repo, ref).filter((rel) => !described.has(rel));
  const paseo = verified(repo, "upstream/main")
    ? pathsInRange(repo, [UPSTREAM_REMOTES])
    : new Set();
  return [...pathsInRange(repo, history)]
    .filter((rel) => !described.has(rel) && (personal.has(rel) || !paseo.has(rel)))
    .sort();
}

function readArgs(argv) {
  const args = { mode: null, ref: null, history: null, repo: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (flag === "--check" || flag === "--staged" || flag === "--update") {
      args.mode = flag.slice(2);
    } else if (flag === "--list-unlisted") args.mode = "list";
    else if (flag === "--history") {
      args.history =
        next && !next.startsWith("--")
          ? argv[++index].split(/\s+/).filter(Boolean)
          : ["--all", "--not", UPSTREAM_REMOTES];
    } else if (flag === "--ref" || flag === "--repo") {
      if (next === undefined) throw new Error(`${flag} needs a value`);
      args[flag.slice(2)] = argv[++index];
    } else throw new Error(`unknown flag ${flag}`);
  }
  if (!args.mode) throw new Error("pick one: --check, --staged, --update or --list-unlisted");
  if (args.history && args.mode !== "list") throw new Error("--history goes with --list-unlisted");
  return args;
}

function report(problems, notes, label) {
  for (const note of notes) process.stderr.write(`files map: ${note}\n`);
  if (problems.length === 0) {
    process.stdout.write(`files map: clean (${label})\n`);
    return 0;
  }
  process.stderr.write(`files map: ${problems.length} problem(s); every file needs its line:\n`);
  for (const problem of problems) process.stderr.write(`  ${problem.message}\n`);
  process.stderr.write(
    "  (node scripts/files-map.mjs --update adds stub lines and drops lines of deleted files)\n",
  );
  return 1;
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const repo = path.resolve(
    args.repo ?? git(process.cwd(), ["rev-parse", "--show-toplevel"]).toString().trim(),
  );
  if (args.mode === "check") {
    const { problems, notes } = checkRepo(repo, args.ref ?? "worktree");
    return report(problems, notes, args.ref ?? "index");
  }
  if (args.mode === "staged") {
    const { problems, notes } = stagedMapHits(repo);
    return report(problems, notes, "staged");
  }
  if (args.mode === "update") {
    const file = path.join(repo, MAP_FILE);
    const tracked = trackedPaths(repo, null);
    const identical = paseoIdentical(repo, tracked, paseoBases(repo, { merge: true }), null);
    const { text, changes } = updateMap({
      text: readMap(repo, "worktree") ?? "",
      tracked,
      identical,
    });
    writeFileSync(file, text);
    for (const [what, list] of Object.entries(changes)) {
      for (const rel of list) process.stdout.write(`${what}: ${rel}\n`);
    }
    const stubs = parseMap(text).entries.filter((entry) => classify(entry.text).kind === "stub");
    process.stdout.write(`files map: updated; ${stubs.length} line(s) still to write\n`);
    return 0;
  }
  const list = listUnlisted({ repo, ref: args.ref ?? "HEAD", history: args.history });
  if (list.length > 0) process.stdout.write(`${list.join("\n")}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exit(main());
  } catch (error) {
    process.stderr.write(`files map: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}
