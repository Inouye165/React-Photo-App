const express = require('express');

module.exports = function createCollectiblesRouter({ db }) {
  const router = express.Router();

  // GET /api/photos/:photoId/collectibles
  router.get('/photos/:photoId/collectibles', async (req, res) => {
    try {
      const { photoId } = req.params;
      const collectibles = await db('collectibles').where({ photo_id: photoId });
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
      await db('collectibles').where({ id: collectibleId }).update({ user_notes });
      const collectible = await db('collectibles').where({ id: collectibleId }).first();
      res.json({ success: true, collectible });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
};
