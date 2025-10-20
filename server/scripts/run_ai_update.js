(async ()=>{
  const path = require('path');
  const { openDb, migrate } = require('../db/index');
  const db = openDb();
  await migrate(db);
  db.get("SELECT * FROM photos WHERE state='inprogress' LIMIT 1", async (err,row)=>{
    if(err||!row){ console.log('No inprogress row found or error', err); db.close(); return; }
    console.log('Found inprogress row:', row.filename);
    const { updatePhotoAIMetadata } = require('../ai/service');
    const { INPROGRESS_DIR } = require('../config/paths');
    try{
        await updatePhotoAIMetadata(db, row, path.join(INPROGRESS_DIR, row.filename));
        console.log('updatePhotoAIMetadata finished');
        db.get('SELECT caption, description, keywords FROM photos WHERE id = ?', [row.id], async (e, r)=>{
          console.log('DB AI fields:', r);
          // Close DB cleanly and allow Node to exit naturally
          db.close();
        });
    } catch(e){ console.error('update error', e); db.close(); return; }
  });
})();
