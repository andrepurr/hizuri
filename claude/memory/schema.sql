-- hizuri memory: every session's dialogue and the user's own notes, searchable by words.
-- Applied by `hizuri-memory up` on every start; each statement is safe to run again.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- One row per transcript file: how far it has been read, so a sync reads only new lines.
CREATE TABLE IF NOT EXISTS sources (
  path text PRIMARY KEY,
  offset_bytes bigint NOT NULL DEFAULT 0,
  line_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- What the user and the agent said. A typed phrase's id is "m<id>"; a spoken one keeps the
-- daemon's phrase id ("p…") in voice_id.
CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  session_id text NOT NULL,
  source text NOT NULL,
  line_no integer NOT NULL,
  part smallint NOT NULL DEFAULT 0,
  at timestamptz,
  speaker text NOT NULL CHECK (speaker IN ('user', 'agent')),
  channel text NOT NULL CHECK (channel IN ('typed', 'spoken', 'chat', 'speech')),
  sidechain boolean NOT NULL DEFAULT false,
  voice_id text,
  project text,
  body text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', body)) STORED,
  UNIQUE (source, line_no, part)
);
CREATE INDEX IF NOT EXISTS messages_tsv ON messages USING gin (tsv);
CREATE INDEX IF NOT EXISTS messages_trgm ON messages USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS messages_at ON messages (at);
CREATE INDEX IF NOT EXISTS messages_session ON messages (session_id, line_no, part);
CREATE INDEX IF NOT EXISTS messages_voice ON messages (voice_id) WHERE voice_id IS NOT NULL;

-- array_to_string is only STABLE, and a generated column takes IMMUTABLE functions alone.
CREATE OR REPLACE FUNCTION hizuri_words(text[]) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT array_to_string($1, ' ') $$;

-- The user's own memory, kept by the agent: facts, notes, tasks, people, places.
CREATE TABLE IF NOT EXISTS notes (
  id bigserial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'note',
  title text,
  body text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  due date,
  done_at timestamptz,
  source_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || body || ' ' || hizuri_words(tags))
  ) STORED
);
CREATE INDEX IF NOT EXISTS notes_tsv ON notes USING gin (tsv);
CREATE INDEX IF NOT EXISTS notes_trgm ON notes USING gin (body gin_trgm_ops);
CREATE INDEX IF NOT EXISTS notes_kind ON notes (kind, done_at);
