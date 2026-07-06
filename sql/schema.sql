-- Execute este SQL no SQL Editor do Supabase Dashboard

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ DEFAULT NOW(),
  team_a TEXT[] NOT NULL,
  team_b TEXT[] NOT NULL,
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL,
  winner TEXT NOT NULL,
  buchuda BOOLEAN DEFAULT FALSE,
  buchuda_de_re BOOLEAN DEFAULT FALSE,
  duration_sec INTEGER
);
