import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Image as ImageIcon, MessageCircle, Pencil } from 'lucide-react';
import type { Photo } from '../types/photo';
import { API_BASE_URL, getOrCreateRoom } from '../api';
import useStore from '../store';
import { useProtectedImageBlobUrl } from '../hooks/useProtectedImageBlobUrl';
import LocationMapPanel from '../components/LocationMapPanel.jsx';
import formatFileSize from '../utils/formatFileSize';
import { aiPollDebug } from '../utils/aiPollDebug';
import { useAuth } from '../contexts/AuthContext';

function normalizeClassification(photo: Photo | undefined): string {
  const raw = (photo?.classification || photo?.ai_analysis?.classification || '')
    .toLowerCase()
    .trim();
  if (raw === 'collectables' || raw === 'collectible') return 'collectible';
  if (raw === 'scenery') return 'scenery';
  return raw || 'unknown';
}

function getDisplayTitle(photo: Photo | undefined): string {
  if (photo?.caption && String(photo.caption).trim()) return String(photo.caption).trim();
  if (photo?.filename && String(photo.filename).trim()) return String(photo.filename).trim();
  return 'Untitled';
}

function getDescription(photo: Photo | undefined): string {
  const d = (photo?.description || '').trim();
  return d || 'No description available.';
}

function getDisplayDate(photo: Photo | undefined): string {
  const dateStr = photo?.metadata?.DateTimeOriginal || photo?.metadata?.CreateDate || photo?.created_at;
  if (!dateStr) return 'Unknown date';
  try {
    const normalized = String(dateStr).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return 'Unknown date';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

function formatStateLabel(state: Photo['state'] | undefined): string {
  switch (state) {
    case 'working':
      return 'Queue';
    case 'inprogress':
      return 'Analyzing...';
    case 'finished':
      return 'Done';
    default:
      return state || '—';
  }
}

function ClassificationBadge({ classification }: { classification: string }) {
  const normalized = classification;
  const { label, className } = (() => {
    if (normalized === 'collectible') {
      return { label: 'Collectible', className: 'bg-amber-50 text-amber-700 border-amber-100' };
    }
    if (normalized === 'scenery') {
      return { label: 'Scenery', className: 'bg-blue-50 text-blue-700 border-blue-100' };
    }
    return {
      label: normalized === 'unknown' ? 'Unclassified' : normalized,
      className: 'bg-slate-50 text-slate-700 border-slate-200',
    };
  })();

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${className}`}
      data-testid="photo-detail-classification-badge"
    >
      {label}
    </span>
  );
}

function formatValuationRange(min: unknown, max: unknown, currency = '$'): string | null {
  const safeMin = Number.isFinite(min as number) ? (min as number) : null;
  const safeMax = Number.isFinite(max as number) ? (max as number) : null;
  if (safeMin == null && safeMax == null) return null;
  const fmt = (n: number) => `${currency}${Math.round(n)}`;
  if (safeMin != null && safeMax != null) return `${fmt(safeMin)} - ${fmt(safeMax)}`;
  if (safeMin != null) return `${fmt(safeMin)}+`;
  if (safeMax != null) return `Up to ${fmt(safeMax)}`;
  return null;
}

/**
 * PhotoDetailPage - Read-only detail view (/photos/:id)
 * Shows the photo and AI insights in a clean, view-first layout.
 */
export default function PhotoDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Ensure parity with PhotoEditPage dependency context, even if unused.
  useOutletContext<unknown>();

  const photos = useStore((state) => state.photos) as Photo[];
  const pollingPhotoIds = useStore((state) => state.pollingPhotoIds) as Set<unknown>;
  const photo = useMemo(() => photos.find((p) => String(p.id) === String(id)), [photos, id]);

  const isPolling = useMemo(() => {
    try {
      return !!photo?.id && (pollingPhotoIds instanceof Set) && pollingPhotoIds.has(photo.id);
    } catch {
      return false;
    }
  }, [pollingPhotoIds, photo?.id]);

  const stateLabel = useMemo(() => formatStateLabel(photo?.state), [photo?.state]);

  useEffect(() => {
    aiPollDebug('ui_photoDetail_status', {
      photoId: photo?.id ?? id ?? null,
      photoState: photo?.state ?? null,
      isPolling,
      derivedLabel: stateLabel,
    });
  }, [photo?.id, photo?.state, id, isPolling, stateLabel]);

  const title = getDisplayTitle(photo);
  const classification = normalizeClassification(photo);
  const isCollectible = classification === 'collectible';

  // Use ?v=hash for cache busting (parity with EditPage)
  const version = photo?.hash || photo?.updated_at || '';
  const displayUrl = photo?.url
    ? `${API_BASE_URL}${photo.url}${version ? `?v=${version}` : ''}`
    : null;

  const { imageBlobUrl, fetchError, isLoading, retry } = useProtectedImageBlobUrl(displayUrl);

  const valuationRange = (() => {
    const est =
      photo?.poi_analysis?.estimatedValue ||
      photo?.collectible_insights?.estimatedValue ||
      photo?.ai_analysis?.collectibleInsights?.estimatedValue;
    const currency = est?.currency && typeof est.currency === 'string' ? est.currency : '$';
    const range = formatValuationRange(est?.min, est?.max, currency);
    return range || '$45 - $60';
  })();

  const [dmLoading, setDmLoading] = useState<boolean>(false);
  const [dmError, setDmError] = useState<string | null>(null);

  if (!photo) {
    return (
      <div className="bg-white rounded-3xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-slate-800">Photo not found</h2>
        <p className="text-slate-600 mt-2">This photo may have been removed or is no longer available.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate('/gallery')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <ArrowLeft size={16} />
            <span>Back to Gallery</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg overflow-hidden" data-testid="photo-detail-page">
      {/* Top actions */}
      <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-slate-200">
        <button
          onClick={() => {
            if (window.history.length > 1) navigate(-1);
            else navigate('/gallery');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          data-testid="photo-detail-back"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2">
          {photo.user_id && user?.id && String(photo.user_id) !== String(user.id) && (
            <button
              type="button"
              onClick={async () => {
                try {
                  setDmLoading(true);
                  setDmError(null);
                  const room = await getOrCreateRoom(String(photo.user_id));
                  navigate(`/chat/${room.id}`);
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  setDmError(message);
                } finally {
                  setDmLoading(false);
                }
              }}
              disabled={dmLoading}
              className={
                dmLoading
                  ? 'inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200'
              }
              data-testid="photo-detail-message-owner"
              aria-label="Message owner"
            >
              <MessageCircle size={16} />
              <span>{dmLoading ? 'Opening…' : 'Message Owner'}</span>
            </button>
          )}

          <Link
            to={`/photos/${photo.id}/edit`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
            data-testid="photo-detail-edit"
            aria-label="Edit photo"
          >
            <Pencil size={16} />
            <span>Edit</span>
          </Link>
        </div>
      </div>

      {dmError && (
        <div className="px-4 sm:px-6 pt-3 text-sm text-red-600" role="alert">
          {dmError}
        </div>
      )}

      {/* Responsive layout: stacked on mobile, split on desktop */}
      <div className="flex flex-col lg:flex-row">
        {/* Left: sticky image */}
        <div className="lg:w-1/2 lg:sticky lg:top-4 lg:self-start bg-slate-100">
          <div className="aspect-[4/3] sm:aspect-[16/10] lg:aspect-auto lg:h-[calc(100vh-200px)] relative">
            {isLoading && <div className="absolute inset-0 bg-slate-200 animate-pulse" />}

            {imageBlobUrl && !fetchError ? (
              <img src={imageBlobUrl} alt={title} className="w-full h-full object-contain" />
            ) : fetchError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <ImageIcon size={48} strokeWidth={1} />
                <p className="mt-2 text-sm">Failed to load image.</p>
                <button
                  onClick={retry}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <ImageIcon size={48} strokeWidth={1} />
                <p className="mt-2 text-sm">No image available.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: info / metadata */}
        <div className="lg:w-1/2 p-4 sm:p-6 overflow-visible lg:overflow-auto">
          {/* Header section */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="text-2xl sm:text-3xl font-bold text-slate-900 truncate"
                data-testid="photo-detail-title"
              >
                {title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>{getDisplayDate(photo)}</span>
                {typeof photo?.file_size === 'number' && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{formatFileSize(photo.file_size)}</span>
                  </>
                )}
              </div>
            </div>
            <ClassificationBadge classification={classification} />
          </div>

          {/* Smart Content / Value section */}
          <div className="mt-6 space-y-4" data-testid="photo-detail-smart-content">
            {isCollectible ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-900">Valuation Estimate</h2>
                <p className="mt-2 text-2xl font-bold text-slate-900" data-testid="photo-detail-valuation">
                  {valuationRange}
                </p>
                <p className="mt-1 text-xs text-slate-500">Estimate only. Actual value may vary.</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900">Location</h2>
                </div>
                <div className="h-64">
                  <LocationMapPanel photo={photo} />
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Description</h2>
              <p
                className="mt-2 text-sm leading-relaxed text-slate-700"
                data-testid="photo-detail-description"
              >
                {getDescription(photo)}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">Metadata</h2>
              <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-slate-500">Filename</dt>
                  <dd className="text-slate-800 break-words">{photo.filename || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">State</dt>
                  <dd className="text-slate-800" data-testid="photo-detail-state">
                    {formatStateLabel(photo.state)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Camera</dt>
                  <dd className="text-slate-800">{photo.metadata?.Model || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Lens</dt>
                  <dd className="text-slate-800">{photo.metadata?.LensModel || '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
