import { Router, Request, Response } from 'express';
// FIX 1: Use 'import' instead of 'require'
import { processAllUnprocessedInprogress } from '../ai/service';
import { addAIJob } from '../queue';

interface AuthenticatedRequest extends Request {
  user?: { id: string; role?: string };
}

export default function createDebugRouter({ db }: { db: any }) {
  const router = Router();

  // ==================================================================
  // MAINTENANCE: Fix Broken Collectibles
  // MOUNTED AT /api/debug/fix-collectibles to pass Frontend Proxy
  // ==================================================================
  // FIX 2: Renamed 'req' to '_req' because it is unused in this function
  router.get('/api/debug/fix-collectibles', async (_req: Request, res: Response) => {
    try {
      console.log('[Maintenance] Starting collectible repair job via DEBUG...');
      
      const photos = await db('photos')
        .whereNotNull('collectible_id') // FIX 3: Removed the accidental 'Q' here
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

  // ==================================================================
  // EXISTING ROUTES
  // ==================================================================

  // Note: /photos/... works because the proxy likely allows /photos
  // FIX 4: Renamed 'req' to '_req' here as well
  router.post('/photos/recheck-inprogress', (_req: Request, res: Response) => {
    try {
      processAllUnprocessedInprogress(db);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Updated to include /api prefix to ensure accessibility
  router.get('/api/debug/inprogress', async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 'req' is used here (req.user), so we keep the name 'req'
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user?.id });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Keep old path for backward compatibility if needed, but add /api version
  router.get('/debug/inprogress', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await db('photos').where({ state: 'inprogress', user_id: req.user?.id });
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

// FIX 5: Since we use 'export default' above, we don't strictly need this, 
// but if your app expects CommonJS, you can leave it. 
// However, in TS, usually 'export default' is enough.
module.exports = createDebugRouter;