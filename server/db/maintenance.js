const path = require('path');
const fs = require('fs');
const logger = require('../logger');

// Backfill file sizes for existing records that don't have them
async function backfillFileSizes(db, { WORKING_DIR, INPROGRESS_DIR, FINISHED_DIR }) {
  try {
    const rows = await db('photos')
      .whereNull('file_size')
      .orWhere('file_size', 0)
      .select('id', 'filename', 'state');
    
    if (rows.length === 0) {
      logger.info('[BACKFILL] No files need file size backfill.');
      return 0;
    }
    
    logger.info(`[BACKFILL] Backfilling file sizes for ${rows.length} records...`);
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
          await db('photos').where({ id: row.id }).update({ file_size: stats.size });
          updated++;
        } else {
          logger.warn(`[BACKFILL] File not found for backfill: ${filePath}`);
        }
      } catch (error) {
        logger.error(`[BACKFILL] Error getting file size for ${row.filename}:`, error.message);
      }
    }
    
    logger.info(`[BACKFILL] Updated file sizes for ${updated} records.`);
    return updated;
  } catch (error) {
    logger.error('[BACKFILL] Error during file size backfill:', error);
    throw error;
  }
}

// Remove DB records for missing files in working dir
async function cleanupMissingFiles(db, workingDir) {
  try {
    const rows = await db('photos').where({ state: 'working' }).select('id', 'filename');
    let removed = 0;
    
    for (const row of rows) {
      const filePath = path.join(workingDir, row.filename);
      if (!fs.existsSync(filePath)) {
        await db('photos').where({ id: row.id }).del();
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.info(`[CLEANUP] Removed ${removed} DB records for missing files in working dir.`);
    }
    return removed;
  } catch (error) {
    logger.error('[CLEANUP] Error during working dir cleanup:', error);
    throw error;
  }
}

// Remove DB records for missing files in inprogress dir
async function cleanupMissingInprogressFiles(db, inprogressDir) {
  try {
    const rows = await db('photos').where({ state: 'inprogress' }).select('id', 'filename');
    let removed = 0;
    
    for (const row of rows) {
      const filePath = path.join(inprogressDir, row.filename);
      if (!fs.existsSync(filePath)) {
        await db('photos').where({ id: row.id }).del();
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.info(`[CLEANUP] Removed ${removed} DB records for missing files in inprogress dir.`);
    }
    return removed;
  } catch (error) {
    logger.error('[CLEANUP] Error during inprogress dir cleanup:', error);
    throw error;
  }
}

module.exports = { backfillFileSizes, cleanupMissingFiles, cleanupMissingInprogressFiles };