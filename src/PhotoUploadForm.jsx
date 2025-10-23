import React, { useEffect, useState, useRef } from "react";

// Renders a modal that previews local files (using object URLs) and uploads them.
const PhotoUploadForm = ({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  uploading,
  filteredLocalPhotos,
  handleUploadFiltered,
  setShowLocalPicker
  , onReopenFolder
}) => {
  const [_previews, setPreviews] = useState({});

  // We no longer create large object URL previews by default to avoid showing
  // huge images in the selection modal. Keep a tiny preview map in case a
  // future UX wants a small thumbnail, but do not auto-generate full-size
  // previews here.
  useEffect(() => {
    setPreviews({});
  }, [filteredLocalPhotos]);

  // Focus trap / accessibility: when the panel is open make it the top view,
  // capture focus, prevent background scroll, and close on Escape.
  const panelRef = useRef(null);
  useEffect(() => {
    // Save previous body overflow and restore on unmount
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the panel container
    try { panelRef.current && panelRef.current.focus(); } catch { /* Ignore focus errors */ }

    const onKey = (e) => {
      if (e.key === 'Escape') {
        try { setShowLocalPicker(false); } catch { /* Ignore state errors */ }
      }
      if (e.key !== 'Tab') return;
      // Simple focus trap: keep focus inside panel
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

    // Compute toolbar bottom and set panel top dynamically so the panel fills
    // the remaining viewport under the toolbar (no hard-coded guesswork).
    try {
      const toolbar = document.querySelector('[aria-label="Main toolbar"]');
      if (toolbar && panelRef.current) {
        const rect = toolbar.getBoundingClientRect();
        // leave a small gap of 8px
        const topPx = Math.ceil(rect.bottom + 8);
        panelRef.current.style.position = 'absolute';
        panelRef.current.style.left = '16px';
        panelRef.current.style.right = '16px';
        panelRef.current.style.top = `${topPx}px`;
        panelRef.current.style.bottom = '16px';
        panelRef.current.style.margin = '0';
      }
    } catch {
      // ignore
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // App-panel: fill remaining screen under the toolbar (toolbar stays visible)
    <div
      id="photo-upload-panel"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="fixed overflow-auto"
      style={{
        left: '0',
        right: '0',
        top: '96px', // fallback top; will be replaced dynamically if toolbar found
        bottom: '0',
        zIndex: 60,
        margin: '0',
        padding: '20px',
        background: '#f5f5f5', // light gray to match other views
        color: '#111'
      }}
    >
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Select Photos to Upload</h2>
          <button
            onClick={() => setShowLocalPicker(false)}
            className="text-gray-500 hover:text-gray-700 text-xl font-bold"
            aria-label="Close upload modal"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          <div className="mb-4 flex gap-4 items-center">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="border rounded px-2 py-1"
              placeholder="Start Date"
            />
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="border rounded px-2 py-1"
              placeholder="End Date"
            />
            <button
              onClick={handleUploadFiltered}
              disabled={uploading || filteredLocalPhotos.length === 0}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            >
              {uploading ? `Uploading...` : `Upload ${filteredLocalPhotos.length} Photos`}
            </button>
          </div>
          <div className="font-medium mb-2">Photos to Upload ({filteredLocalPhotos.length}):</div>
          {filteredLocalPhotos.length === 0 ? (
            <div className="p-6 text-center text-gray-600">
              <div className="mb-3">No images found in the selected folder.</div>
              <div className="flex justify-center gap-2">
                <button onClick={() => onReopenFolder && onReopenFolder()} className="px-3 py-1 bg-blue-600 text-white rounded">Re-select folder</button>
                <button onClick={() => setShowLocalPicker(false)} className="px-3 py-1 bg-gray-100 border rounded">Close</button>
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded">
              <ul className="divide-y divide-gray-200">
                {filteredLocalPhotos.map((p, i) => {
                const key = `${p.name}-${p.file?.lastModified ?? ''}-${i}`;
                const fileDate = p.exifDate ? new Date(p.exifDate) : new Date(p.file?.lastModified);
                const fileSize = p.file ? (p.file.size || 0) : 0;
                return (
                  <li key={key} className="flex items-center gap-4 px-3 py-2">
                    <div className="w-12 h-12 bg-gray-50 rounded flex items-center justify-center text-xs text-gray-400 border">{p.name.split('.').pop()?.toUpperCase()}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">{fileDate.toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-gray-500">{(fileSize / 1024).toFixed(1)} KB</div>
                  </li>
                );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
  );
};

export default PhotoUploadForm;
