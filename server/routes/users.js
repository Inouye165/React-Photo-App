/**
 * Users API Routes
 * 
 * Handles user preferences (grading scales) for the Smart Collector module.
 * All routes require authentication and enforce strict user isolation.
 * 
 * @module server/routes/users
 */

'use strict';

const express = require('express');
const createUserPreferencesService = require('../services/userPreferences');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../logger');

/**
 * Factory function to create users router.
 * 
 * @param {Object} options - Router dependencies
 * @param {import('knex').Knex} options.db - Knex database instance
 * @returns {express.Router} Express router
 */
function createUsersRouter({ db }) {
  const router = express.Router();
  const preferencesService = createUserPreferencesService({ db });

  const USERNAME_MIN_LEN = 3;
  const USERNAME_MAX_LEN = 30;
  const USERNAME_REGEX = /^[A-Za-z0-9_]+$/;

  // All routes require authentication
  router.use(authenticateToken);

  /**
   * GET /api/users/me
   * Returns the current user's profile row from public.users.
   *
   * IMPORTANT (PII): This endpoint is intended to be the single source of truth
   * for display name/username; clients should not derive names from email.
   */
  router.get('/me', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const row = await db('users')
        .select('id', 'username', 'has_set_username')
        .where({ id: userId })
        .first();

      // If no row exists yet, return a safe default.
      // (Some environments may create the row lazily.)
      if (!row) {
        return res.json({
          success: true,
          data: {
            id: userId,
            username: null,
            has_set_username: false,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          id: row.id,
          username: row.username ?? null,
          has_set_username: Boolean(row.has_set_username),
        },
      });
    } catch (error) {
      logger.error('[users] GET /me error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
    }
  });

  /**
   * PATCH /api/users/me
   * Updates the current user's profile.
   * Currently supports: username (also sets has_set_username=true).
   */
  router.patch('/me', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const usernameRaw = req.body?.username;
      if (typeof usernameRaw !== 'string') {
        return res.status(400).json({ success: false, error: 'username is required' });
      }

      const username = usernameRaw.trim();
      if (username.length < USERNAME_MIN_LEN) {
        return res
          .status(400)
          .json({ success: false, error: `Username must be at least ${USERNAME_MIN_LEN} characters` });
      }
      if (username.length > USERNAME_MAX_LEN) {
        return res
          .status(400)
          .json({ success: false, error: `Username must be at most ${USERNAME_MAX_LEN} characters` });
      }
      if (!USERNAME_REGEX.test(username)) {
        return res
          .status(400)
          .json({ success: false, error: 'Username may only contain letters, numbers, and underscores' });
      }

      // Uniqueness check (case-insensitive) to provide a clear 409.
      const existing = await db('users')
        .select('id')
        .whereRaw('lower(username) = lower(?)', [username])
        .andWhereNot({ id: userId })
        .first();

      if (existing) {
        return res.status(409).json({ success: false, error: 'Username is already taken' });
      }

      // Upsert profile update.
      await db('users')
        .insert({
          id: userId,
          username,
          has_set_username: true,
          created_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .onConflict('id')
        .merge({
          username,
          has_set_username: true,
          updated_at: db.fn.now(),
        });

      const updated = await db('users').select('id', 'username', 'has_set_username').where({ id: userId }).first();

      return res.json({
        success: true,
        data: {
          id: updated?.id ?? userId,
          username: updated?.username ?? username,
          has_set_username: updated ? Boolean(updated.has_set_username) : true,
        },
      });
    } catch (error) {
      logger.error('[users] PATCH /me error:', error);
      return res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  });

  /**
   * GET /api/users/me/preferences
   * Returns the current user's preferences (grading scales).
   */
  router.get('/me/preferences', async (req, res) => {
    try {
      // SECURITY: Strictly use req.user.id - users can only access their own data
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const preferences = await preferencesService.getPreferences(userId);
      
      res.json({
        success: true,
        data: preferences
      });
    } catch (error) {
      logger.error('[users] GET /me/preferences error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch preferences'
      });
    }
  });

  /**
   * PATCH /api/users/me/preferences
   * Updates the current user's preferences (grading scales).
   * Validates and merges with existing preferences.
   */
  router.patch('/me/preferences', async (req, res) => {
    try {
      // SECURITY: Strictly use req.user.id - users can only modify their own data
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const newPrefs = req.body;
      
      // Basic validation
      if (!newPrefs || typeof newPrefs !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid preferences format'
        });
      }

      const updatedPrefs = await preferencesService.updatePreferences(userId, newPrefs);
      
      res.json({
        success: true,
        data: updatedPrefs
      });
    } catch (error) {
      logger.error('[users] PATCH /me/preferences error:', error);
      
      // Return validation errors with 400 status
      if (error.message.includes('Invalid')) {
        return res.status(400).json({
          success: false,
          error: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'Failed to update preferences'
      });
    }
  });

  /**
   * POST /api/users/me/preferences/load-defaults
   * Loads default grading scales for specified categories.
   * Merges with existing preferences without overwriting.
   */
  router.post('/me/preferences/load-defaults', async (req, res) => {
    try {
      // SECURITY: Strictly use req.user.id
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { categories } = req.body;
      
      // Validate categories if provided
      if (categories && !Array.isArray(categories)) {
        return res.status(400).json({
          success: false,
          error: 'categories must be an array'
        });
      }

      const updatedPrefs = await preferencesService.loadDefaults(userId, categories);
      
      res.json({
        success: true,
        data: updatedPrefs
      });
    } catch (error) {
      logger.error('[users] POST /me/preferences/load-defaults error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load defaults'
      });
    }
  });

  /**
   * GET /api/users/me/preferences/available-defaults
   * Returns list of categories with available default grading scales.
   */
  router.get('/me/preferences/available-defaults', async (req, res) => {
    try {
      // SECURITY: Still require authentication even for reading defaults
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const categories = preferencesService.getAvailableDefaults();
      
      res.json({
        success: true,
        data: { categories }
      });
    } catch (error) {
      logger.error('[users] GET /me/preferences/available-defaults error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get available defaults'
      });
    }
  });

  /**
   * POST /api/users/accept-terms
   * Records that the current user has accepted the experimental/beta terms.
   * Updates terms_accepted_at timestamp to current time.
   */
  router.post('/accept-terms', async (req, res) => {
    try {
      // SECURITY: Strictly use req.user.id - users can only accept terms for themselves
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Upsert the user record with terms_accepted_at = now
      await db('users')
        .insert({
          id: userId,
          terms_accepted_at: db.fn.now(),
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .onConflict('id')
        .merge({
          terms_accepted_at: db.fn.now(),
          updated_at: db.fn.now()
        });

      logger.info(`[users] User ${userId} accepted terms`);

      res.json({
        success: true,
        data: {
          terms_accepted_at: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('[users] POST /accept-terms error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to record terms acceptance'
      });
    }
  });

  return router;
}

module.exports = createUsersRouter;
