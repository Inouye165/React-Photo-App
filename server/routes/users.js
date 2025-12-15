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

  // All routes require authentication
  router.use(authenticateToken);

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
