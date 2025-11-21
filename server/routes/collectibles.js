const express = require('express');

module.exports = function createCollectiblesRouter({ db }) {
  const router = express.Router();

  // GET /api/photos/:photoId/collectibles
  router.get('/photos/:photoId/collectibles', async (req, res) => {
    try {
      const { photoId } = req.params;
      const collectibles = await db('collectibles')
        .join('photos', 'collectibles.photo_id', 'photos.id')
        .where('photos.id', photoId)
        .andWhere('photos.user_id', req.user.id)
        .select('collectibles.*');
      res.json({ success: true, collectibles });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/photos/:photoId/collectibles
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

      const [id] = await db('collectibles').insert({
        photo_id: photoId,
        name,
        user_notes: user_notes || ''
      }).returning('id');
      const collectible = await db('collectibles').where({ id }).first();
      res.status(201).json({ success: true, collectible });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PATCH /api/collectibles/:collectibleId
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

      await db('collectibles').where({ id: collectibleId }).update({ user_notes });
      const updated = await db('collectibles').where({ id: collectibleId }).first();
      res.json({ success: true, collectible: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
