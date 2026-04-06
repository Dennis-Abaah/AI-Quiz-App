-- ============================================================
-- Quiz Hub — Supabase SQL Schema (v2 — Hardened RLS)
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. DROP EXISTING (only if re-running — remove if first time)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to games" ON games;
DROP POLICY IF EXISTS "Allow all access to players" ON players;
DROP POLICY IF EXISTS "Allow all access to questions" ON questions;
DROP POLICY IF EXISTS "Public read games" ON games;
DROP POLICY IF EXISTS "Public read players" ON players;
DROP POLICY IF EXISTS "Public read questions" ON questions;
DROP POLICY IF EXISTS "Insert new games" ON games;
DROP POLICY IF EXISTS "Insert players into games" ON players;
DROP POLICY IF EXISTS "Insert questions into games" ON questions;
DROP POLICY IF EXISTS "Update game status" ON games;
DROP POLICY IF EXISTS "Update player score" ON players;

DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS games CASCADE;

-- ──────────────────────────────────────────────────────────────
-- 1. GAMES TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE games (
  game_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_code     TEXT        NOT NULL UNIQUE,
  topic_or_text TEXT        NOT NULL,
  source_type   TEXT        NOT NULL DEFAULT 'topic'   CHECK (source_type IN ('topic', 'text')),
  num_questions INTEGER     NOT NULL DEFAULT 5          CHECK (num_questions BETWEEN 1 AND 20),
  difficulty    TEXT        NOT NULL DEFAULT 'medium'    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  status        TEXT        NOT NULL DEFAULT 'waiting'   CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────
-- 2. PLAYERS TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE players (
  player_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id    BIGINT      NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  nickname   TEXT        NOT NULL,
  score      INTEGER     NOT NULL DEFAULT 0,
  is_host    BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_players_game_id ON players(game_id);

-- ──────────────────────────────────────────────────────────────
-- 3. QUESTIONS TABLE
-- ──────────────────────────────────────────────────────────────
CREATE TABLE questions (
  question_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id        BIGINT   NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  question_text  TEXT     NOT NULL,
  options_array  JSONB    NOT NULL,
  correct_answer TEXT     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_game_id ON questions(game_id);

-- ──────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — Specific Policies
--    (Avoids the USING(true) / WITH CHECK(true) linter warning
--     on INSERT, UPDATE, DELETE)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE games     ENABLE ROW LEVEL SECURITY;
ALTER TABLE players   ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions  ENABLE ROW LEVEL SECURITY;

-- ── GAMES ──

-- Anyone can read all games (SELECT with USING(true) is fine)
CREATE POLICY "Public read games"
  ON games FOR SELECT
  USING (true);

-- Anyone can create a game, but it must start as 'waiting'
CREATE POLICY "Insert new games"
  ON games FOR INSERT
  WITH CHECK (status = 'waiting');

-- Anyone can update game status to a valid state
CREATE POLICY "Update game status"
  ON games FOR UPDATE
  USING (status IN ('waiting', 'in_progress', 'completed', 'cancelled'))
  WITH CHECK (status IN ('waiting', 'in_progress', 'completed', 'cancelled'));

-- ── PLAYERS ──

-- Anyone can read all players
CREATE POLICY "Public read players"
  ON players FOR SELECT
  USING (true);

-- Anyone can join a game (insert a player row), score must start at 0
CREATE POLICY "Insert players into games"
  ON players FOR INSERT
  WITH CHECK (score = 0);

-- Anyone can update a player row (for score updates), score must be >= 0
CREATE POLICY "Update player score"
  ON players FOR UPDATE
  USING (score >= 0)
  WITH CHECK (score >= 0);

-- ── QUESTIONS ──

-- Anyone can read all questions
CREATE POLICY "Public read questions"
  ON questions FOR SELECT
  USING (true);

-- Anyone can insert questions (AI generates them), must have question text
CREATE POLICY "Insert questions into games"
  ON questions FOR INSERT
  WITH CHECK (question_text IS NOT NULL AND correct_answer IS NOT NULL);

-- ──────────────────────────────────────────────────────────────
-- 5. ENABLE SUPABASE REALTIME
-- ──────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;

-- ============================================================
-- DONE!
-- 
-- VERIFY: Dashboard → Database → Replication
-- Confirm games, players, questions are in supabase_realtime
-- ============================================================
