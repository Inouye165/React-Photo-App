'use strict';

const { Router } = require('express');
const createCaptureIntentsService = require('../services/captureIntentsService');

const MAX_TTL_MS = 10 * 60 * 1000;

function parsePositiveInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function ensureUuidLike(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.length > 80) return null;
  return s;
}

function createCaptureIntentsRouter({ db, sseManager } = {}) {
  if (!db) throw new Error('db is required');

  const router = Router();
  const service = createCaptureIntentsService({ db, ttlMs: MAX_TTL_MS });

  router.post('/open', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const photoId = parsePositiveInt(req.body?.photoId);
      if (!photoId) {
        return res.status(400).json({ success: false, error: 'Valid photoId is required' });
      }

      const collectibleIdRaw = req.body?.collectibleId;
      const collectibleId = collectibleIdRaw === null || collectibleIdRaw === undefined
        ? null
        : parsePositiveInt(collectibleIdRaw);
      if (collectibleIdRaw !== null && collectibleIdRaw !== undefined && !collectibleId) {
        return res.status(400).json({ success: false, error: 'collectibleId must be a positive integer' });
      }

      const photo = await db('photos').where({ id: photoId, user_id: userId }).first();
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      if (collectibleId) {
        const collectible = await db('collectibles').where({ id: collectibleId, user_id: userId }).first();
        if (!collectible) {
          return res.status(404).json({ success: false, error: 'Collectible not found' });
        }
        if (String(collectible.photo_id) !== String(photoId)) {
          return res.status(400).json({ success: false, error: 'Collectible does not belong to photo' });
        }
      }

      const intent = await service.openIntent(userId, { photoId, collectibleId });

      try {
        if (sseManager && typeof sseManager.publishToUser === 'function' && intent) {
          sseManager.publishToUser(userId, 'capture.intent', {
            id: intent.id,
            photoId: intent.photoId,
            collectibleId: intent.collectibleId,
            state: intent.state,
            expiresAt: intent.expiresAt,
            createdAt: intent.createdAt,
          });
        }
      } catch {
        // Avoid failing the request on realtime publish errors.
      }

      return res.status(200).json({ success: true, intent });
    } catch (error) {
      console.error('[capture-intents] open error:', error);
      return res.status(500).json({ success: false, error: 'Failed to open capture intent' });
    }
  });

  router.get('/open', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const intent = await service.getOpenIntent(userId);
      return res.status(200).json({ success: true, intent: intent || null });
    } catch (error) {
      console.error('[capture-intents] get open error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch capture intent' });
    }
  });

  router.post('/:id/consume', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const intentId = ensureUuidLike(req.params?.id);
      if (!intentId) {
        return res.status(400).json({ success: false, error: 'Valid intent id is required' });
      }

      const intent = await service.consumeIntent(userId, intentId);
      if (!intent) {
        return res.status(404).json({ success: false, error: 'Capture intent not found' });
      }

      return res.status(200).json({ success: true, intent });
    } catch (error) {
      console.error('[capture-intents] consume error:', error);
      return res.status(500).json({ success: false, error: 'Failed to consume capture intent' });
    }
  });

  return router;
}

module.exports = createCaptureIntentsRouter;
