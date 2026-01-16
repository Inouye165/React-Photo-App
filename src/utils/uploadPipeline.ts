import { uploadPhotoToServer } from '../api';
import { compressForUpload, generateClientThumbnail } from './clientImageProcessing';
import useStore from '../store';
import type { AnalysisType } from '../types/uploads';

export type UploadPipelineOptions = {
  files: File[];
  analysisType?: AnalysisType;
  collectibleId?: string | number | null;
  onUploadComplete?: () => void | Promise<void>;
  onUploadSuccess?: (count: number) => void;
  generateThumbnail?: (file: File) => Promise<Blob | null>;
  convertToJpeg?: (file: File) => Promise<File>;
};

const DEFAULT_THUMBNAIL_TIMEOUT_MS = Number(import.meta.env.VITE_THUMBNAIL_GENERATION_TIMEOUT_MS || 5000);

export function normalizeCollectibleId(value?: string | number | null): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized ? normalized : undefined;
}

export function isHeicLikeFile(file: File): boolean {
  const name = file?.name?.toLowerCase() || '';
  const type = file?.type?.toLowerCase() || '';
  return name.endsWith('.heic') || name.endsWith('.heif') || type === 'image/heic' || type === 'image/heif';
}

export function toJpegFileName(originalName: string): string {
  if (/\.(heic|heif)$/i.test(originalName)) {
    return originalName.replace(/\.(heic|heif)$/i, '.jpg');
  }

  const lastDot = originalName.lastIndexOf('.');
  if (lastDot === -1) return `${originalName}.jpg`;
  return `${originalName.slice(0, lastDot)}.jpg`;
}

export async function convertToJpegIfHeic(file: File): Promise<File> {
  if (!isHeicLikeFile(file)) return file;

  const result = await compressForUpload(file);
  return new File([result.blob], toJpegFileName(file.name), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });
}

export function createThumbnailGenerator(timeoutMs = DEFAULT_THUMBNAIL_TIMEOUT_MS) {
  return async (file: File): Promise<Blob | null> => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return await generateClientThumbnail(file);
    }

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Thumbnail generation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve(generateClientThumbnail(file))
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  };
}

export function startBackgroundUpload({
  files,
  analysisType = 'none',
  collectibleId,
  onUploadComplete,
  onUploadSuccess,
  generateThumbnail,
  convertToJpeg,
}: UploadPipelineOptions): void {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  if (safeFiles.length === 0) return;

  const effectiveCollectibleId = normalizeCollectibleId(collectibleId);
  const pendingEntries = useStore.getState().addPendingUploads(safeFiles, effectiveCollectibleId) || [];
  const backgroundUploadIds = useStore.getState().addBackgroundUploads(safeFiles, analysisType) || [];
  const toJpeg = convertToJpeg || convertToJpegIfHeic;
  const buildThumbnail = generateThumbnail || createThumbnailGenerator();

  Promise.resolve().then(async () => {
    const removePendingUpload = useStore.getState().removePendingUpload;
    const errors: string[] = [];

    for (let i = 0; i < safeFiles.length; i++) {
      const file = safeFiles[i];
      const tempId = pendingEntries[i]?.id;
      const bgId = backgroundUploadIds[i];
      let thumbnailBlob: Blob | null = null;
      let fileForUpload: File;

      try {
        fileForUpload = await toJpeg(file);
      } catch (error) {
        errors.push(file?.name || 'unknown');
        const message = error instanceof Error ? error.message : String(error);
        if (bgId) useStore.getState().markBackgroundUploadError(bgId, message || 'HEIC conversion failed');
        if (tempId) removePendingUpload(tempId);
        continue;
      }

      try {
        thumbnailBlob = await buildThumbnail(fileForUpload);
      } catch {
        // Continue without thumbnail
      }

      try {
        await uploadPhotoToServer(fileForUpload, undefined, thumbnailBlob, {
          classification: analysisType,
          collectibleId: effectiveCollectibleId,
        });
        if (bgId) useStore.getState().markBackgroundUploadSuccess(bgId);

        if (typeof onUploadComplete === 'function') {
          try {
            await onUploadComplete();
          } catch {
            // Ignore callback errors
          }
        }
      } catch (error) {
        errors.push(file?.name || 'unknown');
        const message = error instanceof Error ? error.message : String(error);
        if (bgId) useStore.getState().markBackgroundUploadError(bgId, message || 'Upload failed');
      } finally {
        if (tempId) removePendingUpload(tempId);
      }
    }

    if (errors.length === 0) {
      if (typeof onUploadSuccess === 'function') {
        onUploadSuccess(safeFiles.length);
      }
    } else {
      useStore.getState().setBanner({
        message: `Upload failed for: ${errors.slice(0, 3).join(', ')}${
          errors.length > 3 ? ` (+${errors.length - 3} more)` : ''
        }`,
        severity: 'error',
      });
    }
  });
}
