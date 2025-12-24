import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import PhotoGallery from '../PhotoGallery.jsx';
import PhotoUploadForm from '../PhotoUploadForm.jsx';
import MetadataModal from '../components/MetadataModal.jsx';
import usePhotoPrivileges from '../hooks/usePhotoPrivileges';
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker';
import usePhotoManagement from '../hooks/usePhotoManagement';
import useStore from '../store';
import { useAuth } from '../contexts/AuthContext';
import useSignedThumbnails from '../hooks/useSignedThumbnails';

/**
 * PhotoGalleryPage - Main gallery view showing the photo card grid
 * Route: /gallery
 */
export default function PhotoGalleryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setToolbarMessage } = useOutletContext();
  const { session } = useAuth();

  const setBanner = useStore((state) => state.setBanner);
  const showMetadataModal = useStore((state) => state.showMetadataModal);
  const metadataPhoto = useStore((state) => state.metadataPhoto);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const showLocalPicker = useStore((state) => state.uploadPicker.status !== 'closed');
  const pendingUploads = useStore((state) => state.pendingUploads);

  // If we navigated here from an optimistic upload redirect (e.g., /upload → /gallery),
  // make sure the picker is forced closed so it doesn't re-open/redraw unexpectedly.
  useEffect(() => {
    if (!location?.state?.suppressUploadPicker) return;
    try {
      useStore.getState().pickerCommand?.closePicker?.('nav-suppress');
    } catch {
      /* no-op */
    }
    // Clear the one-time flag to avoid affecting back/forward navigation.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location?.state?.suppressUploadPicker, location.pathname, location.search, navigate]);

  const {
    photos,
    loading,
    loadingMore,
    photosHasMore,
    loadMorePhotos,
    pollingPhotoId,
    pollingPhotoIds,
    refreshPhotos,
    handleDeletePhoto,
  } = usePhotoManagement();

  const sortedPhotos = useMemo(() => {
    const list = Array.isArray(photos) ? [...photos] : [];
    const toTimestamp = (photo) => {
      const dateStr = photo?.metadata?.DateTimeOriginal || photo?.metadata?.CreateDate || photo?.created_at;
      if (!dateStr) return 0;
      try {
        const normalized = String(dateStr).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        const ms = new Date(normalized).getTime();
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    };
    list.sort((a, b) => toTimestamp(b) - toTimestamp(a));
    return list;
  }, [photos]);

  // Merge pending uploads with sorted photos (pending uploads at the top)
  const allPhotos = useMemo(() => {
    return [...pendingUploads, ...sortedPhotos];
  }, [pendingUploads, sortedPhotos]);

  const hasCachedPhotos = allPhotos && allPhotos.length > 0;

  const { getSignedUrl } = useSignedThumbnails(photos, session?.access_token);
  const privilegesMap = usePhotoPrivileges(photos);

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFilteredOptimistic,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
  } = useLocalPhotoPicker({
    onUploadComplete: refreshPhotos,
    onUploadSuccess: (count) => setToolbarMessage(`Successfully uploaded ${count} photos`),
  });

  const handleSelectPhoto = (photo) => {
    if (photo) {
      // Navigate to read-only detail page when clicking photo thumbnail
      navigate(`/photos/${photo.id}`);
    }
  };

  const handleEditPhoto = (photo) => {
    if (photo) {
      navigate(`/photos/${photo.id}/edit`);
    }
  };

  const handleMoveToInprogress = async (id) => {
    const result = await useStore.getState().moveToInprogress(id);
    return result;
  };

  const handleMoveToWorking = async (id) => {
    try {
      const { updatePhotoState } = await import('../api');
      await updatePhotoState(id, 'working');
      await refreshPhotos();
      setBanner({ message: 'Photo moved back to working', severity: 'info' });
    } catch (error) {
      setBanner({ 
        message: `Error moving photo back to working: ${error?.message || error}`, 
        severity: 'error' 
      });
    }
  };

  return (
    <>
      {showMetadataModal && metadataPhoto && (
        <MetadataModal 
          photo={metadataPhoto} 
          onClose={() => { 
            setShowMetadataModal(false); 
            setMetadataPhoto(null); 
          }} 
        />
      )}


      {showLocalPicker && (
        <PhotoUploadForm
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          uploading={uploading}
          filteredLocalPhotos={filteredLocalPhotos}
          handleUploadFiltered={handleUploadFilteredOptimistic}
          onReopenFolder={handleSelectFolder}
          closeReason="gallery-close"
          onClose={() => {
            // no-op: unified gallery has no view param
          }}
        />
      )}

      {loading && !hasCachedPhotos ? (
        <div className="flex items-center justify-center h-64 text-slate-500">
          <p>Loading photos...</p>
        </div>
      ) : (
        <>
          {loading && hasCachedPhotos && (
            <div className="flex items-center justify-center text-xs text-slate-400 mb-2">
              <span>Refreshing…</span>
            </div>
          )}
          <PhotoGallery
            photos={allPhotos}
            privilegesMap={privilegesMap}
            pollingPhotoId={pollingPhotoId}
            pollingPhotoIds={pollingPhotoIds}
            handleMoveToInprogress={handleMoveToInprogress}
            handleEditPhoto={handleEditPhoto}
            handleMoveToWorking={handleMoveToWorking}
            handleDeletePhoto={handleDeletePhoto}
            onSelectPhoto={handleSelectPhoto}
            getSignedUrl={getSignedUrl}
          />
          
          {photosHasMore && (
            <div className="flex items-center justify-center py-8">
              <button
                onClick={loadMorePhotos}
                disabled={loadingMore}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? 'Loading...' : 'Load More Photos'}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}