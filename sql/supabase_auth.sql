-- Metadados privados dos usuários do aplicativo.
-- As contas/senhas ficam em auth.users, administradas pelo Supabase Auth.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'blocked')),
  password_reset_offered BOOLEAN NOT NULL DEFAULT FALSE,
  password_change_required BOOLEAN NOT NULL DEFAULT TRUE,
  legacy_id INTEGER UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_reset_offered BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN NOT NULL DEFAULT TRUE;

-- Permite bloquear e desbloquear acessos sem apagar a conta.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'blocked'));

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Não há policy pública de leitura ou escrita; cada usuário só pode ler
-- o próprio perfil. Operações administrativas passam pelo backend.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users read own profile'
  ) THEN
    CREATE POLICY "Users read own profile" ON public.profiles
      FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Migração de 21/09/2026: a partir de hoje, TODO usuário (inclusive admin)
-- deve trocar a senha no primeiro acesso. Esta atualização marca todos os
-- perfis como "primeiro acesso"; a flag é desligada automaticamente quando o
-- usuário conclui a troca pelo aplicativo. Execute no SQL Editor do Supabase.
-- ---------------------------------------------------------------------------
UPDATE public.profiles
SET password_change_required = TRUE,
    password_reset_offered = FALSE;
