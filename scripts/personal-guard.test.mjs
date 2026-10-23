import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";

import {
  addedLines,
  extractTree,
  genericKinds,
  loadFingerprints,
  MEDIA_LIST,
  messageHits,
  modelMagic,
  parseDenyList,
  publicBase,
  scanFolder,
  scanHistory,
  scanSecrets,
  scanStaged,
  settingsPatterns,
} from "./personal-guard.mjs";
import {
  CHECKED,
  checkMap,
  classify,
  listUnlisted,
  PASEO_LINE,
  parseMap,
  updateMap,
} from "./files-map.mjs";

const GUARD = path.join(import.meta.dirname, "personal-guard.mjs");
// The planted examples are built at run time, so this file itself holds none of what it plants.
// The first code point of the Unicode Cyrillic block, made at run time: any such letter is a hit.
const CYR = String.fromCodePoint(0x0400);
const PRONOUN = ["h", "is"].join("");
const PRONOUN_F = ["sh", "e"].join("");
const OWNER = ["The own", "er"].join("");
const MAC_HOME = ["/Us", "ers/zed"].join("");
const PHRASE = ["p", "4766"].join("");
const HOME = ["/ho", "me/zed"].join("");
const LAN = [10, 20, 30, 7].join(".");
const FIXTURE_DIR = "packages/server/src/server/test-utils/fixtures";
const deny = parseDenyList("# names\nword:zed\nzed-box\n\nword:θήτα\nzed@example\\.invalid\n");
let root;
let repo;
let base;

function write(dir, rel, content) {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), content);
}

function run(...args) {
  return execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" })
    .toString()
    .trim();
}

function commit(message, email = "dev@example.com") {
  run("-c", "user.name=dev", "-c", `user.email=${email}`, "commit", "-q", "-m", message);
}

function blobId(content) {
  return execFileSync("git", ["hash-object", "--stdin"], { input: content }).toString().trim();
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "personal-guard-test-"));
  repo = path.join(root, "repo");
  mkdirSync(repo);
  run("init", "-q", "-b", "main");
  run("config", "user.name", "dev");
  run("config", "user.email", "dev@example.com");
  write(repo, "src/app.ts", 'const host = "zed-box";\n');
  write(repo, "src/i18n.ts", `export const hi = "${CYR}";\n`);
  write(repo, "assets/tone.wav", "RIFF-upstream-tone");
  run("add", "-A");
  commit("upstream base");
  run("branch", "upstream");
  base = publicBase(repo, ["upstream"]);
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  run("reset", "-q", "--hard", "upstream");
  run("clean", "-qfd");
});

test("parseDenyList skips comments, wraps word: patterns, and labels by line, never by value", () => {
  assert.equal(deny.length, 4);
  assert.deepEqual(
    deny.map((pattern) => pattern.label),
    ["deny-list #2", "deny-list #3", "deny-list #5", "deny-list #6"],
  );
  assert.equal(deny[0].regex.test("Zed, hi"), true);
  assert.equal(deny[0].regex.test("Zedd"), false);
  assert.equal(deny[2].regex.test("Θήτα, come here"), true);
  assert.equal(deny[2].regex.test("Θήταρχος"), false);
});

test("addedLines reads new paths and line numbers; an added line that reads like a header is content", () => {
  const diff = [
    "diff --git a/x.ts b/x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@ -3,0 +4,3 @@",
    "+one",
    "+two",
    "+++ /dev/null",
    "diff --git a/gone.ts b/gone.ts",
    "--- a/gone.ts",
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    "-old",
  ].join("\n");
  assert.deepEqual(
    [...addedLines(diff)],
    [
      [
        "x.ts",
        [
          { line: 4, text: "one" },
          { line: 5, text: "two" },
          { line: 6, text: "++ /dev/null" },
        ],
      ],
    ],
  );
});

test("genericKinds: Cyrillic is a hit in every file, language files and fixtures included", () => {
  assert.deepEqual(genericKinds("src/voice.ts", `// ${CYR}`), ["cyrillic"]);
  assert.deepEqual(genericKinds(null, `Fix ${CYR}`), ["cyrillic"]);
  assert.deepEqual(genericKinds("packages/server/src/server/voice-language/ru.ts", CYR), [
    "cyrillic",
  ]);
  assert.deepEqual(genericKinds("packages/app/src/i18n/resources/ru.ts", CYR), ["cyrillic"]);
  assert.deepEqual(genericKinds(`${FIXTURE_DIR}/echo.ts`, CYR), ["cyrillic"]);
});

test("genericKinds: person words in English text, not in translations or for a session owner", () => {
  assert.deepEqual(genericKinds("src/a.ts", `// keeps ${PRONOUN} reply`), ["person-word"]);
  assert.deepEqual(genericKinds("docs/a.md", `${OWNER} asked for it.`), ["person-word"]);
  assert.deepEqual(genericKinds("src/a.ts", `// what ${PRONOUN_F} says next`), ["person-word"]);
  assert.deepEqual(genericKinds("src/a.ts", "// the user's reply; ownership; therefore"), []);
  assert.deepEqual(
    genericKinds("packages/app/src/i18n/resources/de.ts", `a: "Lange ${["h", "er"].join("")}"`),
    [],
  );
});

test("genericKinds: phrase ids in comments, docs and before a quote; ids as data pass", () => {
  assert.deepEqual(genericKinds("src/a.ts", `// cut in (${PHRASE})`), ["phrase-id"]);
  assert.deepEqual(genericKinds("docs/a.md", `Decided (${PHRASE}).`), ["phrase-id"]);
  assert.deepEqual(genericKinds("src/a.ts", `const why = "${PHRASE}: “stop”";`), ["phrase-id"]);
  assert.deepEqual(genericKinds("src/a.test.ts", `meta: { id: "${PHRASE}" },`), []);
  assert.deepEqual(genericKinds(null, `Voice: stop on time (${PHRASE})`), ["phrase-id"]);
  assert.deepEqual(genericKinds("src/a.ts", "// latency p50 and p999 budget"), ["phrase-id"]);
});

test("genericKinds: measurements from recordings in comments; the same numbers in code pass", () => {
  assert.deepEqual(genericKinds("src/a.ts", "// a 1 s tail scored 0.10 and was lost"), [
    "recording-stat",
  ]);
  assert.deepEqual(genericKinds("src/a.ts", "// (0.19 for the user's own voice, phrase dropped)"), [
    "recording-stat",
  ]);
  assert.deepEqual(genericKinds("src/a.ts", "// a long phrase once waited 35 s"), [
    "recording-stat",
  ]);
  assert.deepEqual(genericKinds("src/a.ts", "// noise pulled them down to 0.0-0.16"), [
    "recording-stat",
  ]);
  assert.deepEqual(genericKinds("src/a.ts", "// a second is too little to score reliably"), []);
  assert.deepEqual(genericKinds("src/a.ts", "const MIN_SCORE = 0.25;"), []);
});

test("genericKinds: home folders and private addresses; placeholders and shared examples pass", () => {
  assert.deepEqual(genericKinds("src/a.ts", `const dir = "${HOME}/x";`), ["home-path"]);
  assert.deepEqual(genericKinds("src/a.ts", `const dir = "${MAC_HOME}/x";`), ["home-path"]);
  assert.deepEqual(genericKinds("src/a.ts", 'f("/home/dev/.paseo", "/home/x", "/srv/home/y")'), []);
  assert.deepEqual(genericKinds("src/a.ts", `host: "${LAN}:6768"`), ["private-ip"]);
  assert.deepEqual(genericKinds("src/a.ts", `wg: "${[192, 168, 1, 50].join(".")}"`), [
    "private-ip",
  ]);
  const shared = ["10.0.0.2", "10.8.0.1", "10.0.2.2", "172.30.0.0/16", "192.0.2.10", "110.20.30.7"];
  assert.deepEqual(genericKinds("src/a.ts", shared.join(" ")), []);
});

test("staged: a new line with a denied word is a hit, labelled by list line; a base line is not", () => {
  write(repo, "src/app.ts", 'const host = "zed-box";\n// asked by Θήτα\n');
  write(repo, "src/copy.ts", 'const host = "zed-box";\n');
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    "src/app.ts:2: deny-list #5",
    "src/copy.ts:1: deny-list #2, deny-list #3",
  ]);
});

test("staged: a clean line passes; a Cyrillic, person-word or phrase-quote line is refused", () => {
  write(repo, "src/clean.ts", "// Waits for the user's pause before the reply starts.\n");
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), []);
  write(
    repo,
    "src/voice.ts",
    [`// ${CYR}`, `// waits for ${PRONOUN} pause`, `// asked in ${PHRASE}: “wait”`, ""].join("\n"),
  );
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    "src/voice.ts:1: cyrillic",
    "src/voice.ts:2: person-word",
    "src/voice.ts:3: phrase-id",
  ]);
});

test("staged: only new lines count; an old Cyrillic line elsewhere in the file does not block", () => {
  write(repo, "src/i18n.ts", `export const hi = "${CYR}";\nexport const n = 1;\n`);
  run("add", "-A");
  commit("our old line");
  write(repo, "src/i18n.ts", `export const hi = "${CYR}";\nexport const n = 2;\n`);
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), []);
});

test("staged: a fixture folder line with Cyrillic is a hit, whatever its first lines say", () => {
  write(repo, `${FIXTURE_DIR}/a.ts`, `// fixtures\nexport const A = "${CYR}";\n`);
  write(repo, `${FIXTURE_DIR}/b.ts`, `// Invented test phrases\nexport const B = "${CYR}";\n`);
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }).sort(), [
    `${FIXTURE_DIR}/a.ts:2: cyrillic`,
    `${FIXTURE_DIR}/b.ts:2: cyrillic`,
  ]);
});

test("staged: the commit identity is checked against the deny-list", () => {
  write(repo, "src/other.ts", "export const y = 2;\n");
  run("add", "-A");
  const saved = process.env.GIT_AUTHOR_EMAIL;
  process.env.GIT_AUTHOR_EMAIL = "zed@example.invalid";
  try {
    assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
      "(identity) author: deny-list #2, deny-list #6",
    ]);
  } finally {
    if (saved === undefined) delete process.env.GIT_AUTHOR_EMAIL;
    else process.env.GIT_AUTHOR_EMAIL = saved;
  }
});

test("staged: personal/, .dev/, env files, new audio and escaping symlinks are refused", () => {
  write(repo, "personal/settings.json", "{}");
  write(repo, ".dev/x.json", "{}");
  write(repo, "packages/server/.env", "A=1");
  write(repo, "docker/.env.example", "A=");
  write(repo, "voices/me.wav", "RIFF-my-voice");
  symlinkSync("../../personal/skills/role", path.join(repo, "role-link"));
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }).sort(), [
    ".dev/x.json: private path (.dev/)",
    "packages/server/.env: env file",
    "personal/settings.json: private path (personal/)",
    "role-link: symlink that leaves the repo or points into a private path",
    "voices/me.wav: audio or voice file not in the public base",
  ]);
});

test("staged: a picture nobody listed is refused; a listed one and a Cyrillic file name", () => {
  write(repo, "docs/shot.png", "PNG-a-screenshot");
  write(repo, "docs/logo.png", "PNG-the-logo");
  write(repo, MEDIA_LIST, `# checked\n${blobId("PNG-the-logo")} docs/logo.png the logo\n`);
  write(repo, `docs/${CYR}.md`, "notes\n");
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }).sort(), [
    `docs/shot.png: unchecked media (list its blob id in ${MEDIA_LIST} after a look)`,
    `docs/${CYR}.md: cyrillic in the file name`,
  ]);
});

test("staged and history: a checked picture still may not carry a denied name in its bytes", () => {
  const picture = "PNG\u0000tEXtAuthor\u0000Zed\u0000";
  write(repo, "docs/pic.png", picture);
  write(repo, MEDIA_LIST, `${blobId(picture)} docs/pic.png a picture\n`);
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    "docs/pic.png (binary): deny-list #2",
  ]);
  commit("picture");
  const sha = run("rev-parse", "--short=9", "HEAD");
  assert.deepEqual(scanHistory({ repo, range: "upstream..HEAD", base, denyPatterns: deny }), [
    `${sha} docs/pic.png (binary): deny-list #2`,
  ]);
});

test("tree: every line of a fork file counts, old ones too; identical upstream files pass but for Cyrillic", () => {
  const folder = mkdtempSync(path.join(root, "tree-"));
  write(folder, "src/app.ts", 'const host = "zed-box";\n');
  write(folder, "src/i18n.ts", `export const hi = "${CYR}";\n`);
  write(folder, "assets/tone.wav", "RIFF-upstream-tone");
  write(folder, "docs/note.md", `Zed wrote this\nIt waits for ${PRONOUN} pause.\n`);
  symlinkSync("src/app.ts", path.join(folder, "ok-link.ts"));
  symlinkSync("../outside", path.join(folder, "bad-link"));
  assert.deepEqual(scanFolder({ folder, base, denyPatterns: deny }).sort(), [
    "bad-link: symlink that leaves the repo or points nowhere",
    "docs/note.md:1: deny-list #2",
    "docs/note.md:2: person-word",
    "src/i18n.ts:1: cyrillic",
  ]);
});

test("history: identity, message lines, added paths and added lines of each commit", () => {
  write(repo, "src/new.ts", `// for Zed\n// ${CYR}\nexport const x = 1;\n`);
  write(repo, "packages/server/.env", "A=1");
  run("add", "-A");
  commit(`Add x\n\nAsked by Θήτα (${PHRASE})\n${CYR}`, "zed@example.invalid");
  const sha = run("rev-parse", "--short=9", "HEAD");
  assert.deepEqual(scanHistory({ repo, range: "upstream..HEAD", base, denyPatterns: deny }), [
    `${sha} author/committer: deny-list #2, deny-list #6`,
    `${sha} message:3: deny-list #5, phrase-id`,
    `${sha} message:4: cyrillic`,
    `${sha} packages/server/.env: env file`,
    `${sha} src/new.ts:1: deny-list #2`,
    `${sha} src/new.ts:2: cyrillic`,
  ]);
});

test("history: a range of several refs, Cyrillic in a fixture is a hit at every commit", () => {
  write(repo, `${FIXTURE_DIR}/a.ts`, `// fixtures\nexport const A = "${CYR}";\n`);
  run("add", "-A");
  commit("real fixture");
  const first = run("rev-parse", "--short=9", "HEAD");
  write(
    repo,
    `${FIXTURE_DIR}/a.ts`,
    `// Invented test phrases\nexport const A = "${CYR} ${CYR}";\n`,
  );
  run("add", "-A");
  commit("invented fixture");
  const second = run("rev-parse", "--short=9", "HEAD");
  assert.deepEqual(
    scanHistory({ repo, range: "main ^upstream", base, denyPatterns: deny }).sort(),
    [
      `${first} ${FIXTURE_DIR}/a.ts:2: cyrillic`,
      `${second} ${FIXTURE_DIR}/a.ts:2: cyrillic`,
    ].sort(),
  );
});

test("messageHits: lines up to the scissors count, # lines too (git commit -m keeps them)", () => {
  const message = [
    "Voice: stop on time",
    "# Please enter the commit message",
    `# ${CYR}`,
    "# ------------------------ >8 ------------------------",
    `+ ${CYR}`,
  ].join("\n");
  assert.deepEqual(messageHits(message, deny), ["message:3: cyrillic"]);
  assert.deepEqual(messageHits(`Fix\n\n${CYR} for Zed`, deny), [
    "message:3: deny-list #2, cyrillic",
  ]);
});

test("settingsPatterns: names of the personal settings, labelled by knob, never by value", () => {
  const patterns = settingsPatterns(
    JSON.stringify({
      env: {
        PASEO_ASSISTANT_NAME: "Kit",
        PASEO_USER_NAME_FORMS: "Zed|Zeda|Z",
        PASEO_VOICE_LANGUAGE: "ru",
      },
    }),
  );
  assert.deepEqual(
    patterns.map((pattern) => pattern.label),
    [
      "settings PASEO_ASSISTANT_NAME",
      "settings PASEO_USER_NAME_FORMS",
      "settings PASEO_USER_NAME_FORMS",
    ],
  );
  assert.equal(patterns[0].regex.test("Kit, stop"), true);
  assert.equal(patterns[0].regex.test("Kitchen"), false);
});

test("secrets: a finding counts unless upstream has that line; values are never shown", () => {
  const folder = mkdtempSync(path.join(root, "tree-"));
  write(folder, "src/app.ts", 'const host = "zed-box";\n');
  write(folder, "src/keys.ts", "export const key = 'not-a-real-key';\n");
  const tools = mkdtempSync(path.join(root, "tools-"));
  const report = JSON.stringify([
    {
      File: path.join(folder, "src/keys.ts"),
      StartLine: 1,
      RuleID: "generic-api-key",
      Secret: "x",
    },
    { File: path.join(folder, "src/app.ts"), StartLine: 1, RuleID: "generic-api-key", Secret: "y" },
  ]);
  write(
    tools,
    "gitleaks",
    `#!/bin/sh\nwhile [ "$1" != "--report-path" ]; do shift; done\nprintf '%s' '${report}' > "$2"\n`,
  );
  execFileSync("chmod", ["+x", path.join(tools, "gitleaks")]);
  const savedPath = process.env.PATH;
  process.env.PATH = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
  try {
    assert.deepEqual(scanSecrets({ mode: "tree", folder, repo, base, toolsDirs: [tools] }), {
      hits: ["src/keys.ts:1: gitleaks generic-api-key"],
      scanners: ["gitleaks"],
    });
  } finally {
    process.env.PATH = savedPath;
  }
});

test("secrets: --history runs gitleaks over the range and names the commit of each finding", () => {
  write(repo, "src/keys.ts", "export const key = 'not-a-real-key';\n");
  run("add", "-A");
  commit("keys");
  const full = run("rev-parse", "HEAD");
  const tools = mkdtempSync(path.join(root, "tools-"));
  const report = JSON.stringify([
    { File: "src/keys.ts", StartLine: 1, RuleID: "generic-api-key", Commit: full, Secret: "x" },
  ]);
  write(
    tools,
    "gitleaks",
    [
      "#!/bin/sh",
      `printf '%s\\n' "$@" > "${path.join(tools, "args")}"`,
      'while [ "$1" != "--report-path" ]; do shift; done',
      `printf '%s' '${report}' > "$2"`,
      "",
    ].join("\n"),
  );
  execFileSync("chmod", ["+x", path.join(tools, "gitleaks")]);
  const savedPath = process.env.PATH;
  process.env.PATH = `${path.dirname(process.execPath)}:/usr/bin:/bin`;
  try {
    const range = "main ^upstream";
    assert.deepEqual(scanSecrets({ mode: "history", repo, base, range, toolsDirs: [tools] }), {
      hits: [`${full.slice(0, 9)} src/keys.ts:1: gitleaks generic-api-key`],
      scanners: ["gitleaks"],
    });
    const args = execFileSync("cat", [path.join(tools, "args")])
      .toString()
      .split("\n");
    assert.deepEqual(args.slice(0, 4), ["git", repo, "--log-opts", range]);
  } finally {
    process.env.PATH = savedPath;
  }
});

test("cli: --staged without a deny-list or scanner warns and passes; --tree fails closed", () => {
  const home = mkdtempSync(path.join(root, "home-"));
  const env = {
    ...process.env,
    HIZURI_HOME: home,
    PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
  };
  write(repo, "src/other.ts", "export const y = 2;\n");
  run("add", "-A");
  const staged = spawnSync(process.execPath, [GUARD, "--staged", "--base", "upstream"], {
    cwd: repo,
    env,
  });
  assert.equal(staged.status, 0, staged.stderr.toString());
  assert.match(staged.stderr.toString(), /no deny-list/);
  const tree = spawnSync(process.execPath, [GUARD, "--tree", "--base", "upstream"], {
    cwd: repo,
    env,
  });
  assert.equal(tree.status, 2);
  assert.match(tree.stderr.toString(), /no deny-list/);
});

test("cli: --tree exits 1 and lists the hits without printing a deny pattern or a settings name", () => {
  const home = mkdtempSync(path.join(root, "home-"));
  write(home, "personal/publish/deny-list.txt", "word:zed\n");
  write(home, "personal/settings.json", JSON.stringify({ env: { PASEO_ASSISTANT_NAME: "Kit" } }));
  write(repo, "docs/note.md", "Zed wrote this\nKit said so\n");
  run("add", "-A");
  commit("note");
  const env = { ...process.env, HIZURI_HOME: home };
  const tree = spawnSync(
    process.execPath,
    [GUARD, "--tree", "HEAD", "--base", "upstream", "--no-secret-scan"],
    { cwd: repo, env },
  );
  assert.equal(tree.status, 1);
  const out = tree.stderr.toString();
  assert.match(out, /docs\/note\.md:1: deny-list #1/);
  assert.match(out, /docs\/note\.md:2: settings PASEO_ASSISTANT_NAME/);
  assert.doesNotMatch(out, /zed|Kit/i);
});

test("addedLines: a merge's combined diff keeps lines a column adds and drops removed ones", () => {
  const diff = [
    "diff --cc x.ts",
    "--- a/x.ts",
    "+++ b/x.ts",
    "@@@ -1,1 -1,1 +1,2 @@@",
    "- old",
    " -older",
    "++resolved",
    " +from one side",
  ].join("\n");
  assert.deepEqual(addedLines(diff).get("x.ts"), [
    { line: 1, text: "resolved" },
    { line: 2, text: "from one side" },
  ]);
});

test("the base rule never passes Cyrillic: a base line with it is a hit at its own path too", () => {
  write(repo, "src/app.ts", 'const host = "zed-box";\nexport const n = 3;\n');
  write(repo, "src/copy.ts", 'const host = "zed-box";\n');
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    "src/copy.ts:1: deny-list #2, deny-list #3",
  ]);
  const folder = mkdtempSync(path.join(root, "tree-"));
  extractTree(repo, "upstream", folder);
  assert.deepEqual(scanFolder({ folder, base, denyPatterns: deny }), ["src/i18n.ts:1: cyrillic"]);
});

test("genericKinds: Cyrillic written as an escape is a hit; Greek, quotes and the word are not", () => {
  const slash = String.fromCharCode(92);
  for (const escaped of [
    `${slash}u0410`,
    `${slash}u{410}`,
    ["&#", "1040;"].join(""),
    ["&#x", "410;"].join(""),
    ["%D0", "%90"].join(""),
    `${slash}xd0${slash}x90`,
  ]) {
    assert.deepEqual(genericKinds("src/a.ts", `const a = "${escaped}";`), ["cyrillic-escape"]);
  }
  for (const clean of [String.fromCodePoint(0x3b1), "\u00ab\u00bb", "Cyrillic", `${slash}u0041`]) {
    assert.deepEqual(genericKinds("src/a.ts", clean), []);
  }
});

test("person words count in English translation files, not in other languages", () => {
  const objectWord = ["h", "er"].join("");
  assert.deepEqual(
    genericKinds("packages/app/src/i18n/resources/en.ts", `a: "${objectWord} face"`),
    ["person-word"],
  );
  assert.deepEqual(
    genericKinds("packages/server/src/server/voice-language/en.ts", `// ${objectWord}`),
    ["person-word"],
  );
});

test("parseDenyList: a broken pattern is named by its line, never quoted", () => {
  assert.throws(
    () => parseDenyList("word:zed\nzed(\n"),
    (error) => {
      assert.equal(error.message, "deny-list #2 is not a valid pattern");
      return true;
    },
  );
});

test("staged: a file name with a denied word is named by its blob, not its path", () => {
  write(repo, "notes/zed-plans.md", `plans\n${CYR}\n`);
  run("add", "-A");
  const blob = run("rev-parse", ":notes/zed-plans.md").slice(0, 9);
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    `(file name hidden, blob ${blob}): deny-list #2`,
    "(file name hidden):2: cyrillic",
  ]);
});

test("staged: a text file git diffs as binary, a file turned symlink, and a move are all judged", () => {
  write(repo, ".gitattributes", "*.dat -diff\n");
  write(repo, "data/words.dat", `${CYR}\n`);
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), ["data/words.dat:1: cyrillic"]);
  run("reset", "-q", "--hard", "upstream");
  rmSync(path.join(repo, "src/app.ts"));
  symlinkSync("../personal/secret.ts", path.join(repo, "src/app.ts"));
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), [
    "src/app.ts: symlink that leaves the repo or points into a private path",
  ]);
  run("reset", "-q", "--hard", "upstream");
  run("mv", "src/i18n.ts", "src/moved.ts");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }), ["src/moved.ts:1: cyrillic"]);
});

test("tree: Cyrillic in a fixture is a hit, the deny-list still applies", () => {
  const folder = mkdtempSync(path.join(root, "tree-"));
  write(folder, `${FIXTURE_DIR}/a.ts`, `// fixtures\nexport const A = "${CYR}";\n`);
  write(
    folder,
    `${FIXTURE_DIR}/b.ts`,
    `// Invented test phrases\nexport const B = "${CYR} Zed";\n`,
  );
  assert.deepEqual(scanFolder({ folder, base, denyPatterns: deny }).sort(), [
    `${FIXTURE_DIR}/a.ts:2: cyrillic`,
    `${FIXTURE_DIR}/b.ts:2: deny-list #2, cyrillic`,
  ]);
});

test("extractTree writes files that export-ignore would leave out of an archive", () => {
  write(repo, ".gitattributes", "secret.md export-ignore\n");
  write(repo, "secret.md", "Zed\n");
  run("add", "-A");
  commit("hidden from archives");
  const folder = mkdtempSync(path.join(root, "tree-"));
  extractTree(repo, "HEAD", folder);
  assert.equal(existsSync(path.join(folder, "secret.md")), true);
  assert.deepEqual(scanFolder({ folder, base, denyPatterns: deny }).sort(), [
    "secret.md:1: deny-list #2",
    "src/i18n.ts:1: cyrillic",
  ]);
});

test("history: a merge that adds its own file is judged; the merged commits are judged one by one", () => {
  run("checkout", "-q", "-b", "side", "upstream");
  write(repo, "src/side.ts", `// ${CYR}\n`);
  run("add", "-A");
  commit("side");
  const side = run("rev-parse", "--short=9", "HEAD");
  run("checkout", "-q", "main");
  run("merge", "-q", "--no-ff", "--no-commit", "side");
  write(repo, "src/evil.ts", "// Zed\n");
  run("add", "-A");
  commit("merge side");
  const merge = run("rev-parse", "--short=9", "HEAD");
  run("branch", "-D", "side");
  assert.deepEqual(
    scanHistory({ repo, range: "main ^upstream", base, denyPatterns: deny }).sort(),
    [`${merge} src/evil.ts:1: deny-list #2`, `${side} src/side.ts:1: cyrillic`].sort(),
  );
});

test("cli: --history fails closed without a deny-list; --message refuses a denied name", () => {
  const home = mkdtempSync(path.join(root, "home-"));
  const env = { ...process.env, HIZURI_HOME: home };
  const history = spawnSync(
    process.execPath,
    [GUARD, "--history", "upstream..HEAD", "--base", "upstream"],
    { cwd: repo, env },
  );
  assert.equal(history.status, 2);
  assert.match(history.stderr.toString(), /no deny-list/);
  write(home, "personal/publish/deny-list.txt", "word:zed\n");
  const file = path.join(root, "MSG_DENY");
  writeFileSync(file, "Fix\n\nAsked by Zed\n");
  const message = spawnSync(process.execPath, [GUARD, "--message", file], { cwd: repo, env });
  assert.equal(message.status, 1);
  assert.match(message.stderr.toString(), /message:3: deny-list #1/);
  assert.doesNotMatch(message.stderr.toString(), /zed/i);
});

test("cli: a broken settings file stops the guard without quoting it", () => {
  const home = mkdtempSync(path.join(root, "home-"));
  write(home, "personal/publish/deny-list.txt", "word:zed\n");
  write(home, "personal/settings.json", '{"env": {"PASEO_USER_NAME": "Zed"');
  const env = { ...process.env, HIZURI_HOME: home };
  const tree = spawnSync(process.execPath, [GUARD, "--tree", "--base", "upstream"], {
    cwd: repo,
    env,
  });
  assert.equal(tree.status, 2);
  assert.match(tree.stderr.toString(), /not a settings JSON file/);
  assert.doesNotMatch(tree.stderr.toString(), /zed/i);
});

test("cli: --message refuses a Cyrillic line and passes a clean message", () => {
  const home = mkdtempSync(path.join(root, "home-"));
  const env = { ...process.env, HIZURI_HOME: home };
  const file = path.join(root, "COMMIT_EDITMSG");
  writeFileSync(file, "Voice: stop on time\n\nThe gate waits for the pause.\n");
  const clean = spawnSync(process.execPath, [GUARD, "--message", file], { cwd: repo, env });
  assert.equal(clean.status, 0, clean.stderr.toString());
  writeFileSync(file, `Voice: stop on time\n\n${CYR}\n`);
  const dirty = spawnSync(process.execPath, [GUARD, "--message", file], { cwd: repo, env });
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr.toString(), /message:3: cyrillic/);
});

test("a line any public base ref has passes (upstream may drop lines the fork still carries)", () => {
  run("checkout", "-q", "-b", "older", "upstream");
  write(repo, "docs/old.md", "Zed was here\n");
  run("add", "-A");
  commit("older upstream line");
  run("checkout", "-q", "main");
  const folder = mkdtempSync(path.join(root, "tree-"));
  write(folder, "docs/old.md", "Zed was here\nZed again\n");
  const both = publicBase(repo, ["upstream", "older"]);
  assert.deepEqual(scanFolder({ folder, base: both, denyPatterns: deny }), [
    "docs/old.md:2: deny-list #2",
  ]);
});

// The files map (scripts/files-map.mjs), each test in its own repo: upstream/main is Paseo there.
const NOTE = "Paseo's files here: the app's helpers, kept as upstream has them.";
const own = (rel, what = "A helper") =>
  `- \`${rel}\` — ${what}. Why: the app imports it. ${CHECKED}`;
const paseo = (rel) => `- \`${rel}\` — ${PASEO_LINE}`;

function mapRepo() {
  const dir = mkdtempSync(path.join(root, "map-"));
  const git = (...args) =>
    execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" })
      .toString()
      .trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "dev");
  git("config", "user.email", "dev@example.com");
  write(dir, "src/a.ts", "export const a = 1;\n");
  write(dir, "src/b.ts", "export const b = 2;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "paseo");
  git("update-ref", "refs/remotes/upstream/main", "HEAD");
  const map = (lines) => write(dir, "FILES.md", ["# Files", "", ...lines, ""].join("\n"));
  const guard = () =>
    spawnSync(process.execPath, [GUARD, "--staged", "--no-secret-scan", "--deny", "/dev/null"], {
      cwd: dir,
      env: { ...process.env, HIZURI_HOME: dir },
    });
  return { dir, git, map, guard };
}

const header = (folder) => `## \`${folder}\``;

test("files map: line kinds; a line without a reason or the mark is bad", () => {
  assert.equal(classify(PASEO_LINE).kind, "paseo");
  assert.equal(classify(`The face page. Why: the app loads it. ${CHECKED}`).kind, "own");
  assert.equal(classify("Clips of a face. personal: must leave the repo").kind, "personal");
  assert.equal(classify("not checked: write it").kind, "stub");
  assert.equal(classify(`The face page. ${CHECKED}`).kind, "bad");
  assert.equal(classify("The face page. Why: the app loads it.").kind, "bad");
  assert.equal(classify(`<what it holds>. Why: <what uses it>. ${CHECKED}`).kind, "bad");
});

test("files map: checkMap names missing, gone, doubled, misplaced, stub and personal lines", () => {
  const text = [
    "# Files",
    header("./"),
    own("FILES.md", "This map"),
    own("src/a.ts"),
    header("src/"),
    own("src/a.ts"),
    own("src/gone.ts"),
    "- `src/c.ts` — not checked: write it",
    "- `src/d.ts` — Faces. personal: must leave the repo",
  ].join("\n");
  const problems = checkMap({
    text,
    tracked: ["FILES.md", "src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"],
    identical: null,
  }).map((problem) => problem.message);
  assert.match(problems.join("\n"), /src\/a\.ts belongs under "## `src\/`"/);
  assert.match(problems.join("\n"), /src\/a\.ts is listed twice/);
  assert.match(problems.join("\n"), /src\/gone\.ts is not in the repo: delete its line/);
  assert.match(problems.join("\n"), /src\/c\.ts is not checked/);
  assert.match(problems.join("\n"), /src\/d\.ts is personal and must leave the repo/);
  assert.match(
    problems.join("\n"),
    /no line for src\/b\.ts; add under "## `src\/`": - `src\/b\.ts` — <what it holds>\. Why: <what uses it>\./,
  );
});

test("files map: a Paseo line needs its folder's note and must equal Paseo's file", () => {
  const tracked = ["src/a.ts", "src/b.ts"];
  const lines = [header("src/"), paseo("src/a.ts"), paseo("src/b.ts")];
  const without = checkMap({ text: lines.join("\n"), tracked, identical: new Set(tracked) });
  assert.equal(without.length, 2);
  assert.match(without[0].message, /needs a note "Paseo's files here:/);
  const text = [header("src/"), NOTE, paseo("src/a.ts"), paseo("src/b.ts")].join("\n");
  assert.deepEqual(checkMap({ text, tracked, identical: new Set(tracked) }), []);
  const changed = checkMap({ text, tracked, identical: new Set(["src/a.ts"]) });
  assert.equal(changed.length, 1);
  assert.match(changed[0].message, /src\/b\.ts differs from Paseo's/);
});

test("files map: updateMap adds Paseo and stub lines, drops gone ones, sorts by folder", () => {
  const text = [
    "# Files",
    "",
    header("src/"),
    NOTE,
    "",
    paseo("src/b.ts"),
    own("src/gone.ts"),
  ].join("\n");
  const { text: out, changes } = updateMap({
    text,
    tracked: ["src/a.ts", "src/b.ts", "src/new.ts", "README.md"],
    identical: new Set(["src/a.ts"]),
  });
  assert.deepEqual(changes, {
    added: ["src/a.ts", "src/new.ts", "README.md"],
    dropped: ["src/gone.ts"],
    stubbed: ["src/b.ts"],
  });
  const map = parseMap(out);
  assert.deepEqual(
    map.entries.map((entry) => [entry.rel, classify(entry.text).kind]),
    [
      ["README.md", "stub"],
      ["src/a.ts", "paseo"],
      ["src/b.ts", "stub"],
      ["src/new.ts", "stub"],
    ],
  );
  assert.deepEqual(map.notes.get("src/"), [NOTE]);
  assert.equal(
    updateMap({ text: out, tracked: ["src/a.ts"], identical: null }).changes.added.length,
    0,
  );
});

test("files map: the guard refuses a new file without its line and passes once it has one", () => {
  const { dir, git, map, guard } = mapRepo();
  map([
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
    paseo("src/b.ts"),
  ]);
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
  git("commit", "-q", "-m", "map");
  write(dir, "src/new.ts", "export const n = 3;\n");
  git("add", "-A");
  const refused = guard();
  assert.equal(refused.status, 1);
  assert.match(
    refused.stderr.toString(),
    /\(files map\): FILES\.md: no line for src\/new\.ts; add under "## `src\/`": - `src\/new\.ts` — /,
  );
  map([
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
    paseo("src/b.ts"),
    own("src/new.ts"),
  ]);
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
  git("commit", "-q", "-m", "new");
  git("rm", "-q", "src/new.ts");
  const deleted = guard();
  assert.equal(deleted.status, 1);
  assert.match(deleted.stderr.toString(), /src\/new\.ts is not in the repo: delete its line/);
});

test("files map: editing a Paseo file makes its Paseo line false; Paseo's own newer file passes", () => {
  const { dir, git, map, guard } = mapRepo();
  map([
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
    paseo("src/b.ts"),
  ]);
  git("add", "-A");
  git("commit", "-q", "-m", "map");
  write(dir, "src/a.ts", "export const a = 10;\n");
  git("add", "-A");
  const refused = guard();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr.toString(), /src\/a\.ts differs from Paseo's/);
  git("reset", "-q", "--hard");
  git("checkout", "-q", "-b", "paseo-next", "upstream/main");
  write(dir, "src/a.ts", "export const a = 10;\n");
  git("commit", "-q", "-am", "paseo moves on");
  git("update-ref", "refs/remotes/upstream/main", "HEAD");
  git("checkout", "-q", "main");
  write(dir, "src/a.ts", "export const a = 10;\n");
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
});

test("files map: a tree without the map is not judged by it", () => {
  const { dir, git, guard } = mapRepo();
  write(dir, "src/new.ts", "export const n = 3;\n");
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
});

test("files map: --list-unlisted --history names every path ever committed outside the map", () => {
  const { dir, git, map } = mapRepo();
  git("checkout", "-q", "-b", "work");
  write(dir, "notes/draft.md", "a draft\n");
  git("add", "-A");
  git("commit", "-q", "-m", "draft");
  git("rm", "-q", "notes/draft.md");
  write(dir, "src/kept.ts", "export const k = 1;\n");
  write(dir, "src/stub.ts", "export const s = 1;\n");
  map([
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
    paseo("src/b.ts"),
    own("src/kept.ts"),
    "- `src/stub.ts` — not checked: write it",
  ]);
  git("add", "-A");
  git("commit", "-q", "-m", "work");
  assert.deepEqual(listUnlisted({ repo: dir, ref: "work" }), ["src/stub.ts"]);
  assert.deepEqual(
    listUnlisted({ repo: dir, ref: "work", history: ["--all", "--not", "--remotes=upstream"] }),
    ["notes/draft.md", "src/stub.ts"],
  );
});

test("files map: an older stub waits for --check; a new file needs a finished line", () => {
  const { dir, git, map, guard } = mapRepo();
  const stub = "- `src/b.ts` — not checked: write it";
  const lines = [
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
  ];
  map([...lines, stub]);
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
  git("commit", "-q", "-m", "map with a stub");
  write(dir, "src/b.ts", "export const b = 20;\n");
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
  write(dir, "src/c.ts", "export const c = 3;\n");
  map([...lines, stub, "- `src/c.ts` — not checked: write it"]);
  git("add", "-A");
  const added = guard();
  assert.equal(added.status, 1);
  assert.match(added.stderr.toString(), /src\/c\.ts is not checked/);
  assert.doesNotMatch(added.stderr.toString(), /src\/b\.ts/);
  map([...lines, stub.replace("not checked: write it", "B. Why"), own("src/c.ts")]);
  git("add", "-A");
  const broken = guard();
  assert.equal(broken.status, 1);
  assert.match(broken.stderr.toString(), /src\/b\.ts: the line does not end with/);
});

test("files map: a Paseo line naming a public path passes the deny-list; a new line does not", () => {
  const { dir, git, map } = mapRepo();
  // Built at run time: the literal name would trip a real deny-list on this very file.
  const name = ["a", "2x"].join("@");
  const denyFile = path.join(dir, "..", `${path.basename(dir)}-deny.txt`);
  writeFileSync(denyFile, `${name}\n`);
  const guard = () =>
    spawnSync(process.execPath, [GUARD, "--staged", "--no-secret-scan", "--deny", denyFile], {
      cwd: dir,
      env: { ...process.env, HIZURI_HOME: dir },
    });
  git("checkout", "-q", "upstream/main");
  write(dir, `src/${name}.ts`, "export const icon = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "paseo file with a denied-looking name");
  git("update-ref", "refs/remotes/upstream/main", "HEAD");
  git("checkout", "-q", "-B", "main");
  const lines = [header("./"), own("FILES.md", "This map"), header("src/"), NOTE];
  map([...lines, paseo("src/a.ts"), paseo(`src/${name}.ts`), paseo("src/b.ts")]);
  git("add", "-A");
  assert.equal(guard().status, 0, guard().stderr.toString());
  map([...lines, paseo("src/a.ts"), own(`src/${name}.ts`, "An icon"), paseo("src/b.ts")]);
  git("add", "-A");
  const ownLine = guard();
  assert.equal(ownLine.status, 1);
  assert.match(ownLine.stderr.toString(), /FILES\.md:\d+: deny-list #1/);
});

test("files map: removing an untouched file's line is refused; a merged hizuri branch is not Paseo", () => {
  const { dir, git, map, guard } = mapRepo();
  const lines = [
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
  ];
  map([...lines, paseo("src/b.ts")]);
  git("add", "-A");
  git("commit", "-q", "-m", "map");
  map(lines);
  git("add", "-A");
  const removed = guard();
  assert.equal(removed.status, 1);
  assert.match(removed.stderr.toString(), /no line for src\/b\.ts/);
  git("reset", "-q", "--hard");
  git("checkout", "-q", "-b", "side");
  write(dir, "src/a.ts", "export const a = 99;\n");
  git("commit", "-q", "-am", "a hizuri edit on a side branch");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-commit", "--no-ff", "side");
  const merged = guard();
  assert.equal(merged.status, 1);
  assert.match(merged.stderr.toString(), /src\/a\.ts differs from Paseo's/);
  git("merge", "--abort");
});

test("files map: --history lists a personal path even when Paseo once had it", () => {
  const { dir, git, map } = mapRepo();
  write(dir, "src/b.ts", "export const b = 'about one person';\n");
  map([
    header("./"),
    own("FILES.md", "This map"),
    header("src/"),
    NOTE,
    paseo("src/a.ts"),
    "- `src/b.ts` — A note about one person. personal: must leave the repo",
  ]);
  git("add", "-A");
  git("commit", "-q", "-m", "ours");
  const listed = listUnlisted({
    repo: dir,
    ref: "main",
    history: ["--all", "--not", "--remotes=upstream"],
  });
  assert.deepEqual(listed, ["src/b.ts"]);
});

test("models and avatars: refused by extension and by their bytes; the public base's copy passes", () => {
  write(repo, "assets/mouth.onnx", "onnx-weights");
  write(repo, "assets/face.glb", "glb-avatar");
  write(repo, "assets/weights.dat", "GGUF\u0003\u0000\u0000\u0000model");
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny }).sort(), [
    "assets/face.glb: model or avatar file not in the public base",
    "assets/mouth.onnx: model or avatar file not in the public base",
    "assets/weights.dat: a model or avatar by its bytes",
  ]);
  const header = Buffer.from('{"w":{"dtype":"F32"}}');
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(header.length));
  assert.equal(modelMagic(Buffer.concat([size, header, Buffer.alloc(16)])), true);
  assert.equal(modelMagic(Buffer.from("PNG-a-screenshot")), false);
  run("reset", "-q", "--hard", "upstream");
  write(repo, "assets/vad.onnx", "public-vad");
  run("add", "-A");
  commit("upstream model");
  const withModel = publicBase(repo, ["HEAD"]);
  run("reset", "-q", "--hard", "upstream");
  write(repo, "assets/vad.onnx", "public-vad");
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base: withModel, denyPatterns: deny }), []);
});

test("the user's own files: same bytes, a long line of their skill, a path through their skill", () => {
  const own = path.join(root, "own");
  const proseLine =
    "Every phrase the user speaks is answered by the assistant in the order it came";
  write(own, "skills/secret-skill/SKILL.md", `# A skill\n\n${proseLine}\n`);
  write(own, "skills/shipped-skill/SKILL.md", "# Another\n");
  write(own, "setup/modules/stt.ts", "export const endpoint = 1;\n");
  write(own, "setup/fonts/Font-OFL.txt", `${proseLine} under the font licence\n`);
  write(own, "setup/.gitkeep", "");
  const fingerprints = loadFingerprints({
    skillDirs: [path.join(own, "skills")],
    fileDirs: [path.join(own, "setup")],
    publicSkills: new Set(["shipped-skill"]),
    cacheFile: path.join(root, "cache", "fingerprints.json"),
  });
  write(repo, "src/stt.ts", "export const endpoint = 1;\n");
  write(repo, "docs/notes.md", `- ${proseLine}\n`);
  write(repo, "plugin/skills/secret-skill/README.md", "renamed copy\n");
  write(repo, "plugin/skills/shipped-skill/SKILL.md", "# Another, for users\n");
  write(repo, "keep/.gitkeep", "");
  run("add", "-A");
  assert.deepEqual(scanStaged({ repo, base, denyPatterns: deny, fingerprints }).sort(), [
    "docs/notes.md:1: text of the user's own skills or notes",
    "plugin/skills/secret-skill/README.md: a skill of the user's own (secret-skill)",
    "src/stt.ts: the same bytes as one of the user's own files",
  ]);
  // The cache keeps the blob ids: a second load gives the same fingerprints.
  const again = loadFingerprints({
    skillDirs: [path.join(own, "skills")],
    fileDirs: [path.join(own, "setup")],
    cacheFile: path.join(root, "cache", "fingerprints.json"),
  });
  assert.deepEqual([...again.blobs.keys()].sort(), [...fingerprints.blobs.keys()].sort());
});
