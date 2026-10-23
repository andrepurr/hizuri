#!/usr/bin/env node
// Hizuri: the personal-data guard. hizuri is one public repo; everything personal lives in the
// user's home folder (~/.hizuri/personal) and must never reach the repo. The guard fails closed:
// any hit is a non-zero exit with the list (path, line, rule), never a personal value or a secret.
//
//   --staged            the staged changes and the commit identity (pre-commit): new lines only
//   --message <file>    a commit message (commit-msg)
//   --tree [ref]        the whole tree of ref, default HEAD (before a push): every line
//   --history <range>   commits (e.g. "hizuri modular ^upstream/main"): author and committer,
//                       message, added paths and lines, and gitleaks over the same commits
//   --generic-only      no deny-list, settings or fingerprints: only the rules of point 3 below
//   --own-dir <dir>     one more folder of the user's own files (a voice program, its models)
//   --public-skill <n>  a skill the repo ships under a name the user's own skills use too
//
// What it checks:
// 1. Paths: nothing under personal/ or .dev/, no .env file, no symlink that leaves the repo or
//    points nowhere, no audio or voice-print file unless byte-identical to the public base, no
//    Cyrillic in a file name, and no picture, video or PDF that nobody looked at (its blob id goes
//    into scripts/personal-guard-media.txt once a person checked what it shows). No model weights
//    or 3D avatar unless byte-identical to the public base, by extension or by their first bytes.
// 1a. The user's own files (loadFingerprints): a blob with the bytes of a file in their Claude Code
//    skills, hizuri's home folder (personal layer, setup, voice history), the downloaded speech
//    models or an --own-dir; a long prose line of those skills and notes; a path through
//    skills/<name>/ for one of their skills (unless --public-skill names it).
// 2. The deny-list (--deny, default $HIZURI_HOME/personal/publish/deny-list.txt; one regex per
//    line, "word:" adds letter boundaries) on every new line. Hits name the list line, never the
//    pattern. A line the public base already has at the same path is public already and passes.
//    The base is every --base ref, by default upstream/main and its merge base with HEAD.
// 3. Generic rules that hold nothing personal (genericKinds): Cyrillic in any file, third-person words that make one person of the user or the assistant in
//    English text, phrase ids cited in comments and docs or before a quote, home folders and
//    private network addresses, counts from real recordings in comments. Same base rule as
//    the deny-list.
// 4. Secrets: gitleaks (all modes) and trufflehog (--tree) from --tools-dir, the personal folder's
//    publish/tools-dirs.txt, or PATH.
// 5. The files map (--staged, --tree): every file of the tree has its line in FILES.md, with what it
//    holds, why it is needed and the check mark (scripts/files-map.mjs), once the tree uses the map.
// With no deny-list or no scanner, --staged warns and goes on (a stranger's clone has neither);
// --tree and --history fail.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  checkRepo,
  ENTRY,
  HEADING,
  MAP_FILE,
  PASEO_LINE,
  stagedMapHits,
  usesMap,
} from "./files-map.mjs";

const AUDIO_OR_VOICE =
  /\.(wav|mp3|ogg|oga|opus|m4a|aac|flac|webm|vrm|vrma)$|(^|\/)(campplus\.onnx|profile\.json)$/i;
/** Trained models, their weights and 3D avatars, by extension. */
const MODEL_OR_AVATAR =
  /\.(onnx|ort|safetensors|pt|pth|ckpt|gguf|ggml|tflite|mlmodel|npz|npy|h5|pb|bin|glb|gltf|fbx|pmx)$/i;
const ENV_FILE = /(^|\/)\.env(\.[^/]*)?$/;
const PRIVATE_DIRS = ["personal", ".dev"];
/** The product's vision, tech design and module plan stay local (.gitignore). */
const LOCAL_ONLY_DOCS = ["docs/VISION.md", "docs/TECH-DESIGN.md", "docs/plans/modular.md"];
// --no-renames: a moved file is judged as new at its new path, like the base rule that is by path.
const DIFF_FLAGS = [
  "-U0",
  "--no-color",
  "--no-ext-diff",
  "--no-renames",
  "--src-prefix=a/",
  "--dst-prefix=b/",
];
const MEDIA = /\.(png|jpe?g|webp|gif|bmp|tiff?|heic|avif|ico|mp4|mov|m4v|mkv|avi|pdf)$/i;
export const MEDIA_LIST = "scripts/personal-guard-media.txt";

/** Cyrillic is a hit in every tracked file, with no exceptions. */
const CYRILLIC = /\p{Script=Cyrillic}/u;
/**
 * Cyrillic written as an escape: \u-escapes (four digits or braces), HTML character references and
 * UTF-8 bytes as %XX or \xXX, for the Cyrillic blocks of Unicode.
 */
const CYRILLIC_ESCAPE = new RegExp(
  [
    String.raw`\\u(?:04[0-9a-f]{2}|05[0-2][0-9a-f]|1c8[0-9a-f]|2d[ef][0-9a-f]|a6[4-9][0-9a-f])`,
    String.raw`\\u\{0*(?:4[0-9a-f]{2}|5[0-2][0-9a-f]|1c8[0-9a-f]|2d[ef][0-9a-f]|a6[4-9][0-9a-f]|1e0[3-8][0-9a-f])\}`,
    String.raw`&#0*(?:10[2-9]\d|11\d\d|12\d\d|13[0-2]\d);`,
    String.raw`&#x0*(?:4[0-9a-f]{2}|5[0-2][0-9a-f]);`,
    String.raw`%d[0-4]%[89ab][0-9a-f]`,
    String.raw`\\x[dD][0-4]\\x[89abAB][0-9a-fA-F]`,
  ].join("|"),
  "i",
);
/** The app's translations, where English person words mean nothing (en files are English). */
const NOT_ENGLISH = /(^|\/)i18n\/resources\/(?!en\.)/;
/**
 * Third-person words that make one person of the user or the assistant (the product serves any
 * user). Letters are escaped (\x65 is e, \x69 is i) so this file does not trip its own rule.
 */
const PERSON_WORD =
  /(?<![\p{L}\p{N}_])(?:h\x65|h\x69m|h\x69s|h\x69mself|sh\x65|h\x65r|h\x65rs|h\x65rself|th\x65 own\x65r|own\x65r's)(?![\p{L}\p{N}_])/iu;
/** A phrase id of the voice journal: a p and 3 to 5 digits. */
const PHRASE_ID = /(?<![\p{L}\p{N}_-])p\d{3,5}(?![\p{L}\p{N}_])/u;
const PHRASE_QUOTE = /(?<![\p{L}\p{N}_-])p\d{3,5}[,:]?\s*[«“]/u;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|#|<!--|--)|\s\/\/\s/;
/**
 * A measurement diary in a comment: counts and scores from field tests. A comment states the
 * threshold and its technical reason; measurements belong in the task tracker, not in the code.
 */
const RECORDING_STAT = new RegExp(
  [
    String.raw`\brecorded (?:session|hour|day|phrases?|outdoor|stop)`,
    String.raw`\b(?:replay|replayed) (?:of|on) \d`,
    String.raw`\b\d[\d,]* of \d[\d,]* (?:phrases|replays|tries|labelled|damaged|long sounds|accepted|empty|thoughts|user)`,
    String.raw`\bthe user's [\d,]+ (?:phrases|sessions|words)`,
    String.raw`\b\d+ (?:days|hours|weeks) of the (?:voice|phrase|session)`,
    String.raw`\bvoice print\b[^.]*\(measured`,
    String.raw`\bscored (?:that )?\d*\.\d+`,
    String.raw`\b\d*\.\d+ for the user's own voice`,
    String.raw`\bonce waited \d`,
    String.raw`\b(?:down )?to \d*\.\d+-\d*\.\d+\b`,
  ].join("|"),
  "i",
);
const DOC_FILE = /\.(md|mdx|txt|rst)$/i;
const HOME_PATH = /(?<![\w.-])(?:\/home|\/Users)\/([A-Za-z_][\w.-]*)/g;
/** Folder names that stand for nobody in particular (one or two letters do too). */
const PLACEHOLDER_HOMES = new Set([
  "paseo",
  "dev",
  "test",
  "tester",
  "runner",
  "node",
  "me",
  "you",
  "alice",
  "bob",
  "example",
  "someone",
  "username",
  "name",
]);
const PRIVATE_IP =
  /(?<![\d.])((?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3})(?!\d|\.\d)/g;
/**
 * Example addresses anyone uses: the first block of each range, the defaults of the Android
 * emulator, Docker and VPN guides, and network addresses (x.y.0.0) of a range.
 */
const SHARED_IP =
  /^(?:(?:10\.0|10\.8|172\.16|172\.17|192\.168|100\.64)\.0\.\d{1,3}|10\.0\.2\.\d{1,3}|\d+\.\d+\.0\.0)$/;

/**
 * The generic kinds of one line: rel is the file's path, or null for a commit message.
 */
export function genericKinds(rel, text) {
  const kinds = [];
  if (CYRILLIC.test(text)) kinds.push("cyrillic");
  if (CYRILLIC_ESCAPE.test(text)) kinds.push("cyrillic-escape");
  if (rel && !NOT_ENGLISH.test(rel) && PERSON_WORD.test(text)) {
    kinds.push("person-word");
  }
  const cited = !rel || DOC_FILE.test(rel) || COMMENT_LINE.test(text);
  if ((cited && PHRASE_ID.test(text)) || PHRASE_QUOTE.test(text)) kinds.push("phrase-id");
  if (rel && COMMENT_LINE.test(text) && RECORDING_STAT.test(text)) kinds.push("recording-stat");
  const personalHome = (name) => name.length > 2 && !PLACEHOLDER_HOMES.has(name.toLowerCase());
  if ([...text.matchAll(HOME_PATH)].some((match) => personalHome(match[1]))) {
    kinds.push("home-path");
  }
  if ([...text.matchAll(PRIVATE_IP)].some((match) => !SHARED_IP.test(match[1]))) {
    kinds.push("private-ip");
  }
  return kinds;
}

/** One regex per line; "#" starts a comment; "word:" adds letter boundaries on both sides. */
export function parseDenyList(text) {
  const patterns = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const word = line.startsWith("word:");
    const source = word ? line.slice(5).trim() : line;
    const wrapped = word ? `(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])` : source;
    // The label names the list line, never the pattern: the patterns are personal values.
    const label = `deny-list #${index + 1}`;
    let regex;
    try {
      regex = new RegExp(wrapped, "iu");
    } catch (error) {
      throw new Error(`${label} is not a valid pattern`, { cause: error });
    }
    patterns.push({ label, regex });
  });
  return patterns;
}

/**
 * Knobs of the personal settings.json that hold names: the assistant's private name, the user's
 * name, the people around them, and the time zone that places them.
 */
export const SETTINGS_NAME_KEYS = [
  "PASEO_ASSISTANT_NAME",
  "PASEO_ASSISTANT_NAME_RU",
  "PASEO_ASSISTANT_NAME_FORMS",
  "PASEO_USER_NAME",
  "PASEO_USER_CALL_NAME",
  "PASEO_USER_NAME_FORMS",
  "PASEO_OTHER_PEOPLE",
  "PASEO_NOT_FOR_ME_NAMES",
  "PASEO_TIME_ZONE",
];

/** Word patterns from the names in the personal settings.json, labelled by knob, never by value. */
export function settingsPatterns(text) {
  const env = JSON.parse(text).env ?? {};
  const patterns = [];
  for (const key of SETTINGS_NAME_KEYS) {
    if (typeof env[key] !== "string") continue;
    for (const word of env[key].split(/[|,;]/).map((part) => part.trim())) {
      if (word.length < 3) continue;
      const source = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      patterns.push({
        label: `settings ${key}`,
        regex: new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, "iu"),
      });
    }
  }
  return patterns;
}

/** Media blob ids a person has looked at: "<blob id> <path> <what it shows>" per line. */
export function parseMediaList(text) {
  const ids = new Set();
  for (const line of text.split("\n")) {
    const id = /^([0-9a-f]{40})\s/.exec(line.trim());
    if (id) ids.add(id[1]);
  }
  return ids;
}

function blobSha(buffer) {
  return createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");
}

/**
 * A model or avatar whatever its name: GGUF and binary glTF by their magic, a safetensors file by
 * its length-prefixed JSON header, a PyTorch checkpoint as a zip that holds data.pkl.
 */
export function modelMagic(content) {
  const magic = content.subarray(0, 4).toString("latin1");
  if (magic === "GGUF" || magic === "glTF") return true;
  if (content.length > 16 && content[8] === 0x7b && content[9] === 0x22) {
    const headerLength = content.readBigUInt64LE(0);
    if (headerLength > 1n && headerLength < BigInt(content.length)) return true;
  }
  return magic === "PK\x03\x04" && content.includes("data.pkl");
}

/** No personal files known: a clone without the personal folder, CI, --generic-only. */
export const NO_FINGERPRINTS = { blobs: new Map(), lines: new Set(), skills: new Set() };
const PROSE_FILE = /\.(md|mdx|txt)$/i;
const SKIPPED_DIRS = new Set([".git", "node_modules", "__pycache__", ".venv", "venv"]);
/**
 * Files that say nothing about the user: licence texts ship with fonts and code everywhere, and
 * every repo keeps its files map with a copy of this repo's checker.
 */
const LICENCE_FILE = /(^|[-_.])(licen[cs]e|copying|notice|ofl)([-_.]|$)/i;
const SHARED_FILE = new Set(["FILES.md", "files-map.mjs"]);

/** A prose line as fingerprints compare it: no list or quote marker, single spaces. */
export function proseKey(text) {
  const key = text
    .trim()
    .replace(/^(?:[-*>#]+|\d+\.)\s+/, "")
    .replace(/\s+/g, " ");
  return key.length >= 50 && key.split(" ").length >= 8 ? key : null;
}

function filesUnder(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) filesUnder(abs, files);
    } else if (entry.isFile()) files.push(abs);
  }
  return files;
}

/**
 * The user's own files, which never go in: skillDirs hold their skills (each folder name is a
 * skill), fileDirs their setup, models and notes. Every file gives its blob id; prose files give
 * their long lines. Blob ids are cached by path, size and time in cacheFile (models are large).
 */
export function loadFingerprints({
  skillDirs,
  fileDirs,
  publicSkills = new Set(),
  exclude = [],
  cacheFile,
}) {
  const skip = exclude.map((dir) => `${path.resolve(dir)}${path.sep}`);
  const cache = new Map();
  if (cacheFile && existsSync(cacheFile)) {
    try {
      for (const [file, entry] of Object.entries(JSON.parse(readFileSync(cacheFile, "utf8")))) {
        cache.set(file, entry);
      }
    } catch {
      // A broken cache is rebuilt.
    }
  }
  const fresh = {};
  const blobs = new Map();
  const lines = new Set();
  const skills = new Set();
  const read = (dir, kind) => {
    for (const file of filesUnder(dir)) {
      // The repo being checked may sit inside one of these folders: its own files are not the user's.
      if (skip.some((prefix) => file.startsWith(prefix))) continue;
      const { size, mtimeMs } = lstatSync(file);
      // An empty file (a .gitkeep) has the same bytes everywhere.
      const name = path.basename(file);
      if (size === 0 || LICENCE_FILE.test(name) || SHARED_FILE.has(name)) continue;
      const known = cache.get(file);
      let sha = known && known[0] === size && known[1] === mtimeMs ? known[2] : null;
      const prose = PROSE_FILE.test(file) && size < 1024 * 1024;
      const content = sha === null || prose ? readFileSync(file) : null;
      sha ??= blobSha(content);
      fresh[file] = [size, mtimeMs, sha];
      if (!blobs.has(sha)) blobs.set(sha, kind);
      if (prose) {
        for (const line of content.toString("utf8").split("\n")) {
          const key = proseKey(line);
          if (key) lines.add(key);
        }
      }
    }
  };
  for (const dir of skillDirs) {
    for (const entry of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
      if (!publicSkills.has(entry.name)) skills.add(entry.name);
    }
    read(dir, "skills");
  }
  for (const dir of fileDirs) read(dir, "own files");
  if (cacheFile) {
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(fresh));
  }
  return { blobs, lines, skills };
}

/** The personal skill a path goes through (".../skills/<name>/..."), or null. */
function personalSkill(rel, fingerprints) {
  const parts = rel.split("/");
  for (let index = 0; index + 2 < parts.length; index += 1) {
    if (parts[index] === "skills" && fingerprints.skills.has(parts[index + 1])) {
      return parts[index + 1];
    }
  }
  return null;
}

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { maxBuffer: 1024 * 1024 * 1024 });
  if (result.status !== 0) {
    const why = result.error ? result.error.message : result.stderr.toString().trim();
    throw new Error(`git ${args.join(" ")} failed: ${why}`);
  }
  return result.stdout;
}

/** The public base over some refs: is a blob public at a path, and the lines a path has there. */
export function publicBase(repo, refs) {
  const blobs = new Map();
  for (const ref of refs) {
    const out = git(repo, ["ls-tree", "-r", "-z", ref]).toString("utf8");
    for (const entry of out.split("\0")) {
      if (!entry) continue;
      const tab = entry.indexOf("\t");
      const [, type, sha] = entry.slice(0, tab).split(" ");
      const rel = entry.slice(tab + 1);
      if (type !== "blob") continue;
      if (!blobs.has(rel)) blobs.set(rel, new Set());
      blobs.get(rel).add(sha);
    }
  }
  const lines = new Map();
  let folders = null;
  return {
    hasPath(rel) {
      return blobs.has(rel);
    },
    hasFolder(dir) {
      folders ??= new Set([...blobs.keys()].map((rel) => `${path.posix.dirname(rel)}/`));
      return folders.has(dir);
    },
    has(rel, content) {
      return blobs.get(rel)?.has(blobSha(content)) ?? false;
    },
    hasSha(rel, sha) {
      return blobs.get(rel)?.has(sha) ?? false;
    },
    linesOf(rel) {
      if (!lines.has(rel)) {
        const set = new Set();
        for (const sha of blobs.get(rel) ?? []) {
          for (const line of git(repo, ["cat-file", "blob", sha]).toString("utf8").split("\n")) {
            set.add(line);
          }
        }
        lines.set(rel, set);
      }
      return lines.get(rel);
    },
  };
}

function privateDir(rel) {
  return PRIVATE_DIRS.find((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

/** A path as hits show it: hidden when the path itself holds a deny-list word. */
function shownPath(rel, denyPatterns) {
  return denyPatterns.some((pattern) => pattern.regex.test(rel)) ? "(file name hidden)" : rel;
}

/** Path rules for one file's blob id; returns a hit or null. */
function pathHit(rel, { sha, base, media, denyPatterns = [], fingerprints = NO_FINGERPRINTS }) {
  const named = denyPatterns.filter((pattern) => pattern.regex.test(rel));
  if (named.length > 0 && !base.hasSha(rel, sha)) {
    // The path itself holds the value: name the blob, which `git ls-files -s` or `ls-tree` finds.
    return `(file name hidden, blob ${sha.slice(0, 9)}): ${named.map((pattern) => pattern.label).join(", ")}`;
  }
  const dir = privateDir(rel);
  if (dir) return `${rel}: private path (${dir}/)`;
  if (LOCAL_ONLY_DOCS.includes(rel)) return `${rel}: product doc that stays local`;
  if (ENV_FILE.test(rel) && !rel.endsWith(".env.example")) return `${rel}: env file`;
  if (CYRILLIC.test(rel)) return `${rel}: cyrillic in the file name`;
  if (base.hasSha(rel, sha)) return null;
  if (AUDIO_OR_VOICE.test(rel)) return `${rel}: audio or voice file not in the public base`;
  if (MODEL_OR_AVATAR.test(rel)) return `${rel}: model or avatar file not in the public base`;
  const own = fingerprints.blobs.get(sha);
  if (own) return `${shownPath(rel, denyPatterns)}: the same bytes as one of the user's ${own}`;
  const skill = personalSkill(rel, fingerprints);
  if (skill) return `${shownPath(rel, denyPatterns)}: a skill of the user's own (${skill})`;
  if (MEDIA.test(rel) && !media.has(sha)) {
    return `${rel}: unchecked media (list its blob id in ${MEDIA_LIST} after a look)`;
  }
  return null;
}

/**
 * A FILES.md line made only of public words: a "Paseo, unchanged" line or a folder heading that
 * names a path the public base has.
 */
function publicMapLine(rel, text, base) {
  if (rel !== MAP_FILE) return false;
  const entry = ENTRY.exec(text);
  if (entry) return entry[2] === PASEO_LINE && base.hasPath(entry[1]);
  const heading = HEADING.exec(text);
  return heading !== null && heading[1].endsWith("/") && base.hasFolder(heading[1]);
}

/** Deny-list and generic hits of new lines: [{ line, text }] of one path. */
const CYRILLIC_KINDS = new Set(["cyrillic", "cyrillic-escape"]);

/**
 * The hits of numbered lines. A line the public base has at the same path passes, unless it holds
 * Cyrillic: that is a hit in every file, Paseo's included. cyrillicOnly reads only that rule (a
 * file identical to the base's).
 */
function lineHits(
  rel,
  numbered,
  denyPatterns,
  base,
  { binary = false, cyrillicOnly = false, fingerprints = NO_FINGERPRINTS } = {},
) {
  const hits = [];
  for (const { line, text } of numbered) {
    let kinds = cyrillicOnly
      ? []
      : denyPatterns.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.label);
    // Compressed bytes spell anything by chance; only the deny-list reads binary files.
    if (!binary) kinds.push(...genericKinds(rel, text));
    if (!binary && !cyrillicOnly && fingerprints.lines.has(proseKey(text))) {
      kinds.push("text of the user's own skills or notes");
    }
    if (cyrillicOnly || base.linesOf(rel).has(text) || publicMapLine(rel, text, base)) {
      kinds = kinds.filter((kind) => CYRILLIC_KINDS.has(kind));
    }
    if (kinds.length === 0) {
      continue;
    }
    const shown = shownPath(rel, denyPatterns);
    const where = binary ? `${shown} (binary)` : `${shown}:${line}`;
    hits.push(`${where}: ${[...new Set(kinds)].join(", ")}`);
  }
  return hits;
}

/**
 * Deny-list hits inside a binary blob (metadata such as an author name); git diffs show no lines
 * of a binary file, so --staged and --history read the blob itself.
 */
function binaryHits(rel, content, denyPatterns, base) {
  if (modelMagic(content))
    return [`${shownPath(rel, denyPatterns)}: a model or avatar by its bytes`];
  if (!content.subarray(0, 8000).includes(0)) return [];
  const numbered = content
    .toString("utf8")
    .split("\n")
    .map((text, index) => ({ line: index + 1, text }));
  return lineHits(rel, numbered, denyPatterns, base, { binary: true });
}

/**
 * Deny-list and generic hits of a commit message up to the scissors line. Lines that start with
 * "#" count too: `git commit -m` keeps them.
 */
export function messageHits(message, denyPatterns, prefix = "message") {
  const hits = [];
  const lines = message.split("\n");
  const scissors = lines.findIndex((line) => /^# -+ >8 -+$/.test(line));
  lines.slice(0, scissors === -1 ? lines.length : scissors).forEach((text, index) => {
    const kinds = [
      ...denyPatterns.filter((pattern) => pattern.regex.test(text)).map((pattern) => pattern.label),
      ...genericKinds(null, text),
    ];
    if (kinds.length > 0) hits.push(`${prefix}:${index + 1}: ${[...new Set(kinds)].join(", ")}`);
  });
  return hits;
}

function walk(root, dir = "", files = []) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (!dir && entry.name === ".git") continue;
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(root, rel, files);
    else files.push(rel);
  }
  return files;
}

/** The media list a person keeps; an empty set when there is none. */
function readMediaList(text) {
  return text === null ? new Set() : parseMediaList(text);
}

/** Scans a checked-out folder (the tree of a ref). Returns the hits, empty when clean. */
export function scanFolder({ folder, base, denyPatterns, media, fingerprints = NO_FINGERPRINTS }) {
  const root = path.resolve(folder);
  const listFile = path.join(root, MEDIA_LIST);
  const reviewed =
    media ?? readMediaList(existsSync(listFile) ? readFileSync(listFile, "utf8") : null);
  const hits = [];
  for (const rel of walk(root)) {
    const abs = path.join(root, rel);
    if (lstatSync(abs).isSymbolicLink()) {
      const target = readlinkSync(abs);
      const resolved = path.resolve(path.dirname(abs), target);
      if (!resolved.startsWith(`${root}${path.sep}`) || !existsSync(resolved)) {
        hits.push(`${rel}: symlink that leaves the repo or points nowhere`);
      } else if (privateDir(path.relative(root, resolved))) {
        hits.push(`${rel}: symlink into a private path`);
      }
      continue;
    }
    const content = readFileSync(abs);
    const sha = blobSha(content);
    const hit = pathHit(rel, { sha, base, media: reviewed, denyPatterns, fingerprints });
    if (hit) {
      hits.push(hit);
      continue;
    }
    const cyrillicOnly = base.has(rel, content);
    if (!cyrillicOnly && modelMagic(content)) {
      hits.push(`${shownPath(rel, denyPatterns)}: a model or avatar by its bytes`);
      continue;
    }
    const text = content.toString("utf8");
    const numbered = text.split("\n").map((line, index) => ({ line: index + 1, text: line }));
    const binary = content.subarray(0, 8000).includes(0);
    if (cyrillicOnly && binary) continue;
    hits.push(
      ...lineHits(rel, numbered, denyPatterns, base, { binary, cyrillicOnly, fingerprints }),
    );
  }
  return hits;
}

/**
 * Added lines of a unified diff (-U0), grouped by the new path. File headers count only between a
 * "diff" line and the first hunk, so an added line that reads "++ x" is content, not a header. A
 * merge's combined diff ("@@@") has one marker column per parent: a line is added when a column
 * says "+" and none says "-".
 */
export function addedLines(diff) {
  const files = new Map();
  let current = null;
  let inHunk = false;
  let columns = 1;
  let line = 0;
  for (const row of diff.split("\n")) {
    if (row.startsWith("diff ")) {
      current = null;
      inHunk = false;
    } else if (!inHunk && row.startsWith("+++ ")) {
      current = row === "+++ /dev/null" ? null : row.slice(6);
      if (current && !files.has(current)) files.set(current, []);
    } else if (row.startsWith("@@")) {
      inHunk = true;
      columns = /^@+/.exec(row)[0].length - 1;
      line = Number(/ \+(\d+)/.exec(row)?.[1] ?? 0);
    } else if (inHunk && current) {
      const markers = row.slice(0, columns);
      if (markers.includes("-") || row.startsWith("\\")) continue;
      if (markers.includes("+")) files.get(current).push({ line, text: row.slice(columns) });
      line += 1;
    }
  }
  return files;
}

/** Paths a diff shows only as "Binary files ... differ": git printed none of their lines. */
export function binaryPaths(diff) {
  const paths = new Set();
  for (const row of diff.split("\n")) {
    const match = /^Binary files .* and b\/(.+) differ$/.exec(row);
    if (match) paths.add(match[1]);
  }
  return paths;
}

/** A staged or committed symlink that leaves the repo or points into a private path. */
function symlinkHit(rel, target, denyPatterns) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target));
  if (path.isAbsolute(target) || resolved.startsWith("..") || privateDir(resolved)) {
    return `${shownPath(rel, denyPatterns)}: symlink that leaves the repo or points into a private path`;
  }
  return null;
}

/** Deny-list hits of the identity the next commit gets (git var reads -c, env and config). */
function identityHits(repo, denyPatterns) {
  const hits = [];
  for (const [variable, who] of [
    ["GIT_AUTHOR_IDENT", "author"],
    ["GIT_COMMITTER_IDENT", "committer"],
  ]) {
    const result = spawnSync("git", ["-C", repo, "var", variable]);
    if (result.status !== 0) {
      hits.push(`(guard): cannot read the commit ${who} identity`);
      continue;
    }
    const identity = result.stdout.toString("utf8").replace(/\s+\d+ [+-]\d{4}\s*$/, "");
    const matched = denyPatterns.filter((pattern) => pattern.regex.test(identity));
    if (matched.length > 0) {
      hits.push(`(identity) ${who}: ${matched.map((pattern) => pattern.label).join(", ")}`);
    }
  }
  return hits;
}

function stagedText(repo, rel) {
  const result = spawnSync("git", ["-C", repo, "show", `:${rel}`], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout.toString("utf8") : null;
}

/** The staged changes: the identity, paths, symlinks and every added line. */
export function scanStaged({ repo, base, denyPatterns, media, fingerprints = NO_FINGERPRINTS }) {
  const hits = identityHits(repo, denyPatterns);
  const reviewed = media ?? readMediaList(stagedText(repo, MEDIA_LIST));
  const staged = git(repo, ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  for (const rel of staged) {
    const [mode, sha] = git(repo, ["ls-files", "-s", "--", rel]).toString("utf8").split(" ");
    if (mode === "120000") {
      const target = git(repo, ["cat-file", "blob", sha]).toString("utf8");
      const hit = symlinkHit(rel, target, denyPatterns);
      if (hit) hits.push(hit);
      continue;
    }
    const hit = pathHit(rel, { sha, base, media: reviewed, denyPatterns, fingerprints });
    if (hit) hits.push(hit);
    if (!base.hasSha(rel, sha)) {
      hits.push(...binaryHits(rel, git(repo, ["cat-file", "blob", sha]), denyPatterns, base));
    }
  }
  const diffArgs = ["-c", "core.quotepath=false", "diff", "--cached", ...DIFF_FLAGS];
  const diff = git(repo, diffArgs).toString("utf8");
  const lines = addedLines(diff);
  // A text file that git diffs as binary (an attribute, a stray byte) still has new lines.
  const forced = [...binaryPaths(diff)].filter(
    (rel) => !(stagedText(repo, rel) ?? "").includes("\0"),
  );
  if (forced.length > 0) {
    const text = git(repo, [...diffArgs, "--text", "--", ...forced]).toString("utf8");
    for (const [rel, numbered] of addedLines(text)) lines.set(rel, numbered);
  }
  for (const [rel, numbered] of lines) {
    hits.push(...lineHits(rel, numbered, denyPatterns, base, { fingerprints }));
  }
  return hits;
}

/** The refs a range ends at ("a..b" ends at b; "^x" excludes x), for the media list. */
function rangeTips(args) {
  return args
    .filter((arg) => !arg.startsWith("^") && !arg.startsWith("-"))
    .map((arg) => (arg.includes("..") ? arg.split(/\.\.\.?/)[1] || "HEAD" : arg));
}

/** The media list at the tips of a range: a picture checked once is checked in every commit. */
function mediaAtTips(repo, args) {
  const reviewed = new Set();
  for (const tip of rangeTips(args)) {
    const result = spawnSync("git", ["-C", repo, "show", `${tip}:${MEDIA_LIST}`]);
    if (result.status === 0)
      for (const id of parseMediaList(result.stdout.toString("utf8"))) reviewed.add(id);
  }
  return reviewed;
}

/**
 * Paths a commit adds or changes, with their mode and blob id. A merge lists the paths whose
 * result differs from every parent: what the merge itself brought in.
 */
function changedPaths(repo, commit, merge) {
  if (merge) {
    const names = git(repo, [
      "diff-tree",
      "--cc",
      "-r",
      "-z",
      "--name-only",
      "--no-commit-id",
      commit,
    ])
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    const paths = [];
    for (const rel of names) {
      const entry = git(repo, ["ls-tree", "-z", commit, "--", rel]).toString("utf8");
      if (!entry) continue;
      const [mode, , sha] = entry.slice(0, entry.indexOf("\t")).split(" ");
      paths.push({ rel, mode, sha });
    }
    return paths;
  }
  const out = git(repo, [
    "diff-tree",
    "-r",
    "-z",
    "--root",
    "--no-commit-id",
    "--diff-filter=ACMRT",
    commit,
  ]).toString("utf8");
  const fields = out.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index + 1 < fields.length; index += 1) {
    if (!fields[index].startsWith(":")) continue;
    const [, mode, , sha, status] = fields[index].slice(1).split(" ");
    const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
    paths.push({ rel: fields[index + pathCount], mode, sha });
    index += pathCount;
  }
  return paths;
}

/** Is a path of a commit a text file (no NUL byte), though git diffed it as binary? */
function textAt(repo, commit, rel) {
  const shown = spawnSync("git", ["-C", repo, "show", `${commit}:${rel}`], {
    maxBuffer: 1024 * 1024 * 1024,
  });
  return shown.status === 0 && !shown.stdout.includes(0);
}

/** Commits of a range: identities, messages, added paths and added lines. */
export function scanHistory({
  repo,
  range,
  base,
  denyPatterns,
  media,
  fingerprints = NO_FINGERPRINTS,
}) {
  const args = range.split(/\s+/).filter(Boolean);
  const reviewed = media ?? mediaAtTips(repo, args);
  const hits = [];
  const commits = git(repo, ["rev-list", "--parents", ...args])
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split(" "));
  for (const [commit, ...parents] of commits) {
    const short = commit.slice(0, 9);
    const [identity, message] = git(repo, [
      "show",
      "-s",
      "--format=%an <%ae> / %cn <%ce>%x00%B",
      commit,
    ])
      .toString("utf8")
      .split("\0");
    const who = denyPatterns.filter((pattern) => pattern.regex.test(identity));
    if (who.length > 0) {
      hits.push(`${short} author/committer: ${who.map((pattern) => pattern.label).join(", ")}`);
    }
    hits.push(...messageHits(message, denyPatterns, `${short} message`));
    for (const { rel, mode, sha } of changedPaths(repo, commit, parents.length > 1)) {
      const blob = () => git(repo, ["cat-file", "blob", sha]);
      if (mode === "120000") {
        const hit = symlinkHit(rel, blob().toString("utf8"), denyPatterns);
        if (hit) hits.push(`${short} ${hit}`);
        continue;
      }
      const hit = pathHit(rel, { sha, base, media: reviewed, denyPatterns, fingerprints });
      if (hit) hits.push(`${short} ${hit}`);
      if (base.hasSha(rel, sha)) continue;
      const content = blob();
      for (const found of binaryHits(rel, content, denyPatterns, base))
        hits.push(`${short} ${found}`);
    }
    const showArgs = ["-c", "core.quotepath=false", "show", "--format=", ...DIFF_FLAGS, commit];
    const diff = git(repo, showArgs).toString("utf8");
    const lines = addedLines(diff);
    const forced = [...binaryPaths(diff)].filter((rel) => textAt(repo, commit, rel));
    if (forced.length > 0) {
      const text = git(repo, [...showArgs, "--text", "--", ...forced]).toString("utf8");
      for (const [rel, numbered] of addedLines(text)) lines.set(rel, numbered);
    }
    for (const [rel, numbered] of lines) {
      for (const hit of lineHits(rel, numbered, denyPatterns, base, { fingerprints })) {
        hits.push(`${short} ${hit}`);
      }
    }
  }
  return hits;
}

function findTool(name, toolsDirs) {
  for (const dir of toolsDirs) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  const found = spawnSync("sh", ["-c", `command -v ${name}`]);
  return found.status === 0 ? found.stdout.toString().trim() : null;
}

/** gitleaks findings as { tool, file, line, rule }; the report is redacted and thrown away. */
function runGitleaks(binary, args) {
  const scratch = mkdtempSync(path.join(tmpdir(), "personal-guard-"));
  try {
    const report = path.join(scratch, "gitleaks.json");
    const run = spawnSync(binary, [
      ...args,
      "--no-banner",
      "--redact",
      "--exit-code",
      "0",
      "--report-format",
      "json",
      "--report-path",
      report,
    ]);
    if (run.status !== 0 || !existsSync(report)) {
      return { error: `(guard): gitleaks failed (exit ${run.status})`, findings: [] };
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(report, "utf8"));
    } catch {
      // The parser's message would quote the report, secrets included.
      return { error: "(guard): gitleaks wrote a report that is not JSON", findings: [] };
    }
    const findings = parsed.map((finding) => ({
      tool: "gitleaks",
      file: finding.File,
      line: finding.StartLine,
      rule: finding.RuleID,
      commit: finding.Commit || null,
    }));
    return { error: null, findings };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** trufflehog findings as { tool, file, line, rule }, without verification or network. */
function runTrufflehog(binary, folder) {
  const run = spawnSync(
    binary,
    ["filesystem", folder, "--json", "--no-verification", "--no-update"],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    return { error: `(guard): trufflehog failed (exit ${run.status})`, findings: [] };
  }
  const findings = run.stdout
    .toString("utf8")
    .split("\n")
    .filter((row) => row.trim().startsWith("{"))
    .map((row) => JSON.parse(row))
    .filter((finding) => finding.SourceMetadata?.Data?.Filesystem)
    .map((finding) => ({
      tool: "trufflehog",
      file: finding.SourceMetadata.Data.Filesystem.file,
      line: finding.SourceMetadata.Data.Filesystem.line ?? 0,
      rule: finding.DetectorName,
    }));
  return { error: null, findings };
}

/** A finding counts unless the public base already has that exact line at that path. */
function secretHit({ root, base, finding, readLine }) {
  const rel = path.relative(root, path.resolve(root, finding.file));
  const text = readLine(rel, finding.line, finding.commit);
  if (text !== undefined && base.linesOf(rel).has(text)) return null;
  const where = finding.commit ? `${finding.commit.slice(0, 9)} ${rel}` : rel;
  return `${where}:${finding.line}: ${finding.tool} ${finding.rule}`;
}

function gitleaksArgs(mode, root, range) {
  if (mode === "tree") return ["dir", root];
  if (mode === "history") return ["git", root, "--log-opts", range];
  return ["git", "--pre-commit", "--staged", root];
}

/**
 * Secret scanners over a folder (--tree: gitleaks dir + trufflehog), the staged changes
 * (--staged: gitleaks) or the commits of a range (--history: gitleaks). Returns hits and the names
 * of the scanners that ran.
 */
export function scanSecrets({ mode, folder, repo, base, range, toolsDirs = [] }) {
  const gitleaks = findTool("gitleaks", toolsDirs);
  const trufflehog = mode === "tree" ? findTool("trufflehog", toolsDirs) : null;
  const root = path.resolve(mode === "tree" ? folder : repo);
  const runs = [];
  if (gitleaks) runs.push(runGitleaks(gitleaks, gitleaksArgs(mode, root, range)));
  if (trufflehog) runs.push(runTrufflehog(trufflehog, root));
  const readLine = (rel, line, commit) => {
    if (mode === "tree") {
      const abs = path.join(root, rel);
      return existsSync(abs) ? readFileSync(abs, "utf8").split("\n")[line - 1] : undefined;
    }
    const spec = mode === "history" && commit ? `${commit}:${rel}` : `:${rel}`;
    const shown = spawnSync("git", ["-C", repo, "show", spec], { maxBuffer: 1024 * 1024 * 1024 });
    return shown.status === 0 ? shown.stdout.toString("utf8").split("\n")[line - 1] : undefined;
  };
  const hits = [];
  for (const { error, findings } of runs) {
    if (error) hits.push(error);
    for (const finding of findings) {
      const hit = secretHit({ root, base, finding, readLine });
      if (hit) hits.push(hit);
    }
  }
  return { hits, scanners: [gitleaks && "gitleaks", trufflehog && "trufflehog"].filter(Boolean) };
}

function expandHome(file) {
  return file === "~" || file.startsWith("~/") ? path.join(homedir(), file.slice(1)) : file;
}

function readList(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map(expandHome);
}

function readArgs(argv) {
  const args = { toolsDirs: [], bases: [], ownDirs: [], publicSkills: [], secretScan: true };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${flag} needs a value`);
      return argv[index];
    };
    if (flag === "--staged") args.mode = "staged";
    else if (flag === "--tree") {
      args.mode = "tree";
      if (next && !next.startsWith("--")) args.ref = value();
    } else if (flag === "--history") {
      args.mode = "history";
      args.range = value();
    } else if (flag === "--message") {
      args.mode = "message";
      args.messageFile = value();
    } else if (flag === "--deny") args.deny = value();
    else if (flag === "--settings") args.settings = value();
    else if (flag === "--base") args.bases.push(value());
    else if (flag === "--repo") args.repo = value();
    else if (flag === "--tools-dir") args.toolsDirs.push(value());
    else if (flag === "--no-secret-scan") args.secretScan = false;
    else if (flag === "--generic-only") args.genericOnly = true;
    else if (flag === "--public-skill") args.publicSkills.push(value());
    else if (flag === "--own-dir") args.ownDirs.push(value());
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!args.mode) {
    throw new Error("pick one: --staged, --message <file>, --tree [ref] or --history <range>");
  }
  return args;
}

function verified(repo, ref) {
  const found = spawnSync("git", ["-C", repo, "rev-parse", "--verify", "-q", `${ref}^{commit}`]);
  return found.status === 0;
}

/** --base refs as given ("none" = no base), else upstream/main and its merge base with HEAD. */
function resolveBases(repo, bases) {
  if (bases.includes("none")) return [];
  if (bases.length > 0) {
    for (const ref of bases) if (!verified(repo, ref)) throw new Error(`unknown base ${ref}`);
    return bases;
  }
  if (!verified(repo, "upstream/main")) return [];
  const fork = spawnSync("git", ["-C", repo, "merge-base", "HEAD", "upstream/main"]);
  const forkPoint = fork.status === 0 ? fork.stdout.toString().trim() : null;
  return forkPoint ? ["upstream/main", forkPoint] : ["upstream/main"];
}

/** The deny patterns; without a list --staged notes it and goes on, the other modes stop. */
function loadDenyList(denyFile, lenient, notes) {
  const patterns = existsSync(denyFile) ? parseDenyList(readFileSync(denyFile, "utf8")) : [];
  if (patterns.length === 0) {
    if (!lenient) throw new Error(`no deny-list at ${denyFile}`);
    notes.push(`no deny-list at ${denyFile}: personal words not checked`);
  }
  return patterns;
}

/** The names of the personal settings.json as deny patterns; none without the file. */
function loadSettings(file, notes) {
  if (!existsSync(file)) {
    notes.push(`no settings at ${file}: names from the personal settings not checked`);
    return [];
  }
  try {
    return settingsPatterns(readFileSync(file, "utf8"));
  } catch (error) {
    // The parser's message quotes the text it read: never print it, it holds personal names.
    throw new Error(`cannot read ${file}: not a settings JSON file`, { cause: error });
  }
}

/**
 * Writes every blob and symlink of a ref into a folder. Not `git archive`: export-ignore and
 * export-subst attributes would leave files out or change them.
 */
export function extractTree(repo, ref, folder) {
  const entries = git(repo, ["ls-tree", "-r", "-z", ref])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf("\t");
      const [mode, type, sha] = entry.slice(0, tab).split(" ");
      return { mode, type, sha, rel: entry.slice(tab + 1) };
    })
    .filter((entry) => entry.type === "blob");
  if (entries.length === 0) return;
  const batch = spawnSync("git", ["-C", repo, "cat-file", "--batch"], {
    input: entries.map((entry) => `${entry.sha}\n`).join(""),
    maxBuffer: 4 * 1024 * 1024 * 1024,
  });
  if (batch.status !== 0) throw new Error(`cannot read the tree of ${ref}`);
  const out = batch.stdout;
  let offset = 0;
  for (const entry of entries) {
    const headerEnd = out.indexOf(10, offset);
    const [sha, type, size] = out.subarray(offset, headerEnd).toString("utf8").split(" ");
    if (sha !== entry.sha || type !== "blob") throw new Error(`cannot read the tree of ${ref}`);
    const content = out.subarray(headerEnd + 1, headerEnd + 1 + Number(size));
    offset = headerEnd + 1 + Number(size) + 1;
    const abs = path.join(folder, entry.rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    if (entry.mode === "120000") symlinkSync(content.toString("utf8"), abs);
    else writeFileSync(abs, content);
  }
}

/** --tree: the ref's tree in a scratch folder, path and deny-list rules, then the scanners. */
function scanTree({ repo, ref, base, denyPatterns, fingerprints, secretScan, toolsDirs }) {
  const folder = mkdtempSync(path.join(tmpdir(), "personal-guard-tree-"));
  try {
    extractTree(repo, ref, folder);
    const hits = scanFolder({ folder, base, denyPatterns, fingerprints });
    if (usesMap(repo, ref)) hits.push(...mapHits(checkRepo(repo, ref).problems));
    if (secretScan) {
      const secrets = scanSecrets({ mode: "tree", folder, repo, base, toolsDirs });
      hits.push(...secrets.hits);
      if (secrets.scanners.length === 0) {
        hits.push("(guard): no secret scanner found (gitleaks or trufflehog)");
      }
    }
    return hits;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Files-map problems as guard hits. */
function mapHits(problems) {
  return problems.map((problem) => `(files map): ${problem.message}`);
}

/** --staged: staged paths and lines, the files map, then gitleaks on the staged changes. */
function scanStagedAll({ repo, base, denyPatterns, fingerprints, secretScan, toolsDirs, notes }) {
  const hits = scanStaged({ repo, base, denyPatterns, fingerprints });
  const map = stagedMapHits(repo);
  hits.push(...mapHits(map.problems));
  notes.push(...map.notes.map((note) => `files map: ${note}`));
  if (secretScan) {
    const secrets = scanSecrets({ mode: "staged", repo, base, toolsDirs });
    hits.push(...secrets.hits);
    if (secrets.scanners.length === 0) notes.push("no gitleaks found: secrets not checked");
  }
  return hits;
}

/** --history: commits of the range, then gitleaks over the same commits. */
function scanHistoryAll({ repo, range, base, denyPatterns, fingerprints, secretScan, toolsDirs }) {
  const hits = scanHistory({ repo, range, base, denyPatterns, fingerprints });
  if (secretScan) {
    const secrets = scanSecrets({ mode: "history", repo, base, range, toolsDirs });
    hits.push(...secrets.hits);
    if (secrets.scanners.length === 0) hits.push("(guard): no secret scanner found (gitleaks)");
  }
  return hits;
}

function main() {
  const args = readArgs(process.argv.slice(2));
  const repo = path.resolve(
    args.repo ?? git(process.cwd(), ["rev-parse", "--show-toplevel"]).toString().trim(),
  );
  const personal = path.join(
    expandHome(process.env.HIZURI_HOME?.trim() || "~/.hizuri"),
    "personal",
  );
  const notes = [];
  // --generic-only: the rules that hold nothing personal (a clone without the personal folder, CI).
  const denyPatterns = args.genericOnly
    ? []
    : [
        ...loadDenyList(
          args.deny ?? path.join(personal, "publish", "deny-list.txt"),
          args.mode === "staged" || args.mode === "message",
          notes,
        ),
        ...loadSettings(args.settings ?? path.join(personal, "settings.json"), notes),
      ];
  const baseRefs = resolveBases(repo, args.bases);
  const hizuriHome = path.dirname(personal);
  const fingerprints = args.genericOnly
    ? NO_FINGERPRINTS
    : loadFingerprints({
        skillDirs: [
          path.join(homedir(), ".claude", "skills"),
          path.join(personal, "skills"),
          path.join(personal, "claude", "skills"),
        ],
        fileDirs: [
          hizuriHome,
          path.join(homedir(), ".paseo", "models"),
          ...args.ownDirs.map(expandHome),
        ],
        publicSkills: new Set(args.publicSkills),
        exclude: [repo],
        cacheFile: path.join(
          expandHome(process.env.XDG_CACHE_HOME?.trim() || "~/.cache"),
          "hizuri",
          "guard-fingerprints.json",
        ),
      });
  const scan = {
    repo,
    base: publicBase(repo, baseRefs),
    denyPatterns,
    fingerprints,
    secretScan: args.secretScan,
    toolsDirs: [...args.toolsDirs, ...readList(path.join(personal, "publish", "tools-dirs.txt"))],
    notes,
  };
  const modes = {
    staged: () => scanStagedAll(scan),
    tree: () => scanTree({ ...scan, ref: args.ref ?? "HEAD" }),
    history: () => scanHistoryAll({ ...scan, range: args.range }),
    message: () => messageHits(readFileSync(args.messageFile, "utf8"), denyPatterns),
  };
  const hits = modes[args.mode]();

  for (const note of notes) process.stderr.write(`personal guard: ${note}\n`);
  if (hits.length > 0) {
    process.stderr.write(`personal guard: ${hits.length} hit(s), nothing personal may go in:\n`);
    for (const hit of hits) process.stderr.write(`  ${hit}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `personal guard: clean (${args.mode}, ${denyPatterns.length} deny patterns, public base ${baseRefs.map((ref) => ref.slice(0, 13)).join(" + ") || "none"})\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `personal guard: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(2);
  }
}
