import React, { useState } from 'react';
import { Pencil, CheckCircle, Trash2, Calendar, HardDrive, Lock, Image as ImageIcon } from 'lucide-react';
import formatFileSize from '../utils/formatFileSize.js';
import { toUrl } from '../utils/toUrl.js';

/**
 * Generates a human-readable title from photo data.
 * Priority: caption > truncated filename > "Untitled"
 */
function getDisplayTitle(photo) {
  if (photo.caption && photo.caption.trim()) {
    return photo.caption.length > 40 ? photo.caption.slice(0, 40) + '…' : photo.caption;
  }
  if (photo.filename) {
    // Remove UUID prefix if present (common pattern: uuid_originalname.ext)
    const name = photo.filename.replace(/^[a-f0-9-]{36}_/i, '');
    return name.length > 25 ? name.slice(0, 25) + '…' : name;
  }
  return 'Untitled';
}

/**
 * Formats date for display. Accepts EXIF date strings or ISO dates.
 */
function formatDate(photo) {
  const dateStr = photo.metadata?.DateTimeOriginal || photo.metadata?.CreateDate || photo.created_at;
  if (!dateStr) return 'Unknown date';
  
  try {
    // EXIF dates are often "YYYY:MM:DD HH:MM:SS" format
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

/**
 * Maps state to a user-friendly badge
 */
function getStatusBadge(state) {
  switch (state) {
    case 'inprogress':
      return { label: 'In Progress', className: 'bg-amber-50 text-amber-600 border-amber-100' };
    case 'working':
      return { label: 'Queued', className: 'bg-blue-50 text-blue-600 border-blue-100' };
    case 'finished':
      return { label: 'Complete', className: 'bg-green-50 text-green-600 border-green-100' };
    default:
      return { label: state || 'Unknown', className: 'bg-gray-50 text-gray-600 border-gray-100' };
  }
}

/**
 * Maps access level string to user-friendly label
 */
function formatAccessLevel(privileges) {
  if (!privileges) return 'Unknown';
  if (privileges.includes('write')) return 'Full Access';
  if (privileges.includes('read')) return 'Read Only';
  return privileges;
}

/**
 * PhotoCard - A modern card component for displaying photo previews
 * 
 * Styled to match the EditPage aesthetic with:
 * - Large rounded corners (24px)
 * - Subtle shadows
 * - Clean typography
 * - Icon-based actions
 */
export default function PhotoCard({
  photo,
  accessLevel,
  isPolling = false,
  apiBaseUrl,
  getSignedUrl,
  onSelect,
  onEdit,
  onApprove,
  onDelete,
}) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [useThumbnail, setUseThumbnail] = useState(true);

  const status = getStatusBadge(photo.state);
  const title = getDisplayTitle(photo);
  const date = formatDate(photo);
  const fileSize = formatFileSize(photo.file_size);
  const access = formatAccessLevel(accessLevel);
  
  // Determine if user can perform write actions
  const canWrite = accessLevel?.includes('write');
  
  // Get image URL - prefer thumbnail for performance, fallback to full image
  // Thumbnails are much smaller and faster to load. Full image is only used if no thumbnail exists.
  // If thumbnail fails to load (race condition or error), we fallback to full image via useThumbnail state.
  const getImageUrl = () => {
    if (photo.thumbnail && useThumbnail) {
      return getSignedUrl ? getSignedUrl(photo) : toUrl(photo.thumbnail, apiBaseUrl);
    }
    if (photo.url) {
      return getSignedUrl ? getSignedUrl(photo, 'full') : toUrl(photo.url, apiBaseUrl);
    }
    return null;
  };

  const imageUrl = getImageUrl();

  const handleEdit = (e) => {
    e.stopPropagation();
    if (onEdit) onEdit(photo);
  };

  const handleApprove = (e) => {
    e.stopPropagation();
    if (onApprove) onApprove(photo.id);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (!canWrite) return;
    if (window.confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      if (onDelete) onDelete(photo.id);
    }
  };

  return (
    <div
      className="bg-white rounded-3xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden cursor-pointer group"
      style={{
        borderRadius: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
      onClick={() => onSelect && onSelect(photo)}
      data-testid="photo-card"
      role="article"
      aria-label={`Photo: ${title}`}
    >
      {/* Thumbnail Section */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {/* Loading Skeleton */}
        {!imageLoaded && !imageError && imageUrl && (
          <div className="absolute inset-0 bg-slate-200 animate-pulse" data-testid="photo-card-skeleton" />
        )}
        
        {/* Actual Image */}
        {imageUrl && !imageError ? (
          <img
            src={imageUrl}
            alt={photo.caption || photo.filename || 'Photo thumbnail'}
            className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              // If thumbnail failed, try falling back to full image
              if (useThumbnail && photo.thumbnail && photo.url) {
                setUseThumbnail(false);
                setImageLoaded(false); // Reset loaded state for the new image
                setImageError(false);  // Reset error state
              } else {
                setImageError(true);
              }
            }}
            loading="lazy"
          />
        ) : (
          /* Fallback Placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400">
            <ImageIcon size={48} strokeWidth={1} />
            <span className="text-xs mt-2">{imageError ? 'Failed to load' : 'No preview'}</span>
          </div>
        )}

        {/* Polling Overlay */}
        {isPolling && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">Processing</span>
          </div>
        )}

        {/* Status Badge */}
        <div className="absolute top-3 left-3">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${status.className}`}
            data-testid="photo-card-status"
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-4">
        {/* Title */}
        <h3 
          className="text-base font-semibold text-slate-800 truncate mb-2"
          title={photo.caption || photo.filename}
          data-testid="photo-card-title"
        >
          {title}
        </h3>

        {/* Metadata */}
        <div className="space-y-1 text-sm text-slate-500 mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400" />
            <span data-testid="photo-card-date">{date}</span>
            <span className="text-slate-300">•</span>
            <HardDrive size={14} className="text-slate-400" />
            <span data-testid="photo-card-size">{fileSize}</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-slate-400" />
            <span 
              className="text-[11px] font-medium text-slate-400 uppercase tracking-wider"
              data-testid="photo-card-access"
            >
              {access}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          {/* Edit Button - Always visible for inprogress */}
          {photo.state === 'inprogress' && (
            <button
              onClick={handleEdit}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-full transition-colors"
              aria-label="Edit photo"
              data-testid="photo-card-edit-btn"
            >
              <Pencil size={14} />
              <span>Edit</span>
            </button>
          )}

          {/* Approve/Promote Button - For working state */}
          {photo.state === 'working' && (
            <button
              onClick={handleApprove}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-full transition-colors"
              aria-label="Promote photo to processing"
              data-testid="photo-card-approve-btn"
            >
              <CheckCircle size={14} />
              <span>Promote</span>
            </button>
          )}

          {/* Return to Queue Button - For inprogress state */}
          {photo.state === 'inprogress' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // This triggers the "move to working" action
                if (onApprove) onApprove(photo.id);
              }}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-full transition-colors"
              aria-label="Return photo to queue"
              data-testid="photo-card-return-btn"
            >
              <span>Return</span>
            </button>
          )}

          {/* Delete Button - Available in all states */}
          <button
            onClick={handleDelete}
            disabled={!canWrite}
            className={`flex items-center justify-center p-2 rounded-full transition-colors ${
              canWrite 
                ? 'bg-red-50 hover:bg-red-100 text-red-600' 
                : 'bg-slate-50 text-slate-300 cursor-not-allowed'
            }`}
            aria-label="Delete photo"
            title={canWrite ? 'Delete photo' : 'No permission to delete'}
            data-testid="photo-card-delete-btn"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
