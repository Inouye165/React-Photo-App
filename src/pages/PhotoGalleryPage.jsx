import React, { useEffect } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import PhotoGallery from '../PhotoGallery.jsx';
import PhotoUploadForm from '../PhotoUploadForm.jsx';
import MetadataModal from '../components/MetadataModal.jsx';
import usePhotoPrivileges from '../hooks/usePhotoPrivileges.js';
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker.js';
import usePhotoManagement from '../hooks/usePhotoManagement.js';
import useStore from '../store.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import useSignedThumbnails from '../hooks/useSignedThumbnails.js';
import useAIPolling from '../hooks/useAIPolling.jsx';

/**
 * PhotoGalleryPage - Main gallery view showing the photo card grid
 * Route: /gallery
 * 
 * Supports URL query params for deep linking:
 * - /gallery?view=working (default)
 * - /gallery?view=inprogress
 * - /gallery?view=finished
 */
export default function PhotoGalleryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setToolbarMessage } = useOutletContext();
  const { session } = useAuth();

  const setBanner = useStore((state) => state.setBanner);
  const showMetadataModal = useStore((state) => state.showMetadataModal);
  const metadataPhoto = useStore((state) => state.metadataPhoto);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const showLocalPicker = useStore((state) => state.uploadPicker.status !== 'closed');
  const view = useStore((state) => state.view);
  const setView = useStore((state) => state.setView);

  // Sync view state from URL query params on mount and when URL changes
  // URL is the single source of truth - store just mirrors it for convenience
  useEffect(() => {
    const viewParam = searchParams.get('view');
    const validViews = ['working', 'inprogress', 'finished'];
    
    if (viewParam && validViews.includes(viewParam)) {
      // URL has a valid view param - sync to store
      if (viewParam !== view) {
        setView(viewParam);
      }
    } else {
      // No view param or invalid - default to 'working' and update URL
      // This handles direct navigation to /gallery without a view param
      setSearchParams({ view: 'working' }, { replace: true });
      if (view !== 'working') {
        setView('working');
      }
    }
  }, [searchParams, view, setView, setSearchParams]);

  // Update URL when view changes via toolbar or other means
  // Note: This function is available for programmatic view changes within the page
  // eslint-disable-next-line no-unused-vars
  const handleViewChange = (newView) => {
    setView(newView);
    setSearchParams({ view: newView }, { replace: true });
  };

  const {
    photos,
    loading,
    pollingPhotoId,
    refreshPhotos,
    handleDeletePhoto,
  } = usePhotoManagement();

  const { getSignedUrl } = useSignedThumbnails(photos, session?.access_token);
  const privilegesMap = usePhotoPrivileges(photos);

  useAIPolling();

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleUploadFiltered,
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
      // Navigate directly to edit page when clicking photo thumbnail
      navigate(`/photos/${photo.id}/edit`);
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
      const { updatePhotoState } = await import('../api.js');
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
          handleUploadFiltered={handleUploadFiltered}
          onReopenFolder={handleSelectFolder}
          closeReason="gallery-close"
          onClose={() => {
            if (!photos || photos.length === 0) {
              setView('working');
              setSearchParams({ view: 'working' }, { replace: true });
            }
          }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-500">
          <p>Loading photos...</p>
        </div>
      ) : (
        <PhotoGallery
          photos={photos}
          privilegesMap={privilegesMap}
          pollingPhotoId={pollingPhotoId}
          handleMoveToInprogress={handleMoveToInprogress}
          handleEditPhoto={handleEditPhoto}
          handleMoveToWorking={handleMoveToWorking}
          handleDeletePhoto={handleDeletePhoto}
          onSelectPhoto={handleSelectPhoto}
          getSignedUrl={getSignedUrl}
        />
      )}
    </>
  );
}
