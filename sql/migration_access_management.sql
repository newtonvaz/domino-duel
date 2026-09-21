-- Migração do gerenciamento de acesso.
-- Execute uma vez no SQL Editor do Supabase em projetos já existentes.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'blocked'));
