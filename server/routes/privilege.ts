// @ts-nocheck

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

      // Batch check: if 'filenames' is present, return an array of results.
      // NOTE: We intentionally avoid returning an object keyed by user-provided
      // filename to prevent remote property injection / prototype pollution concerns.
      if (Array.isArray(req.body.filenames)) {
        const filenames = req.body.filenames;
        
        if (filenames.length === 0) {
          return res.json({
            success: true,
            privileges: []
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
        // SECURITY: We use Map.get() which is safe against prototype pollution
        // because Map uses internal storage, not object prototype chain.
        // Additionally, we validate each filename with isSafePropertyKey() before use.
        // The results are pushed to an array (not set as object keys) to prevent injection.
        const privileges = [];
        filenames.forEach(filename => {
          // lgtm[js/remote-property-injection] - Map.get() is safe, not object property access
          if (!isSafePropertyKey(filename)) {
            return;
          }
          // lgtm[js/remote-property-injection] - Using Map.get(), not bracket notation on Object
          const ownerId = photoOwners.get(filename);

          if (!ownerId) {
            // File not found in database - no permissions
            privileges.push({ filename, access: '' });
          } else if (ownerId === req.user.id) {
            // User owns the file - full permissions
            privileges.push({ filename, access: 'RWX' });
          } else {
            // User does not own the file - read-only (assuming public)
            privileges.push({ filename, access: 'R' });
          }
        });

        return res.json({
          success: true,
          privileges
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