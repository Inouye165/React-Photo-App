/**
 * Backfill collectible (reference) photo derivatives.
 *
 * Finds photos attached to collectibles that are missing `display_path` and enqueues
 * them into the BullMQ pipeline with `runAiAnalysis: false` so they generate
 * thumbnails/display assets without running expensive AI.
 *
 * Usage (from repo root):
 *   node server/scripts/fix-collectible-thumbnails.js --dry-run
 *   node server/scripts/fix-collectible-thumbnails.js --limit 100
 */

require('../env');

const { createClient } = require('@supabase/supabase-js');

function parseArgs(argv) {
  const args = new Set(argv);
  const dryRun = args.has('--dry-run');

  const limitIndex = argv.findIndex((a) => a === '--limit');
  const limitRaw = limitIndex >= 0 ? argv[limitIndex + 1] : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  return {
    dryRun,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing env: VITE_SUPABASE_URL (or SUPABASE_URL fallback)');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
  }

  const { addAIJob, aiQueue } = require('../queue');

  if (typeof addAIJob !== 'function') {
    throw new Error('queue.addAIJob is unavailable');
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const query = supabaseAdmin
    .from('photos')
    .select('id,collectible_id,display_path,filename')
    .not('collectible_id', 'is', null)
    .is('display_path', null)
    .order('id', { ascending: true });

  if (typeof limit === 'number') {
    query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || 'Failed to query photos');
  }

  const rows = Array.isArray(data) ? data : [];

  console.log(
    `[fix-collectible-thumbnails] Found ${rows.length} collectible photos missing display_path` +
      (dryRun ? ' (dry-run)' : '') +
      (limit ? ` (limit=${limit})` : '')
  );

  let enqueued = 0;
  for (const row of rows) {
    const photoId = row && typeof row.id === 'number' ? row.id : null;
    if (!photoId) continue;

    if (dryRun) {
      console.log(
        `[dry-run] Would enqueue photoId=${photoId} collectible_id=${row.collectible_id} filename=${row.filename || ''}`
      );
      continue;
    }

    try {
      await addAIJob(photoId, {
        processMetadata: true,
        generateThumbnail: true,
        generateDisplay: true,
        runAiAnalysis: false,
        requestId: 'backfill-collectible-thumbnails',
      });
      enqueued += 1;

      if (enqueued % 25 === 0) {
        console.log(`[fix-collectible-thumbnails] Enqueued ${enqueued}/${rows.length}...`);
      }
    } catch (err) {
      console.warn(`[fix-collectible-thumbnails] Failed to enqueue photoId=${photoId}: ${err?.message || err}`);
    }
  }

  if (!dryRun) {
    console.log(`[fix-collectible-thumbnails] Done. Enqueued ${enqueued}/${rows.length} jobs.`);
  }

  // Best-effort: close BullMQ queue to allow process to exit.
  try {
    if (aiQueue && typeof aiQueue.close === 'function') {
      await aiQueue.close();
    }
  } catch {
    // ignore
  }
}

main().catch((err) => {
  console.error('[fix-collectible-thumbnails] Unhandled error:', err?.message || err);
  process.exitCode = 1;
});
