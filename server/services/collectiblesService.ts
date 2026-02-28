// @ts-nocheck

/**
 * Collectibles Service Layer
 * 
 * Service responsible for all collectibles database operations.
 * Follows the "Sidecar Architecture" pattern - failures here should not
 * affect the main photo gallery functionality.
 * 
 * @module server/services/collectiblesService
 */

'use strict';

const { assertCollectiblesDbEnabled, isCollectiblesDbEnabled } = require('../utils/featureFlags');
const createUserPreferencesService = require('./userPreferences');

/**
 * Factory function to create a collectibles service instance.
 * Uses dependency injection for testability.
 * 
 * @param {Object} options - Service dependencies
 * @param {import('knex').Knex} options.db - Knex database instance
 * @returns {Object} Collectibles service methods
 */
function createCollectiblesService({ db }) {
  // Create preferences service for definition lookups
  const preferencesService = createUserPreferencesService({ db });
  /**
   * Upsert a collectible record for a photo.
   * Uses INSERT ... ON CONFLICT for idempotent operations.
   * 
   * @param {string} userId - User UUID who owns the collectible
   * @param {number} photoId - Photo ID to link the collectible to
   * @param {Object} options - Collectible data
   * @param {Object} [options.formState] - User form input data
   * @param {string} [options.formState.category] - Collectible category
   * @param {string} [options.formState.name] - Item name
   * @param {number} [options.formState.conditionRank] - Condition rank (1-5)
   * @param {string} [options.formState.conditionLabel] - Condition label
   * @param {string} [options.formState.conditionDef] - Condition definition snapshot
   * @param {number} [options.formState.valueMin] - Minimum estimated value
   * @param {number} [options.formState.valueMax] - Maximum estimated value
   * @param {string} [options.formState.currency] - Currency code (default: 'USD')
   * @param {Object} [options.formState.specifics] - Category-specific key-value pairs
   * @param {Object} [options.latestAiRun] - Latest AI analysis result
   * @param {boolean} [options.recordAi=false] - Whether to append AI result to history
   * @returns {Promise<Object>} The upserted collectible record
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   * @throws {Error} When database operation fails
   */
  async function upsertCollectible(userId, photoId, { formState = {}, latestAiRun = null, recordAi = false } = {}) {
    assertCollectiblesDbEnabled();

    if (!userId) {
      throw new Error('userId is required');
    }
    if (!photoId) {
      throw new Error('photoId is required');
    }

    // SNAPSHOTTING: If conditionDef not provided but we have category and label,
    // look up the user's definition and snapshot it
    let conditionDef = formState.conditionDef || null;
    if (!conditionDef && formState.category && formState.conditionLabel) {
      conditionDef = await preferencesService.getDefinition(
        userId,
        formState.category,
        formState.conditionLabel
      );
    }

    // Map form state to database columns
    const collectibleData = {
      user_id: userId,
      photo_id: photoId,
      schema_version: 1,
      category: formState.category || null,
      name: formState.name || null,
      condition_rank: formState.conditionRank || null,
      condition_label: formState.conditionLabel || null,
      condition_def: conditionDef,
      value_min: formState.valueMin || null,
      value_max: formState.valueMax || null,
      currency: formState.currency || 'USD',
      specifics: JSON.stringify(formState.specifics || {}),
      updated_at: new Date().toISOString()
    };

    // Check if record exists
    const existing = await db('collectibles')
      .where({ photo_id: photoId, user_id: userId })
      .first();

    let result;

    if (existing) {
      // Handle AI history append if recordAi is true
      if (recordAi && latestAiRun) {
        let currentHistory = [];
        try {
          currentHistory = typeof existing.ai_analysis_history === 'string'
            ? JSON.parse(existing.ai_analysis_history)
            : (existing.ai_analysis_history || []);
        } catch {
          currentHistory = [];
        }
        
        // Append new AI run with timestamp
        const aiRunWithTimestamp = {
          ...latestAiRun,
          recorded_at: new Date().toISOString()
        };
        currentHistory.push(aiRunWithTimestamp);
        collectibleData.ai_analysis_history = JSON.stringify(currentHistory);
      }

      // Update existing record
      await db('collectibles')
        .where({ id: existing.id })
        .update(collectibleData);
      
      result = await db('collectibles').where({ id: existing.id }).first();
    } else {
      // Insert new record
      collectibleData.created_at = new Date().toISOString();
      
      // Handle AI history for new record
      if (recordAi && latestAiRun) {
        const aiRunWithTimestamp = {
          ...latestAiRun,
          recorded_at: new Date().toISOString()
        };
        collectibleData.ai_analysis_history = JSON.stringify([aiRunWithTimestamp]);
      } else {
        collectibleData.ai_analysis_history = JSON.stringify([]);
      }

      const [id] = await db('collectibles')
        .insert(collectibleData)
        .returning('id');
      
      // Handle different return formats from Knex
      const insertedId = typeof id === 'object' ? id.id : id;
      result = await db('collectibles').where({ id: insertedId }).first();
    }

    return result;
  }

  /**
   * Get a collectible by photo ID for a specific user.
   * 
   * @param {string} userId - User UUID
   * @param {number} photoId - Photo ID
   * @returns {Promise<Object|null>} Collectible record or null if not found
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function getCollectibleByPhotoId(userId, photoId) {
    assertCollectiblesDbEnabled();

    return await db('collectibles')
      .where({ user_id: userId, photo_id: photoId })
      .first();
  }

  /**
   * Get all collectibles for a user with optional filtering.
   * 
   * @param {string} userId - User UUID
   * @param {Object} [filters] - Optional filters
   * @param {string} [filters.category] - Filter by category
   * @param {number} [filters.minCondition] - Minimum condition rank
   * @param {number} [filters.maxCondition] - Maximum condition rank
   * @returns {Promise<Object[]>} Array of collectible records
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function listCollectibles(userId, filters = {}) {
    assertCollectiblesDbEnabled();

    let query = db('collectibles').where({ user_id: userId });

    if (filters.category) {
      query = query.where({ category: filters.category });
    }
    if (filters.minCondition) {
      query = query.where('condition_rank', '>=', filters.minCondition);
    }
    if (filters.maxCondition) {
      query = query.where('condition_rank', '<=', filters.maxCondition);
    }

    return await query.orderBy('created_at', 'desc');
  }

  /**
   * Delete a collectible by ID.
   * 
   * @param {string} userId - User UUID
   * @param {number} collectibleId - Collectible ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function deleteCollectible(userId, collectibleId) {
    assertCollectiblesDbEnabled();

    const count = await db('collectibles')
      .where({ id: collectibleId, user_id: userId })
      .del();
    
    return count > 0;
  }

  /**
   * Add market data entry for a collectible.
   * 
   * @param {string} userId - User UUID
   * @param {number} collectibleId - Collectible ID
   * @param {Object} marketData - Market data entry
   * @param {number} marketData.price - Price observed
   * @param {Date|string} marketData.dateSeen - Date the price was observed
   * @param {string} [marketData.venue] - Where the price was observed
   * @param {number} [marketData.similarityScore] - 0-100 similarity score
   * @param {string} [marketData.url] - URL reference
   * @returns {Promise<Object>} Created market data record
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function addMarketData(userId, collectibleId, marketData) {
    assertCollectiblesDbEnabled();

    const data = {
      collectible_id: collectibleId,
      user_id: userId,
      price: marketData.price,
      date_seen: marketData.dateSeen,
      venue: marketData.venue || null,
      similarity_score: marketData.similarityScore || null,
      url: marketData.url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const [id] = await db('collectible_market_data')
      .insert(data)
      .returning('id');
    
    const insertedId = typeof id === 'object' ? id.id : id;
    return await db('collectible_market_data').where({ id: insertedId }).first();
  }

  /**
   * Bulk insert market data records within a transaction.
   * Designed for use within updatePhotoAIMetadata or similar orchestration functions.
   * 
   * @param {import('knex').Knex.Transaction} trx - Knex transaction object
   * @param {Object[]} records - Array of market data records
   * @param {number} records[].collectible_id - Collectible ID
   * @param {string} records[].user_id - User UUID
   * @param {number} records[].price - Price observed (must be a valid number)
   * @param {Date|string} [records[].date_seen] - Date the price was observed
   * @param {string} [records[].venue] - Where the price was observed (max 255 chars)
   * @param {number} [records[].similarity_score] - 0-100 similarity score
   * @param {string} [records[].url] - URL reference (max 2048 chars)
   * @returns {Promise<void>}
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function addMarketDataBulk(trx, records) {
    assertCollectiblesDbEnabled();

    if (!records || !Array.isArray(records) || records.length === 0) {
      return;
    }

    const sanitizedRecords = records
      .filter(r => r && typeof r.price === 'number' && !Number.isNaN(r.price))
      .map(r => ({
        collectible_id: r.collectible_id,
        user_id: r.user_id,
        price: r.price,
        date_seen: r.date_seen || new Date(),
        venue: r.venue ? String(r.venue).substring(0, 255) : null,
        similarity_score: r.similarity_score || null,
        url: (r.url && typeof r.url === 'string' && r.url.length < 2048) ? r.url : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

    if (sanitizedRecords.length > 0) {
      await trx('collectible_market_data').insert(sanitizedRecords);
    }
  }

  /**
   * Get market data history for a collectible.
   * 
   * @param {string} userId - User UUID
   * @param {number} collectibleId - Collectible ID
   * @returns {Promise<Object[]>} Array of market data records
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function getMarketData(userId, collectibleId) {
    assertCollectiblesDbEnabled();

    return await db('collectible_market_data')
      .where({ collectible_id: collectibleId, user_id: userId })
      .orderBy('date_seen', 'desc');
  }

  /**
   * Link an additional photo to a collectible.
   * 
   * @param {string} userId - User UUID
   * @param {number} collectibleId - Collectible ID
   * @param {number} photoId - Photo ID to link
   * @param {Object} [options] - Link options
   * @param {string} [options.role='detail'] - Photo role: 'primary', 'detail', 'damage'
   * @param {string} [options.description] - Photo description
   * @returns {Promise<Object>} Created link record
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function linkPhoto(userId, collectibleId, photoId, { role = 'detail', description = null } = {}) {
    assertCollectiblesDbEnabled();

    const data = {
      collectible_id: collectibleId,
      photo_id: photoId,
      user_id: userId,
      role,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Use upsert pattern for idempotency
    const existing = await db('collectible_photos')
      .where({ collectible_id: collectibleId, photo_id: photoId })
      .first();

    if (existing) {
      await db('collectible_photos')
        .where({ id: existing.id })
        .update({ role, description, updated_at: new Date().toISOString() });
      return await db('collectible_photos').where({ id: existing.id }).first();
    }

    const [id] = await db('collectible_photos')
      .insert(data)
      .returning('id');
    
    const insertedId = typeof id === 'object' ? id.id : id;
    return await db('collectible_photos').where({ id: insertedId }).first();
  }

  /**
   * Get all photos linked to a collectible.
   * 
   * @param {string} userId - User UUID
   * @param {number} collectibleId - Collectible ID
   * @returns {Promise<Object[]>} Array of photo link records
   * @throws {Error} When ENABLE_COLLECTIBLES_DB is false
   */
  async function getLinkedPhotos(userId, collectibleId) {
    assertCollectiblesDbEnabled();

    return await db('collectible_photos')
      .where({ collectible_id: collectibleId, user_id: userId })
      .orderBy('role', 'asc');
  }

  /**
   * Check if collectibles feature is enabled (no-throw version).
   * Useful for conditional UI rendering.
   * 
   * @returns {boolean} True if collectibles DB operations are enabled
   */
  function isEnabled() {
    return isCollectiblesDbEnabled();
  }

  return {
    upsertCollectible,
    getCollectibleByPhotoId,
    listCollectibles,
    deleteCollectible,
    addMarketData,
    addMarketDataBulk,
    getMarketData,
    linkPhoto,
    getLinkedPhotos,
    isEnabled
  };
}

module.exports = createCollectiblesService;
