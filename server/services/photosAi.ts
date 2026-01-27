// photosAi.ts - AI/queue integration for photo processing
/**
 * Service for queuing AI jobs, model allowlist/validation, and integration with AI providers.
 * Inject queue, logger, MODEL_ALLOWLIST, etc.
 */

type AddAIJob = (photoId: string, jobOptions?: Record<string, unknown>) => Promise<void> | void;

type CreatePhotosAiDeps = {
  addAIJob: AddAIJob;
  MODEL_ALLOWLIST: string[];
};

type PhotosAiService = {
  enqueuePhotoAiJob: (photoId: string, jobOptions?: Record<string, unknown>) => Promise<void>;
  isModelAllowed: (modelName: string) => boolean;
};

const createPhotosAi = function createPhotosAi({ addAIJob, MODEL_ALLOWLIST }: CreatePhotosAiDeps): PhotosAiService {
  return {
    /**
     * Add a job to the AI queue for a given photo.
     * @param photoId
     * @param jobOptions
     */
    async enqueuePhotoAiJob(photoId: string, jobOptions: Record<string, unknown> = {}) {
      return addAIJob(photoId, jobOptions);
    },
    /**
     * Validate that a model is in the allowlist.
     * @param modelName
     */
    isModelAllowed(modelName: string) {
      return MODEL_ALLOWLIST.includes(modelName);
    },
  };
};

export = createPhotosAi;