const express = require('express');

module.exports = function createPrivilegeRouter() {
  const router = express.Router();

  router.post('/privilege', (req, res) => {
    try {
      // Batch check: if 'filenames' is present, return a map keyed by filename
      if (Array.isArray(req.body.filenames)) {
        const privilegesMap = {};
        req.body.filenames.forEach(filename => {
          // All files get full permissions for now
          privilegesMap[filename] = 'RWX';
        });
        return res.json({
          success: true,
          privileges: privilegesMap
        });
      }
      // Single file check (legacy)
      res.json({
        success: true,
        message: 'Files are stored in Supabase Storage - privilege checking not applicable',
        privileges: { read: true, write: true, execute: false }
      });
    } catch (err) {
      console.error('Privilege check error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
  });

  return router;
};