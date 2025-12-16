/*
 * One-off DB cleanup: mark "zombie" photos stuck in `inprogress` as `finished`.
 *
 * Usage (from repo root):
 *   node server/scripts/fix-stuck-analyzing.js
 */

const dotenv = require('dotenv');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env from server/.env (path: ../.env relative to this file).
// This is where server-side secrets like SUPABASE_SERVICE_ROLE_KEY typically live.
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

// Best-effort: also load repo-root .env (../../.env) for Vite-prefixed vars if present.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), override: false });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let configError = false;
if (!supabaseUrl) {
  console.error('[fix-stuck-analyzing] Missing env: VITE_SUPABASE_URL (or SUPABASE_URL fallback)');
  configError = true;
}

if (!serviceRoleKey) {
  console.error('[fix-stuck-analyzing] Missing env: SUPABASE_SERVICE_ROLE_KEY');
  configError = true;
}

if (configError) {
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  // Select all rows in photos where state is 'inprogress'
  const { data: stuckRows, error: selectError } = await supabaseAdmin
    .from('photos')
    .select('id,state')
    .eq('state', 'inprogress');

  if (selectError) {
    console.error('[fix-stuck-analyzing] Failed to query photos:', selectError);
    process.exitCode = 1;
    return;
  }

  const count = Array.isArray(stuckRows) ? stuckRows.length : 0;
  console.log(`[fix-stuck-analyzing] Found ${count} photos with state=inprogress`);

  if (count === 0) {
    console.log('[fix-stuck-analyzing] No updates needed.');
    return;
  }

  // Update them all: set state to 'finished'
  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from('photos')
    .update({ state: 'finished' })
    .eq('state', 'inprogress')
    .select('id');

  if (updateError) {
    console.error('[fix-stuck-analyzing] Failed to update photos:', updateError);
    process.exitCode = 1;
    return;
  }

  const updatedCount = Array.isArray(updatedRows) ? updatedRows.length : 0;
  console.log(`[fix-stuck-analyzing] Success: updated ${updatedCount} photos to state=finished`);
}

main().catch((err) => {
  console.error('[fix-stuck-analyzing] Unhandled error:', err);
  process.exitCode = 1;
});
