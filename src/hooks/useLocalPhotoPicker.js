import { useCallback, useMemo, useRef } from 'react';
import { parse } from 'exifr';
import { uploadPhotoToServer } from '../api.js';
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import useStore from '../store.js';

export default function useLocalPhotoPicker({ onUploadComplete, onUploadSuccess }) {
  const uploadPicker = useStore((state) => state.uploadPicker);
  const pickerCommand = useStore((state) => state.pickerCommand);
  const workingDirHandleRef = useRef(null);

  const startDate = uploadPicker.filters.startDate;
  const endDate = uploadPicker.filters.endDate;
  const uploading = uploadPicker.status === 'uploading';
  const showPicker = uploadPicker.status !== 'closed';

  const handleSelectFolder = useCallback(async () => {
    try {
      if (!window.showDirectoryPicker) {
        throw new Error('File System Access API not supported');
      }

      const dirHandle = await window.showDirectoryPicker();
      const files = [];

      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(name)) {
          const file = await handle.getFile();
          try {
            const exif = await parse(file);
            const exifDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.DateTime;
            files.push({ name, file, exifDate, handle });
          } catch {
            files.push({ name, file, exifDate: null, handle });
          }
        }
      }

      workingDirHandleRef.current = dirHandle;
      pickerCommand.openPicker({ dirHandle, files });
    } catch {
      // toast removed: folder selection failed
    }
  }, [pickerCommand]);

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

  const setStartDate = useCallback((value) => {
    pickerCommand.setFilters({ startDate: value, endDate });
  }, [pickerCommand, endDate]);

  const setEndDate = useCallback((value) => {
    pickerCommand.setFilters({ startDate, endDate: value });
  }, [pickerCommand, startDate]);

  const handleUploadFiltered = useCallback(async (subsetToUpload) => {
    const photosToUpload = Array.isArray(subsetToUpload) ? subsetToUpload : filteredLocalPhotos;
    if (photosToUpload.length === 0) return;

    pickerCommand.startUpload({ ids: photosToUpload.map((photo) => photo.id) });
    let encounteredError = null;
    try {
      for (const photo of photosToUpload) {
        let thumbnailBlob = null;
        try {
          thumbnailBlob = await generateClientThumbnail(photo.file);
        } catch (err) {
          // Graceful fallback: log and continue without thumbnail
          console.warn(`Thumbnail generation failed for ${photo.name}:`, err);
        }
        try {
          const uploadResponse = await uploadPhotoToServer(photo.file, undefined, thumbnailBlob);
          pickerCommand.markUploadSuccess(photo.id);
          // Log compass direction (if available) from server response
          if (uploadResponse && uploadResponse.metadata) {
            const direction = uploadResponse.metadata.compass_heading;
            console.log(`Photo '${photo.name}': Compass direction =`, direction !== undefined ? direction : 'Not found');
          } else {
            console.log(`Photo '${photo.name}': No metadata returned from server.`);
          }
        } catch (error) {
          encounteredError = error;
          pickerCommand.markUploadFailure(photo.id, error?.message);
        }
      }

  // toast removed: upload success
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
  }, [filteredLocalPhotos, onUploadComplete, onUploadSuccess, pickerCommand]);

  return {
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFiltered,
    showPicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
    workingDirHandleRef,
  };
}
