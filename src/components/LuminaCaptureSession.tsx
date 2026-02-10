import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertToWebpForUpload, createThumbnailGenerator, startBackgroundUpload } from '../utils/uploadPipeline';

export type LuminaCaptureSessionPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

export interface LuminaCaptureSessionProps {
  open: boolean;
  collectibleId?: string | number | null;
  onClose: () => void;
  onUploadComplete?: () => void | Promise<void>;
  onUploadSuccess?: (count: number) => void;
  onFallbackToLibrary?: () => void;
  onCaptureSingle?: (file: File) => void;
}

const MAX_CAPTURE_DIMENSION = 1920;

function getCameraErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = String((error as { name?: unknown }).name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Camera access was denied. You can add photos from your library instead.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'No camera device was found. You can add photos from your library instead.';
    }
  }
  return 'Camera is unavailable. You can add photos from your library instead.';
}

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const elements = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(elements).filter((el) => !el.hasAttribute('disabled'));
}

export default function LuminaCaptureSession({
  open,
  collectibleId,
  onClose,
  onUploadComplete,
  onUploadSuccess,
  onFallbackToLibrary,
  onCaptureSingle,
}: LuminaCaptureSessionProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nextIdRef = useRef(0);

  const [photos, setPhotos] = useState<LuminaCaptureSessionPhoto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const thumbnailTimeoutMs = Number(import.meta.env.VITE_THUMBNAIL_GENERATION_TIMEOUT_MS || 5000);
  const generateThumbnailWithTimeout = useMemo(
    () => createThumbnailGenerator(thumbnailTimeoutMs),
    [thumbnailTimeoutMs]
  );

  const isSingleCapture = typeof onCaptureSingle === 'function';

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = null;
    if (videoRef.current) {
      try {
        (videoRef.current as HTMLVideoElement).srcObject = null;
      } catch {
        /* ignore */
      }
    }
  }, []);

  const resetSession = useCallback(() => {
    setCameraError(null);
    setIsInitializing(false);
    setSelectedId(null);
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
  }, []);

  const handleClose = useCallback(() => {
    stopStream();
    resetSession();
    onClose();
  }, [onClose, resetSession, stopStream]);

  useEffect(() => {
    if (!open) {
      stopStream();
      resetSession();
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, resetSession, stopStream]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleClose, open]);

  useEffect(() => {
    if (!open) return;

    if (!window.isSecureContext) {
      setCameraError('Camera access requires a secure connection (HTTPS).');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported in this browser.');
      return;
    }

    let isMounted = true;
    setIsInitializing(true);
    setCameraError(null);

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (!isMounted) return;
        streamRef.current = stream;
        if (videoRef.current) {
          try {
            videoRef.current.srcObject = stream;
          } catch {
            /* ignore */
          }
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        setCameraError(getCameraErrorMessage(error));
      })
      .finally(() => {
        if (isMounted) setIsInitializing(false);
      });

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [open, stopStream]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const videoWidth = video.videoWidth || video.clientWidth;
    const videoHeight = video.videoHeight || video.clientHeight;
    if (!videoWidth || !videoHeight) return;

    const ratio = Math.min(1, MAX_CAPTURE_DIMENSION / Math.max(videoWidth, videoHeight));
    const targetWidth = Math.round(videoWidth * ratio);
    const targetHeight = Math.round(videoHeight * ratio);

    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Unable to capture photo. Please try again.');
          return;
        }
        const nextIndex = nextIdRef.current + 1;
        nextIdRef.current = nextIndex;
        const timestamp = Date.now();
        const name = `collectible-ref-${timestamp}-${nextIndex}.jpg`;
        const file = new File([blob], name, { type: blob.type || 'image/jpeg' });
        if (isSingleCapture) {
          onCaptureSingle?.(file);
          handleClose();
          return;
        }
        const previewUrl = URL.createObjectURL(file);
        const id = `${timestamp}-${nextIndex}`;
        setPhotos((prev) => {
          const next = [...prev, { id, file, previewUrl }];
          return next;
        });
        setSelectedId(id);
      },
      'image/jpeg',
      0.92
    );
  }, [handleClose, isSingleCapture, onCaptureSingle]);

  const handleAddFromLibrary = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    input.value = '';
    if (files.length === 0) return;

    if (isSingleCapture) {
      const file = files[0];
      if (file) {
        onCaptureSingle?.(file);
        handleClose();
      }
      return;
    }

    const addedIds: string[] = [];

    setPhotos((prev) => {
      const next = [...prev];
      files.forEach((file) => {
        const id = `library-${Date.now()}-${nextIdRef.current++}`;
        const previewUrl = URL.createObjectURL(file);
        next.push({ id, file, previewUrl });
        addedIds.push(id);
      });
      return next;
    });
    const lastId = addedIds[addedIds.length - 1];
    setSelectedId(lastId ?? null);
  }, [handleClose, isSingleCapture, onCaptureSingle]);

  const handleDeletePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const next = prev.filter((photo) => photo.id !== id);
      const removed = prev.find((photo) => photo.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      if (selectedId === id) {
        setSelectedId(next[0]?.id || null);
      }
      return next;
    });
  }, [selectedId]);

  const handleUpload = useCallback(() => {
    if (photos.length === 0) return;

    const files = photos.map((photo) => photo.file);
    startBackgroundUpload({
      files,
      analysisType: 'none',
      collectibleId,
      onUploadComplete,
      onUploadSuccess,
      generateThumbnail: generateThumbnailWithTimeout,
      convertToWebp: convertToWebpForUpload,
    });

    handleClose();
  }, [collectibleId, generateThumbnailWithTimeout, handleClose, onUploadComplete, onUploadSuccess, photos]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(panelRef.current);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!open) return null;

  const hasPhotos = photos.length > 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70"
      role="dialog"
      aria-modal="true"
      aria-label="Lumina capture session"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="relative flex h-full w-full flex-col bg-slate-900 text-white sm:h-[92vh] sm:w-[92vw] sm:rounded-3xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true">📷</span>
            <span>Lumina Capture</span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close capture session"
            className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            Close
          </button>
        </div>

        <div className="relative flex flex-1 items-center justify-center bg-black">
          {cameraError ? (
            <div className="flex max-w-md flex-col items-center gap-4 px-6 text-center text-sm text-slate-200">
              <p>{cameraError}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Add from library"
                  className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-900"
                >
                  Add from library
                </button>
                {onFallbackToLibrary && (
                  <button
                    type="button"
                    onClick={() => {
                      onFallbackToLibrary();
                      handleClose();
                    }}
                    aria-label="Use existing library picker"
                    className="rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200"
                  >
                    Use existing picker
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                data-testid="lumina-capture-video"
                className="h-full w-full object-cover"
                muted
                autoPlay
                playsInline
              />
              {isInitializing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-slate-200">
                  Starting camera…
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-800 bg-slate-950/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={captureFrame}
              aria-label="Capture photo"
              disabled={Boolean(cameraError)}
              className={`h-14 w-14 rounded-full border-4 border-white shadow-inner ${
                cameraError ? 'bg-white/5 opacity-50' : 'bg-white/10'
              }`}
            />
            {!isSingleCapture && (
              <>
                <div className="flex flex-1 items-center gap-2 overflow-x-auto" role="list">
                  {photos.map((photo) => (
                    <div
                      key={photo.id}
                      role="listitem"
                      className={`relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg border ${
                        selectedId === photo.id ? 'border-white' : 'border-slate-700'
                      }`}
                      onClick={() => setSelectedId(photo.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') setSelectedId(photo.id);
                      }}
                      tabIndex={0}
                    >
                      <img
                        src={photo.previewUrl}
                        alt="Captured thumbnail"
                        data-testid="capture-thumbnail"
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeletePhoto(photo.id);
                        }}
                        aria-label="Delete captured photo"
                        className="absolute right-0 top-0 rounded-bl bg-black/70 px-1 text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={!hasPhotos}
                  aria-label="Upload captured photos"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    hasPhotos ? 'bg-white text-slate-900' : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  Done / Upload
                </button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-300">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add from library"
              className="rounded-full border border-slate-700 px-3 py-1"
            >
              Add from library
            </button>
            {!isSingleCapture && <span>{hasPhotos ? `${photos.length} captured` : 'No photos yet'}</span>}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          onChange={handleAddFromLibrary}
          className="sr-only"
          aria-label="Add from library"
          data-testid="lumina-library-input"
        />
      </div>
    </div>
  );
}
