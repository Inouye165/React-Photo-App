import React from 'react';

import type { Photo } from '../types/photo';
import type { CollectibleRecord } from '../types/collectibles';

import useStore from '../store';

import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker';
import LuminaCaptureSession from './LuminaCaptureSession';

import { request } from '../api/httpClient';
import { getHeadersForGetRequestAsync } from '../api/auth';
import { deletePhoto } from '../api/photos';
import { openCaptureIntent } from '../api/captureIntents';

import PriceRangeVisual from './PriceRangeVisual';
import PriceHistoryList from './PriceHistoryList';
import CollectibleReferencePhotosSection, {
  type CollectiblePhotoDto,
  type Id,
} from './collectibles/CollectibleReferencePhotosSection';
import DeletePhotoDialog from './collectibles/DeletePhotoDialog';

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
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [captureIntentSubmitting, setCaptureIntentSubmitting] = React.useState(false);
  const [addReferenceActionOpen, setAddReferenceActionOpen] = React.useState(false);
  const [isProcessingSelection, setIsProcessingSelection] = React.useState(false);

  const addReferenceActionRef = React.useRef<HTMLDivElement | null>(null);

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
  const captureSearch = typeof window !== 'undefined' ? window.location.search : '';

  const loadCollectiblePhotos = React.useCallback(async (): Promise<CollectiblePhotoDto[]> => {
    const collectibleId = collectibleData?.id;
    if (!collectibleId) {
      setCollectiblePhotos([]);
      return [];
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
      const next = Array.isArray(json.photos) ? json.photos : [];
      setCollectiblePhotos(next);
      return next;
    } catch (err) {
      setCollectiblePhotosError(getErrorMessage(err) || 'Failed to load collectible photos');
      setCollectiblePhotos([]);
      return [];
    } finally {
      setCollectiblePhotosLoading(false);
    }
  }, [collectibleData?.id]);

  const fetchCollectiblePhotos = React.useCallback(async (): Promise<void> => {
    await loadCollectiblePhotos();
  }, [loadCollectiblePhotos]);

  const collectiblePhotoWatchTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const collectiblePhotoWatchDeadlineRef = React.useRef<number | null>(null);
  const collectiblePhotoWatchBaselineRef = React.useRef<Set<string> | null>(null);
  const collectiblePhotoWatchInFlightRef = React.useRef(false);

  const stopCollectiblePhotoWatch = React.useCallback(() => {
    if (collectiblePhotoWatchTimerRef.current) {
      try {
        clearInterval(collectiblePhotoWatchTimerRef.current);
      } catch {
        // ignore
      }
      collectiblePhotoWatchTimerRef.current = null;
    }
    collectiblePhotoWatchDeadlineRef.current = null;
    collectiblePhotoWatchBaselineRef.current = null;
    collectiblePhotoWatchInFlightRef.current = false;
  }, []);

  const pollCollectiblePhotosOnce = React.useCallback(async () => {
    const deadline = collectiblePhotoWatchDeadlineRef.current;
    if (!deadline || Date.now() > deadline) {
      stopCollectiblePhotoWatch();
      return;
    }
    if (collectiblePhotoWatchInFlightRef.current) return;

    collectiblePhotoWatchInFlightRef.current = true;
    try {
      const latest = await loadCollectiblePhotos();
      const baseline = collectiblePhotoWatchBaselineRef.current;
      if (baseline && Array.isArray(latest)) {
        const hasNew = latest.some((p) => !baseline.has(String(p?.id)));
        if (hasNew) {
          stopCollectiblePhotoWatch();
        }
      }
    } finally {
      collectiblePhotoWatchInFlightRef.current = false;
    }
  }, [loadCollectiblePhotos, stopCollectiblePhotoWatch]);

  const startCollectiblePhotoWatch = React.useCallback(() => {
    stopCollectiblePhotoWatch();

    const collectibleId = collectibleData?.id;
    if (!collectibleId) return;

    collectiblePhotoWatchBaselineRef.current = new Set(
      (Array.isArray(collectiblePhotos) ? collectiblePhotos : []).map((p) => String(p?.id)),
    );
    collectiblePhotoWatchDeadlineRef.current = Date.now() + 90_000;

    void pollCollectiblePhotosOnce();
    collectiblePhotoWatchTimerRef.current = setInterval(() => {
      void pollCollectiblePhotosOnce();
    }, 2_500);
  }, [collectibleData?.id, collectiblePhotos, pollCollectiblePhotosOnce, stopCollectiblePhotoWatch]);

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

  React.useEffect(() => {
    return () => {
      stopCollectiblePhotoWatch();
    };
  }, [stopCollectiblePhotoWatch]);

  React.useEffect(() => {
    const collectibleId = collectibleData?.id;
    if (!collectibleId) return;
    if (typeof window === 'undefined' || !window.addEventListener) return;

    const onCollectiblePhotosChanged = (event: Event) => {
      const custom = event as CustomEvent;
      const detail = custom?.detail as { collectibleId?: unknown } | undefined;
      if (!detail) return;
      if (String(detail.collectibleId ?? '') !== String(collectibleId)) return;
      void fetchCollectiblePhotos();
    };

    window.addEventListener('collectible-photos-changed', onCollectiblePhotosChanged);
    return () => {
      window.removeEventListener('collectible-photos-changed', onCollectiblePhotosChanged);
    };
  }, [collectibleData?.id, fetchCollectiblePhotos]);

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

  const closeAddReferenceMenu = React.useCallback(() => {
    setAddReferenceActionOpen(false);
  }, []);

  const handleToggleAddReferenceAction = React.useCallback(() => {
    setAddReferenceActionOpen((prev) => !prev);
  }, []);

  React.useEffect(() => {
    if (!addReferenceActionOpen) return;
    if (typeof document === 'undefined') return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!addReferenceActionRef.current) return;
      if (!addReferenceActionRef.current.contains(event.target as Node)) {
        setAddReferenceActionOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAddReferenceActionOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [addReferenceActionOpen]);

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

  const handleOpenCaptureSession = React.useCallback(() => {
    if (!collectibleData?.id) {
      setBanner({ message: 'Select a collectible before adding photos.', severity: 'warning' });
      return;
    }
    setCaptureOpen(true);
  }, [collectibleData?.id, setBanner]);

  const handleCaptureOnPhone = React.useCallback(async () => {
    if (captureIntentSubmitting) return;
    if (!photo?.id || !collectibleData?.id) {
      setBanner({ message: 'Select a collectible before capturing on phone.', severity: 'warning' });
      return;
    }

    setCaptureIntentSubmitting(true);
    try {
      const intent = await openCaptureIntent({
        photoId: photo.id,
        collectibleId: collectibleData.id,
      });
      if (!intent) {
        setBanner({ message: 'Unable to create capture intent. Please try again.', severity: 'error' });
      } else {
        setBanner({ message: 'Ready on your phone', severity: 'info' });
        // Fallback: poll for the new reference photo in case SSE is disabled,
        // blocked by infra/proxies, or the event is missed.
        startCollectiblePhotoWatch();
      }
    } catch (err) {
      setBanner({ message: getErrorMessage(err) || 'Failed to start phone capture', severity: 'error' });
    } finally {
      setCaptureIntentSubmitting(false);
    }
  }, [captureIntentSubmitting, collectibleData?.id, photo?.id, setBanner, startCollectiblePhotoWatch]);

  const handleCloseCaptureSession = React.useCallback(() => {
    setCaptureOpen(false);
  }, []);

  React.useEffect(() => {
    if (!photo?.id || !collectibleData?.id) return;
    if (typeof window === 'undefined') return;
    if (captureOpen) return;

    const params = new URLSearchParams(captureSearch);
    if (params.get('capture') !== '1') return;

    const paramCollectibleId = params.get('collectibleId');
    if (paramCollectibleId && String(collectibleData.id) !== String(paramCollectibleId)) return;

    setCaptureOpen(true);

    params.delete('capture');
    params.delete('collectibleId');
    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash || ''}`;
    try {
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // ignore history errors
    }
  }, [captureOpen, captureSearch, collectibleData?.id, photo?.id]);

  const onFileChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsProcessingSelection(true);

      // Snapshot the selection immediately (Safari/Firefox can lose `files` after async work).
      const inputEl = (e?.currentTarget || e?.target) as HTMLInputElement | null;
      const selectedFiles = Array.from(inputEl?.files || []);

      try {
        if (selectedFiles.length === 0) return;

        if (!collectibleData?.id) {
          setBanner({ message: 'Select a collectible before adding photos.', severity: 'warning' });
          return;
        }

        // 1) Stage files (EXIF/thumbnail parsing, HEIC handling is downstream)
        await handleNativeSelection(e);

        // 2) Guard against race: only upload if this selection actually staged something.
        const selectedNames = new Set(selectedFiles.map((file) => file.name));
        const staged = useStore.getState().uploadPicker?.localPhotos || [];
        const hasStagedSelection = staged.some((item) => selectedNames.has(item?.file?.name || item?.name));
        if (!hasStagedSelection) {
          setBanner({ message: 'No photos were staged for upload.', severity: 'warning' });
          return;
        }

        // 3) Trigger upload immediately for the collectible with explicit classification.
        handleUploadFilteredOptimistic(undefined, 'none', String(collectibleData.id));
      } catch (err) {
        const message = getErrorMessage(err) || 'Failed to process selected image(s).';
        setCollectiblePhotosError(message);
        setBanner({ message, severity: 'error' });
      } finally {
        setIsProcessingSelection(false);
      }
    },
    [collectibleData?.id, handleNativeSelection, handleUploadFilteredOptimistic, setBanner]
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
    <>
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
      <CollectibleReferencePhotosSection
        collectibleId={collectibleData?.id}
        mergedCollectiblePhotos={mergedCollectiblePhotos}
        collectiblePhotosLoading={collectiblePhotosLoading}
        collectiblePhotosError={collectiblePhotosError}
        collectiblePhotosUploading={collectiblePhotosUploading}
        isProcessingSelection={isProcessingSelection}
        addReferenceActionOpen={addReferenceActionOpen}
        addReferenceActionRef={addReferenceActionRef}
        captureIntentSubmitting={captureIntentSubmitting}
        onToggleAddReferenceAction={handleToggleAddReferenceAction}
        onCloseAddReferenceMenu={closeAddReferenceMenu}
        onAddCollectiblePhotosClick={handleAddCollectiblePhotosClick}
        onOpenCaptureSession={handleOpenCaptureSession}
        onCaptureOnPhone={handleCaptureOnPhone}
        onRequestDeletePhoto={handleRequestDeletePhoto}
        fileInputRef={fileInputRef}
        onFileChange={onFileChange}
      />

      <DeletePhotoDialog
        open={Boolean(photoToDelete)}
        filename={selectedPhotoToDelete?.filename ? String(selectedPhotoToDelete.filename) : null}
        deleteSubmitting={deleteSubmitting}
        onCancel={handleCancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />

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
      <LuminaCaptureSession
        open={captureOpen}
        collectibleId={collectibleData?.id ?? null}
        onClose={handleCloseCaptureSession}
        onUploadComplete={fetchCollectiblePhotos}
        onFallbackToLibrary={handleAddCollectiblePhotosClick}
      />
    </>
  );
}
