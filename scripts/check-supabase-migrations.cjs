const { spawnSync } = require('node:child_process');

function runSupabaseMigrationList() {
  return spawnSync('supabase', ['migration', 'list', '--local'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

function parseMigrationRows(output) {
  const rows = [];
  const lines = output.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.includes('|')) continue;
    if (line.includes('Local') && line.includes('Remote')) continue;
    if (/^-+\|-+\|-+$/.test(line.replace(/\s+/g, ''))) continue;

    const parts = line.split('|').map((part) => part.trim());
    if (parts.length < 3) continue;

    const local = parts[0] || null;
    const remote = parts[1] || null;

    if (!local && !remote) continue;
    rows.push({ local, remote });
  }

  return rows;
}

function findPendingLocalMigrations(rows) {
  return rows.filter((row) => row.local && row.local !== row.remote).map((row) => row.local);
}

function main() {
  const result = runSupabaseMigrationList();

  if (typeof result.status !== 'number' || result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();

    console.warn('[supabase-migration-guard] Skipped migration check.');
    if (stderr) console.warn(`[supabase-migration-guard] ${stderr}`);
    else if (stdout) console.warn(`[supabase-migration-guard] ${stdout}`);
    else console.warn('[supabase-migration-guard] Supabase CLI unavailable or local stack not running.');
    process.exit(0);
  }

  const rows = parseMigrationRows(result.stdout || '');
  const pending = findPendingLocalMigrations(rows);

  if (pending.length === 0) {
    console.log('[supabase-migration-guard] OK: Local Supabase migrations are up to date.');
    process.exit(0);
  }

  console.error('[supabase-migration-guard] Pending local Supabase migrations detected:');
  for (const migration of pending) {
    console.error(` - ${migration}`);
  }
  console.error('[supabase-migration-guard] Run: supabase db push --local');
  process.exit(1);
}

main();
