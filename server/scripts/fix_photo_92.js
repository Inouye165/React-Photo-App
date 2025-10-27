// One-time script to fix photo id 92 storage_path/state
// Run with: node server/scripts/fix_photo_92.js

const db = require('../db/index');

(async function() {
  try {
    const id = 92;
    const newState = 'inprogress';
    const newPath = 'inprogress/IMG_4476.HEIC';

    const row = await db('photos').where({ id }).first();
    if (!row) {
      console.error('Photo id', id, 'not found in DB');
      process.exit(1);
    }

    console.log('Before update:', { id: row.id, state: row.state, storage_path: row.storage_path });

    await db('photos').where({ id }).update({ state: newState, storage_path: newPath, updated_at: new Date().toISOString() });

    const updated = await db('photos').where({ id }).first();
    console.log('After update:', { id: updated.id, state: updated.state, storage_path: updated.storage_path });

    process.exit(0);
  } catch (err) {
    console.error('Error updating photo:', err);
    process.exit(1);
  }
})();
