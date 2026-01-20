import React from 'react';

import { ChevronDown, Trash2 } from 'lucide-react';

import { API_BASE_URL } from '../../api/httpClient';
import { isProbablyMobile } from '../../utils/isProbablyMobile';

import AuthenticatedImage from '../AuthenticatedImage';

export type Id = string | number;

export type CollectiblePhotoDto = {
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

interface CollectibleReferencePhotosSectionProps {
  collectibleId?: Id;
  mergedCollectiblePhotos: CollectiblePhotoDto[];
  collectiblePhotosLoading: boolean;
  collectiblePhotosError: string | null;
  collectiblePhotosUploading: boolean;
  isProcessingSelection: boolean;
  addReferenceActionOpen: boolean;
  addReferenceActionRef: React.RefObject<HTMLDivElement | null>;
  captureIntentSubmitting: boolean;
  onToggleAddReferenceAction: () => void;
  onCloseAddReferenceMenu: () => void;
  onAddCollectiblePhotosClick: () => void;
  onOpenCaptureSession: () => void;
  onCaptureOnPhone: () => void;
  onRequestDeletePhoto: (id: Id) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function CollectibleReferencePhotosSection({
  collectibleId,
  mergedCollectiblePhotos,
  collectiblePhotosLoading,
  collectiblePhotosError,
  collectiblePhotosUploading,
  isProcessingSelection,
  addReferenceActionOpen,
  addReferenceActionRef,
  captureIntentSubmitting,
  onToggleAddReferenceAction,
  onCloseAddReferenceMenu,
  onAddCollectiblePhotosClick,
  onOpenCaptureSession,
  onCaptureOnPhone,
  onRequestDeletePhoto,
  fileInputRef,
  onFileChange,
}: CollectibleReferencePhotosSectionProps) {
  const hasCollectible = Boolean(collectibleId);

  return (
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <div ref={addReferenceActionRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={onToggleAddReferenceAction}
              aria-haspopup="menu"
              aria-expanded={addReferenceActionOpen}
              disabled={!hasCollectible}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                backgroundColor: hasCollectible ? '#0f172a' : '#f1f5f9',
                color: hasCollectible ? '#ffffff' : '#94a3b8',
                fontSize: '12px',
                fontWeight: 700,
                cursor: hasCollectible ? 'pointer' : 'not-allowed',
                opacity: collectiblePhotosUploading || isProcessingSelection ? 0.85 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {isProcessingSelection
                ? 'Processing Image…'
                : collectiblePhotosUploading
                  ? 'Uploading…'
                  : 'Add Reference Photo'}
              <ChevronDown size={14} aria-hidden="true" focusable="false" />
            </button>

            {addReferenceActionOpen && (
              <div
                role="menu"
                aria-orientation="vertical"
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  minWidth: '200px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                  padding: '6px',
                  zIndex: 20,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCloseAddReferenceMenu();
                    onAddCollectiblePhotosClick();
                  }}
                  disabled={!hasCollectible || collectiblePhotosUploading || isProcessingSelection}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: '#0f172a',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    opacity: collectiblePhotosUploading || isProcessingSelection ? 0.65 : 1,
                  }}
                >
                  Upload File
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCloseAddReferenceMenu();
                    onOpenCaptureSession();
                  }}
                  disabled={!hasCollectible}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 10px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'transparent',
                    color: '#0f172a',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Use Webcam
                </button>

                {!isProbablyMobile() && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onCloseAddReferenceMenu();
                      void onCaptureOnPhone();
                    }}
                    disabled={!hasCollectible || captureIntentSubmitting}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 10px',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'transparent',
                      color: '#0f172a',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: captureIntentSubmitting ? 'not-allowed' : 'pointer',
                      opacity: captureIntentSubmitting ? 0.65 : 1,
                    }}
                  >
                    {captureIntentSubmitting ? 'Connecting…' : 'Connect to Phone'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isProcessingSelection && <div style={{ fontSize: '12px', color: '#475569' }}>Processing image…</div>}

      {collectiblePhotosError && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{collectiblePhotosError}</div>}

      {collectiblePhotosLoading ? (
        <div style={{ fontSize: '12px', color: '#64748b' }}>Loading photos…</div>
      ) : hasCollectible && mergedCollectiblePhotos.length === 0 ? (
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
                    onClick={() => onRequestDeletePhoto(p.id)}
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
  );
}
