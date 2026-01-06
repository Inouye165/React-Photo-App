// photosDb.js - Photo database service layer
/**
 * Service responsible for all photo database operations.
 * Use dependency injection for db for easy testing/mocking.
 */
module.exports = function createPhotosDb({ db }) {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const NUMERIC_ID_REGEX = /^\d+$/;

  async function resolvePhotoPrimaryId(anyId, userId) {
    const raw = typeof anyId === 'string' ? anyId.trim() : String(anyId);
    const isUuid = UUID_REGEX.test(raw);
    const isNumeric = NUMERIC_ID_REGEX.test(raw);

    // If it's already a UUID, prefer it as-is.
    if (isUuid) return raw;

    // If numeric, match by primary key for test/legacy environments where photos.id is numeric.
    if (isNumeric) {
      const numericId = Number(raw);
      
      {
        const row = await db('photos')
          .select('id')
          .where({ user_id: userId, id: numericId })
          .first();
        if (row && row.id) return row.id;
      }

      // Also try string form in case ids are stored as text.
      {
        const row = await db('photos')
          .select('id')
          .where({ user_id: userId, id: raw })
          .first();
        if (row && row.id) return row.id;
      }

      return null;
    }

    return null;
  }

  return {
    async listPhotos(userId, state, options = {}) {
      // OPTIMIZED: Select only lite columns for list view to reduce payload size
      // Heavy fields (poi_analysis, ai_model_history, text_style, storage_path, edited_filename)
      // are excluded - use getPhotoById for full detail view
      let query = db('photos').select(
        'id', 'filename', 'state', 'metadata', 'hash', 'file_size',
        'caption', 'description', 'keywords', 'classification', 'created_at'
      ).where('user_id', userId);
      
      if (state === 'working' || state === 'inprogress' || state === 'finished') {
        query = query.where({ state });
      }
      
      // Stable ordering for pagination: newest first, with id as tie-breaker
      query = query.orderBy('created_at', 'desc').orderBy('id', 'desc');
      
      // PAGINATION: Apply cursor-based filtering if cursor provided
      if (options.cursor) {
        const { created_at, id } = options.cursor;
        // For descending order: fetch rows "older than" the cursor tuple
        query = query.where(function() {
          this.where('created_at', '<', created_at)
            .orWhere(function() {
              this.where('created_at', '=', created_at)
                .andWhere('id', '<', id);
            });
        });
      }
      
      // PAGINATION: Apply limit if provided (add 1 to detect if more results exist)
      if (options.limit && Number.isInteger(options.limit) && options.limit > 0) {
        query = query.limit(options.limit + 1);
      }
      
      const timeoutMs = Number(options && options.timeoutMs);
      if (Number.isFinite(timeoutMs) && timeoutMs > 0 && typeof query.timeout === 'function') {
        query = query.timeout(timeoutMs, { cancel: true });
      }
      
      return await query;
    },
    async getPhotoById(photoId, userId) {
      return await db('photos')
        .leftJoin('collectibles', 'photos.id', 'collectibles.photo_id')
        .select(
          'photos.*',
          'collectibles.value_min as collectible_value_min',
          'collectibles.value_max as collectible_value_max',
          'collectibles.currency as collectible_currency',
          'collectibles.category as collectible_category',
          'collectibles.specifics as collectible_specifics'
        )
        .where({ 'photos.id': photoId, 'photos.user_id': userId })
        .first();
    },

    async resolvePhotoPrimaryId(anyId, userId) {
      return await resolvePhotoPrimaryId(anyId, userId);
    },

    async getPhotoByAnyId(anyId, userId) {
      const resolvedId = await resolvePhotoPrimaryId(anyId, userId);
      if (!resolvedId) return null;
      return await this.getPhotoById(resolvedId, userId);
    },
    async updatePhotoMetadata(photoId, userId, metadata) {
      const fields = {};
      if (metadata.caption !== undefined) fields.caption = metadata.caption;
      if (metadata.description !== undefined) fields.description = metadata.description;
      if (metadata.keywords !== undefined) fields.keywords = metadata.keywords;
      if (metadata.classification !== undefined) fields.classification = metadata.classification;
      if (metadata.textStyle !== undefined) fields.text_style = metadata.textStyle === null ? null : JSON.stringify(metadata.textStyle);
      fields.updated_at = new Date().toISOString();
      if (Object.keys(fields).length === 1) return false; // only updated_at
      const count = await db('photos').where({ id: photoId, user_id: userId }).update(fields);
      return count > 0;
    },
    async deletePhoto(photoId, userId) {
      const count = await db('photos').where({ id: photoId, user_id: userId }).del();
      return count > 0;
    },
    async getEditedPhoto(photoId, userId) {
      return await db('photos').where({ id: photoId, user_id: userId }).select('*').first();
    },
    async getPhotoByFilenameAndState(filename, state, userId) {
      return await db('photos')
        .where(function() {
          this.where({ filename, state })
              .orWhere({ edited_filename: filename, state });
        })
        .andWhere({ user_id: userId })
        .first();
    },
    async updatePhotoEditedFilename(photoId, userId, editedFilename) {
      const count = await db('photos')
        .where({ id: photoId, user_id: userId })
        .update({ 
          edited_filename: editedFilename,
          updated_at: new Date().toISOString()
        });
      return count > 0;
    },
    async updatePhoto(photoId, userId, fields) {
      const count = await db('photos')
        .where({ id: photoId, user_id: userId })
        .update(fields);
      return count > 0;
    },
    async setPhotoDisplayPath({ photoId, displayPath }) {
      const count = await db('photos')
        .where({ id: photoId })
        .update({
          display_path: displayPath,
          updated_at: new Date().toISOString(),
        });
      return count > 0;
    }
    // Add additional database operations as needed.
  };
};
