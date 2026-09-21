#!/usr/bin/env node

/* Importa o backup local para as tabelas do Supabase.
 * Uso:
 *   SUPABASE_URL="https://seu-projeto.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="sua-chave-secreta" \
 *   node tools/import_supabase.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const root = path.resolve(__dirname, '..');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY) antes de executar.');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(path.join(root, 'data', 'backup.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data', 'settings.json'), 'utf8'));
const sqlitePath = path.join(root, 'data', 'dominoduelpro.sqlite');

function localUsers() {
  const sql = 'SELECT id, email, password, role, status, created_at FROM users ORDER BY id';
  return JSON.parse(execFileSync('sqlite3', ['-json', sqlitePath, sql], {encoding: 'utf8'}));
}

async function supabaseRequest(endpoint, options = {}) {
  const response = await fetch(`${supabaseUrl}${endpoint}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch {}
  if (!response.ok) {
    throw new Error(`${endpoint}: HTTP ${response.status} — ${text}`);
  }
  return body;
}

async function upsert(table, rows, conflictColumn) {
  if (!rows.length) return;
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(rows)
    }
  );
  if (!response.ok) {
    throw new Error(`${table}: HTTP ${response.status} — ${await response.text()}`);
  }
  console.log(`${table}: ${rows.length} registro(s) importado(s)`);
}

async function importUsers() {
  const users = localUsers();
  const page = await supabaseRequest('/auth/v1/admin/users?per_page=1000&page=1');
  const existing = Array.isArray(page.users) ? page.users : [];

  for (const user of users) {
    let authUser = existing.find(item => item.email?.toLowerCase() === user.email.toLowerCase());
    const userMetadata = {
      legacy_id: user.id,
      role: user.role,
      status: user.status
    };

    if (!authUser) {
      authUser = await supabaseRequest('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          password_hash: user.password,
          email_confirm: true,
          user_metadata: userMetadata
        })
      });
    } else {
      authUser = await supabaseRequest(`/auth/v1/admin/users/${authUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({email_confirm: true, user_metadata: userMetadata})
      });
    }

    const authId = authUser.id || authUser.user?.id;
    if (!authId) throw new Error(`Não foi possível obter o ID Auth de ${user.email}`);

    await upsert('profiles', [{
      id: authId,
      email: user.email,
      role: user.role,
      status: user.status,
      legacy_id: user.id,
      created_at: user.created_at
    }], 'id');
    console.log(`auth: ${user.email}`);
  }
}

async function main() {
  await upsert('players', (backup.players || []).map(player => ({
    id: player.id,
    name: player.name,
    photo: player.photo || null
  })), 'id');

  await upsert('matches', (backup.matches || []).map(match => ({
    id: match.id,
    date: match.date,
    team_a: match.teamA || match.team_a || [],
    team_b: match.teamB || match.team_b || [],
    score_a: match.scoreA ?? match.score_a ?? 0,
    score_b: match.scoreB ?? match.score_b ?? 0,
    winner: match.winner,
    buchuda: Boolean(match.buchuda),
    buchuda_de_re: Boolean(match.buchudaDeRe ?? match.buchuda_de_re),
    duration_sec: match.durationSec ?? match.duration_sec ?? null
  })), 'id');

  await upsert('settings', Object.entries(settings || {}).map(([key, value]) => ({
    key,
    value
  })), 'key');

  await importUsers();
}

main().catch(error => {
  console.error(`Importação interrompida: ${error.message}`);
  process.exit(1);
});
