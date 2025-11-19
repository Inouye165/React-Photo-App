import React, { useEffect, useState, useRef } from "react";

const Thumbnail = ({ file, className }) => {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!file) return;
    // Only create object URLs for browser-supported image types
    // HEIC is not supported natively in <img> tags in most browsers
    if (file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.heic')) {
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  if (src) {
    return <img src={src} alt="" className={`object-cover w-full h-full ${className}`} />;
  }

  // Fallback/Placeholder for HEIC or other types
  return (
    <div className={`flex flex-col items-center justify-center bg-gray-100 text-gray-400 font-bold text-xs ${className}`}>
      <svg className="w-8 h-8 mb-1 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      {file.name.split('.').pop()?.toUpperCase() || 'IMG'}
    </div>
  );
};

const PhotoUploadForm = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  uploading,
  filteredLocalPhotos,
  handleUploadFiltered,
  setShowLocalPicker,
  onReopenFolder
}) => {
  // Selection state: Set of indices
  const [selectedIndices, setSelectedIndices] = useState(new Set());

  // Reset selection when the filtered list changes (e.g. new folder or date filter change)
  // Default to selecting ALL photos
  useEffect(() => {
    const allIndices = new Set(filteredLocalPhotos.map((_, i) => i));
    setSelectedIndices(allIndices);
  }, [filteredLocalPhotos]);

  const toggleSelection = (index) => {
    const newSelection = new Set(selectedIndices);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedIndices(newSelection);
  };

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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    try { panelRef.current && panelRef.current.focus(); } catch { /* ignore */ }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        try { setShowLocalPicker(false); } catch { /* ignore */ }
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
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [setShowLocalPicker]);

  return (
    <div
      id="photo-upload-panel"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed overflow-hidden flex flex-col shadow-xl rounded-lg border border-gray-200"
      style={{
        left: '0',
        right: '0',
        top: '96px',
        bottom: '0',
        zIndex: 60,
        margin: '0',
        background: '#f8fafc', // Slate-50
        color: '#1e293b' // Slate-800
      }}
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
          onClick={() => setShowLocalPicker(false)}
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
            disabled={uploading || selectedIndices.size === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
          >
            {uploading ? 'Uploading...' : `Upload ${selectedIndices.size} Photos`}
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredLocalPhotos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p className="text-lg font-medium">No photos found</p>
            <p className="text-sm mt-1">Try adjusting the date range or selecting a different folder.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredLocalPhotos.map((p, i) => {
              const isSelected = selectedIndices.has(i);
              const key = `${p.name}-${p.file?.lastModified ?? ''}-${i}`;
              const fileDate = p.exifDate ? new Date(p.exifDate) : new Date(p.file?.lastModified);
              const fileSize = p.file ? (p.file.size || 0) : 0;

              return (
                <div 
                  key={key}
                  onClick={() => toggleSelection(i)}
                  className={`
                    group relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all duration-200
                    ${isSelected ? 'border-blue-500 ring-2 ring-blue-200 ring-offset-1' : 'border-transparent hover:border-gray-300'}
                    bg-white shadow-sm hover:shadow-md
                  `}
                >
                  <Thumbnail file={p.file} className="w-full h-full" />
                  
                  {/* Selection Overlay */}
                  <div className={`absolute inset-0 bg-black transition-opacity duration-200 ${isSelected ? 'bg-opacity-10' : 'bg-opacity-0 group-hover:bg-opacity-10'}`} />
                  
                  {/* Checkbox Indicator */}
                  <div className="absolute top-2 right-2">
                    <div className={`
                      w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200
                      ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400 group-hover:border-gray-500'}
                    `}>
                      {isSelected && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                      )}
                    </div>
                  </div>

                  {/* Info Overlay (Bottom) */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
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
        )}
      </div>
    </div>
  );
};

export default PhotoUploadForm;
