import { Router, Request, Response } from 'express';
const { processAllUnprocessedInprogress, extractLatLon } = require('../ai/service');
const { generateThumbnail } = require('../media/image');
const supabase = require('../lib/supabaseClient');
const logger = require('../logger');
const { addAIJob } = require('../queue');
const path = require('path');

// Type definition for the request
interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
}

export default function createDebugRouter({ db }: { db: any }) {
  const router = Router();

  // ------------------------------------------------------------------
  // MAINTENANCE: Fix Broken Collectibles
  // Security block REMOVED to ensure this runs in production
  // ------------------------------------------------------------------
  router.get('/fix-collectibles', async (req: Request, res: Response) => {
    try {
      console.log('[Maintenance] Starting collectible repair job via DEBUG...');
      
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
        // Enqueue job: AI disabled, Image Gen enabled
        await addAIJob(p.id, {
          runAiAnalysis: false,
          generateThumbnail: true,
          generateDisplay: true
        });
        count++;
      }

      return res.json({ 
        success: true, 
        count, 
        message: `Enqueued ${count} photos for repair. Wait 1 minute and refresh.` 
      });

    } catch (err: any) {
      console.error('[Maintenance] Repair failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // ------------------------------------------------------------------
  // EXISTING ROUTES
  // ------------------------------------------------------------------

  router.post('/photos/recheck-inprogress', (req: Request, res: Response) => {
    try {
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/debug/inprogress', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user?.id });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/dev/reextract-gps', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'id is required' });
      const row = await db('photos').where({ id, user_id: req.user?.id }).first();
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

  router.post('/debug/reset-ai-retry', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await db('photos')
        .where('filename', 'like', '%.HEIC')
        .andWhere('user_id', req.user?.id)
        .update({ ai_retry_count: 0 });
      res.json({ updated: result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/storage', async (req: Request, res: Response) => {
     try {
       const { data } = await supabase.storage.from('photos').list('', { limit: 1 });
       res.json({ success: true, files: data });
     } catch(err: any) {
       res.status(500).json({ error: err.message });
     }
  });

  return router;
};

// CommonJS compatibility
module.exports = createDebugRouter;
