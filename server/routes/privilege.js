const express = require('express');
const logger = require('../logger');

const UNSAFE_PROPERTY_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isSafePropertyKey(key) {
  return typeof key === 'string' && !UNSAFE_PROPERTY_KEYS.has(String(key).toLowerCase());
}

module.exports = function createPrivilegeRouter({ db }) {
  const router = express.Router();

  router.post('/privilege', async (req, res) => {
    try {
      // Require authentication - req.user should be set by authenticateToken middleware
      if (!req.user || !req.user.id) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      // Batch check: if 'filenames' is present, return a map keyed by filename
      if (Array.isArray(req.body.filenames)) {
        const filenames = req.body.filenames;
        
        if (filenames.length === 0) {
          return res.json({
            success: true,
            privileges: {}
          });
        }

        // Perform batch DB query to get owners for all requested filenames
        const photos = await db('photos')
          .select('filename', 'user_id')
          .whereIn('filename', filenames);

        // Create a map of filename -> user_id for quick lookup
        const photoOwners = new Map();
        photos.forEach(photo => {
          photoOwners.set(photo.filename, photo.user_id);
        });

        // Determine privileges based on ownership
        const privilegesMap = Object.create(null);
        filenames.forEach(filename => {
          if (!isSafePropertyKey(filename)) {
            return;
          }
          const ownerId = photoOwners.get(filename);
          
          if (!ownerId) {
            // File not found in database - no permissions
            privilegesMap[filename] = '';
          } else if (ownerId === req.user.id) {
            // User owns the file - full permissions
            privilegesMap[filename] = 'RWX';
          } else {
            // User does not own the file - read-only (assuming public)
            privilegesMap[filename] = 'R';
          }
        });

        return res.json({
          success: true,
          privileges: privilegesMap
        });
      }

      // Single file check (legacy) - default to no permissions
      res.json({
        success: true,
        message: 'Batch privilege check recommended - use filenames array',
        privileges: { read: false, write: false, execute: false }
      });
    } catch (err) {
      logger.error('Privilege check error:', err);
      return res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    }
  });

  return router;
};