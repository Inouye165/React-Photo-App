import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import PhotoTable from '../components/PhotoTable.jsx';
import PhotoUploadForm from '../PhotoUploadForm.jsx';
import MetadataModal from '../components/MetadataModal.jsx';
import usePhotoPrivileges from '../hooks/usePhotoPrivileges.js';
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker.js';
import usePhotoManagement from '../hooks/usePhotoManagement.js';
import useStore from '../store.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import useSignedThumbnails from '../hooks/useSignedThumbnails.js';
import useAIPolling from '../hooks/useAIPolling.jsx';
import { API_BASE_URL } from '../api.js';

/**
 * PhotoGalleryPage - Main gallery view showing the photo table
 * Route: /
 */
export default function PhotoGalleryPage() {
  const navigate = useNavigate();
  const { setToolbarMessage } = useOutletContext();
  const { session } = useAuth();

  const setBanner = useStore((state) => state.setBanner);
  const showMetadataModal = useStore((state) => state.showMetadataModal);
  const metadataPhoto = useStore((state) => state.metadataPhoto);
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal);
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto);
  const showLocalPicker = useStore((state) => state.showUploadPicker);

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
        />
      )}

      <PhotoTable
        photos={photos}
        loading={loading}
        privilegesMap={privilegesMap}
        pollingPhotoId={pollingPhotoId}
        onSelectPhoto={handleSelectPhoto}
        onEditPhoto={handleEditPhoto}
        onMoveToInprogress={handleMoveToInprogress}
        onMoveToWorking={handleMoveToWorking}
        onDeletePhoto={handleDeletePhoto}
        apiBaseUrl={API_BASE_URL}
        getSignedUrl={getSignedUrl}
      />
    </>
  );
}
