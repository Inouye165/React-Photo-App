import React, { useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import EditPage from '../EditPage.jsx';
import useStore from '../store.js';

/**
 * PhotoEditPage - Route component for editing a photo (/photos/:id/edit)
 * Reads photo ID from URL params and displays the full-page editor
 */
export default function PhotoEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { aiDependenciesReady } = useOutletContext();

  // Get photo data and handlers from store
  const photos = useStore((state) => state.photos);
  const setBanner = useStore((state) => state.setBanner);
  const setEditingMode = useStore((state) => state.setEditingMode);
  const setActivePhotoId = useStore((state) => state.setActivePhotoId);
  const pollingPhotoId = useStore((state) => state.pollingPhotoId);
  const setPollingPhotoId = useStore((state) => state.setPollingPhotoId);
  
  const photo = photos.find((p) => String(p.id) === String(id));

  // Auto-start polling if photo appears to still be processing
  // (has placeholder caption or empty AI metadata)
  useEffect(() => {
    if (!photo || !photo.id) return;
    
    // Skip if already polling this photo
    if (pollingPhotoId === photo.id) return;
    
    // Check if photo looks like it's still being processed
    const caption = (photo.caption || '').trim().toLowerCase();
    const description = (photo.description || '').trim();
    
    const isPlaceholder = 
      caption === '' ||
      caption === 'processing...' ||
      caption === 'ai processing' ||
      caption.startsWith('uploaded photo') ||
      (description === '' && caption === '');
    
    if (isPlaceholder) {
      console.log('[PhotoEditPage] Auto-starting polling for photo', photo.id, '(appears to be processing)');
      setPollingPhotoId(photo.id);
    }
  }, [photo, pollingPhotoId, setPollingPhotoId]);

  const handleClose = () => {
    setEditingMode(null);
    // Navigate back to gallery or detail view
    navigate('/');
  };

  const handleFinished = async (photoId) => {
    try {
      const { updatePhotoState } = await import('../api.js');
      await updatePhotoState(photoId, 'finished');
      setBanner({ message: 'Photo marked as finished', severity: 'success' });
      setEditingMode(null);
      setActivePhotoId(null);
      useStore.getState().removePhotoById(photoId);
      navigate('/');
    } catch (error) {
      setBanner({ 
        message: `Error marking photo as finished: ${error?.message || error}`, 
        severity: 'error' 
      });
    }
  };

  const handleSave = async (updated) => {
    useStore.getState().setPhotos((prev) =>
      prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
    );
    setEditingMode(null);
    setActivePhotoId(updated.id);
    // Stay on the edit page after saving (no navigation needed)
    // User can manually navigate away when done
  };

  const handleRecheckAI = async (photoId, model) => {
    if (!aiDependenciesReady) {
      setBanner({ 
        message: 'AI services unavailable. Start required Docker containers to re-enable processing.', 
        severity: 'warning' 
      });
      return null;
    }

    try {
      const { recheckPhotoAI } = await import('../api.js');
      const response = await recheckPhotoAI(photoId, model);
      setBanner({ message: 'AI recheck initiated. Polling for results...', severity: 'info' });
      useStore.getState().setPollingPhotoId(photoId);
      return response;
    } catch (error) {
      setBanner({ message: `AI recheck failed: ${error?.message || 'unknown'}`, severity: 'error' });
      throw error;
    }
  };

  if (!photo) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-700">Photo not found</h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Return to Gallery
        </button>
      </div>
    );
  }

  return (
    <EditPage
      key={`${photo.id}:${photo.caption || ''}`}
      photo={photo}
      onClose={handleClose}
      onFinished={handleFinished}
      onSave={handleSave}
      onRecheckAI={handleRecheckAI}
      aiReady={aiDependenciesReady}
    />
  );
}
