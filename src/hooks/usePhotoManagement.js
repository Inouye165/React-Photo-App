import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPhotos,
  updatePhotoState,
  recheckPhotoAI,
  updatePhotoCaption,
  deletePhoto,
  API_BASE_URL,
} from '../api.js';
import useStore from '../store.js';

function usePhotoManagement() {
  const photos = useStore((state) => state.photos);
  const setPhotos = useStore((state) => state.setPhotos);
  const updatePhotoData = useStore((state) => state.updatePhotoData);
  const removePhotoById = useStore((state) => state.removePhotoById);
  const moveToInprogress = useStore((state) => state.moveToInprogress);
  const pollingPhotoId = useStore((state) => state.pollingPhotoId);
  const setPollingPhotoId = useStore((state) => state.setPollingPhotoId);
  const toast = useStore((state) => state.toast);
  const setToast = useStore((state) => state.setToast);

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('working');
  const [activePhotoId, setActivePhotoId] = useState(null);
  const [editingMode, setEditingMode] = useState(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedKeywords, setEditedKeywords] = useState('');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [metadataPhoto, setMetadataPhoto] = useState(null);

  const lastActiveElementRef = useRef(null);

  const apiOrigin = useMemo(() => {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      return '';
    }
  }, []);

  const loadPhotos = useCallback(
    (endpoint = 'working') => {
      const controller = new AbortController();

      const task = (async () => {
        setLoading(true);
        try {
          const response = await getPhotos(endpoint);
          if (controller.signal.aborted) return;
          setPhotos((response && response.photos) || []);
        } catch (error) {
          if (controller.signal.aborted) return;
          setToast({ message: `Error loading photos from backend: ${error?.message || 'unknown'}`, severity: 'error' });
        } finally {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        }
      })();

      return {
        cancel: () => controller.abort(),
        promise: task,
      };
    },
    [setPhotos, setToast],
  );

  useEffect(() => {
    const { cancel } = loadPhotos(view);
    return cancel;
  }, [view, loadPhotos]);

  const refreshPhotos = useCallback(() => {
    loadPhotos(view);
  }, [view, loadPhotos]);

  const activePhoto = useMemo(() => {
    if (activePhotoId == null) return null;
    return photos.find((photo) => String(photo.id) === String(activePhotoId)) || null;
  }, [activePhotoId, photos]);

  const isInlineEditing = editingMode === 'inline';
  const isFullPageEditing = editingMode === 'full';

  useEffect(() => {
    if (!isInlineEditing || !activePhoto) return;
    setEditedCaption(activePhoto.caption || '');
    setEditedDescription(activePhoto.description || '');
    setEditedKeywords(activePhoto.keywords || '');
  }, [activePhoto, isInlineEditing]);

  useEffect(() => {
    if (!showMetadataModal || !activePhoto) return;
    setMetadataPhoto(activePhoto);
  }, [showMetadataModal, activePhoto]);

  useEffect(() => {
    const onRunAi = (event) => {
      try {
        const id = event?.detail?.photoId;
        if (id) setPollingPhotoId(id);
      } catch {
        /* noop */
      }
    };
    const onStorage = (event) => {
      try {
        if (!event || event.key !== 'photo:run-ai') return;
        if (!event.newValue) return;
        const parsed = JSON.parse(event.newValue);
        const id = parsed?.photoId;
        if (id) setPollingPhotoId(id);
      } catch {
        /* ignore */
      }
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('photo:run-ai', onRunAi);
      window.addEventListener('storage', onStorage);
    }
    return () => {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('photo:run-ai', onRunAi);
          window.removeEventListener('storage', onStorage);
        }
      } catch {
        /* ignore */
      }
    };
  }, [setPollingPhotoId]);

  useEffect(() => {
    const onMessage = (event) => {
      try {
        if (apiOrigin && event.origin && event.origin !== apiOrigin) return;
        const payload = event.data || {};
        if (payload && payload.type === 'updateCaption') {
          updatePhotoData(payload.id, { caption: payload.caption });
        }
      } catch {
        /* ignore */
      }
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('message', onMessage);
    }
    return () => {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('message', onMessage);
        }
      } catch {
        /* ignore */
      }
    };
  }, [apiOrigin, updatePhotoData]);

  const handleRecheckSinglePhoto = useCallback(
    async (photoId) => {
      try {
        const response = await recheckPhotoAI(photoId);
        setToast({ message: 'AI recheck initiated. Polling for results...', severity: 'info' });
        setPollingPhotoId(photoId);
        return response;
      } catch (error) {
        setToast({ message: `AI recheck failed: ${error?.message || 'unknown'}`, severity: 'error' });
        throw error;
      }
    },
    [setToast, setPollingPhotoId],
  );

  const handleMoveToFinished = useCallback(
    async (id) => {
      try {
        await updatePhotoState(id, 'finished');
        setToast({ message: 'Photo marked as finished', severity: 'success' });
        setEditingMode(null);
        setActivePhotoId(null);
        removePhotoById(id);
      } catch (error) {
        setToast({ message: `Error marking photo as finished: ${error.message}`, severity: 'error' });
      }
    },
    [removePhotoById, setToast],
  );

  const handleMoveToWorking = useCallback(
    async (id) => {
      try {
        await updatePhotoState(id, 'working');
        const { promise } = loadPhotos(view);
        await promise;
        setToast({ message: 'Photo moved back to working', severity: 'info' });
      } catch (error) {
        setToast({ message: `Error moving photo back to working: ${error.message}`, severity: 'error' });
      }
    },
    [loadPhotos, setToast, view],
  );

  const handleInlineSave = useCallback(async () => {
    if (!activePhoto) return;
    try {
      if (editedCaption !== (activePhoto.caption || '')) {
        await updatePhotoCaption(activePhoto.id, editedCaption);
      }
      updatePhotoData(activePhoto.id, {
        caption: editedCaption,
        description: editedDescription,
        keywords: editedKeywords,
      });
      setEditingMode(null);
      setToast({ message: 'Saved in app', severity: 'success' });
    } catch (error) {
      setToast({ message: `Save failed: ${error?.message || error}`, severity: 'error' });
    }
  }, [activePhoto, editedCaption, editedDescription, editedKeywords, setToast, updatePhotoData]);

  const handleDeletePhoto = useCallback(
    async (id) => {
      if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) return;
      try {
        await deletePhoto(id);
        removePhotoById(id);
        setToast({ message: 'Photo deleted successfully', severity: 'success' });
        if (String(activePhotoId) === String(id)) {
          setActivePhotoId(null);
          setEditingMode(null);
        }
      } catch (error) {
        if (error && (error.status === 401 || error.status === 403)) {
          window.location.reload();
          return;
        }
        setToast({ message: `Error deleting photo: ${error?.message || error}`, severity: 'error' });
      }
    },
    [activePhotoId, removePhotoById, setToast],
  );

  const handleEditPhoto = useCallback((photo, openFullPage = false) => {
    if (!photo) return;
    try {
      lastActiveElementRef.current = document.activeElement;
    } catch {
      /* ignore focus capture failures */
    }
    setActivePhotoId(photo.id);
    if (openFullPage) {
      setEditingMode('full');
    } else {
      setEditingMode('inline');
      setEditedCaption(photo.caption || '');
      setEditedDescription(photo.description || '');
      setEditedKeywords(photo.keywords || '');
    }
  }, []);

  const handleSelectPhoto = useCallback((photo) => {
    setActivePhotoId(photo ? photo.id : null);
    setEditingMode(null);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setEditingMode(null);
    setActivePhotoId(null);
    try {
      lastActiveElementRef.current?.focus?.();
    } catch {
      /* ignore focus restore errors */
    }
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingMode(null);
    try {
      lastActiveElementRef.current?.focus?.();
    } catch {
      /* ignore focus restore errors */
    }
  }, []);

  const handleMoveToInprogress = useCallback(
    async (id) => {
      const result = await moveToInprogress(id);
      if (!result?.success) return result;
      setActivePhotoId(null);
      setEditingMode(null);
      return result;
    },
    [moveToInprogress],
  );

  return {
    photos,
    toast,
    setToast,
    loading,
    view,
    setView,
    activePhotoId,
    setActivePhotoId,
    activePhoto,
    editingMode,
    setEditingMode,
    editedCaption,
    setEditedCaption,
    editedDescription,
    setEditedDescription,
    editedKeywords,
    setEditedKeywords,
    showMetadataModal,
    setShowMetadataModal,
    metadataPhoto,
    setMetadataPhoto,
    pollingPhotoId,
    setPollingPhotoId,
    loadPhotos,
    refreshPhotos,
    isInlineEditing,
    isFullPageEditing,
    handleRecheckSinglePhoto,
    handleMoveToFinished,
    handleMoveToWorking,
    handleInlineSave,
    handleDeletePhoto,
    handleEditPhoto,
    handleSelectPhoto,
    handleCloseDetail,
    handleCloseEditor,
    handleMoveToInprogress,
    setPhotos,
  };
}

export default usePhotoManagement;
