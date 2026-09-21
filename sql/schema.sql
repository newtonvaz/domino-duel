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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES ('modo_buchuda', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- O aplicativo usa a chave publishable/anon somente para leitura.
-- Se o RLS estiver ativado no projeto, estas policies permitem essa leitura.
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'players'
      AND policyname = 'Public read players'
  ) THEN
    CREATE POLICY "Public read players" ON public.players
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'matches'
      AND policyname = 'Public read matches'
  ) THEN
    CREATE POLICY "Public read matches" ON public.matches
      FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'settings'
      AND policyname = 'Public read settings'
  ) THEN
    CREATE POLICY "Public read settings" ON public.settings
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;
