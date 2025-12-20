import { useRef, useMemo, CSSProperties } from 'react';
import useStore from '../store';
import { useNavigate } from 'react-router-dom';
import PhotoUploadForm from '../PhotoUploadForm';
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker';
import { useThumbnailQueue } from '../hooks/useThumbnailQueue';
import { isProbablyMobile } from '../utils/isProbablyMobile';
import type { UploadPickerLocalPhoto } from '../store/uploadPickerSlice';
import type { AnalysisType } from '../hooks/useLocalPhotoPicker';

/**
 * UploadPage - Dedicated page for photo uploads
 * Route: /upload
 * 
 * This page is the landing destination when:
 * - User has no photos (SmartRouter redirects here)
 * - User explicitly navigates to upload new photos
 * 
 * Mobile behavior:
 * - Shows TWO buttons: "Choose from gallery" and "Take photo"
 * - Gallery input has NO capture attribute (opens gallery)
 * - Camera input has capture="environment" (opens camera)
 * 
 * Desktop behavior:
 * - Shows "Select Photos" button
 * - Uses File System Access API if available
 * 
 * @security File inputs validated and processed safely
 * @security Optimistic upload with error handling
 */
export default function UploadPage() {
  const navigate = useNavigate();

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleNativeSelection,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
  } = useLocalPhotoPicker({
    onUploadComplete: () => {},
    onUploadSuccess: () => {},
  });

  // Optimistic upload handler
  const addPendingUploads = useStore((state) => state.addPendingUploads);

  /**
   * Fire-and-forget upload logic with optimistic UI
   * @security Per-file error tracking, graceful failures
   */
  const handleOptimisticUpload = async (
    photosToUpload: UploadPickerLocalPhoto[],
    analysisType: AnalysisType = 'scenery'
  ) => {
    const files = (Array.isArray(photosToUpload) ? photosToUpload : [])
      .map((p) => p?.file)
      .filter(Boolean);

    // Close picker state so /gallery doesn't reopen the picker modal
    try {
      useStore.getState().pickerCommand?.closePicker?.('optimistic-upload-start');
    } catch {
      /* no-op */
    }

    // Add pending uploads to store (returns created temp entries)
    const pendingEntries = addPendingUploads(files) || [];

    // Navigate immediately
    navigate('/gallery', { replace: true, state: { suppressUploadPicker: true } });

    // Start background upload
    setTimeout(async () => {
      const { uploadPhotoToServer } = await import('../api');
      const { getPhotos } = await import('../api');
      const { generateClientThumbnail } = await import('../utils/clientImageProcessing');
      const removePendingUpload = useStore.getState().removePendingUpload;

      const errors: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const tempId = pendingEntries[i]?.id;
        let thumbnailBlob: Blob | null = null;
        try {
          thumbnailBlob = await generateClientThumbnail(file);
        } catch {
          /* no-op: error intentionally ignored */
        }
        try {
          await uploadPhotoToServer(file, undefined, thumbnailBlob, { classification: analysisType });
        } catch {
          errors.push(file?.name || 'unknown');
        }

        // Remove from pending uploads (use exact tempId when available)
        if (tempId) {
          removePendingUpload(tempId);
        } else {
          // Fallback: best-effort match by name+size
          const pending = useStore
            .getState()
            .pendingUploads.find((p) => p?.filename === file?.name && p?.file_size === file?.size);
          if (pending) removePendingUpload(pending.id);
        }
      }

      // Refresh the gallery data once uploads finish so real server photos appear
      try {
        const response = await getPhotos();
        useStore.getState().setPhotos((response && response.photos) || []);
      } catch {
        /* no-op */
      }

      if (errors.length > 0) {
        useStore.getState().setBanner({
          message: `Upload failed for: ${errors.slice(0, 3).join(', ')}${
            errors.length > 3 ? ` (+${errors.length - 3} more)` : ''
          }`,
          severity: 'error',
        });
      }
    }, 100);
  };

  // Refs for fallback file inputs (Safari/Firefox/mobile)
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Track if user has selected a folder
  const hasSelectedFolder = filteredLocalPhotos.length > 0;
  const isMobile = isProbablyMobile();

  // Extract files for queue processing
  const files = useMemo(() => filteredLocalPhotos.map((p) => p.file).filter(Boolean), [filteredLocalPhotos]);

  // Instantiate thumbnail queue - processes thumbnails in batches for better performance
  const thumbnailQueue = useThumbnailQueue(files, {
    concurrency: 4, // Process 4 thumbnails in parallel
    batchInterval: 200, // Flush UI updates every 200ms
  });

  /**
   * Handle folder selection flow with cross-browser support
   * @security On mobile, prefer native file input to avoid file system UI
   */
  const handleStartUpload = () => {
    // On Android/mobile, directory picker routes users into filesystem UI
    // that does not offer Camera option. Prefer native file input there.
    if (typeof window.showDirectoryPicker === 'function' && !isMobile) {
      handleSelectFolder();
    } else {
      galleryInputRef.current?.click();
    }
  };

  const handleChooseFromGallery = () => {
    galleryInputRef.current?.click();
  };

  const handleTakePhoto = () => {
    cameraInputRef.current?.click();
  };

  // Close/cancel handler - go to gallery
  const handleClose = () => {
    try {
      useStore.getState().pickerCommand?.closePicker?.('upload-cancel');
    } catch {
      /* no-op */
    }
    navigate('/gallery');
  };

  // Styles
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'calc(100vh - 120px)',
    padding: '32px',
    textAlign: 'center',
  };

  const cardStyle: CSSProperties = {
    maxWidth: '500px',
    padding: '48px',
    background: '#ffffff',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e2e8f0',
  };

  const iconContainerStyle: CSSProperties = {
    width: '80px',
    height: '80px',
    margin: '0 auto 24px',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 16px rgba(79, 70, 229, 0.3)',
  };

  const titleStyle: CSSProperties = {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: '12px',
  };

  const descriptionStyle: CSSProperties = {
    fontSize: '16px',
    color: '#64748b',
    lineHeight: '1.6',
    marginBottom: '32px',
  };

  const primaryButtonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.4)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  };

  const secondaryButtonStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 32px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#1e293b',
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
    transition: 'transform 0.2s, box-shadow 0.2s',
  };

  // If no folder selected yet, show the welcome/empty state
  if (!hasSelectedFolder) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          {/* Icon */}
          <div style={iconContainerStyle}>
            <svg
              width="40"
              height="40"
              fill="none"
              stroke="white"
              viewBox="0 0 24 24"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>

          {/* Title */}
          <h1 style={titleStyle}>Upload Your Photos</h1>

          {/* Description */}
          <p style={descriptionStyle}>
            Select photos to get started. Your photos will be uploaded and processed automatically.
          </p>

          {/* Primary Action Button(s) */}
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                type="button"
                onClick={handleChooseFromGallery}
                style={primaryButtonStyle}
                aria-label="Choose from gallery"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)';
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
                Choose from gallery
              </button>

              <button
                type="button"
                onClick={handleTakePhoto}
                style={secondaryButtonStyle}
                aria-label="Take photo"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.10)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h3l2-2h8l2 2h3a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Take photo
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartUpload}
              style={primaryButtonStyle}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.4)';
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
              Select Photos
            </button>
          )}

          {/* Hidden inputs: gallery (no capture) + camera (capture="environment") */}
          <input
            type="file"
            accept="image/*,.heic,.heif,.png,.jpg,.jpeg"
            multiple
            className="hidden"
            style={{ display: 'none' }}
            ref={galleryInputRef}
            onChange={handleNativeSelection}
            data-testid="gallery-input"
          />
          <input
            type="file"
            accept="image/*,.heic,.heif,.png,.jpg,.jpeg"
            multiple
            className="hidden"
            style={{ display: 'none' }}
            ref={cameraInputRef}
            capture="environment"
            onChange={handleNativeSelection}
            data-testid="camera-input"
          />

          {/* Secondary link */}
          <div style={{ marginTop: '24px' }}>
            <button
              onClick={handleClose}
              style={{
                fontSize: '14px',
                color: '#64748b',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Go to Gallery →
            </button>
          </div>

          {/* Features list */}
          <div
            style={{
              marginTop: '32px',
              paddingTop: '24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left',
            }}
          >
            {[
              { icon: '📸', text: 'Supports JPEG, PNG, and HEIC formats' },
              { icon: '🔄', text: 'Automatic HEIC to JPEG conversion' },
              { icon: '🤖', text: 'AI-powered metadata extraction' },
            ].map((feature, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  fontSize: '14px',
                  color: '#475569',
                }}
              >
                <span>{feature.icon}</span>
                <span>{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Once folder is selected, show the full upload form
  return (
    <div style={{ position: 'relative', minHeight: 'calc(100vh - 80px)' }}>
      <PhotoUploadForm
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        uploading={uploading}
        filteredLocalPhotos={filteredLocalPhotos}
        handleUploadFiltered={handleOptimisticUpload}
        onReopenFolder={handleSelectFolder}
        handleNativeSelection={handleNativeSelection}
        isStandalonePage={true}
        closeReason="upload-page-close"
        onClose={handleClose}
        thumbnailData={thumbnailQueue}
      />
    </div>
  );
}
