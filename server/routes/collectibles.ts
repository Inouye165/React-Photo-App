// @ts-nocheck

const express = require('express');
const createCollectiblesService = require('../services/collectiblesService');
const { mapPhotoRowToListDto } = require('../serializers/photos');
const { signThumbnailUrl } = require('../utils/urlSigning');

module.exports = function createCollectiblesRouter({ db }) {
  const router = express.Router();
  const collectiblesService = createCollectiblesService({ db });

  // GET /collectibles/:collectibleId/photos - Get auxiliary photos attached to a collectible
  router.get('/collectibles/:collectibleId/photos', async (req, res) => {
    try {
      const { collectibleId } = req.params;

      const collectible = await db('collectibles')
        .where({ id: collectibleId, user_id: req.user.id })
        .select('id')
        .first();

      if (!collectible) {
        return res.status(404).json({ success: false, error: 'Collectible not found' });
      }

      // Select the columns required by the photo serializer.
      const rows = await db('photos')
        .select(
          'id',
          'filename',
          'state',
          'metadata',
          'hash',
          'file_size',
          'caption',
          'description',
          'keywords',
          'classification',
          'storage_path',
          'edited_filename',
          'text_style',
          'ai_model_history',
          'poi_analysis',
          'thumb_path',
          'thumb_small_path'
        )
        .where({ user_id: req.user.id, collectible_id: collectibleId })
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc');

      // Use server-signed /display/thumbnails URLs so browsers can render thumbnails
      // without cookies or Authorization headers.
      const COLLECTIBLES_THUMB_TTL_SECONDS = 3600;
      const photos = await Promise.all(
        rows.map((row) =>
          mapPhotoRowToListDto(row, {
            ttlSeconds: COLLECTIBLES_THUMB_TTL_SECONDS,
            signThumbnailUrl,
          })
        )
      );
      res.json({ success: true, photos });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /collectibles/:collectibleId/history - Get price history for a collectible
  router.get('/collectibles/:collectibleId/history', async (req, res) => {
    try {
      const { collectibleId } = req.params;
      
      // Verify the collectible exists and belongs to user
      const collectible = await db('collectibles')
        .join('photos', 'collectibles.photo_id', 'photos.id')
        .where('collectibles.id', collectibleId)
        .andWhere('photos.user_id', req.user.id)
        .select('collectibles.id')
        .first();

      if (!collectible) {
        return res.status(404).json({ success: false, error: 'Collectible not found' });
      }

      const history = await collectiblesService.getMarketData(req.user.id, collectibleId);
      res.json({ success: true, history });
    } catch (err) {
      console.error('[Collectibles] History fetch error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /photos/:photoId/collectibles
  // SECURITY: Verify photo ownership before returning collectibles
  router.get('/photos/:photoId/collectibles', async (req, res) => {
    try {
      const { photoId } = req.params;
      
      // CRITICAL: First verify the photo belongs to the requesting user
      const photo = await db('photos')
        .where({ id: photoId, user_id: req.user.id })
        .first();
      
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }
      
      // Only fetch collectibles after ownership verification
      const collectibles = await db('collectibles')
        .where('photo_id', photoId)
        .select('*');
      
      res.json({ success: true, collectibles });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /photos/:photoId/collectibles - Upsert (create or update) collectible
  router.put('/photos/:photoId/collectibles', express.json(), async (req, res) => {
    try {
      const { photoId } = req.params;
      const { formState, recordAi: _recordAi } = req.body;

      // Verify photo ownership
      const photo = await db('photos')
        .where({ id: photoId, user_id: req.user.id })
        .first();
      
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      // Check if collectible already exists for this photo
      const existing = await db('collectibles')
        .where('photo_id', photoId)
        .first();

      const collectibleData = {
        photo_id: photoId,
        user_id: req.user.id,
        name: formState?.name || photo.caption || 'Collectible Item',
        category: formState?.category || null,
        condition_label: formState?.conditionLabel || null,
        condition_rank: formState?.conditionRank || null,
        value_min: formState?.valueMin || null,
        value_max: formState?.valueMax || null,
        currency: 'USD',
        specifics: formState?.specifics ? JSON.stringify(formState.specifics) : null,
        updated_at: new Date().toISOString()
      };

      let collectible;
      if (existing) {
        // Update existing
        await db('collectibles')
          .where('id', existing.id)
          .update(collectibleData);
        collectible = await db('collectibles').where('id', existing.id).first();
      } else {
        // Create new
        collectibleData.created_at = new Date().toISOString();
        const [inserted] = await db('collectibles')
          .insert(collectibleData)
          .returning('*');
        collectible = inserted;
      }

      res.json({ success: true, collectible });
    } catch (err) {
      console.error('[Collectibles] Upsert error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /photos/:photoId/collectibles - Create new collectible
  router.post('/photos/:photoId/collectibles', express.json(), async (req, res) => {
    try {
      const { photoId } = req.params;
      const { name, user_notes } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

      // Verify photo ownership
      const photo = await db('photos')
        .where({ id: photoId, user_id: req.user.id })
        .first();
      
      if (!photo) {
        return res.status(404).json({ success: false, error: 'Photo not found' });
      }

      const [collectible] = await db('collectibles').insert({
        photo_id: photoId,
        user_id: req.user.id,
        name,
        user_notes: user_notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
      
      res.status(201).json({ success: true, collectible });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /collectibles/:collectibleId
  router.patch('/collectibles/:collectibleId', express.json(), async (req, res) => {
    try {
      const { collectibleId } = req.params;
      const { user_notes } = req.body;
      if (user_notes === undefined) return res.status(400).json({ success: false, error: 'user_notes is required' });

      // Verify ownership via join
      const collectible = await db('collectibles')
        .join('photos', 'collectibles.photo_id', 'photos.id')
        .where('collectibles.id', collectibleId)
        .andWhere('photos.user_id', req.user.id)
        .select('collectibles.id')
        .first();

      if (!collectible) {
        return res.status(404).json({ success: false, error: 'Collectible not found' });
      }

      await db('collectibles')
        .where({ id: collectibleId })
        .update({ user_notes, updated_at: new Date().toISOString() });
      const updated = await db('collectibles').where({ id: collectibleId }).first();
      res.json({ success: true, collectible: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
