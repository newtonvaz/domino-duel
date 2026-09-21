-- Schema SQLite usado pelo Dominó do Torres.
-- O banco de produção/local está em:
-- /Volumes/Pendrive002/db_domino/dominoduelpro.sqlite
-- O SQLite armazena datas como texto; a API grava explicitamente em
-- America/Recife (UTC-03:00). Os defaults abaixo mantêm o mesmo padrão.

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  photo TEXT,
  created_at TEXT DEFAULT (datetime('now', '-3 hours'))
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  date TEXT DEFAULT (datetime('now', '-3 hours')),
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  score_a INTEGER NOT NULL,
  score_b INTEGER NOT NULL,
  winner TEXT NOT NULL,
  buchuda INTEGER NOT NULL DEFAULT 0,
  buchuda_de_re INTEGER NOT NULL DEFAULT 0,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', '-3 hours'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  created_at TEXT DEFAULT (datetime('now', '-3 hours'))
);
