import React from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import PhotoDetailPanel from '../components/PhotoDetailPanel.jsx';
import useStore from '../store.js';
import { API_BASE_URL } from '../api.js';

/**
 * PhotoDetailPage - Route component for viewing a single photo (/photos/:id)
 * Reads photo ID from URL params and displays the detail panel
 */
export default function PhotoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { aiDependenciesReady } = useOutletContext();

  // Get photo data and handlers from store
  const photos = useStore((state) => state.photos);
  const pollingPhotoId = useStore((state) => state.pollingPhotoId);
  const setBanner = useStore((state) => state.setBanner);
  const editingMode = useStore((state) => state.editingMode);
  const setEditingMode = useStore((state) => state.setEditingMode);
  
  // Photo management hooks would be accessed via context or hooks
  const photo = photos.find((p) => String(p.id) === String(id));

  // Handle edited fields for inline editing
  const [editedCaption, setEditedCaption] = React.useState(photo?.caption || '');
  const [editedDescription, setEditedDescription] = React.useState(photo?.description || '');
  const [editedKeywords, setEditedKeywords] = React.useState(photo?.keywords || '');

  React.useEffect(() => {
    if (photo) {
      setEditedCaption(photo.caption || '');
      setEditedDescription(photo.description || '');
      setEditedKeywords(photo.keywords || '');
    }
  }, [photo]);

  const handleClose = () => {
    navigate('/');
  };

  const handleInlineSave = async () => {
    if (!photo) return;
    
    try {
      const { updatePhotoCaption } = await import('../api.js');
      
      if (editedCaption !== (photo.caption || '')) {
        await updatePhotoCaption(photo.id, editedCaption);
      }
      
      useStore.getState().updatePhotoData(photo.id, {
        caption: editedCaption,
        description: editedDescription,
        keywords: editedKeywords,
      });
      
      setEditingMode(null);
      setBanner({ message: 'Saved in app', severity: 'success' });
    } catch (error) {
      setBanner({ message: `Save failed: ${error?.message || error}`, severity: 'error' });
    }
  };

  const handleMarkFinished = async () => {
    if (!photo) return;
    
    try {
      const { updatePhotoState } = await import('../api.js');
      await updatePhotoState(photo.id, 'finished');
      setBanner({ message: 'Photo marked as finished', severity: 'success' });
      useStore.getState().removePhotoById(photo.id);
      navigate('/');
    } catch (error) {
      setBanner({ message: `Error marking photo as finished: ${error?.message || error}`, severity: 'error' });
    }
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
          onClick={handleClose}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Return to Gallery
        </button>
      </div>
    );
  }

  return (
    <PhotoDetailPanel
      photo={photo}
      isInlineEditing={editingMode === 'inline'}
      editedCaption={editedCaption}
      editedDescription={editedDescription}
      editedKeywords={editedKeywords}
      onCaptionChange={setEditedCaption}
      onDescriptionChange={setEditedDescription}
      onKeywordsChange={setEditedKeywords}
      onClose={handleClose}
      onInlineSave={handleInlineSave}
      onMarkFinished={handleMarkFinished}
      onRecheckAI={handleRecheckAI}
      isRechecking={pollingPhotoId === photo.id}
      apiBaseUrl={API_BASE_URL}
      aiReady={aiDependenciesReady}
    />
  );
}
