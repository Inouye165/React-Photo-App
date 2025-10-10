const path = require('path');
const fs = require('fs');

// Backfill file sizes for existing records that don't have them
async function backfillFileSizes(db, { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR }) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename, state FROM photos WHERE file_size IS NULL OR file_size = 0', async (err, rows) => {
      if (err) return reject(err);
      if (rows.length === 0) {
        console.log('[BACKFILL] No files need file size backfill.');
        return resolve(rows.length);
      }
      console.log(`[BACKFILL] Backfilling file sizes for ${rows.length} records...`);
      let updated = 0;
      for (const row of rows) {
        try {
          const getDir = (state) => {
            switch(state) {
              case 'working': return WORKING_DIR;
              case 'inprogress': return INPROGRESS_DIR;
              case 'finished': return FINISHED_DIR;
              default: return WORKING_DIR;
            }
          };
          const dir = getDir(row.state);
          const filePath = path.join(dir, row.filename);
          if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            db.run('UPDATE photos SET file_size = ? WHERE id = ?', [stats.size, row.id]);
            updated++;
          } else {
            console.log(`[BACKFILL] File not found for backfill: ${filePath}`);
          }
        } catch (error) {
          console.error(`[BACKFILL] Error getting file size for ${row.filename}:`, error.message);
        }
      }
      console.log(`[BACKFILL] Updated file sizes for ${updated} records.`);
      resolve(updated);
    });
  });
}

// Remove DB records for missing files in working dir
async function cleanupMissingFiles(db, workingDir) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename FROM photos WHERE state = "working"', async (err, rows) => {
      if (err) return reject(err);
      let removed = 0;
      for (const row of rows) {
        const filePath = path.join(workingDir, row.filename);
        if (!fs.existsSync(filePath)) {
          db.run('DELETE FROM photos WHERE id = ?', [row.id]);
          removed++;
        }
      }
      if (removed > 0) console.log(`[CLEANUP] Removed ${removed} DB records for missing files in working dir.`);
      resolve();
    });
  });
}

// Remove DB records for missing files in inprogress dir
async function cleanupMissingInprogressFiles(db, inprogressDir) {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, filename FROM photos WHERE state = "inprogress"', async (err, rows) => {
      if (err) return reject(err);
      let removed = 0;
      for (const row of rows) {
        const filePath = path.join(inprogressDir, row.filename);
        if (!fs.existsSync(filePath)) {
          db.run('DELETE FROM photos WHERE id = ?', [row.id]);
          removed++;
        }
      }
      if (removed > 0) console.log(`[CLEANUP] Removed ${removed} DB records for missing files in inprogress dir.`);
      resolve();
    });
  });
}

module.exports = { backfillFileSizes, cleanupMissingFiles, cleanupMissingInprogressFiles };