#!/usr/bin/env node

/* Importa o backup local para as tabelas do Supabase.
 * Uso:
 *   SUPABASE_URL="https://seu-projeto.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="sua-chave-secreta" \
 *   node tools/import_supabase.js
 */

const fs = require('fs');
const path = require('path');

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const root = path.resolve(__dirname, '..');

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar.');
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(path.join(root, 'data', 'backup.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(root, 'data', 'settings.json'), 'utf8'));

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
}

main().catch(error => {
  console.error(`Importação interrompida: ${error.message}`);
  process.exit(1);
});
