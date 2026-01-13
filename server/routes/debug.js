const express = require('express');
const { processAllUnprocessedInprogress, extractLatLon } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { addAIJob } = require('../queue');

module.exports = function createDebugRouter({ db }) {
  const router = express.Router();

  // 🔴 SECURITY BLOCK REMOVED FOR MAINTENANCE
  // router.use((req, res, next) => { ...deleted... });

  // ==================================================================
  // MAINTENANCE: Fix Broken Collectibles (GET request for easy access)
  // ==================================================================
  router.get('/fix-collectibles', async (req, res) => {
    try {
      logger.info('[Maintenance] Starting collectible repair job via DEBUG...');
      
      const photos = await db('photos')
        .whereNotNull('collectible_id')
        .whereNull('display_path')
        .select('id', 'filename', 'storage_path')
        .limit(100);

      if (photos.length === 0) {
        return res.json({ success: true, count: 0, message: 'No broken collectibles found.' });
      }

      let count = 0;
      for (const p of photos) {
        await addAIJob(p.id, {
          runAiAnalysis: false,
          generateThumbnail: true,
          generateDisplay: true
        });
        count++;
      }

      res.json({ 
        success: true, 
        count, 
        message: `Enqueued ${count} photos for repair. Wait 1 minute and refresh.` 
      });

    } catch (err) {
      logger.error('[Maintenance] Repair failed:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ==================================================================
  // EXISTING ROUTES (Preserved)
  // ==================================================================

  router.post('/photos/recheck-inprogress', (req, res) => {
    try {
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/debug/inprogress', async (req, res) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user.id });
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/dev/reextract-gps', async (req, res) => {
    try {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id is required' });
      const row = await db('photos').where({ id, user_id: req.user.id }).first();
      if (!row) return res.status(404).json({ error: 'not found' });
      const meta = (typeof row.metadata === 'string') ? JSON.parse(row.metadata || '{}') : (row.metadata || {});
      const coords = extractLatLon(meta);
      return res.json({
        id: row.id,
        filename: row.filename,
        gpsString: (coords && coords.lat != null) ? `${coords.lat},${coords.lon}` : null
      });
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }
  });

  router.post('/debug/reset-ai-retry', async (req, res) => {
    try {
      const result = await db('photos')
        .where('filename', 'like', '%.HEIC')
        .andWhere('user_id', req.user.id)
        .update({ ai_retry_count: 0 });
      res.json({ updated: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/debug/regenerate-thumbnails', async (req, res) => {
    try {
      const rows = await db('photos').whereNotNull('hash').andWhere('user_id', req.user.id);
      let missing = 0, generated = 0;
      for (const row of rows) {
        const { data } = await supabase.storage.from('photos').list('thumbnails', { search: `${row.hash}.jpg` });
        if (!data || data.length === 0) {
          missing++;
          const storagePath = row.storage_path || `${row.state}/${row.filename}`;
          const { data: fileData } = await supabase.storage.from('photos').download(storagePath);
          if (fileData) {
            await generateThumbnail(Buffer.from(await fileData.arrayBuffer()), row.hash);
            generated++;
          }
        }
      }
      res.json({ success: true, summary: { missing, generated } });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  router.get('/storage', async (req, res) => {
     try {
       const { data } = await supabase.storage.from('photos').list('', { limit: 1 });
       res.json({ success: true, files: data });
     } catch(err) {
       res.status(500).json({ error: err.message });
     }
  });

  return router;
};