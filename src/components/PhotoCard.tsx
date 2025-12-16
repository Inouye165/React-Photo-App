import React, { useState } from 'react';
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
import formatFileSize from '../utils/formatFileSize.js';
import { toUrl } from '../utils/toUrl.js';
import AuthenticatedImage from './AuthenticatedImage.jsx';

type PhotoCardPhoto = Omit<Photo, 'state' | 'url'> & {
  url?: string;
  state?: Photo['state'] | 'uploading';
  thumbnail?: string | null;
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
  const [useThumbnail, setUseThumbnail] = useState(true);

  const status = getStatusBadge(photo.state);
  const title = getDisplayTitle(photo);
  const date = formatDate(photo);
  const fileSize = formatFileSize(photo.file_size);
  const access = formatAccessLevel(accessLevel);

  // Determine if user can perform write actions (RWX, W, or legacy 'write')
  const canWrite =
    !!accessLevel && (accessLevel.includes('W') || accessLevel.toLowerCase().includes('write'));

  // Disable interaction for uploading photos
  const isUploading = photo.state === 'uploading' || !!photo.isTemporary;

  // Get image URL - prefer thumbnail for performance, fallback to full image
  const getImageUrl = (): { url: string | null; needsAuth: boolean } => {
    // Optimistic uploads use local blob URLs; never require auth for these.
    if ((photo?.isTemporary || photo?.state === 'uploading') && typeof photo?.url === 'string') {
      return { url: photo.url, needsAuth: false };
    }

    if (photo.thumbnail && useThumbnail) {
      const signedUrl = getSignedUrl ? getSignedUrl(photo) : null;
      if (signedUrl) {
        return { url: signedUrl, needsAuth: false };
      }
      // No signed URL - need authenticated fetch
      return { url: toUrl(photo.thumbnail, apiBaseUrl), needsAuth: true };
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
      const signedUrl = getSignedUrl ? getSignedUrl(photo, 'full') : null;
      if (signedUrl) {
        return { url: signedUrl, needsAuth: false };
      }
      // No signed URL - need authenticated fetch
      return { url: toUrl(photo.url, apiBaseUrl), needsAuth: true };
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
    if (window.confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      onDelete?.(photo.id);
    }
  };

  return (
    <div
      className="bg-white rounded-3xl shadow-lg hover:shadow-xl transition-shadow duration-200 overflow-hidden cursor-pointer group"
      style={{
        borderRadius: '24px',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
      onClick={() => !isUploading && onSelect?.(photo)}
      data-testid="photo-card"
      role="article"
      aria-label={`Photo: ${title}`}
    >
      {/* Thumbnail Section */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {/* Loading Skeleton */}
        {!imageLoaded && !imageError && imageUrl && !isUploading && (
          <div
            className="absolute inset-0 bg-slate-200 animate-pulse"
            data-testid="photo-card-skeleton"
          />
        )}

        {/* Actual Image - use AuthenticatedImage when Bearer auth is required */}
        {imageUrl && !imageError ? (
          needsAuth ? (
            <AuthenticatedImage
              src={imageUrl}
              alt={photo.caption || photo.filename || 'Photo thumbnail'}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                // If thumbnail failed, try falling back to full image
                if (useThumbnail && photo.thumbnail && photo.url) {
                  setUseThumbnail(false);
                  setImageLoaded(false);
                  setImageError(false);
                } else {
                  setImageError(true);
                }
              }}
              loadingPlaceholder={<div className="absolute inset-0 bg-slate-200 animate-pulse" />}
            />
          ) : (
            <img
              src={imageUrl}
              alt={photo.caption || photo.filename || 'Photo thumbnail'}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                // If thumbnail failed, try falling back to full image
                if (useThumbnail && photo.thumbnail && photo.url) {
                  setUseThumbnail(false);
                  setImageLoaded(false);
                  setImageError(false);
                } else {
                  setImageError(true);
                }
              }}
              loading="lazy"
            />
          )
        ) : (
          /* Fallback Placeholder */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 text-slate-400">
            <ImageIcon size={48} strokeWidth={1} />
            <span className="text-xs mt-2">{imageError ? 'Failed to load' : 'No preview'}</span>
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

        {/* Polling Overlay */}
        {isPolling && !isUploading && (
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
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-full transition-colors"
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
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-full transition-colors"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
