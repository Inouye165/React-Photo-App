// Script to trigger processAllUnprocessedInprogress directly from Node (avoids HTTP server)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const db = require('../db/index');
const { processAllUnprocessedInprogress } = require('../ai/service');

(async () => {
  try {
    console.log('[SCRIPT] Starting recheck of inprogress photos');
    const count = await processAllUnprocessedInprogress(db);
    console.log('[SCRIPT] Recheck triggered, processed count:', count);
    process.exit(0);
  } catch (err) {
    console.error('[SCRIPT] Recheck failed:', err && err.message);
    process.exit(2);
  }
})();
