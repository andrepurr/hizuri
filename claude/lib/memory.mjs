// hizuri memory: one Postgres in one container per user, fed from Claude Code's own transcripts.
import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  CLAUDE_DIR,
  HIZURI_HOME,
  PLUGIN_ROOT,
  containerState,
  die,
  engineRun,
  ensureDir,
  lit,
  memoryConfig,
  saveMemoryConfig,
  sql,
  timeZone,
} from "./hizuri.mjs";

const SCHEMA = path.join(PLUGIN_ROOT, "memory", "schema.sql");
const LOCK = path.join(HIZURI_HOME, "memory-sync.lock");
// One sync reads at most this much new transcript per file, so the first run on a large history
// finishes in steps; each run continues where the last one stopped.
const CHUNK_BYTES = 64 * 1024 * 1024;
const MAX_BODY = 20000;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Creates or starts the container, waits for Postgres and applies the schema. */
export function up({ quiet = false } = {}) {
  const config = memoryConfig();
  const log = (line) => quiet || process.stdout.write(`${line}\n`);
  const state = containerState(config);
  if (state === "no-engine") {
    die("hizuri memory: install docker or podman first (one Postgres container holds the memory)");
  }
  if (state === "missing") {
    const data = ensureDir(path.join(HIZURI_HOME, "postgres"));
    const secrets = ensureDir(path.join(HIZURI_HOME, "secrets"));
    const passwordFile = path.join(secrets, "memory-password");
    if (!existsSync(passwordFile)) {
      writeFileSync(passwordFile, randomBytes(24).toString("base64url"), { mode: 0o600 });
    }
    log(`hizuri memory: creating container ${config.container} (${config.image})`);
    const r = engineRun(
      config,
      [
        "run",
        "-d",
        "--name",
        config.container,
        "--restart",
        "unless-stopped",
        "-p",
        `127.0.0.1:${config.port}:5432`,
        "-e",
        `POSTGRES_USER=${config.user}`,
        "-e",
        `POSTGRES_DB=${config.db}`,
        "-e",
        "POSTGRES_PASSWORD_FILE=/run/hizuri/memory-password",
        "-v",
        `${secrets}:/run/hizuri:ro`,
        "-v",
        `${data}:/var/lib/postgresql/data`,
        config.image,
      ],
      { stdio: quiet ? "pipe" : "inherit" },
    );
    if (r.status !== 0) die(`hizuri memory: could not create the container: ${r.stderr ?? ""}`);
    saveMemoryConfig(config);
  } else if (state !== "running") {
    log(`hizuri memory: starting container ${config.container}`);
    const r = engineRun(config, ["start", config.container]);
    if (r.status !== 0) die(`hizuri memory: could not start the container: ${r.stderr}`);
  }
  // The image's first start runs its init step on a temporary server, then restarts once: ready
  // means three answers in a row, a second apart. Then the schema goes in, and its errors show.
  let answers = 0;
  for (let i = 0; i < 180 && answers < 3; i++) {
    const r = engineRun(config, [
      "exec",
      config.container,
      "psql",
      "-X",
      "-q",
      "-U",
      config.user,
      "-d",
      config.db,
      "-c",
      "SELECT 1",
    ]);
    answers = r.status === 0 ? answers + 1 : 0;
    sleep(1000);
  }
  if (answers < 3) die("hizuri memory: Postgres did not become ready within three minutes");
  sql(readFileSync(SCHEMA, "utf8"), { config, rows: false });
  log(`hizuri memory: ready (container ${config.container}, 127.0.0.1:${config.port})`);
  return config;
}

/** Every transcript Claude Code keeps: main sessions and their subagents. */
function transcripts() {
  const root = path.join(CLAUDE_DIR, "projects");
  const out = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
const SPOKEN = /<spoken-input\b([^>]*)>([\s\S]*?)<\/spoken-input>/g;

function textOf(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((b) => b && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text);
}

function userRows(content) {
  const rows = [];
  for (const raw of textOf(content)) {
    const text = raw.replace(REMINDER, "").trim();
    if (!text || /^<(local-command|command-|task-notification)/.test(text)) continue;
    const spoken = [...text.matchAll(SPOKEN)];
    if (spoken.length === 0) {
      rows.push({ speaker: "user", channel: "typed", voiceId: null, body: text });
      continue;
    }
    for (const m of spoken) {
      const voiceId = /\bid="([^"]+)"/.exec(m[1] ?? "")?.[1] ?? null;
      const body = (m[2] ?? "").trim();
      if (body) rows.push({ speaker: "user", channel: "spoken", voiceId, body });
    }
  }
  return rows;
}

function agentRows(content) {
  const rows = [];
  for (const text of textOf(content)) {
    if (text.trim())
      rows.push({ speaker: "agent", channel: "chat", voiceId: null, body: text.trim() });
  }
  const speaks = Array.isArray(content)
    ? content.filter((b) => b?.type === "tool_use" && (b.name ?? "").endsWith("__speak"))
    : [];
  for (const b of speaks) {
    // Emotion and motion tags such as [happy] or [motion:greet] are for the avatar, not words.
    const body =
      typeof b.input?.text === "string"
        ? b.input.text.replace(/\[[a-z]+(?::[a-z-]+)?\]\s*/g, "").trim()
        : "";
    if (body) rows.push({ speaker: "agent", channel: "speech", voiceId: null, body });
  }
  return rows;
}

/** The rows one transcript line yields: what the user typed or said, what the agent wrote or spoke. */
export function rowsOfLine(record) {
  if (!record || record.isMeta) return [];
  let rows = [];
  if (record.type === "user") rows = userRows(record.message?.content);
  else if (record.type === "assistant") rows = agentRows(record.message?.content);
  const at = typeof record.timestamp === "string" ? record.timestamp : null;
  const sidechain = record.isSidechain === true;
  for (const row of rows) {
    row.at = at;
    row.sidechain = sidechain;
    row.body = row.body.slice(0, MAX_BODY);
  }
  return rows;
}

function csvField(value) {
  if (value === null || value === undefined) return "";
  const s = String(value)
    .replaceAll("\0", "")
    .replace(/^\\\.$/gm, "\\ .");
  return `"${s.replace(/"/g, '""')}"`;
}

function readNew(file, from) {
  const size = statSync(file).size;
  if (size <= from) return { text: "", end: size < from ? 0 : from, reset: size < from };
  const length = Math.min(size - from, CHUNK_BYTES);
  const buffer = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, length, from);
  } finally {
    closeSync(fd);
  }
  // Only complete lines: a line still being written waits for the next sync.
  const lastNewline = buffer.lastIndexOf(0x0a);
  if (lastNewline < 0) return { text: "", end: from, reset: false };
  return {
    text: buffer.subarray(0, lastNewline + 1).toString("utf8"),
    end: from + lastNewline + 1,
    reset: false,
  };
}

function takeLock() {
  ensureDir(HIZURI_HOME);
  try {
    writeFileSync(LOCK, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    const pid = Number(readFileSync(LOCK, "utf8"));
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      writeFileSync(LOCK, String(process.pid));
      return true;
    }
  }
}

/** Indexes every new transcript line; returns how many rows were added. */
export function sync({ quiet = false } = {}) {
  // Memory is set up once by `hizuri-memory up` (the installer runs it); a sync never creates it.
  if (memoryConfig().fresh) {
    if (!quiet) die("hizuri memory: not set up yet; run hizuri-memory up");
    return 0;
  }
  if (!takeLock()) return 0;
  try {
    const config = containerState() === "running" ? memoryConfig() : up({ quiet: true });
    const offsets = new Map(
      sql("SELECT path, offset_bytes, line_count FROM sources").map(([p, o, n]) => [
        p,
        { from: Number(o), lines: Number(n) },
      ]),
    );
    let added = 0;
    for (const file of transcripts()) {
      const known = offsets.get(file) ?? { from: 0, lines: 0 };
      const chunk = readNew(file, known.from);
      if (!chunk.text && !chunk.reset) continue;
      // A transcript only grows; one that shrank was replaced and is read again from the top.
      const start = chunk.reset ? 0 : known.lines;
      const lines = chunk.text ? chunk.text.split("\n").length - 1 : 0;
      const session = path.basename(file, ".jsonl");
      const project = path.basename(
        path.dirname(file.includes("/subagents/") ? path.dirname(path.dirname(file)) : file),
      );
      const csv = [];
      chunk.text.split("\n").forEach((line, i) => {
        if (!line.trim()) return;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          return;
        }
        const sid = typeof record.sessionId === "string" ? record.sessionId : session;
        rowsOfLine(record).forEach((row, part) => {
          const sidechain = row.sidechain || file.includes("/subagents/");
          csv.push(
            [
              sid,
              file,
              start + i,
              part,
              row.at,
              row.speaker,
              row.channel,
              sidechain,
              row.voiceId,
              project,
              row.body,
            ]
              .map(csvField)
              .join(","),
          );
        });
      });
      const script = [
        "CREATE TEMP TABLE incoming (session_id text, source text, line_no int, part smallint, at timestamptz, speaker text, channel text, sidechain boolean, voice_id text, project text, body text);",
        "COPY incoming FROM STDIN WITH (FORMAT csv);",
        ...csv,
        "\\.",
        "INSERT INTO messages (session_id, source, line_no, part, at, speaker, channel, sidechain, voice_id, project, body) SELECT * FROM incoming ON CONFLICT (source, line_no, part) DO NOTHING;",
        `INSERT INTO sources (path, offset_bytes, line_count) VALUES (${lit(file)}, ${chunk.end}, ${start + lines}) ON CONFLICT (path) DO UPDATE SET offset_bytes = EXCLUDED.offset_bytes, line_count = EXCLUDED.line_count, updated_at = now();`,
        "",
      ].join("\n");
      sql(script, { config, rows: false });
      added += csv.length;
    }
    if (!quiet) process.stdout.write(`hizuri memory: ${added} new rows indexed\n`);
    return added;
  } finally {
    try {
      unlinkSync(LOCK);
    } catch {
      // Another sync took the lock over from a dead process.
    }
  }
}

/** Words to a prefix query: each word matches its own forms (`insur:*` finds “insurance”). */
export function tsQuery(text) {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).slice(0, 12);
  return words.map((w) => `${w}:*`).join(" | ");
}

function clip(text, n) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function phraseId(id, voiceId) {
  return voiceId || `m${id}`;
}

/** The WHERE parts every kind of search shares: subagents, speaker, days in the user's zone. */
function filters(opts, tz) {
  const where = [];
  if (!opts.all) where.push("NOT sidechain");
  if (opts.speaker && opts.speaker !== "all") {
    where.push(`speaker = ${lit(opts.speaker === "user" ? "user" : "agent")}`);
  }
  if (opts.from) where.push(`at >= (${lit(opts.from)}::date::timestamp AT TIME ZONE ${lit(tz)})`);
  if (opts.to) where.push(`at < ((${lit(opts.to)}::date + 1)::timestamp AT TIME ZONE ${lit(tz)})`);
  if (opts.day) where.push(`(at AT TIME ZONE ${lit(tz)})::date = ${lit(opts.day)}::date`);
  return where;
}

/** Searches what was said; returns the hits and the matching notes. */
export function recall(query, opts = {}) {
  const tz = timeZone();
  const k = Math.max(1, Math.min(200, Number(opts.k ?? 8)));
  const where = filters(opts, tz);
  const cols = `id, voice_id, to_char(at AT TIME ZONE ${lit(tz)}, 'YYYY-MM-DD HH24:MI'), speaker, channel, session_id, line_no, body`;
  let script;
  if (opts.exact) {
    where.push(`body ILIKE ${lit(`%${opts.exact.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)}`);
    script = `SELECT ${cols} FROM messages WHERE ${where.join(" AND ")} ORDER BY at DESC LIMIT ${k};`;
  } else if (opts.day && !query) {
    script = `SELECT ${cols} FROM messages WHERE ${where.join(" AND ")} ORDER BY at, line_no, part LIMIT ${k};`;
  } else {
    const tq = tsQuery(query);
    if (!tq) die("hizuri-recall: give some words to search for");
    const match = `(tsv @@ to_tsquery('simple', ${lit(tq)}) OR ${lit(query)} <% body)`;
    where.push(match);
    script = `SET pg_trgm.word_similarity_threshold = 0.5;
SELECT ${cols} FROM messages WHERE ${where.join(" AND ")}
ORDER BY ts_rank(tsv, to_tsquery('simple', ${lit(tq)})) + word_similarity(${lit(query)}, body) DESC, at DESC LIMIT ${k};`;
  }
  const hits = sql(script).map(([id, voiceId, at, speaker, channel, session, line, body]) => ({
    id: phraseId(id, voiceId),
    at,
    speaker,
    channel,
    session,
    line: Number(line),
    body,
  }));
  const notes =
    opts.exact || (opts.day && !query) || opts.speaker === "agent" ? [] : searchNotes(query, 3);
  if (opts.context && hits.length > 0) {
    for (const hit of hits) {
      const n = Math.min(20, Number(opts.context));
      hit.around = sql(
        `SELECT ${cols} FROM messages WHERE session_id = ${lit(hit.session)} AND NOT sidechain
         AND line_no BETWEEN ${hit.line - n * 4} AND ${hit.line + n * 4} ORDER BY line_no, part;`,
      ).map(([id, voiceId, at, speaker, channel, , , body]) => ({
        id: phraseId(id, voiceId),
        at,
        speaker,
        channel,
        body,
      }));
    }
  }
  return { hits, notes };
}

export function formatRecall({ hits, notes }, { context = 0 } = {}) {
  const lines = [];
  for (const n of notes)
    lines.push(`note n${n.id} · ${n.kind}${n.title ? ` · ${n.title}` : ""}: ${clip(n.body, 300)}`);
  for (const h of hits) {
    lines.push(
      `${h.id} · ${h.at} · ${h.speaker} (${h.channel}): ${clip(h.body, context ? 2000 : 400)}  [session ${h.session.slice(0, 8)}]`,
    );
    for (const a of h.around ?? []) {
      if (a.id === h.id) continue;
      lines.push(`    ${a.id} · ${a.at} · ${a.speaker}: ${clip(a.body, 300)}`);
    }
  }
  if (lines.length === 0)
    lines.push(
      "hizuri-recall: nothing found; try other words: the user's words and the result's words",
    );
  return lines.join("\n");
}

export function searchNotes(query, k = 10, kind = null) {
  const tq = query ? tsQuery(query) : "";
  const where = [];
  if (kind) where.push(`kind = ${lit(kind)}`);
  if (tq) where.push(`(tsv @@ to_tsquery('simple', ${lit(tq)}) OR ${lit(query)} <% body)`);
  const order = tq
    ? `ts_rank(tsv, to_tsquery('simple', ${lit(tq)})) DESC, updated_at DESC`
    : "updated_at DESC";
  return sql(
    `SET pg_trgm.word_similarity_threshold = 0.5;
SELECT id, kind, coalesce(title, ''), body, array_to_string(tags, ','), coalesce(due::text, ''), coalesce(done_at::text, '')
FROM notes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ${k};`,
  ).map(([id, kindOut, title, body, tags, due, done]) => ({
    id,
    kind: kindOut,
    title,
    body,
    tags,
    due,
    done,
  }));
}

export function addNote({
  kind = "note",
  title = null,
  body,
  tags = [],
  due = null,
  sources = [],
}) {
  const arr = (list) => `ARRAY[${list.map(lit).join(",")}]::text[]`;
  const [[id]] = sql(
    `INSERT INTO notes (kind, title, body, tags, due, source_ids) VALUES (${lit(kind)}, ${lit(title)}, ${lit(body)}, ${arr(tags)}, ${due ? `${lit(due)}::date` : "NULL"}, ${arr(sources)}) RETURNING id;`,
  );
  return id;
}

export function doneNote(id) {
  sql(
    `UPDATE notes SET done_at = now(), updated_at = now() WHERE id = ${Number(String(id).replace(/^n/, ""))};`,
    { rows: false },
  );
}

export function stats() {
  const [[messages, sessions, first, last, notes, files]] = sql(
    `SELECT (SELECT count(*) FROM messages), (SELECT count(DISTINCT session_id) FROM messages),
            coalesce((SELECT min(at)::date::text FROM messages), '-'), coalesce((SELECT max(at)::date::text FROM messages), '-'),
            (SELECT count(*) FROM notes), (SELECT count(*) FROM sources);`,
  );
  return {
    messages: Number(messages),
    sessions: Number(sessions),
    first,
    last,
    notes: Number(notes),
    files: Number(files),
  };
}
