// Quick script to query a photo row by filename and print caption, description, keywords
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db/index');

async function run() {
  try {
    const filename = process.argv[2] || 'IMG_1809.HEIC';
    const row = await db('photos').where({ filename }).first();
    if (!row) {
      console.log('Photo not found for filename:', filename);
      process.exit(0);
    }
    console.log('Photo row:', {
      id: row.id,
      filename: row.filename,
      caption: row.caption,
      description: row.description,
      keywords: row.keywords,
      storage_path: row.storage_path,
      state: row.state
    });
    process.exit(0);
  } catch (err) {
    console.error('Query failed:', err && err.message);
    process.exit(2);
  }
}

run();
