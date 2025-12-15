// photosDb.js - Photo database service layer
/**
 * Service responsible for all photo database operations.
 * Use dependency injection for db for easy testing/mocking.
 */
module.exports = function createPhotosDb({ db }) {
  return {
    async listPhotos(userId, state) {
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
      return await query;
    },
    async getPhotoById(photoId, userId) {
      return await db('photos').where({ id: photoId, user_id: userId }).first();
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
    }
    // Add additional database operations as needed.
  };
};
