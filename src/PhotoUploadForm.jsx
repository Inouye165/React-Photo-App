import React, { useEffect, useState, useRef, useCallback } from "react";
import { useVirtualizer } from '@tanstack/react-virtual';
import useStore from './store.js';
import Thumbnail from './components/Thumbnail.jsx';

// Hook to get responsive column count
const useColumns = () => {
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

const PhotoUploadForm = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  uploading,
  filteredLocalPhotos,
  handleUploadFiltered,
  onReopenFolder,
  isStandalonePage = false,
  onClose,
  closeReason = 'user-dismissed',
}) => {
  // Connect to store commands
  const closePicker = useStore((state) => state.pickerCommand.closePicker);
  
  // Get responsive column count
  const columns = useColumns();
  
  // Ref for the scrollable container
  const parentRef = useRef(null);
  
  // Handler for closing - supports both modal and page modes
  // Wrapped in useCallback to prevent useEffect dependency changes on every render
  const handleClose = React.useCallback(() => {
    closePicker(closeReason);
    if (typeof onClose === 'function') {
      onClose(closeReason);
    }
  }, [closePicker, onClose, closeReason]);

  // Selection state: Set of indices
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  // Reset selection when the filtered list changes (e.g. new folder or date filter change)
  // Default to selecting ALL photos
  useEffect(() => {
    const allIndices = new Set(filteredLocalPhotos.map((_, i) => i));
    setSelectedIndices(allIndices);
  }, [filteredLocalPhotos]);

  const toggleSelection = useCallback((index) => {
    setSelectedIndices(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
      return newSelection;
    });
  }, []);

  const handleSelectAll = () => {
    setSelectedIndices(new Set(filteredLocalPhotos.map((_, i) => i)));
  };

  const handleDeselectAll = () => {
    setSelectedIndices(new Set());
  };

  const onUploadClick = () => {
    const photosToUpload = filteredLocalPhotos.filter((_, i) => selectedIndices.has(i));
    handleUploadFiltered(photosToUpload);
  };

  const panelRef = useRef(null);
  useEffect(() => {
    // Skip body overflow lock in standalone page mode
    const prevOverflow = document.body.style.overflow;
    if (!isStandalonePage) {
      document.body.style.overflow = 'hidden';
    }
    try { panelRef.current && panelRef.current.focus(); } catch { /* ignore */ }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        try { handleClose(); } catch { /* ignore */ }
      }
      if (e.key !== 'Tab') return;
      const focusableSelector = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const nodes = panelRef.current ? Array.from(panelRef.current.querySelectorAll(focusableSelector)) : [];
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);

    // Position panel relative to toolbar only in modal mode
    if (!isStandalonePage) {
      try {
        const toolbar = document.querySelector('[aria-label="Main toolbar"]');
        if (toolbar && panelRef.current) {
          const rect = toolbar.getBoundingClientRect();
          const topPx = Math.ceil(rect.bottom + 8);
          panelRef.current.style.position = 'absolute';
          panelRef.current.style.left = '16px';
          panelRef.current.style.right = '16px';
          panelRef.current.style.top = `${topPx}px`;
          panelRef.current.style.bottom = '16px';
          panelRef.current.style.margin = '0';
        }
      } catch { /* ignore */ }
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!isStandalonePage) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [isStandalonePage, handleClose]);

  // Different container styles for modal vs standalone page
  const containerStyle = isStandalonePage
    ? {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 'calc(100vh - 80px)',
        background: '#f8fafc',
        color: '#1e293b'
      }
    : {
        left: '0',
        right: '0',
        top: '96px',
        bottom: '0',
        zIndex: 60,
        margin: '0',
        background: '#f8fafc',
        color: '#1e293b'
      };

  return (
    <div
      id="photo-upload-panel"
      ref={panelRef}
      role={isStandalonePage ? 'main' : 'dialog'}
      aria-modal={!isStandalonePage}
      tabIndex={-1}
      className={isStandalonePage ? 'flex flex-col' : 'fixed overflow-hidden flex flex-col shadow-xl rounded-lg border border-gray-200'}
      style={containerStyle}
    >
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Select Photos to Upload</h2>
          <p className="text-sm text-gray-500 mt-1">
            {selectedIndices.size} selected of {filteredLocalPhotos.length} available
          </p>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
          aria-label="Close upload modal"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Toolbar / Filters */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Start Date"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="End Date"
          />
        </div>
        
        <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

        <div className="flex gap-2">
          <button onClick={handleSelectAll} className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">Select All</button>
          <button onClick={handleDeselectAll} className="text-sm text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded hover:bg-gray-100">Deselect All</button>
        </div>

        <div className="ml-auto flex gap-3">
           <button 
             onClick={() => onReopenFolder && onReopenFolder()} 
             className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
           >
             Change Folder
           </button>
          <button
            onClick={onUploadClick}
            disabled={uploading || (selectedIndices.size === 0 && filteredLocalPhotos.length === 0)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {uploading ? 'Uploading...' : `Upload ${selectedIndices.size || filteredLocalPhotos.length} Photos`}
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 h-full min-h-0 overflow-auto" ref={parentRef}>
        {filteredLocalPhotos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-lg font-medium">No photos found</p>
            <p className="text-sm mt-1">Try adjusting the date range or selecting a different folder.</p>
          </div>
        ) : (
          <VirtualizedPhotoGrid
            photos={filteredLocalPhotos}
            columns={columns}
            selectedIndices={selectedIndices}
            toggleSelection={toggleSelection}
            parentRef={parentRef}
          />
        )}
      </div>
    </div>
  );
};

// Virtualized grid component using TanStack Virtual
const VirtualizedPhotoGrid = ({ photos, columns, selectedIndices, toggleSelection, parentRef }) => {
  const rowCount = Math.ceil(photos.length / columns);
  
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180, // Estimated row height (will be measured)
    overscan: 5,
  });

  return (
    <div
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
        width: '100%',
        position: 'relative',
      }}
      className="p-4"
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
        const rowIndex = virtualRow.index;
        const startIdx = rowIndex * columns;
        const rowPhotos = photos.slice(startIdx, startIdx + columns);

        return (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <div 
              className="grid gap-4 h-full"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {rowPhotos.map((p, colIndex) => {
                const index = startIdx + colIndex;
                const isSelected = selectedIndices.has(index);
                const fileDate = p.exifDate ? new Date(p.exifDate) : new Date(p.file?.lastModified);
                const fileSize = p.file ? (p.file.size || 0) : 0;

                return (
                  <div 
                    key={`${p.name}-${index}`}
                    data-testid="photo-cell"
                    onClick={() => toggleSelection(index)}
                    className={`
                      aspect-square
                      group relative rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-200
                      ${isSelected ? 'border-blue-500 ring-2 ring-blue-200 ring-offset-1' : 'border-transparent hover:border-gray-300'}
                      bg-gray-100 shadow-sm hover:shadow-md
                    `}
                  >
                    <Thumbnail file={p.file} className="w-full h-full object-cover" />
                    
                    {/* Checkbox Indicator */}
                    <div className="absolute top-2 right-2 z-10">
                      <div className={`
                        w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200
                        ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400 group-hover:border-gray-500'}
                      `}>
                        {isSelected && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                        )}
                      </div>
                    </div>

                    {/* Info Overlay (Bottom) - only visible on hover */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                      <p className="text-xs font-medium truncate" title={p.name}>{p.name}</p>
                      <div className="flex justify-between items-center mt-0.5">
                        <p className="text-[10px] opacity-80">{fileDate.toLocaleDateString()}</p>
                        <p className="text-[10px] opacity-80">{(fileSize / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PhotoUploadForm;
