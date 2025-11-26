// photosState.js - Photo business logic and state transitions
/**
 * Service for business/state logic of photo transitions (working, inprogress, finished, etc.).
 * Inject db, storage, logger as needed.
 */
module.exports = function createPhotosState({ db, storage }) {
  return {
    /**
     * Transition a photo from one state to another.
     * Handles storage operations and DB updates as needed.
     * @param {string} photoId
     * @param {string} userId
     * @param {string} fromState
     * @param {string} toState
     * @param {string} filename
     * @param {string} [storagePath]
     * @returns {Promise<Object>} Result object {success, error, error_details}
     */
    async transitionState(photoId, userId, fromState, toState, filename, storagePath) {
      // 1. Mark transition status
      await db('photos').where({ id: photoId, user_id: userId }).update({ state_transition_status: 'PENDING_MOVE' });
      const currentPath = storagePath || `${fromState}/${filename}`;
      const newPath = `${toState}/${filename}`;
      // 2. Try move
      const { error: moveErrorInitial } = await storage.movePhoto(currentPath, newPath);
      let moveError = moveErrorInitial;
      // 3. Handle error: already exists
      if (moveError && /already exists|file already exists|resource already exists/i.test(moveError.message||'')) {
        const { error: _removeErr } = await storage.deletePhotos([currentPath]);
        // Ignore errors on remove
        moveError = null;
      }
      // 4. Handle error: not found
      if (moveError && /not found|no such file|no such object/i.test(moveError.message||'')) {
        // Not Found Fallback
        // Try to download, upload to new path, remove original
        const { data: downloadData, error: downloadError } = await storage.downloadPhoto(currentPath);
        if (downloadError) {
          await db('photos').where({ id: photoId, user_id: userId }).update({ state_transition_status: 'IDLE' });
          return { success: false, error: 'Failed to download source during fallback', error_details: downloadError };
        }
        // Stream to upload, assume downloadData.stream() returns Readable
        const { error: uploadError } = await storage.uploadPhoto(newPath, downloadData.stream ? downloadData.stream() : downloadData, { upsert: true });
        if (uploadError) {
          await db('photos').where({ id: photoId, user_id: userId }).update({ state_transition_status: 'IDLE' });
          return { success: false, error: 'Failed to upload during fallback', error_details: uploadError };
        }
        try {
          await storage.deletePhotos([currentPath]);
        } catch {}
        moveError = null; // <-- Fix: Reset moveError after successful fallback
      }
      // 5. On error not handled
      if (moveError) {
        await db('photos').where({ id: photoId, user_id: userId }).update({ state_transition_status: 'IDLE' });
        return { success: false, error: moveError.message || 'Failed to move file in storage', error_details: moveError };
      }
      // 6. Mark new state and path
      await db('photos').where({ id: photoId, user_id: userId }).update({
        state: toState,
        storage_path: newPath,
        state_transition_status: 'IDLE',
        updated_at: new Date().toISOString()
      });
      return { success: true };
    },
  };
};
