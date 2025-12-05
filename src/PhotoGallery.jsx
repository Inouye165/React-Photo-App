/**
 * PhotoGallery - Modern responsive card grid for displaying photos
 * 
 * Refactored from legacy table layout to a clean card-based design
 * matching the EditPage aesthetic.
 */
import React from 'react';
import { API_BASE_URL } from './api.js';
import PhotoCard from './components/PhotoCard.jsx';

export default function PhotoGallery({ 
  photos, 
  privilegesMap, 
  pollingPhotoId,
  handleMoveToInprogress,
  handleEditPhoto,
  handleMoveToWorking, 
  handleDeletePhoto,
  onSelectPhoto,
  getSignedUrl,
}) {
  // Empty state
  if (!photos || photos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-700">
        <p>No photos to display.</p>
      </div>
    );
  }

  return (
    <div 
      className="photo-gallery grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6"
      data-testid="photo-gallery-grid"
    >
      {photos.map((photo) => (
        <PhotoCard
          key={photo.id || photo.name}
          photo={photo}
          accessLevel={privilegesMap?.[photo.id] || ''}
          isPolling={pollingPhotoId === photo.id}
          apiBaseUrl={API_BASE_URL}
          getSignedUrl={getSignedUrl}
          onSelect={onSelectPhoto}
          onEdit={handleEditPhoto}
          onApprove={photo.state === 'working' ? handleMoveToInprogress : handleMoveToWorking}
          onDelete={handleDeletePhoto}
        />
      ))}
    </div>
  );
}
