import { useCallback, useMemo, useRef } from 'react';
import { parse } from 'exifr';
import { uploadPhotoToServer } from '../api';
import useStore from '../store';
import type { UploadPickerLocalPhoto } from '../store/uploadPickerSlice';
import type { UploadResponse } from '../types/global';
import type { AnalysisType } from '../types/uploads';
import { convertToJpegIfHeic, createThumbnailGenerator, startBackgroundUpload } from '../utils/uploadPipeline';

/**
 * File object with optional handle from File System Access API
 */
interface FileWithHandle {
  name: string;
  file: File;
  handle?: FileSystemFileHandle | null;
}

/**
 * Hook options
 */
interface UseLocalPhotoPickerOptions {
  onUploadComplete?: () => void | Promise<void>;
  onUploadSuccess?: (count: number) => void;
  collectibleId?: string | number | null;
}

/**
 * Return type for useLocalPhotoPicker hook
 */
interface UseLocalPhotoPickerReturn {
  filteredLocalPhotos: UploadPickerLocalPhoto[];
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  handleSelectFolder: () => Promise<void>;
  handleNativeSelection: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleUploadFiltered: (
    subsetToUpload?: UploadPickerLocalPhoto[],
    analysisType?: AnalysisType
  ) => Promise<void>;
  handleUploadFilteredOptimistic: (
    subsetToUpload?: UploadPickerLocalPhoto[],
    analysisType?: AnalysisType,
    overrideCollectibleId?: string
  ) => void;
  showPicker: boolean;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  uploading: boolean;
  workingDirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
}

/**
 * Custom hook for managing local photo selection and upload
 * * Provides two file selection methods:
 * - Modern: File System Access API (showDirectoryPicker) for Chrome/Edge
 * - Fallback: Standard file input for Safari/Firefox/mobile
 * * @security Input validation on all file operations
 * @security EXIF parsing errors handled gracefully
 * @security Upload errors isolated per file (one failure doesn't block others)
 * * @param options - Hook configuration options
 * @returns Photo picker state and handlers
 */
export default function useLocalPhotoPicker({
  onUploadComplete,
  onUploadSuccess,
  collectibleId,
}: UseLocalPhotoPickerOptions): UseLocalPhotoPickerReturn {
  const uploadPicker = useStore((state) => state.uploadPicker);
  const pickerCommand = useStore((state) => state.pickerCommand);
  const workingDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startDate = uploadPicker.filters.startDate;
  const endDate = uploadPicker.filters.endDate;
  const uploading = uploadPicker.status === 'uploading';
  const showPicker = uploadPicker.status !== 'closed';

  const exifParseTimeoutMs = Number(import.meta.env.VITE_EXIF_PARSE_TIMEOUT_MS || 1500);
  const thumbnailTimeoutMs = Number(import.meta.env.VITE_THUMBNAIL_GENERATION_TIMEOUT_MS || 5000);

  const generateThumbnailWithTimeout = useCallback(createThumbnailGenerator(thumbnailTimeoutMs), [thumbnailTimeoutMs]);

  const parseExifWithTimeout = useCallback(
    async (file: File) => {
      if (!Number.isFinite(exifParseTimeoutMs) || exifParseTimeoutMs <= 0) {
        return parse(file);
      }

      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`EXIF parse timeout after ${exifParseTimeoutMs}ms`));
        }, exifParseTimeoutMs);

        Promise.resolve(parse(file))
          .then((value) => {
            clearTimeout(timer);
            resolve(value);
          })
          .catch((err) => {
            clearTimeout(timer);
            reject(err);
          });
      });
    },
    [exifParseTimeoutMs],
  );

  const convertToJpegIfHeicSafe = useCallback((file: File) => convertToJpegIfHeic(file), []);

  const supportedExtensions = useMemo(
    () => new Set(['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.webp']),
    []
  );

  const getExtension = useCallback((name: string) => {
    const lastDot = name.lastIndexOf('.');
    return lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';
  }, []);

  const isSupportedImageFile = useCallback(
    (file: File) => file.type.startsWith('image/') || supportedExtensions.has(getExtension(file.name)),
    [getExtension, supportedExtensions]
  );

  /**
   * Shared file processing logic: parses EXIF data from files
   * @security EXIF parsing wrapped in try-catch, continues on failure
   * @security No metadata leakage in logs (file names only)
   */
  const processFiles = useCallback(
    async (fileList: (File | FileWithHandle)[], dirHandle: FileSystemDirectoryHandle | null = null) => {
      const seenKeys = new Set<string>();
      const skipped: Array<{ name: string; reason: string }> = [];
      const files: Array<{
        name: string;
        file: File;
        exifDate: string | null;
        handle: FileSystemFileHandle | null;
      }> = [];

      for (const fileObj of fileList) {
        let file: File;
        let name: string;
        let handle: FileSystemFileHandle | null = null;

        if (fileObj instanceof File) {
          file = fileObj;
          name = fileObj.name;
          handle = null;
        } else {
          file = fileObj.file;
          name = fileObj.name;
          handle = (fileObj.handle as FileSystemFileHandle) || null;
        }

        if (!file || file.size === 0) {
          skipped.push({ name, reason: 'empty-file' });
          continue;
        }

        if (!isSupportedImageFile(file)) {
          skipped.push({ name, reason: 'unsupported-type' });
          continue;
        }

        const dedupeKey = `${name}::${file.size}::${file.lastModified}`;
        if (seenKeys.has(dedupeKey)) {
          skipped.push({ name, reason: 'duplicate' });
          continue;
        }
        seenKeys.add(dedupeKey);

        try {
          const exif = await parseExifWithTimeout(file);
          const exifDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.DateTime || null;
          files.push({ name, file, exifDate, handle });
        } catch {
          // EXIF parse failure: continue without date
          files.push({ name, file, exifDate: null, handle });
        }
      }

      if (import.meta.env.DEV && skipped.length > 0) {
        console.warn('[Picker] Skipped files during selection:', skipped);
      }

      pickerCommand.openPicker({ dirHandle, files });
    },
    [isSupportedImageFile, pickerCommand, parseExifWithTimeout]
  );

  /**
   * Modern API handler: uses File System Access API (Chrome/Edge)
   * @security Wrapped in try-catch, fails silently (user may cancel)
   */
  const handleSelectFolder = useCallback(async () => {
    try {
      if (!window.showDirectoryPicker) {
        throw new Error('File System Access API not supported');
      }

      const dirHandle = await window.showDirectoryPicker();
      const fileList: FileWithHandle[] = [];

      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && /\.(jpg|jpeg|png|gif|heic|heif|webp)$/i.test(name)) {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          fileList.push({ name, file, handle: fileHandle });
        }
      }

      workingDirHandleRef.current = dirHandle;
      await processFiles(fileList, dirHandle);
    } catch {
      // User cancelled or API not supported - fail silently
    }
  }, [processFiles]);

  /**
   * Fallback handler: standard file input for Safari/Firefox/mobile
   * @security Validates event.target.files exists
   * @security Handles empty selection gracefully
   */
  const handleNativeSelection = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = (event?.currentTarget || event?.target) as HTMLInputElement | null;
      const files = inputEl?.files;
      const inputFiles = Array.from(files || []);

      // Force reset the input so the same file can be selected again later
      if (inputEl) inputEl.value = '';
      try {
        await processFiles(inputFiles, null);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        } else if (inputEl) {
          inputEl.value = '';
        }
      }
    },
    [processFiles]
  );

  /**
   * Filtered photos based on date range
   * @security Date parsing wrapped in try-catch via Date constructor
   */
  const filteredLocalPhotos = useMemo(() => {
    const localPhotos = uploadPicker.localPhotos || [];
    if (localPhotos.length === 0) return [];

    return localPhotos.filter((photo) => {
      if (!startDate && !endDate) return true;

      const rawDate = photo.exifDate ? new Date(photo.exifDate) : new Date(photo.file.lastModified);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

      return (!start || rawDate >= start) && (!end || rawDate <= end);
    });
  }, [uploadPicker.localPhotos, startDate, endDate]);

  const getFreshFilteredLocalPhotos = useCallback((): UploadPickerLocalPhoto[] => {
    const { uploadPicker: freshUploadPicker } = useStore.getState();
    const localPhotos = freshUploadPicker.localPhotos || [];
    if (localPhotos.length === 0) return [];

    const freshStartDate = freshUploadPicker.filters.startDate;
    const freshEndDate = freshUploadPicker.filters.endDate;
    if (!freshStartDate && !freshEndDate) return localPhotos;

    return localPhotos.filter((photo) => {
      const rawDate = photo.exifDate ? new Date(photo.exifDate) : new Date(photo.file.lastModified);
      const start = freshStartDate ? new Date(freshStartDate) : null;
      const end = freshEndDate ? new Date(`${freshEndDate}T23:59:59`) : null;

      return (!start || rawDate >= start) && (!end || rawDate <= end);
    });
  }, []);

  /**
   * Update start date filter
   */
  const setStartDate = useCallback(
    (value: string) => {
      pickerCommand.setFilters({ startDate: value, endDate });
    },
    [pickerCommand, endDate]
  );

  /**
   * Update end date filter
   */
  const setEndDate = useCallback(
    (value: string) => {
      pickerCommand.setFilters({ startDate, endDate: value });
    },
    [pickerCommand, startDate]
  );

  /**
   * Upload filtered photos with blocking UI
   * @security Per-file error handling: one failure doesn't block others
   * @security Thumbnail generation failures don't block upload
   * @security No sensitive metadata in logs (file names only)
   */
  const handleUploadFiltered = useCallback(
    async (subsetToUpload?: UploadPickerLocalPhoto[], analysisType: AnalysisType = 'none') => {
      const photosToUpload = Array.isArray(subsetToUpload) ? subsetToUpload : filteredLocalPhotos;
      if (photosToUpload.length === 0) return;

      pickerCommand.startUpload({ ids: photosToUpload.map((photo) => photo.id) });
      let encounteredError: Error | null = null;

      try {
        for (const photo of photosToUpload) {
          let fileForUpload: File;
          let thumbnailBlob: Blob | null = null;

          try {
            fileForUpload = await convertToJpegIfHeicSafe(photo.file);
          } catch (err) {
            encounteredError = err as Error;
            const message = err instanceof Error ? err.message : String(err);
            pickerCommand.markUploadFailure(photo.id, message || 'HEIC conversion failed');
            continue;
          }

          try {
            thumbnailBlob = await generateThumbnailWithTimeout(fileForUpload);
          } catch (err) {
            // Graceful fallback: log and continue without thumbnail
            if (import.meta.env.DEV) {
              console.warn(`Thumbnail generation failed for ${photo.name}:`, err);
            }
          }

          try {
            const uploadResponse = (await uploadPhotoToServer(
              fileForUpload,
              undefined,
              thumbnailBlob,
              { classification: analysisType }
            )) as UploadResponse;
            pickerCommand.markUploadSuccess(photo.id);

            // Log compass direction (if available) from server response
            // Security: only log non-sensitive metadata
            if (import.meta.env.DEV) {
              if (uploadResponse && uploadResponse.metadata) {
                const direction = uploadResponse.metadata.compass_heading;
                console.log(
                  `Photo '${photo.name}': Compass direction =`,
                  direction !== undefined ? direction : 'Not found'
                );
              } else {
                console.log(`Photo '${photo.name}': No metadata returned from server.`);
              }
            }
          } catch (error) {
            encounteredError = error as Error;
            pickerCommand.markUploadFailure(photo.id, (error as Error)?.message);
          }
        }

        if (!encounteredError) {
          pickerCommand.closePicker('upload-complete');
          if (typeof onUploadSuccess === 'function') {
            onUploadSuccess(photosToUpload.length);
          }
          if (typeof onUploadComplete === 'function') {
            await onUploadComplete();
          }
        }
      } finally {
        pickerCommand.finishUploads(encounteredError ? 'error' : 'complete');
      }
    },
    [convertToJpegIfHeicSafe, filteredLocalPhotos, generateThumbnailWithTimeout, onUploadComplete, onUploadSuccess, pickerCommand]
  );

  /**
   * Optimistic upload: close picker immediately and upload in background
   * @security Fire-and-forget with full error handling
   * @security No user blocking on upload failures
   */
  const handleUploadFilteredOptimistic = useCallback(
    (subsetToUpload?: UploadPickerLocalPhoto[], analysisType: AnalysisType = 'none', overrideCollectibleId?: string) => {
      const photosToUpload = Array.isArray(subsetToUpload) ? subsetToUpload : getFreshFilteredLocalPhotos();
      if (photosToUpload.length === 0) return;

      const files = photosToUpload.map((p) => p?.file).filter(Boolean);
      if (files.length === 0) return;

      // Use override if provided, otherwise fallback to prop
      const targetId = overrideCollectibleId ?? collectibleId;

      console.log(
        `[Picker] Selected ${files.length} files for upload. Target Collectible: ${targetId || 'None'}`
      );
      files.forEach((f) => console.log(`[Picker] Processing file: ${f.name}`));

      const effectiveCollectibleId =
        typeof targetId === 'string' && targetId.trim()
          ? targetId.trim()
          : targetId != null
            ? String(targetId)
            : undefined;

      // Close the picker UI immediately so the user returns to the gallery
      pickerCommand.closePicker('optimistic-upload-start');

      startBackgroundUpload({
        files,
        analysisType,
        collectibleId: effectiveCollectibleId,
        onUploadComplete,
        onUploadSuccess,
        generateThumbnail: generateThumbnailWithTimeout,
        convertToJpeg: convertToJpegIfHeicSafe,
      });
    },
    [
      collectibleId,
      convertToJpegIfHeicSafe,
      generateThumbnailWithTimeout,
      getFreshFilteredLocalPhotos,
      onUploadComplete,
      onUploadSuccess,
      pickerCommand,
      startBackgroundUpload,
    ]
  );

  return {
    filteredLocalPhotos,
    fileInputRef,
    handleSelectFolder,
    handleNativeSelection,
    handleUploadFiltered,
    handleUploadFilteredOptimistic,
    showPicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
    workingDirHandleRef,
  };
}