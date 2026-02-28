import React, { useEffect, useState } from 'react';
import {
  Calendar,
  HardDrive,
  Image as ImageIcon,
  Lock,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Photo } from '../types/photo';
import formatFileSize from '../utils/formatFileSize';
import { toUrl } from '../utils/toUrl';
import AuthenticatedImage from './AuthenticatedImage.tsx';
import { aiPollDebug } from '../utils/aiPollDebug';
import useStore from '../store';

type PhotoCardPhoto = Omit<Photo, 'state' | 'url'> & {
  url?: string;
  state?: Photo['state'] | 'uploading';
  thumbnail?: string | null;
  smallThumbnail?: string | null;
  isTemporary?: boolean;
  file?: File;
  name?: string;
};

export interface PhotoCardProps {
  photo: PhotoCardPhoto;
  accessLevel?: string | null;
  isPolling?: boolean;
  apiBaseUrl?: string;
  getSignedUrl?: (photo: PhotoCardPhoto, variant?: 'full' | 'thumb') => string | null;
  onSelect?: (photo: PhotoCardPhoto) => void;
  onEdit?: (photo: PhotoCardPhoto) => void;
  onApprove?: (id: PhotoCardPhoto['id']) => void;
  onDelete?: (id: PhotoCardPhoto['id']) => void;
}

/**
 * Generates a human-readable title from photo data.
 * Priority: caption > truncated filename > "Untitled"
 */
function getDisplayTitle(photo: PhotoCardPhoto): string {
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
function formatDate(photo: PhotoCardPhoto): string {
  const dateStr =
    photo.metadata?.DateTimeOriginal || photo.metadata?.CreateDate || photo.created_at;
  if (!dateStr) return 'Unknown date';

  try {
    // EXIF dates are often "YYYY:MM:DD HH:MM:SS" format
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown date';
  }
}

/**
 * Maps state to a user-friendly badge
 */
function getStatusBadge(state: PhotoCardPhoto['state']): { label: string; className: string } {
  switch (state) {
    case 'inprogress':
      return { label: 'Analyzing...', className: 'bg-amber-50 text-amber-600 border-amber-100' };
    case 'working':
      return { label: 'Queue', className: 'bg-slate-50 text-slate-700 border-slate-200' };
    case 'finished':
      return { label: 'Done', className: 'bg-green-50 text-green-700 border-green-100' };
    default:
      return { label: state || 'Unknown', className: 'bg-gray-50 text-gray-600 border-gray-100' };
  }
}

/**
 * Maps access level string to user-friendly label
 */
function formatAccessLevel(privileges?: string | null): string {
  if (privileges == null) return '';
  const normalized = String(privileges).trim();
  if (!normalized) return '';
  if (/^loading\.*$/i.test(normalized)) return '';
  // RWX or W means full access (backend), fallback to legacy 'write'
  if (/\bW\b|W|write/i.test(normalized)) return 'Full Access';
  if (/\bR\b|read/i.test(normalized)) return 'Read Only';
  return normalized;
}

/**
 * PhotoCard - A modern card component for displaying photo previews
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
}: PhotoCardProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [thumbVariant, setThumbVariant] = useState<'small' | 'large' | null>(null);

  const smallThumbnail = photo.smallThumbnailUrl ?? photo.smallThumbnail ?? null;
  const mediumThumbnail = photo.thumbnailUrl ?? photo.thumbnail ?? null;

  // Track newly uploaded photos that should display a transition spinner.
  const isJustUploaded = useStore((state) => state.justUploadedPhotoIds.has(photo.id));
  const removeJustUploadedMark = useStore((state) => state.removeJustUploadedMark);

  const status = getStatusBadge(photo.state);
  const title = getDisplayTitle(photo);
  const date = formatDate(photo);
  const fileSize = formatFileSize(photo.file_size);
  const access = formatAccessLevel(accessLevel);

  // Clear the transition marker once the photo leaves the 'working' state.
  useEffect(() => {
    if (isJustUploaded && photo.state !== 'working') {
      removeJustUploadedMark(photo.id);
    }
  }, [isJustUploaded, photo.state, photo.id, removeJustUploadedMark]);

  useEffect(() => {
    aiPollDebug('ui_photoCard_status', {
      photoId: photo?.id,
      photoState: photo?.state ?? null,
      isPolling,
      derivedLabel: status?.label ?? null,
    });
  }, [photo?.id, photo?.state, isPolling, status?.label]);

  // Determine if user can perform write actions (RWX, W, or legacy 'write')
  const canWrite =
    !!accessLevel && (accessLevel.includes('W') || accessLevel.toLowerCase().includes('write'));

  // Disable interaction while uploads are active or in post-upload transition.
  const isUploading = photo.state === 'uploading' || !!photo.isTemporary;
  const isTransitioning = isJustUploaded && photo.state === 'working';
  const showTransitionSpinner = isTransitioning;
  const derivativesFailed = !isUploading && photo.derivativesStatus === 'failed';

  useEffect(() => {
    // Reset thumbnail variant when photo changes.
    if (smallThumbnail) setThumbVariant('small');
    else if (mediumThumbnail) setThumbVariant('large');
    else setThumbVariant(null);
    setImageError(false);
    setImageLoaded(false);
  }, [photo?.id, smallThumbnail, mediumThumbnail]);

  // Get image URL - prefer thumbnail for performance, fallback to full image
  const getImageUrl = (): { url: string | null; needsAuth: boolean } => {
    // Optimistic uploads use local blob URLs; never require auth for these.
    if ((photo?.isTemporary || photo?.state === 'uploading') && typeof photo?.url === 'string') {
      return { url: photo.url, needsAuth: false };
    }

    // Gallery grid should never fall back to full-resolution images automatically.
    // If thumbnails fail, we show a placeholder instead.
    const selectedThumb = thumbVariant === 'small' ? smallThumbnail : thumbVariant === 'large' ? mediumThumbnail : null;
    if (selectedThumb) {
      // If URL is already absolute/public, render directly.
      if (
        typeof selectedThumb === 'string' &&
        (selectedThumb.startsWith('blob:') ||
          selectedThumb.startsWith('data:') ||
          selectedThumb.startsWith('http'))
      ) {
        return { url: selectedThumb, needsAuth: false };
      }

      // Server-signed display thumbnails can be rendered directly without Bearer auth.
      if (
        typeof selectedThumb === 'string' &&
        selectedThumb.includes('/display/thumbnails/') &&
        selectedThumb.includes('sig=') &&
        selectedThumb.includes('exp=')
      ) {
        return { url: toUrl(selectedThumb, apiBaseUrl), needsAuth: false };
      }

      const signedUrl = getSignedUrl ? getSignedUrl(photo, 'thumb') : null;
      if (signedUrl) {
        return { url: signedUrl, needsAuth: false };
      }

      // Relative thumbnails require authenticated fetch.
      return { url: toUrl(selectedThumb, apiBaseUrl), needsAuth: true };
    }

    if (photo.url) {
      // Public URLs (blob/data/http) should render directly without AuthenticatedImage.
      if (
        typeof photo.url === 'string' &&
        (photo.url.startsWith('blob:') ||
          photo.url.startsWith('data:') ||
          photo.url.startsWith('http'))
      ) {
        return { url: photo.url, needsAuth: false };
      }

      // NOTE: For grid rendering we do not automatically load the full image.
      // If no thumbnail is available, show placeholder.
      return { url: null, needsAuth: false };
    }
    return { url: null, needsAuth: false };
  };

  const { url: imageUrl, needsAuth } = getImageUrl();

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(photo);
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApprove?.(photo.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    onDelete?.(photo.id);
  };

  const handleCardSelect = () => {
    if (isUploading || isTransitioning) return;
    onSelect?.(photo);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only trigger when the card itself is focused (not when events bubble from child buttons).
    if (e.currentTarget !== e.target) return;
    if (isUploading || isTransitioning) return;

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      onSelect?.(photo);
    }
  };

  return (
    <div
      className="bg-white rounded-3xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden cursor-pointer group"
      style={{
        borderRadius: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
      onClick={handleCardSelect}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
      data-testid="photo-card"
      role="button"
      aria-label={`Photo: ${title}`}
      aria-disabled={isUploading || isTransitioning}
    >
      {/* Thumbnail Section */}
      <div className="relative bg-slate-100 overflow-hidden min-h-[120px]">
        {/* Loading Skeleton */}
        {!derivativesFailed && !imageLoaded && !imageError && imageUrl && !isUploading && (
          <div
            className="absolute inset-0 bg-slate-200 animate-pulse"
            data-testid="photo-card-skeleton"
          />
        )}

        {/* Actual Image - use AuthenticatedImage when Bearer auth is required */}
        {!derivativesFailed && imageUrl && !imageError ? (
          needsAuth ? (
            <AuthenticatedImage
              src={imageUrl}
              alt={photo.caption || photo.filename || 'Photo thumbnail'}
              loading="lazy"
              decoding="async"
              width={320}
              height={240}
              className={`block w-full h-auto transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (thumbVariant === 'small' && mediumThumbnail) {
                  setThumbVariant('large');
                  setImageLoaded(false);
                  setImageError(false);
                  return;
                }
                setThumbVariant(null);
                setImageError(true);
              }}
              loadingPlaceholder={<div className="absolute inset-0 bg-slate-200 animate-pulse" />}
            />
          ) : (
            <img
              src={imageUrl}
              alt={photo.caption || photo.filename || 'Photo thumbnail'}
              loading="lazy"
              decoding="async"
              width={320}
              height={240}
              className={`block w-full h-auto transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                if (thumbVariant === 'small' && mediumThumbnail) {
                  setThumbVariant('large');
                  setImageLoaded(false);
                  setImageError(false);
                  return;
                }
                setThumbVariant(null);
                setImageError(true);
              }}
            />
          )
        ) : (
          /* Fallback Placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400" data-testid="photo-card-placeholder">
            <ImageIcon size={48} strokeWidth={1} />
            <span className="text-xs mt-2">
              {derivativesFailed ? 'Processing Failed' : imageError ? 'Failed to load' : 'No preview'}
            </span>
          </div>
        )}

        {/* Uploading Overlay - for optimistic uploads */}
        {isUploading && (
          <div className="absolute inset-0 bg-indigo-900/60 flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-white text-sm font-medium">Uploading...</p>
            </div>
            <span className="sr-only">Uploading</span>
          </div>
        )}

        {/* Transition spinner for post-upload photos still in the 'working' state. */}
        {showTransitionSpinner && !isUploading && (
          <div className="absolute inset-0 bg-indigo-900/60 flex items-center justify-center backdrop-blur-sm">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-white text-sm font-medium">Processing...</p>
            </div>
            <span className="sr-only">Processing</span>
          </div>
        )}

        {/* Polling Overlay */}
        {isPolling && !isUploading && !showTransitionSpinner && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin" />
            <span className="sr-only">Processing</span>
          </div>
        )}

        {/* Status Badge */}
        {!isUploading && (
          <div className="absolute top-3 left-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${status.className}`}
              data-testid="photo-card-status"
            >
              <span className="inline-flex items-center gap-1.5">
                {photo.state === 'inprogress' && (
                  <span
                    data-testid="photo-card-status-spinner"
                    aria-hidden="true"
                    className="inline-block w-3 h-3 rounded-full border-2 border-amber-400/70 border-t-transparent animate-spin"
                  />
                )}
                <span>{status.label}</span>
              </span>
            </span>
          </div>
        )}
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
          {/* Hide all action buttons when uploading */}
          {!isUploading && (
            <>
              {/* Edit Button - Always visible for inprogress */}
              {photo.state === 'inprogress' && (
                <button
                  onClick={handleEdit}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-full transition-colors"
                  aria-label="Edit photo"
                  data-testid="photo-card-edit-btn"
                >
                  <Pencil size={14} />
                  <span>Edit</span>
                </button>
              )}

              {/* Analyze Button - For working state */}
              {photo.state === 'working' && (
                <button
                  onClick={handleApprove}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full transition-colors"
                  aria-label="Analyze photo with AI"
                  data-testid="photo-card-approve-btn"
                >
                  <Sparkles size={14} />
                  <span>Analyze</span>
                </button>
              )}

              {/* Return to Queue Button - For inprogress state */}
              {photo.state === 'inprogress' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // This triggers the "move to working" action
                    onApprove?.(photo.id);
                  }}
                  className="min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-medium rounded-full transition-colors"
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
                className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
