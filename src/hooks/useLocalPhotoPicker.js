import { useCallback, useMemo, useRef, useState } from 'react';
import { parse } from 'exifr';
import { uploadPhotoToServer } from '../api.js';
import { generateClientThumbnail } from '../utils/clientImageProcessing.js';
import useStore from '../store.js';

export default function useLocalPhotoPicker({ onUploadComplete, onUploadSuccess }) {
  const [localPhotos, setLocalPhotos] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [uploading, setUploading] = useState(false);
  const showPicker = useStore((state) => state.showUploadPicker);
  const setShowPicker = useStore((state) => state.setShowUploadPicker);
  const workingDirHandleRef = useRef(null);

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
      setLocalPhotos(files);
      setShowPicker(true);
    } catch {
      // toast removed: folder selection failed
    }
  }, [setShowPicker]);

  const filteredLocalPhotos = useMemo(() => {
    if (!Array.isArray(localPhotos) || localPhotos.length === 0) return [];

    return localPhotos.filter((photo) => {
      if (!startDate && !endDate) return true;

      const rawDate = photo.exifDate ? new Date(photo.exifDate) : new Date(photo.file.lastModified);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

      return (!start || rawDate >= start) && (!end || rawDate <= end);
    });
  }, [localPhotos, startDate, endDate]);

  const handleUploadFiltered = useCallback(async (subsetToUpload) => {
    const photosToUpload = Array.isArray(subsetToUpload) ? subsetToUpload : filteredLocalPhotos;
    if (photosToUpload.length === 0) return;

    setUploading(true);
    try {
      for (const photo of photosToUpload) {
        let thumbnailBlob = null;
        try {
          thumbnailBlob = await generateClientThumbnail(photo.file);
        } catch (err) {
          // Graceful fallback: log and continue without thumbnail
          console.warn(`Thumbnail generation failed for ${photo.name}:`, err);
        }
        const uploadResponse = await uploadPhotoToServer(photo.file, undefined, thumbnailBlob);
        // Log compass direction (if available) from server response
        if (uploadResponse && uploadResponse.metadata) {
          const direction = uploadResponse.metadata.compass_heading;
          console.log(`Photo '${photo.name}': Compass direction =`, direction !== undefined ? direction : 'Not found');
        } else {
          console.log(`Photo '${photo.name}': No metadata returned from server.`);
        }
      }

  // toast removed: upload success
      setLocalPhotos([]);
      setShowPicker(false);
      setStartDate('');
      setEndDate('');
      if (typeof onUploadSuccess === 'function') {
        onUploadSuccess(photosToUpload.length);
      }
      if (typeof onUploadComplete === 'function') {
        await onUploadComplete();
      }
    } catch {
      // toast removed: upload failed
    } finally {
      setUploading(false);
    }
  }, [filteredLocalPhotos, onUploadComplete, onUploadSuccess, setShowPicker]);

  return {
    localPhotos,
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFiltered,
    showPicker,
    setShowPicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
    workingDirHandleRef,
  };
}
