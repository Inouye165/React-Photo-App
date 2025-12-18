import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPhotos,
  updatePhotoState,
  recheckPhotoAI,
  updatePhotoCaption,
  deletePhoto,
  API_BASE_URL,
} from '../api';
import useStore from '../store';

function usePhotoManagement() {
  const photos = useStore((state) => state.photos);
  const setPhotos = useStore((state) => state.setPhotos);
  const updatePhotoData = useStore((state) => state.updatePhotoData);
  const removePhotoById = useStore((state) => state.removePhotoById);
  const moveToInprogress = useStore((state) => state.moveToInprogress);
  const pollingPhotoId = useStore((state) => state.pollingPhotoId);
  const pollingPhotoIds = useStore((state) => state.pollingPhotoIds);
  const setPollingPhotoId = useStore((state) => state.setPollingPhotoId);
  const startAiPolling = useStore((state) => state.startAiPolling);
  const setBanner = useStore((state) => state.setBanner);

  // UI state now from store
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);
  const activePhotoId = useStore((state) => state.activePhotoId);
  const setActivePhotoId = useStore((state) => state.setActivePhotoId);
  const editingMode = useStore((state) => state.editingMode);
  const setEditingMode = useStore((state) => state.setEditingMode);
  const showMetadataModal = useStore((state) => state.showMetadataModal);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const metadataPhoto = useStore((state) => state.metadataPhoto);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);

  const [loading, setLoading] = useState(true);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedKeywords, setEditedKeywords] = useState('');
  // Track the previous view/page and activePhotoId so we can restore
  // the actual previous screen when closing the full-page editor.
  const [previousView, setPreviousView] = useState(null);
  const [previousActivePhotoId, setPreviousActivePhotoId] = useState(null);

  const lastActiveElementRef = useRef(null);

  const apiOrigin = useMemo(() => {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      return '';
    }
  }, []);

  const loadPhotos = useCallback(
    (endpoint) => {
      const controller = new AbortController();

      const task = (async () => {
        setLoading(true);
        try {
          const response = endpoint ? await getPhotos(endpoint) : await getPhotos();
          if (controller.signal.aborted) return;
          setPhotos((response && response.photos) || []);
        } catch (error) {
          if (!controller.signal.aborted) {
            setBanner({ message: `Error loading photos from backend: ${error?.message || 'unknown'}`, severity: 'error' });
          }
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
  [setPhotos, setBanner],
  );

  useEffect(() => {
    // Unified gallery: always fetch all photos.
    const { cancel } = loadPhotos();
    return cancel;
  }, [loadPhotos]);

  const refreshPhotos = useCallback(() => {
    loadPhotos();
  }, [loadPhotos]);

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
  }, [showMetadataModal, activePhoto, setMetadataPhoto]);

  useEffect(() => {
    const onRunAi = (event) => {
      try {
        const id = event?.detail?.photoId;
        if (id) startAiPolling(id);
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
        if (id) startAiPolling(id);
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
  }, [startAiPolling]);

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
    async (photoId, model = null) => {
      try {
        const response = await recheckPhotoAI(photoId, model);
        setBanner({ message: 'AI recheck initiated. Polling for results...', severity: 'info' });
        startAiPolling(photoId);
        return response;
      } catch (error) {
        setBanner({ message: `AI recheck failed: ${error?.message || 'unknown'}`, severity: 'error' });
        throw error;
      }
    },
  [startAiPolling, setBanner],
  );

  const handleMoveToFinished = useCallback(
    async (id) => {
      try {
        await updatePhotoState(id, 'finished');
        setBanner({ message: 'Photo marked as finished', severity: 'success' });
        setEditingMode(null);
        setActivePhotoId(null);
        removePhotoById(id);
      } catch (error) {
        setBanner({ message: `Error marking photo as finished: ${error?.message || error}`, severity: 'error' });
      }
    },
  [removePhotoById, setBanner, setEditingMode, setActivePhotoId],
  );

  const handleMoveToWorking = useCallback(
    async (id) => {
      try {
        await updatePhotoState(id, 'working');
        const { promise } = loadPhotos();
        await promise;
        setBanner({ message: 'Photo moved back to working', severity: 'info' });
      } catch (error) {
        setBanner({ message: `Error moving photo back to working: ${error?.message || error}`, severity: 'error' });
      }
    },
  [loadPhotos, setBanner],
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
      setBanner({ message: 'Saved in app', severity: 'success' });
    } catch (error) {
      setBanner({ message: `Save failed: ${error?.message || error}`, severity: 'error' });
    }
  }, [activePhoto, editedCaption, editedDescription, editedKeywords, updatePhotoData, setBanner, setEditingMode]);

  const handleDeletePhoto = useCallback(
    async (id) => {
      if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) return;
      try {
        await deletePhoto(id);
        removePhotoById(id);
        setBanner({ message: 'Photo deleted successfully', severity: 'success' });
        if (String(activePhotoId) === String(id)) {
          setActivePhotoId(null);
          setEditingMode(null);
        }
      } catch (error) {
        if (error && (error.status === 401 || error.status === 403)) {
          window.location.reload();
          return;
        }
        setBanner({ message: `Error deleting photo: ${error?.message || error}`, severity: 'error' });
      }
    },
  [activePhotoId, removePhotoById, setBanner, setActivePhotoId, setEditingMode],
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
      // Save the current view and active photo so we can restore later.
      setPreviousView(view);
      setPreviousActivePhotoId(activePhotoId);
      setEditingMode('full');
    } else {
      setEditingMode('inline');
      setEditedCaption(photo.caption || '');
      setEditedDescription(photo.description || '');
      setEditedKeywords(photo.keywords || '');
    }
  }, [view, activePhotoId, setActivePhotoId, setEditingMode]);

  const handleSelectPhoto = useCallback((photo) => {
    setActivePhotoId(photo ? photo.id : null);
    setEditingMode(null);
  }, [setActivePhotoId, setEditingMode]);

  const handleCloseDetail = useCallback(() => {
    setEditingMode(null);
    setActivePhotoId(null);
    try {
      lastActiveElementRef.current?.focus?.();
    } catch {
      /* ignore focus restore errors */
    }
  }, [setEditingMode, setActivePhotoId]);

  const handleCloseEditor = useCallback(() => {
    setEditingMode(null);
    try {
      lastActiveElementRef.current?.focus?.();
    } catch {
      /* ignore focus restore errors */
    }

    // Restore the prior view and the prior active photo (if any).
    if (previousView) {
      setView(previousView);
      setPreviousView(null);
    }
    if (previousActivePhotoId != null) {
      setActivePhotoId(previousActivePhotoId);
      setPreviousActivePhotoId(null);
    } else {
      // If there was no previously selected photo, clear the active one
      // to ensure the user sees the list view rather than the detail panel.
      setActivePhotoId(null);
    }
  }, [previousView, previousActivePhotoId, setView, setActivePhotoId, setEditingMode]);

  const handleMoveToInprogress = useCallback(
    async (id) => {
      const result = await moveToInprogress(id);
      if (!result?.success) return result;
      setActivePhotoId(null);
      setEditingMode(null);
      return result;
    },
    [moveToInprogress, setActivePhotoId, setEditingMode],
  );

  return {
    photos,
  // toast, setToast removed
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
    pollingPhotoIds,
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
