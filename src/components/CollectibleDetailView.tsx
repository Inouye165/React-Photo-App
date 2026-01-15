import React from 'react';

import type { Photo } from '../types/photo';
import type { CollectibleRecord } from '../types/collectibles';

import useStore from '../store';

import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker';

import { request, API_BASE_URL } from '../api/httpClient';
import { getHeadersForGetRequestAsync } from '../api/auth';
import { deletePhoto } from '../api/photos';

import { Trash2 } from 'lucide-react';

import PriceRangeVisual from './PriceRangeVisual';
import PriceHistoryList from './PriceHistoryList';
import AuthenticatedImage from './AuthenticatedImage';

type Id = string | number;

type ConditionColors = { bg: string; text: string; border: string };

/**
 * Condition rank to color mapping
 */
const CONDITION_COLORS: Record<number, ConditionColors> = {
  5: { bg: '#dcfce7', text: '#166534', border: '#86efac' }, // Mint - Green
  4: { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' }, // Excellent - Blue
  3: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' }, // Good - Yellow
  2: { bg: '#fed7aa', text: '#9a3412', border: '#fdba74' }, // Fair - Orange
  1: { bg: '#fecaca', text: '#991b1b', border: '#fca5a5' }, // Poor - Red
};

/**
 * Confidence level to display text
 */
function getConfidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.9) return { text: 'High Confidence', color: '#16a34a' };
  if (confidence >= 0.7) return { text: 'Medium Confidence', color: '#ca8a04' };
  return { text: 'Low Confidence', color: '#dc2626' };
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message?: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return String(err);
}

type CollectibleData = CollectibleRecord & {
  id?: Id;
  category?: string;
  condition_label?: string;
  condition_rank?: number;
  value_min?: number | string;
  value_max?: number | string;
  specifics?: Record<string, unknown>;
  ai_analysis_history?: Array<{ result?: unknown }>; // best-effort
};

type PriceSource = {
  url?: string;
  source?: string;
  notes?: string;
  priceFound?: string | number;
};

type PriceHistoryRecord = {
  id?: Id;
  date_seen?: string;
  venue?: string;
  price?: string | number;
  url?: string;
  [key: string]: unknown;
};

type CollectiblePhotoDto = {
  id: Id;
  url?: string;
  thumbnail?: string | null;
  smallThumbnail?: string | null;
  filename?: string;
  created_at?: string;
  [key: string]: unknown;
};

function resolveMediaUrl(maybeUrl: unknown): string | null {
  if (typeof maybeUrl !== 'string') return null;
  const url = maybeUrl.trim();
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
  const normalized = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE_URL}${normalized}`;
}

type Valuation = {
  lowEstimateUSD?: number | string;
  highEstimateUSD?: number | string;
  currency?: string;
  reasoning?: string;
  priceSources?: PriceSource[];
};

type ConditionObject = { label?: string; rank?: number };

type ParsedInsights = {
  valuation?: Valuation;
  condition?: string | ConditionObject;
  category?: string;
  specifics?: Record<string, unknown>;
  confidences?: Record<string, number>;
  searchResultsUsed?: number;
  [key: string]: unknown;
};

export interface CollectibleDetailViewProps {
  photo?: Partial<Photo> | null;
  collectibleData?: CollectibleData | null;
  aiInsights?: unknown;
}

/**
 * CollectibleDetailView - Rich display of collectible data
 *
 * Shows:
 * - AI-generated story/description
 * - Category and identification
 * - Condition assessment with visual indicator
 * - Price valuation with sources (links)
 * - Item specifics
 * - Confidence scores
 * - Expandable price history ledger
 */
export default function CollectibleDetailView({ photo, collectibleData, aiInsights }: CollectibleDetailViewProps) {
  // State for collapsible valuation ledger
  const [ledgerExpanded, setLedgerExpanded] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [historyData, setHistoryData] = React.useState<PriceHistoryRecord[] | null>(null);
  const [historyError, setHistoryError] = React.useState<string | null>(null);

  // Auxiliary (collectible-attached) photos
  const [collectiblePhotos, setCollectiblePhotos] = React.useState<CollectiblePhotoDto[]>([]);
  const [collectiblePhotosLoading, setCollectiblePhotosLoading] = React.useState(false);
  const [collectiblePhotosError, setCollectiblePhotosError] = React.useState<string | null>(null);

  // Confirm-before-delete state (mandatory)
  const [photoToDelete, setPhotoToDelete] = React.useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);

  const pendingUploads = useStore((state) => state.pendingUploads);
  const setBanner = useStore((state) => state.setBanner);

  // Get insights from either the collectible data or directly from photo
  const insights: unknown =
    aiInsights || collectibleData?.ai_analysis_history?.[0]?.result || photo?.poi_analysis || null;

  // Parse poi_analysis if it's a string
  const parsedInsights = React.useMemo<ParsedInsights | null>(() => {
    if (!insights) return null;
    if (typeof insights === 'string') {
      try {
        const parsed = JSON.parse(insights) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as ParsedInsights) : null;
      } catch {
        return null;
      }
    }
    return insights && typeof insights === 'object' ? (insights as ParsedInsights) : null;
  }, [insights]);

  const description = photo?.description || '';

  const fetchCollectiblePhotos = React.useCallback(async () => {
    const collectibleId = collectibleData?.id;
    if (!collectibleId) {
      setCollectiblePhotos([]);
      return;
    }

    setCollectiblePhotosLoading(true);
    setCollectiblePhotosError(null);

    try {
      const headers = await getHeadersForGetRequestAsync();
      const json = await request<{ success: boolean; error?: string; photos?: CollectiblePhotoDto[] }>({
        path: `/collectibles/${collectibleId}/photos`,
        headers: headers || {},
      });

      if (!json.success) throw new Error(json.error || 'Failed to load collectible photos');
      setCollectiblePhotos(Array.isArray(json.photos) ? json.photos : []);
    } catch (err) {
      setCollectiblePhotosError(getErrorMessage(err) || 'Failed to load collectible photos');
      setCollectiblePhotos([]);
    } finally {
      setCollectiblePhotosLoading(false);
    }
  }, [collectibleData?.id]);

  const mergedCollectiblePhotos = React.useMemo<CollectiblePhotoDto[]>(() => {
    const collectibleId = collectibleData?.id;
    const serverPhotos = Array.isArray(collectiblePhotos) ? collectiblePhotos : [];

    if (!collectibleId) return serverPhotos;

    const pendingForCollectible = (Array.isArray(pendingUploads) ? pendingUploads : [])
      .filter((p) => String(p?.collectibleId || '') === String(collectibleId))
      .map((p) =>
        ({
          id: String(p.id),
          url: p.url,
          filename: p.filename,
          created_at: p.created_at,
          isTemporary: true,
          uploading: true,
          state: p.state,
        }) as CollectiblePhotoDto
      );

    if (pendingForCollectible.length === 0) return serverPhotos;

    const existingIds = new Set(serverPhotos.map((p) => String(p?.id)));
    const toPrepend = pendingForCollectible.filter((p) => !existingIds.has(String(p?.id)));
    return [...toPrepend, ...serverPhotos];
  }, [collectibleData?.id, collectiblePhotos, pendingUploads]);

  React.useEffect(() => {
    void fetchCollectiblePhotos();
  }, [fetchCollectiblePhotos]);

  const selectedPhotoToDelete = React.useMemo(() => {
    if (!photoToDelete) return null;
    return mergedCollectiblePhotos.find((p) => String(p?.id) === String(photoToDelete)) || null;
  }, [mergedCollectiblePhotos, photoToDelete]);

  const handleRequestDeletePhoto = React.useCallback(
    (id: Id) => {
      setCollectiblePhotosError(null);
      setPhotoToDelete(String(id));
    },
    [],
  );

  const handleCancelDelete = React.useCallback(() => {
    if (deleteSubmitting) return;
    setPhotoToDelete(null);
  }, [deleteSubmitting]);

  const handleConfirmDelete = React.useCallback(async () => {
    if (!photoToDelete) return;
    if (deleteSubmitting) return;

    setDeleteSubmitting(true);
    setCollectiblePhotosError(null);
    try {
      await deletePhoto(photoToDelete);
      setPhotoToDelete(null);
      await fetchCollectiblePhotos();
      setBanner({ message: 'Photo deleted', severity: 'success' });
    } catch (err) {
      setCollectiblePhotosError(getErrorMessage(err) || 'Failed to delete photo');
      setBanner({ message: 'Failed to delete photo', severity: 'error' });
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteSubmitting, fetchCollectiblePhotos, photoToDelete, setBanner]);

  const { handleNativeSelection, handleUploadFilteredOptimistic, fileInputRef } = useLocalPhotoPicker({
    onUploadComplete: fetchCollectiblePhotos,
    collectibleId: collectibleData?.id ?? null,
  });

  const collectiblePhotosUploading = React.useMemo(() => {
    const collectibleId = collectibleData?.id;
    if (!collectibleId) return false;
    return (Array.isArray(pendingUploads) ? pendingUploads : []).some(
      (p) => String(p?.collectibleId || '') === String(collectibleId),
    );
  }, [collectibleData?.id, pendingUploads]);

  const handleAddCollectiblePhotosClick = React.useCallback(() => {
    if (!collectibleData?.id) return;
    fileInputRef.current?.click();
  }, [collectibleData?.id]);

  const onFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // 1. Parse EXIF/Thumbnails and stage files
      // Note: input reset is handled inside useLocalPhotoPicker via fileInputRef.
      await handleNativeSelection(e);

      // 2. Trigger the upload IMMEDIATELY
      // Ensure we pass the current collectible ID and 'none' classification
      if (collectibleData?.id) {
        handleUploadFilteredOptimistic(undefined, 'none', String(collectibleData.id));
      }
    },
    [collectibleData?.id, handleNativeSelection, handleUploadFilteredOptimistic]
  );

  // Extract valuation data - memoized to prevent dependency issues
  const valuation = React.useMemo<Valuation>(() => {
    return (parsedInsights?.valuation as Valuation | undefined) || {};
  }, [parsedInsights]);

  const priceSources = Array.isArray(valuation?.priceSources) ? valuation.priceSources : [];

  const parsedCondition = parsedInsights?.condition;
  const condition: string | ConditionObject | undefined = parsedCondition || collectibleData?.condition_label;

  const conditionRankFromInsights =
    parsedCondition &&
    typeof parsedCondition === 'object' &&
    'rank' in parsedCondition &&
    typeof (parsedCondition as { rank?: unknown }).rank === 'number'
      ? (parsedCondition as { rank: number }).rank
      : undefined;

  const conditionRank = conditionRankFromInsights ?? collectibleData?.condition_rank ?? 3;

  const category = parsedInsights?.category || collectibleData?.category || 'Unknown';
  const specifics = (parsedInsights?.specifics as Record<string, unknown> | undefined) || collectibleData?.specifics || {};
  const confidences = (parsedInsights?.confidences as Record<string, number> | undefined) || {};

  const conditionColors = CONDITION_COLORS[conditionRank] || CONDITION_COLORS[3];

  // Fetch price history when ledger is expanded
  const fetchHistory = React.useCallback(async () => {
    if (!collectibleData?.id) return;

    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetch(`/api/collectibles/${collectibleData.id}/history`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load price history');
      }

      const data = (await response.json().catch(() => null)) as { history?: unknown } | null;
      const historyRaw = Array.isArray(data?.history) ? data?.history : [];
      const history = historyRaw.filter((record): record is PriceHistoryRecord => !!record && typeof record === 'object');
      setHistoryData(history);
    } catch (err) {
      console.error('[CollectibleDetailView] History fetch error:', err);
      setHistoryError(getErrorMessage(err) || 'Failed to load price history');
    } finally {
      setHistoryLoading(false);
    }
  }, [collectibleData?.id]);

  // Toggle ledger and fetch data on first expand
  const handleLedgerToggle = () => {
    const willExpand = !ledgerExpanded;
    setLedgerExpanded(willExpand);

    // Fetch data on first expand
    if (willExpand && historyData === null && !historyLoading) {
      void fetchHistory();
    }
  };

  // Calculate average value for the range visual
  const currentValue = React.useMemo<number | string>(() => {
    const min = valuation.lowEstimateUSD || collectibleData?.value_min;
    const max = valuation.highEstimateUSD || collectibleData?.value_max;
    if (min != null && max != null) {
      const minNum = typeof min === 'number' ? min : parseFloat(String(min));
      const maxNum = typeof max === 'number' ? max : parseFloat(String(max));
      if (!Number.isNaN(minNum) && !Number.isNaN(maxNum)) {
        return (minNum + maxNum) / 2;
      }
    }
    return min ?? max ?? 0;
  }, [valuation, collectibleData]);

  return (
    <div
      className="collectible-detail-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        style={{ opacity: 0, position: 'absolute', zIndex: -1, width: 0, height: 0 }}
        onChange={(e) => {
          void onFileChange(e);
        }}
      />

      {/* Header with Category Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span
          style={{
            backgroundColor: '#f1f5f9',
            color: '#475569',
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {category}
        </span>
        {typeof confidences.category === 'number' && (
          <span
            style={{
              fontSize: '11px',
              color: getConfidenceLabel(confidences.category).color,
            }}
          >
            {getConfidenceLabel(confidences.category).text}
          </span>
        )}
      </div>

      {/* Reference Photos (auxiliary photos attached to this collectible) */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            🖼️ Reference Photos
          </h4>

          <button
            type="button"
            onClick={handleAddCollectiblePhotosClick}
            disabled={!collectibleData?.id || collectiblePhotosUploading}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              backgroundColor: collectibleData?.id ? '#ffffff' : '#f1f5f9',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 600,
              cursor: collectibleData?.id && !collectiblePhotosUploading ? 'pointer' : 'not-allowed',
              opacity: collectiblePhotosUploading ? 0.7 : 1,
            }}
          >
            {collectiblePhotosUploading ? 'Uploading…' : 'Add Photos'}
          </button>
        </div>

        {collectiblePhotosError && (
          <div style={{ fontSize: '12px', color: '#b91c1c' }}>{collectiblePhotosError}</div>
        )}

        {collectiblePhotosLoading ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>Loading photos…</div>
        ) : collectibleData?.id && mergedCollectiblePhotos.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>No reference photos yet.</div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '10px',
            }}
          >
            {mergedCollectiblePhotos.map((p) => {
              const thumbnailSrc = resolveMediaUrl(p.smallThumbnail) || resolveMediaUrl(p.thumbnail);
              const fallbackSrc = thumbnailSrc ? null : resolveMediaUrl(p.url);

              const isUploading = Boolean((p as unknown as { uploading?: unknown; isTemporary?: unknown })?.uploading) ||
                Boolean((p as unknown as { uploading?: unknown; isTemporary?: unknown })?.isTemporary);

              return (
                <div
                  key={String(p.id)}
                  className="collectible-ref-photo-tile"
                  style={{
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#ffffff',
                    position: 'relative',
                    opacity: isUploading ? 0.75 : 1,
                  }}
                  title={typeof p.filename === 'string' ? p.filename : undefined}
                >
                  {!isUploading && (
                    <button
                      type="button"
                      aria-label="Delete photo"
                      onClick={() => handleRequestDeletePhoto(p.id)}
                      className="collectible-ref-photo-delete"
                      title="Delete"
                    >
                      <Trash2 size={14} aria-hidden="true" focusable="false" />
                    </button>
                  )}

                  {thumbnailSrc ? (
                    <img
                      src={thumbnailSrc}
                      alt={typeof p.filename === 'string' ? p.filename : 'Collectible reference photo'}
                      style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  ) : fallbackSrc ? (
                    <AuthenticatedImage
                      src={fallbackSrc}
                      alt={typeof p.filename === 'string' ? p.filename : 'Collectible reference photo'}
                      style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '110px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        color: '#64748b',
                      }}
                    >
                      No preview
                    </div>
                  )}

                  {isUploading && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(15, 23, 42, 0.35)',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                      aria-label="Uploading"
                    >
                      Uploading…
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {photoToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete Photo Confirmation"
          onClick={handleCancelDelete}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              borderRadius: '16px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              padding: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Delete Photo?</div>
                <div style={{ marginTop: '6px', fontSize: '13px', color: '#475569' }}>This action cannot be undone.</div>
                {selectedPhotoToDelete?.filename && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>{String(selectedPhotoToDelete.filename)}</div>
                )}
              </div>
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={deleteSubmitting}
                aria-label="Close"
                style={{
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  borderRadius: '10px',
                  width: '34px',
                  height: '34px',
                  cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
                  color: '#334155',
                  fontSize: '18px',
                  lineHeight: '18px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={deleteSubmitting}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                disabled={deleteSubmitting}
                style={{
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid #991b1b',
                  background: deleteSubmitting ? '#fecaca' : '#ef4444',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: deleteSubmitting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleteSubmitting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Story / Description */}
      <div
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #e2e8f0',
        }}
      >
        <h4
          style={{
            margin: '0 0 12px 0',
            fontSize: '11px',
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          📖 Story
        </h4>
        <p
          style={{
            margin: 0,
            fontSize: '15px',
            lineHeight: 1.7,
            color: '#334155',
          }}
        >
          {description || 'No description available.'}
        </p>
      </div>

      {/* Condition Card */}
      <div
        style={{
          backgroundColor: conditionColors.bg,
          borderRadius: '16px',
          padding: '16px 20px',
          border: `1px solid ${conditionColors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h4
            style={{
              margin: '0 0 4px 0',
              fontSize: '11px',
              fontWeight: 700,
              color: conditionColors.text,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              opacity: 0.8,
            }}
          >
            Condition
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: conditionColors.text,
            }}
          >
            {typeof condition === 'object' && condition !== null
              ? condition.label
              : condition || 'Unknown'}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '4px',
          }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: n <= conditionRank ? conditionColors.text : 'rgba(0,0,0,0.1)',
                opacity: n <= conditionRank ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      {/* Valuation Card */}
      <div
        style={{
          backgroundColor: '#fefce8',
          borderRadius: '16px',
          padding: '20px',
          border: '1px solid #fef08a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: '11px',
              fontWeight: 700,
              color: '#854d0e',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            💰 Estimated Value
          </h4>
          {typeof confidences.value === 'number' && (
            <span
              style={{
                fontSize: '11px',
                color: getConfidenceLabel(confidences.value).color,
              }}
            >
              {getConfidenceLabel(confidences.value).text}
            </span>
          )}
        </div>

        <p
          style={{
            margin: '0 0 16px 0',
            fontSize: '28px',
            fontWeight: 700,
            color: '#713f12',
          }}
        >
          ${valuation.lowEstimateUSD || collectibleData?.value_min || '?'} - ${
            valuation.highEstimateUSD || collectibleData?.value_max || '?'
          }
          <span style={{ fontSize: '14px', fontWeight: 500, marginLeft: '4px' }}>
            {valuation.currency || 'USD'}
          </span>
        </p>

        {/* Valuation Reasoning */}
        {valuation.reasoning && (
          <p
            style={{
              margin: '0 0 16px 0',
              fontSize: '13px',
              color: '#a16207',
              fontStyle: 'italic',
            }}
          >
            {valuation.reasoning}
          </p>
        )}

        {/* Price Sources */}
        {priceSources.length > 0 && (
          <div
            style={{
              borderTop: '1px solid #fde047',
              paddingTop: '16px',
            }}
          >
            <h5
              style={{
                margin: '0 0 12px 0',
                fontSize: '11px',
                fontWeight: 600,
                color: '#a16207',
                textTransform: 'uppercase',
              }}
            >
              Sources
            </h5>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {priceSources.map((source, idx) => (
                <a
                  key={idx}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: 'white',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    color: '#1e40af',
                    fontSize: '13px',
                    border: '1px solid #fef08a',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.backgroundColor = '#eff6ff';
                    e.currentTarget.style.borderColor = '#93c5fd';
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.borderColor = '#fef08a';
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600 }}>{source.source}</span>
                    {source.notes && (
                      <span style={{ color: '#64748b', marginLeft: '8px' }}>— {source.notes}</span>
                    )}
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: '#16a34a',
                    }}
                  >
                    {source.priceFound}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {priceSources.length === 0 && (
          <p
            style={{
              margin: 0,
              fontSize: '12px',
              color: '#a16207',
            }}
          >
            No external price sources found. Value estimated using AI knowledge.
          </p>
        )}
      </div>

      {/* Item Specifics */}
      {Object.keys(specifics).length > 0 && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid #e2e8f0',
          }}
        >
          <h4
            style={{
              margin: '0 0 16px 0',
              fontSize: '11px',
              fontWeight: 700,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            🔍 Item Details
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '12px',
            }}
          >
            {Object.entries(specifics).map(([key, value]) => {
              // Handle both simple values and {value, confidence} objects
              const hasValueObject =
                value && typeof value === 'object' && 'value' in (value as Record<string, unknown>);

              const displayValue = hasValueObject
                ? (value as { value?: unknown }).value
                : value;

              const confidence =
                value && typeof value === 'object' && 'confidence' in (value as Record<string, unknown>)
                  ? (value as { confidence?: unknown }).confidence
                  : null;

              return (
                <div
                  key={key}
                  style={{
                    backgroundColor: 'white',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '10px',
                      fontWeight: 600,
                      color: '#94a3b8',
                      textTransform: 'uppercase',
                    }}
                  >
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#1e293b',
                    }}
                  >
                    {displayValue ? String(displayValue) : '—'}
                  </p>
                  {typeof confidence === 'number' && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: getConfidenceLabel(confidence).color,
                      }}
                    >
                      {Math.round(confidence * 100)}% confident
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Analysis Info */}
      {typeof parsedInsights?.searchResultsUsed === 'number' && parsedInsights.searchResultsUsed > 0 && (
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            textAlign: 'center',
            padding: '8px',
          }}
        >
          Analysis used {parsedInsights.searchResultsUsed} search results from Google
        </div>
      )}

      {/* Valuation Ledger - Collapsible Price History Section */}
      {collectibleData?.id && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
          }}
          data-testid="valuation-ledger"
        >
          {/* Collapsible Header */}
          <button
            onClick={handleLedgerToggle}
            style={{
              width: '100%',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-expanded={ledgerExpanded}
            data-testid="valuation-ledger-toggle"
          >
            <h4
              style={{
                margin: 0,
                fontSize: '11px',
                fontWeight: 700,
                color: '#94a3b8',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              📜 Valuation Ledger
            </h4>
            <span
              style={{
                fontSize: '18px',
                color: '#94a3b8',
                transform: ledgerExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}
            >
              ▼
            </span>
          </button>

          {/* Collapsible Content */}
          {ledgerExpanded && (
            <div
              style={{
                padding: '0 20px 20px 20px',
                borderTop: '1px solid #e2e8f0',
              }}
              data-testid="valuation-ledger-content"
            >
              {/* Price Range Visual */}
              {(valuation.lowEstimateUSD || collectibleData?.value_min) && (
                <div style={{ marginTop: '16px' }}>
                  <PriceRangeVisual
                    min={valuation.lowEstimateUSD || collectibleData?.value_min || 0}
                    max={valuation.highEstimateUSD || collectibleData?.value_max || 0}
                    value={currentValue}
                    currency={valuation.currency || 'USD'}
                    label="Estimated Value"
                  />
                </div>
              )}

              {/* Error State */}
              {historyError && (
                <div
                  style={{
                    padding: '12px 16px',
                    backgroundColor: '#fef2f2',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '13px',
                    marginTop: '8px',
                  }}
                  data-testid="valuation-ledger-error"
                >
                  ⚠️ {historyError}
                </div>
              )}

              {/* Price History List */}
              <PriceHistoryList history={historyData || []} loading={historyLoading} currency={valuation.currency || 'USD'} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
