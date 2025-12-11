// photosAi.js - AI/queue integration for photo processing
/**
 * Service for queuing AI jobs, model allowlist/validation, and integration with AI providers.
 * Inject queue, logger, DYNAMIC_MODEL_ALLOWLIST, etc.
 */
module.exports = function createPhotosAi({ addAIJob, MODEL_ALLOWLIST }) {
  return {
    /**
     * Add a job to the AI queue for a given photo.
     * @param {string} photoId
     * @param {Object} [jobOptions]
     * @returns {Promise<void>}
     */
    async enqueuePhotoAiJob(photoId, jobOptions = {}) {
      return addAIJob(photoId, jobOptions);
    },
    /**
     * Validate that a model is in the allowlist.
     * @param {string} modelName
     * @returns {boolean}
     */
    isModelAllowed(modelName) {
      return MODEL_ALLOWLIST.includes(modelName);
    }
  };
};

