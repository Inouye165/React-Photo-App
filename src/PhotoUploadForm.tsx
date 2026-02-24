import React, { useEffect, useState, useRef, useCallback, CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import useStore from './store';
import { useThumbnailQueue } from './hooks/useThumbnailQueue';
import Thumbnail from './components/Thumbnail.tsx';
import { isProbablyMobile } from './utils/isProbablyMobile';
import type { UploadPickerLocalPhoto } from './store/uploadPickerSlice';
import type { AnalysisType } from './types/uploads';

/**
 * Custom hook to get responsive column count based on viewport width
 */
const useColumns = (): number => {
  const [columns, setColumns] = useState(6);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) setColumns(2);
      else if (width < 768) setColumns(3);
      else if (width < 1024) setColumns(4);
      else if (width < 1280) setColumns(5);
      else setColumns(6);
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  return columns;
};

/**
 * PhotoUploadForm component props
 */
interface PhotoUploadFormProps {
  startDate: string;
  endDate: string;
  setStartDate: (value: string) => void;
  setEndDate: (value: string) => void;
  uploading: boolean;
  filteredLocalPhotos: UploadPickerLocalPhoto[];
  handleUploadFiltered: (photos: UploadPickerLocalPhoto[], analysisType: AnalysisType) => void | Promise<void>;
  onReopenFolder?: () => void | Promise<void>;
  handleNativeSelection: (event: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  isStandalonePage?: boolean;
  onClose?: (reason: string) => void;
  closeReason?: string;
  thumbnailData?: ReturnType<typeof useThumbnailQueue> | null;
}

/**
 * PhotoUploadForm Component
 * 
 * Displays a grid of photos for selection and upload.
 * 
 * Mobile behavior:
 * - Shows TWO separate file inputs
 * - "Choose from gallery" button → opens gallery (no capture attribute)
 * - "Take photo" button → opens camera (capture="environment")
 * 
 * Desktop behavior:
 * - Shows "Change Folder" button
 * - Uses File System Access API if available, falls back to webkitdirectory
 * 
 * @security Input validation on all user interactions
 * @security Separate inputs for gallery vs camera prevents file system exposure
 * @security Keys based on stable IDs to prevent selection confusion
 */
const PhotoUploadForm: React.FC<PhotoUploadFormProps> = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  uploading,
  filteredLocalPhotos,
  handleUploadFiltered,
  onReopenFolder,
  handleNativeSelection,
  isStandalonePage = false,
  onClose,
  closeReason = 'user-dismissed',
  thumbnailData = null,
}) => {
  // Refs for file inputs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileGalleryInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);

  // Store commands
  const closePicker = useStore((state) => state.pickerCommand.closePicker);

  // Responsive column count
  const columns = useColumns();

  // Ref for scrollable container (virtualization)
  const parentRef = useRef<HTMLDivElement>(null);

  // Panel ref for focus management
  const panelRef = useRef<HTMLDivElement>(null);

  /**
   * Handler for closing - supports both modal and page modes
   */
  const handleClose = React.useCallback(() => {
    closePicker(closeReason);
    if (typeof onClose === 'function') {
      onClose(closeReason);
    }
  }, [closePicker, onClose, closeReason]);

  /**
   * Generate stable key for a photo
   * @security Uses stable IDs to prevent selection state bugs
   */
  const getPhotoKey = useCallback((photo: UploadPickerLocalPhoto, index: number): string => {
    return photo?.id || photo?.name || photo?.file?.name || String(index);
  }, []);

  // Selection state: Set of stable keys
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const userTouchedSelectionRef = useRef(false);
  const lastListKeyRef = useRef('');

  // Analysis type state - default to 'none' so users opt-in to AI analysis
  const [analysisType, setAnalysisType] = useState<AnalysisType>('none');

  /**
   * Keep selection stable across re-renders and filtering
   * Default to selecting ALL photos only until the user interacts
   */
  useEffect(() => {
    const keys = Array.isArray(filteredLocalPhotos)
      ? filteredLocalPhotos.map((p, i) => getPhotoKey(p, i))
      : [];
    const nextListKey = keys.join('|');

    // When list becomes empty, reset selection state machine
    if (keys.length === 0) {
      lastListKeyRef.current = '';
      userTouchedSelectionRef.current = false;
      setSelectedKeys(new Set());
      return;
    }

    const listChanged = lastListKeyRef.current !== nextListKey;
    lastListKeyRef.current = nextListKey;

    setSelectedKeys((prev) => {
      const prevSet: Set<string> = prev instanceof Set ? prev : new Set();
      // If the user hasn't interacted yet, default to "select all"
      if (!userTouchedSelectionRef.current) {
        return new Set(keys);
      }
      // Otherwise, preserve selection by intersecting with the new list
      if (!listChanged) return prevSet;
      const next = new Set<string>();
      for (const k of prevSet) {
        if (keys.includes(k)) next.add(k);
      }
      return next;
    });
  }, [filteredLocalPhotos, getPhotoKey]);

  /**
   * Toggle selection for a photo
   */
  const toggleSelection = useCallback(
    (photo: UploadPickerLocalPhoto, index: number) => {
      const key = getPhotoKey(photo, index);
      userTouchedSelectionRef.current = true;
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [getPhotoKey]
  );

  /**
   * Select all photos
   */
  const handleSelectAll = () => {
    userTouchedSelectionRef.current = true;
    setSelectedKeys(new Set(filteredLocalPhotos.map((p, i) => getPhotoKey(p, i))));
  };

  /**
   * Deselect all photos
   */
  const handleDeselectAll = () => {
    userTouchedSelectionRef.current = true;
    setSelectedKeys(new Set());
  };

  /**
   * Upload selected photos
   */
  const onUploadClick = () => {
    const photosToUpload = filteredLocalPhotos.filter((p, i) => selectedKeys.has(getPhotoKey(p, i)));
    handleUploadFiltered(photosToUpload, analysisType);
  };

  /**
   * Setup keyboard navigation, focus trap, and body scroll lock
   */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    if (!isStandalonePage) {
      document.body.style.overflow = 'hidden';
    }
    try {
      panelRef.current && panelRef.current.focus();
    } catch {
      /* ignore */
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        try {
          handleClose();
        } catch {
          /* ignore */
        }
      }
      if (e.key !== 'Tab') return;
      const focusableSelector =
        'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const nodes = panelRef.current ? Array.from(panelRef.current.querySelectorAll(focusableSelector)) : [];
      if (nodes.length === 0) return;
      const first = nodes[0] as HTMLElement;
      const last = nodes[nodes.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);

    // Position panel relative to app shell only in modal mode
    if (!isStandalonePage) {
      try {
        const appShell = document.querySelector('#main-app-container');
        if (appShell && panelRef.current) {
          const rect = appShell.getBoundingClientRect();
          const topPx = Math.ceil(rect.top + 16);
          panelRef.current.style.position = 'absolute';
          panelRef.current.style.left = '16px';
          panelRef.current.style.right = '16px';
          panelRef.current.style.top = `${topPx}px`;
          panelRef.current.style.bottom = '16px';
          panelRef.current.style.margin = '0';
        }
      } catch {
        /* ignore */
      }
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!isStandalonePage) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [isStandalonePage, handleClose]);

  // Different container styles for modal vs standalone page
  const containerStyle: CSSProperties = isStandalonePage
    ? {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100vh - 80px)',
        background: '#f8fafc',
        color: '#1e293b',
      }
    : {
        left: '0',
        right: '0',
        top: '96px',
        bottom: '0',
        zIndex: 60,
        margin: '0',
        background: '#f8fafc',
        color: '#1e293b',
      };

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(filteredLocalPhotos.length / columns),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 2,
  });

  // Thumbnail queue (either from prop or create new)
  const filesForThumbnails = filteredLocalPhotos.map((photo) => photo.file);
  const internalThumbnailData = useThumbnailQueue(filesForThumbnails);
  const thumbnailQueue = thumbnailData || internalThumbnailData;

  return (
    <div
      id="photo-upload-panel"
      ref={panelRef}
      role={isStandalonePage ? 'main' : 'dialog'}
      aria-modal={!isStandalonePage}
      tabIndex={-1}
      className={
        isStandalonePage
          ? 'flex flex-col'
          : 'fixed overflow-hidden flex flex-col shadow-xl rounded-lg border border-gray-200'
      }
      style={containerStyle}
    >
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Select Photos to Upload</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedKeys.size} selected of {filteredLocalPhotos.length} available
          </p>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
          aria-label="Close upload modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Toolbar / Filters */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Start Date"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="End Date"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="analysis-type" className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Analysis Type
          </label>
          <select
            id="analysis-type"
            value={analysisType}
            onChange={(e) => setAnalysisType(e.target.value as AnalysisType)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white min-h-[44px]"
            aria-label="Analysis Type"
          >
            <option value="none">📷 Photo Only (No Analysis)</option>
            <option value="scenery">🏞️ Scenery &amp; Location</option>
            <option value="collectible">🏺 Collectible &amp; Appraisal</option>
            <option value="todo">
              📝 Todo / Reminder
            </option>
          </select>
        </div>

        <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50"
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            className="text-sm text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100"
          >
            Deselect All
          </button>
        </div>

        <div className="ml-auto flex gap-3">
          {isProbablyMobile() ? (
            <>
              {/* Mobile: Two separate buttons for gallery and camera */}
              <button
                type="button"
                onClick={() => mobileGalleryInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 min-h-[44px] min-w-[44px]"
                aria-label="Choose from gallery"
              >
                Choose from gallery
              </button>
              <button
                type="button"
                onClick={() => mobileCameraInputRef.current?.click()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 min-h-[44px] min-w-[44px]"
                aria-label="Take photo"
              >
                Take photo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                const mobile = isProbablyMobile();
                const canUseDirectoryPicker = 'showDirectoryPicker' in window && !mobile;
                if (canUseDirectoryPicker) {
                  onReopenFolder && onReopenFolder();
                  return;
                }

                // Desktop unsupported browsers: fall back to webkitdirectory input
                fileInputRef.current?.click();
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 min-h-[44px] min-w-[44px]"
            >
              Change Folder
            </button>
          )}
          {/* Hidden file input for folder selection (desktop fallback) */}
          <input
            type="file"
            // @ts-expect-error - webkitdirectory is non-standard but widely supported
            webkitdirectory=""
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleNativeSelection}
            data-testid="folder-input"
          />
          {/* Mobile input: gallery (no capture attribute) */}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp,image/*"
            multiple
            className="hidden"
            id="mobile-gallery-input"
            data-testid="mobile-gallery-input"
            ref={mobileGalleryInputRef}
            onChange={handleNativeSelection}
          />
          {/* Mobile input: camera (with capture="environment") */}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,image/webp,image/*"
            multiple
            className="hidden"
            id="mobile-camera-input"
            data-testid="mobile-camera-input"
            ref={mobileCameraInputRef}
            capture="environment"
            onChange={handleNativeSelection}
          />
          <button
            onClick={onUploadClick}
            disabled={uploading || filteredLocalPhotos.length === 0 || selectedKeys.size === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {uploading ? 'Uploading...' : `Upload ${selectedKeys.size} Photos`}
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 h-full min-h-0 overflow-auto" ref={parentRef}>
        {filteredLocalPhotos.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">No photos match the selected date range</p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIndex = virtualRow.index * columns;
              const photosInRow = filteredLocalPhotos.slice(startIndex, startIndex + columns);

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex gap-2 px-4 py-2"
                >
                  {photosInRow.map((photo, colIndex) => {
                    const globalIndex = startIndex + colIndex;
                    const key = getPhotoKey(photo, globalIndex);
                    const isSelected = selectedKeys.has(key);
                    
                    // Get thumbnail URL from queue
                    const thumbnailUrl = thumbnailQueue?.thumbnails.get(photo.file.name);
                    const thumbnailStatus = thumbnailQueue?.status.get(photo.file.name);
                    
                    // Format file date for display
                    const fileDate = photo.exifDate ? new Date(photo.exifDate) : new Date(photo.file.lastModified);

                    return (
                      <div
                        key={key}
                        data-testid="photo-cell"
                        onClick={() => toggleSelection(photo, globalIndex)}
                        className={`aspect-square group relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-300'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Thumbnail
                          file={photo.file}
                          externalSrc={thumbnailUrl}
                          externalStatus={thumbnailStatus}
                          className="w-full h-full"
                        />
                        
                        {/* Checkbox Indicator */}
                        <div className="absolute top-2 right-2 z-10">
                          <div
                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-blue-500 border-blue-500'
                                : 'bg-white border-gray-300 group-hover:border-gray-400'
                            }`}
                          >
                            {isSelected && (
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        
                        {/* Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-xs truncate font-medium">{photo.name}</p>
                          <p className="text-[10px] text-gray-200">
                            {fileDate.toLocaleDateString()} • {(photo.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {/* Fill empty cells to maintain grid alignment */}
                  {Array.from({ length: columns - photosInRow.length }).map((_, i) => (
                    <div key={`empty-${virtualRow.index}-${i}`} className="flex-1" />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoUploadForm;
