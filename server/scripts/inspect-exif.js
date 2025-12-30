#!/usr/bin/env node
/*
  Inspect EXIF for a photo stored in Supabase by photo id or storage path.
  Usage:
    node scripts/inspect-exif.js --id 118
    node scripts/inspect-exif.js --path "inprogress/IMG_E5990.JPG"
*/
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
// simple argv parsing to avoid extra deps
const argv = process.argv.slice(2);
let id = null;
let storagePathArg = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if ((a === '--id' || a === '-i') && argv[i+1]) { id = argv[i+1]; i++; }
  else if ((a === '--path' || a === '-p') && argv[i+1]) { storagePathArg = argv[i+1]; i++; }
}

const supabase = require('../lib/supabaseClient');
const db = require('../db');
const { exiftool } = require('exiftool-vendored');

async function downloadToTemp(storagePath, filenameHint) {
  const { data, error } = await supabase.storage.from('photos').download(storagePath);
  if (error) throw new Error(`Supabase download error: ${error.message}`);
  const arrayBuffer = await data.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photo-app-exif-'));
  const safeHint = path.basename(String(filenameHint || 'photo')).replace(/[^a-zA-Z0-9._-]/g, '_');
  const tmp = path.join(tmpDir, `${crypto.randomUUID()}-${safeHint}`);
  fs.writeFileSync(tmp, buf, { flag: 'wx' });
  return { tmp, tmpDir };
}

async function inspectById(photoId) {
  const row = await db('photos').where({ id: photoId }).first();
  if (!row) throw new Error(`Photo id ${photoId} not found in DB`);
  const storagePath = row.storage_path || `${row.state}/${row.filename}`;
  console.log('DB stored metadata (photoRow.metadata):');
  let rowMeta = row.metadata;
  try {
    if (typeof rowMeta === 'string') {
      rowMeta = JSON.parse(rowMeta || '{}');
    }
  } catch {
    // If parsing fails, leave as-is so we can still inspect the raw value
  }
  console.log(JSON.stringify(rowMeta || {}, null, 2));
  console.log('Downloading from storage path:', storagePath);
  const { tmp, tmpDir } = await downloadToTemp(storagePath, row.filename);
  console.log('Saved temp file to:', tmp);
  try {
    const meta = await exiftool.read(tmp);
    console.log('EXIF parsed by exiftool:');
    const keys = ['GPSLatitude','GPSLongitude','GPSLatitudeRef','GPSLongitudeRef','GPSAltitude','DateTimeOriginal','CreateDate','ModifyDate'];
    const out = {};
    for (const k of keys) if (meta[k] !== undefined) out[k] = meta[k];
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await exiftool.end();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

async function inspectByPath(sp) {
  console.log('Downloading from storage path:', sp);
  const { tmp, tmpDir } = await downloadToTemp(sp, path.basename(sp));
  console.log('Saved temp file to:', tmp);
  try {
    const meta = await exiftool.read(tmp);
    console.log('EXIF parsed by exiftool:');
    console.log(JSON.stringify(meta, null, 2));
  } finally {
    await exiftool.end();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

(async () => {
  try {
    if (!id && !storagePathArg) {
      console.error('Usage: node scripts/inspect-exif.js --id <photoId>  OR --path <storagePath>');
      process.exit(2);
    }
    if (id) {
      await inspectById(id);
    } else {
      await inspectByPath(storagePathArg);
    }
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(1);
  }
})();
