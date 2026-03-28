#!/usr/bin/env node
/* Backfill gpsString for photos with stored metadata but missing gpsString */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = require(path.join(__dirname, '..', 'server', 'db', 'index')) as any;
const { extractLatLon } = require(path.join(__dirname, '..', 'server', 'ai', 'service')) as {
  extractLatLon: (meta: Record<string, unknown>) => { lat: number; lon: number; source: string } | null | undefined;
};

interface PhotoRow {
  id: number;
  filename: string;
  metadata: string | Record<string, unknown>;
}

(async () => {
  try {
    const rows: PhotoRow[] = await db('photos')
      .select('id', 'filename', 'metadata')
      .whereNull('gps_string')
      .orWhereNull('gpsString')
      .limit(5000);
    let updated = 0;
    for (const r of rows) {
      const meta = typeof r.metadata === 'string'
        ? JSON.parse(r.metadata || '{}') as Record<string, unknown>
        : (r.metadata || {});
      const c = extractLatLon(meta);
      if (c && c.lat != null && c.lon != null) {
        const gpsString = `${c.lat.toFixed(6)},${c.lon.toFixed(6)}`;
        // Try both column names used historically
        try {
          await db('photos').where({ id: r.id }).update({ gps_string: gpsString });
        } catch {
          try { await db('photos').where({ id: r.id }).update({ gpsString }); } catch { /* ignore */ }
        }
        console.log(`[backfill] id=${r.id} ${r.filename} ← ${gpsString} (${c.source})`);
        updated++;
      }
    }
    console.log(`Done. Updated ${updated}/${rows.length}`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
