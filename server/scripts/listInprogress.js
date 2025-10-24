// Script to list all inprogress photos and print caption/description/keywords
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db/index');

async function run() {
  try {
    const rows = await db('photos').where({ state: 'inprogress' }).select('id','filename','caption','description','keywords','storage_path');
    if (!rows || rows.length === 0) {
      console.log('No inprogress photos found');
      process.exit(0);
    }
    for (const r of rows) {
      console.log('---');
      console.log('id:', r.id);
      console.log('filename:', r.filename);
      console.log('caption:', JSON.stringify(r.caption));
      console.log('description:', JSON.stringify((r.description || '').slice(0,300)));
      console.log('keywords:', JSON.stringify(r.keywords));
      console.log('storage_path:', r.storage_path);
    }
    process.exit(0);
  } catch (err) {
    console.error('Failed to list inprogress photos:', err && err.message);
    process.exit(2);
  }
}

run();
