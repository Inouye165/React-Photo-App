import { logGlobalError } from './utils/globalLog.js';
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { parse } from 'exifr'
import { uploadPhotoToServer, checkPrivilege, checkPrivilegesBatch, getPhotos, updatePhotoState, recheckInprogressPhotos, updatePhotoCaption, deletePhoto } from './api.js'
import { API_BASE_URL } from './api.js';
import Toolbar from './Toolbar.jsx'
import PhotoUploadForm from './PhotoUploadForm.jsx'
import EditPage from './EditPage.jsx'
import useStore from './store.js'
import useAIPolling from './hooks/useAIPolling.jsx'

// Utility: Format file size in human-readable format
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Utility: Show toast message for errors/warnings
function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed top-32 right-4 bg-amber-500 text-white px-3 py-2 rounded-md shadow-lg z-40 max-w-sm text-sm">
      <div className="flex items-start gap-2">
        <span className="text-amber-100">⚠️</span>
        <div className="flex-1">{message}</div>
        <button 
          className="text-amber-100 hover:text-white font-bold ml-2" 
          onClick={onClose}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}












function App() {
  // Handler for rechecking in-progress photos
  const handleRecheckInprogress = async () => {
    setRechecking(true);
    try {
      await recheckInprogressPhotos();
      setToast('Recheck triggered successfully');
    } catch (error) {
      setToast(`Recheck failed: ${error.message}`);
    } finally {
      setRechecking(false);
    }
  };
  // Add a test log entry on mount to verify log visibility
  useEffect(() => {
    logGlobalError('Test log: If you see this, the global log is working!');
  }, []);
  // Photos and UI are now backed by Zustand store where appropriate
  const photos = useStore(state => state.photos);
  const setPhotos = useStore(state => state.setPhotos);
  const updatePhotoData = useStore(state => state.updatePhotoData);
  const removePhotoById = useStore(state => state.removePhotoById);
  const moveToInprogress = useStore(state => state.moveToInprogress);
  const pollingPhotoId = useStore(state => state.pollingPhotoId);
  const setPollingPhotoId = useStore(state => state.setPollingPhotoId);
  const toastMsg = useStore(state => state.toastMsg);
  const setToast = useStore(state => state.setToast);
  const [loading, setLoading] = useState(true);
  // Accessible status for screen readers about polling state (not used by store hook yet)
  const ariaStatus = '';
  // message shown in the toolbar (persists until reload or cleared)
  const [toolbarMessage, setToolbarMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const [localPhotos, setLocalPhotos] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [privilegesMap, setPrivilegesMap] = useState({});
  const [showInprogress, setShowInprogress] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedKeywords, setEditedKeywords] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [showFinished, setShowFinished] = useState(false);
  // Polling state: photo id currently being polled for AI results
  // pollingPhotoId lives in the store; start polling hook below
  const lastActiveElementRef = useRef(null);
  const [useFullPageEditor, setUseFullPageEditor] = useState(true);
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const [metadataPhoto, setMetadataPhoto] = useState(null);

  const workingDirHandleRef = useRef(null);

  // Start global AI polling hook which reacts to changes in store.pollingPhotoId
  useAIPolling()
  
  // Expose global log for debugging
  useEffect(() => {
    window.logGlobalError = logGlobalError;
  }, []);
  // Load photos. Accept an explicit endpoint so the function identity is stable
  // (doesn't capture `showInprogress`/`showFinished`) and can be included in
  // effect dependency arrays without disabling eslint. Callers must pass the
  // desired endpoint (e.g. 'working', 'inprogress', 'finished'). If omitted,
  // default to 'working'.
  const loadPhotos = useCallback(async (endpointOverride) => {
    setLoading(true);
    try {
      const endpoint = typeof endpointOverride === 'string' ? endpointOverride : 'working';
      const res = await getPhotos(endpoint);
      // Server now provides fully-signed image URLs (url, thumbnail) in the photo objects.
      setPhotos((res && res.photos) || []);
    } catch (err) {
      setToast(`Error loading photos from backend: ${err && err.message ? err.message : 'unknown'}`);
    } finally {
      setLoading(false);
    }
  }, [setPhotos, setToast]);

  // Compute current endpoint from view flags and call loadPhotos with it.
  useEffect(() => {
    const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
    loadPhotos(endpoint);
  }, [showInprogress, showFinished, loadPhotos]);

  // Load privileges after photos are loaded

  // Cache the last checked filenames to avoid redundant privilege checks
  const lastCheckedFilenamesRef = useRef([]);

  useEffect(() => {
    const loadPrivileges = async () => {
      if (photos.length === 0) return;

      const filenames = photos.map(photo => photo.filename);
      // Compare with last checked filenames
      const prev = lastCheckedFilenamesRef.current;
      const same =
        prev.length === filenames.length &&
        prev.every((f, i) => f === filenames[i]);
      if (same) return; // No change, skip privilege check

      lastCheckedFilenamesRef.current = filenames;

      // initialize to Loading so UI shows progress
      const initial = {};
      for (const p of photos) initial[p.id] = 'Loading...';
      setPrivilegesMap(initial);

      let map = {};
      let batchSucceeded = false;
      try {
        // Try batch privilege check first
        const batchResult = await checkPrivilegesBatch(filenames);
        if (batchResult && typeof batchResult === 'object') {
          console.log('[App] Batch privilege mapping: photo filenames:', filenames);
          console.log('[App] Batch privilege mapping: batchResult keys:', Object.keys(batchResult));
          for (const photo of photos) {
            const priv = batchResult[photo.filename];
            if (typeof priv === 'string') {
              map[photo.id] = priv;
            } else if (priv && typeof priv === 'object') {
              // Convert object privileges to string (RWX)
              const privArr = [];
              if (priv.read || priv.canRead) privArr.push('R');
              if (priv.write || priv.canWrite) privArr.push('W');
              if (priv.execute || priv.canExecute) privArr.push('X');
              map[photo.id] = privArr.length > 0 ? privArr.join('') : '?';
            } else {
              console.warn('[App] No privilege found for photo:', photo.filename, 'in batchResult:', batchResult);
              map[photo.id] = '?';
            }
          }
          setPrivilegesMap(map);
          batchSucceeded = true;
        }
      } catch (err) {
        console.warn('[App] Batch privilege check failed, will fallback to individual checks:', err);
      }
      if (batchSucceeded) {
        console.log('[App] Batch privilege mapping succeeded, skipping fallback.');
        return;
      } else {
        console.warn('[App] Batch privilege mapping did not succeed, running fallback to individual checks.');
        // Fallback to individual checks if batch fails
        map = {};
        for (const photo of photos) {
          try {
            const res = await checkPrivilege(photo.filename);
            const privObj = res && (
              res.privileges ||
              res.privilege ||
              ((res.canRead || res.canWrite || res.canExecute) ? res : null)
            );
            if (privObj && privObj.read !== undefined) {
              privObj.canRead = privObj.read;
              privObj.canWrite = privObj.write;
              privObj.canExecute = privObj.execute;
            }
            if (privObj) {
              const privArr = [];
              if (privObj.canRead) privArr.push('R');
              if (privObj.canWrite) privArr.push('W');
              if (privObj.canExecute) privArr.push('X');
              map[photo.id] = privArr.length > 0 ? privArr.join('') : '?';
            } else {
              map[photo.id] = '?';
            }
          } catch (err) {
            console.warn('Privilege check failed for', photo.filename, err);
            map[photo.id] = 'Err';
          }
        }
        setPrivilegesMap(map);
      }
    };
    loadPrivileges();
  }, [photos]);

  // Manual retry for privileges


  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        throw new Error('File System Access API not supported');
      }
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'file' && /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(name)) {
          const file = await handle.getFile();
          try {
            // Parse EXIF to get date taken
            const exif = await parse(file);
            const exifDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.DateTime;
            files.push({ name, file, exifDate, handle });
          } catch {
            files.push({ name, file, exifDate: null, handle });
          }
        }
      }
      workingDirHandleRef.current = dirHandle;
      setLocalPhotos(files);
      setShowLocalPicker(true);
    } catch (error) {
      setToast(`Folder selection failed: ${error.message}`);
    }
  };

  // Filter local photos by date range
  const filteredLocalPhotos = localPhotos.filter(p => {
    if (!startDate && !endDate) return true;
    const fileDate = p.exifDate ? new Date(p.exifDate) : new Date(p.file.lastModified);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate + 'T23:59:59') : null;
    return (!start || fileDate >= start) && (!end || fileDate <= end);
  });

  // Handle upload of filtered photos
  const handleUploadFiltered = async () => {
    if (filteredLocalPhotos.length === 0) return;
    setUploading(true);
    try {
      for (const p of filteredLocalPhotos) {
        await uploadPhotoToServer(p.file);
      }
      setToolbarMessage(`Successfully uploaded ${filteredLocalPhotos.length} photos`);
      // Refresh the photo list for the current tab
      {
        const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
        await loadPhotos(endpoint);
      }
      setLocalPhotos([]);
      setShowLocalPicker(false);
    } catch (error) {
      setToast(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Handle move to inprogress
  const handleMoveToInprogress = async (id) => {
    try {
      const res = await moveToInprogress(id)
      if (!res || !res.success) {
        const err = res && res.error
        setToast(`Error moving photo: ${err?.message || 'unknown'}`)
      } else {
        // Reload inprogress list if that's the current tab, otherwise reload working
        const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
        await loadPhotos(endpoint);
      }
    } catch (error) {
      setToast(`Error moving photo: ${error.message}`)
    }
  };

  // Handle move back to working (staged)
  const handleMoveToWorking = async (id) => {
    try {
      await updatePhotoState(id, 'working');
      {
        const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
        await loadPhotos(endpoint);
      }
    } catch (error) {
      setToast(`Error moving photo back to staged: ${error.message}`)
    }
  };

  // Handle delete photo
  const handleDeletePhoto = async (id) => {
    if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      return;
    }
    try {
      // Use api.deletePhoto to perform deletion (keeps network logic centralized)
      await deletePhoto(id);
      // Remove the photo from the current list
      removePhotoById(id);
      setToast('Photo deleted successfully');
    } catch (error) {
      // Preserve behavior for auth-related errors if deletePhoto surfaces status
      try {
        if (error && (error.status === 401 || error.status === 403)) {
          window.location.reload();
          return;
        }
      } catch {
        // ignore
      }
      setToast(`Error deleting photo: ${error && error.message ? error.message : error}`);
    }
  };


  // polling is handled by useAIPolling() which watches store.pollingPhotoId

  // Listen for global run-ai events so polling starts no matter where runAI was invoked
  useEffect(() => {
    const onRunAi = (ev) => {
      try {
        try { console.debug('[App] onRunAi event', ev && ev.detail && ev.detail.photoId); } catch { void 0; }
        const id = ev?.detail?.photoId;
        if (id) setPollingPhotoId(id);
      } catch {
        // ignore
      }
    };
    const onStorage = (ev) => {
      try {
        if (!ev || ev.key !== 'photo:run-ai') return;
        const v = ev.newValue;
        if (!v) return;
        const parsed = JSON.parse(v);
        const id = parsed && parsed.photoId;
        try { console.debug('[App] storage event photo:run-ai', id); } catch { void 0; }
        if (id) setPollingPhotoId(id);
      } catch {
        // ignore parse errors
      }
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('photo:run-ai', onRunAi);
      window.addEventListener('storage', onStorage);
    }
    return () => {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('photo:run-ai', onRunAi);
          window.removeEventListener('storage', onStorage);
        }
  } catch { /* ignore */ }
    };
  }, [setPollingPhotoId]);

  // Handle edit photo
  const handleEditPhoto = (photo, openFullPage = false) => {
    // remember the element that opened the editor so we can restore focus later
    try { lastActiveElementRef.current = document.activeElement; } catch { /* Ignore focus errors */ }
    // Default to in-app editor unless openFullPage=true
    setUseFullPageEditor(Boolean(openFullPage));
    setEditingPhoto(photo);
    // Also set selectedPhoto so the two-column view is shown for the photo being edited
    try { setSelectedPhoto(photo); } catch { /* Ignore state update errors */ }
  };

  // keep editable fields synced when editingPhoto changes
  useEffect(() => {
    if (editingPhoto) {
      setEditedCaption(editingPhoto.caption || '');
      setEditedDescription(editingPhoto.description || '');
      setEditedKeywords(editingPhoto.keywords || '');
    }
  }, [editingPhoto]);



  

  // Handle move to finished
  const handleMoveToFinished = useCallback(async (id) => {
    try {
      await updatePhotoState(id, 'finished');
      setToast('Photo marked as finished');
      setEditingPhoto(null);
      // Remove the photo from the current list (since it's moved to finished view)
      removePhotoById(id);
    } catch (error) {
      setToast(`Error marking photo as finished: ${error.message}`);
    }
  }, [removePhotoById, setToast]);

  // Listen for messages from edit tabs/windows
  React.useEffect(() => {
    const onMessage = (ev) => {
      try {
        const m = ev.data || {};
        if (m && m.type === 'updateCaption') {
          // Update photo caption in store when edit window posts an update
          updatePhotoData(m.id, { caption: m.caption });
        } else if (m && m.type === 'markFinished') {
          // Mark finished acknowledgement will be handled elsewhere; ignore here
        }
      } catch {
        // ignore
      }
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('message', onMessage);
    }
    return () => {
      try { if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('message', onMessage); } catch { /* ignore */ }
    };
  }, [updatePhotoData]);

  return (
    <div
      className="flex flex-col bg-gray-100"
      id="main-app-container"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: '72px'
      }}
    >
      {/* Toast at top center */}
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
        <Toast message={toastMsg} onClose={() => setToast('')} />
      </div>

      <Toolbar
        onSelectFolder={handleSelectFolder}
        onViewStaged={() => {
          setShowInprogress(false);
          setShowFinished(false);
          setEditingPhoto(null);
          setSelectedPhoto(null);
          setUseFullPageEditor(false);
        }}
        onViewInprogress={() => {
          setShowInprogress(true);
          setShowFinished(false);
          setEditingPhoto(null);
          setSelectedPhoto(null);
          setUseFullPageEditor(false);
        }}
        onViewFinished={() => {
          setShowInprogress(false);
          setShowFinished(true);
          setEditingPhoto(null);
          setSelectedPhoto(null);
          setUseFullPageEditor(false);
        }}
        onRecheck={handleRecheckInprogress}
        rechecking={rechecking}
        onShowMetadata={() => {
          if (selectedPhoto || editingPhoto) {
            setMetadataPhoto(selectedPhoto || editingPhoto);
            setShowMetadataModal(true);
          } else {
            setToast('Please select a photo first');
          }
        }}
        toolbarMessage={toolbarMessage}
        onClearToolbarMessage={() => setToolbarMessage('')}
      />

      {/* Accessible live region for polling status */}
      <div aria-live="polite" className="sr-only">{ariaStatus}</div>

      {/* Metadata Modal */}
      {showMetadataModal && metadataPhoto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 100 }}>
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full m-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Photo Metadata</h2>
              <button onClick={() => setShowMetadataModal(false)} className="text-2xl text-gray-500 hover:text-gray-700">&times;</button>
            </div>
            <div className="space-y-2 text-sm">
              <p><strong>Filename:</strong> {metadataPhoto.filename}</p>
              <p><strong>File Size:</strong> {metadataPhoto.file_size}</p>
              <p><strong>State:</strong> {metadataPhoto.state}</p>
              <p><strong>Hash:</strong> <span className="font-mono text-xs break-all">{metadataPhoto.hash || 'N/A'}</span></p>
              {metadataPhoto.metadata?.DateTimeOriginal && (
                <p><strong>Date Taken:</strong> {metadataPhoto.metadata.DateTimeOriginal}</p>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowMetadataModal(false)} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Local Photos Selection Modal (centralized component) */}
      {showLocalPicker && (
        <PhotoUploadForm
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          uploading={uploading}
          filteredLocalPhotos={filteredLocalPhotos}
          handleUploadFiltered={handleUploadFiltered}
          setShowLocalPicker={setShowLocalPicker}
          onReopenFolder={handleSelectFolder}
        />
      )}

      <div className="flex-1 overflow-auto" style={{ padding: '8px 16px 16px 16px' }}>
        {/* Show EditPage when editing, otherwise show photo list */}
        {editingPhoto ? (
          <EditPage 
            photo={editingPhoto}
            onClose={() => setEditingPhoto(null)}
            onFinished={async (id) => { await handleMoveToFinished(id); setEditingPhoto(null); }}
            onSave={async (updated) => {
              setPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
              setEditingPhoto(null);
            }}
          />
        ) : (
          <>
            {/* If a photo is selected open single-page viewer; otherwise show list */}
            {selectedPhoto ? (
          <div className="bg-white rounded-lg shadow-md h-full p-6">
            <div className="flex items-start h-full gap-4" style={{height: 'calc(100vh - 140px)'}}>
                  {/* Left: Image */}
                  <div className="w-2/5 bg-gray-100 rounded overflow-auto flex items-center justify-center px-2 py-3" style={{maxHeight: '100%'}}>
                        <img
                          src={`${API_BASE_URL}${selectedPhoto.url}`}
                          alt={selectedPhoto.filename}
                          className="max-h-full max-w-full object-contain"
                          style={{width: 'auto', height: 'auto'}}
                        />
                      </div>

                  {/* Divider / gutter (visible) */}
                  <div className="mx-3" style={{width: '3px', backgroundColor: '#e5e7eb', height: '100%'}} />

                {/* Right: Top (caption/description/keywords) and Bottom (AI chat placeholder) */}
                <aside className="w-3/5 bg-white rounded shadow-sm border p-8 flex flex-col" style={{maxHeight: '100%', borderLeft: '1px solid #e5e7eb'}}>
                <header className="mb-3">
                  <h2 className="text-lg font-semibold">{selectedPhoto.filename}</h2>
                  <div className="text-xs text-gray-500">{selectedPhoto.metadata?.DateTimeOriginal || ''}</div>
                </header>

                <div className="space-y-4 mb-2" style={{overflow: 'auto'}}>
                  <section>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Caption</label>
                    {editingPhoto && editingPhoto.id === selectedPhoto.id && !useFullPageEditor ? (
                      <textarea value={editedCaption} onChange={(e) => setEditedCaption(e.target.value)} className="w-full rounded border p-2 text-sm bg-gray-50" />
                    ) : (
                      <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">{selectedPhoto.caption || <span className="text-gray-400">No caption</span>}</div>
                    )}
                  </section>

                  <section>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    {editingPhoto && editingPhoto.id === selectedPhoto.id && !useFullPageEditor ? (
                      <textarea value={editedDescription} onChange={(e) => setEditedDescription(e.target.value)} className="w-full rounded border p-2 text-sm bg-gray-50" rows={4} />
                    ) : (!selectedPhoto.description || !selectedPhoto.keywords) ? (
                      <div className="flex flex-col items-center justify-center py-8">
                        <svg className="animate-spin h-8 w-8 text-blue-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span className="text-gray-500 text-sm">AI is processing this photo...</span>
                      </div>
                    ) : (
                      <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">{selectedPhoto.description || <span className="text-gray-400">No description</span>}</div>
                    )}
                  </section>

                  <section>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                    {editingPhoto && editingPhoto.id === selectedPhoto.id && !useFullPageEditor ? (
                      <input value={editedKeywords} onChange={(e) => setEditedKeywords(e.target.value)} className="w-full rounded border p-2 text-sm bg-gray-50" />
                    ) : (!selectedPhoto.description || !selectedPhoto.keywords) ? (
                      <div className="flex flex-col items-center justify-center py-4">
                        <svg className="animate-spin h-6 w-6 text-blue-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span className="text-gray-500 text-xs">Waiting for AI info...</span>
                      </div>
                    ) : (
                      <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">{selectedPhoto.keywords || <span className="text-gray-400">No keywords</span>}</div>
                    )}
                  </section>

                  <section className="flex-1 min-h-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">AI Agent</label>
                    <div className="h-full bg-gray-50 rounded p-3 overflow-auto text-sm text-gray-700 flex flex-col" style={{minHeight:0}}>
                      <div className="flex-1">
                        <p className="text-gray-400">AI chat agent placeholder. Integrate agent UI here (messages, input box, actions).</p>
                        <div className="mt-3 text-xs text-gray-500">Example:
                          <ul className="list-disc ml-5">
                            <li>Ask: "Generate alt text for this image"</li>
                            <li>Ask: "Suggest 5 keywords"</li>
                          </ul>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 mt-2">Placeholder</div>
                    </div>
                  </section>
                </div>

                    <div className="sticky bottom-0 bg-white pt-2 -mx-4 px-4 pb-2 border-t">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setEditingPhoto(null); }} className="px-3 py-1 bg-gray-100 border rounded text-sm">Close</button>
                    <button onClick={async () => {
                        try {
                          if (editedCaption !== (selectedPhoto.caption || '')) {
                            await updatePhotoCaption(selectedPhoto.id, editedCaption);
                          }
                              // update store-backed photo data
                              updatePhotoData(selectedPhoto.id, { caption: editedCaption, description: editedDescription, keywords: editedKeywords });
                              setEditingPhoto(null);
                              setToast('Saved in app');
                        } catch (e) {
                              setToast('Save failed: ' + (e.message || e));
                        }
                      }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
                    <button onClick={async () => {
                        try {
                          await handleMoveToFinished(selectedPhoto.id);
                            } catch { setToast('Mark finished failed'); }
                      }} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Mark as Finished</button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading photos...</div>
            ) : photos.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No photos found in backend.</div>
            ) : (
              <div>
                <div className="border-b border-gray-200 px-4 py-2 bg-gray-50 font-medium text-sm">
                  <div className="grid grid-cols-15 gap-4">
                    <div className="col-span-2">Preview</div>
                    <div className="col-span-2">Filename</div>
                    <div className="col-span-3">Date Taken</div>
                    <div className="col-span-1">Size</div>
                    <div className="col-span-2">State</div>
                    <div className="col-span-2">Privileges</div>
                    <div className="col-span-1">Hash</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                </div>
                <div className="divide-y divide-gray-200 table-row-compact">
                  {photos.map(photo => (
                    <div key={photo.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedPhoto(photo)}>
                      <div className="grid grid-cols-15 gap-4 text-sm items-center">
                        <div className="col-span-2">
                          <div className="relative inline-block">
                            {photo.thumbnail ? (
                              <img src={`${API_BASE_URL}${photo.thumbnail}`} alt={photo.filename} className="max-h-20 rounded shadow bg-white" />
                            ) : (
                              <div className="w-20 h-20 flex items-center justify-center bg-gray-200 text-gray-400 rounded shadow">No Thumb</div>
                            )}
                            {/* Spinner overlay when this photo is being polled for AI results */}
                            {pollingPhotoId === photo.id && (
                              <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center rounded">
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
                                <span className="sr-only">Processing</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 font-medium text-gray-900 truncate">{photo.filename}</div>
                        <div className="col-span-3 text-gray-600">
                          {photo.metadata.DateTimeOriginal || photo.metadata.CreateDate || 'Unknown'}
                        </div>
                        <div className="col-span-1 text-gray-600 text-xs">
                          {formatFileSize(photo.file_size)}
                        </div>
                        <div className="col-span-2 text-gray-600">{photo.state === 'working' ? 'staged' : photo.state}</div>
                        <div className="col-span-2 text-gray-600">{privilegesMap[photo.id] || '...'}</div>
                        <div className="col-span-1 text-green-700 font-mono text-xs">
                          {photo.hash ? <span title={photo.hash}>✔ {photo.hash.slice(-5)}</span> : '...'}
                        </div>
                        <div className="col-span-2 flex gap-2">
                          {photo.state === 'working' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMoveToInprogress(photo.id); }}
                              className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                            >
                              Move to Inprogress
                            </button>
                          )}
                          {photo.state === 'inprogress' && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditPhoto(photo, false); }}
                                className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleMoveToWorking(photo.id); }}
                                className="bg-yellow-500 hover:bg-yellow-700 text-white px-2 py-1 rounded text-xs"
                              >
                                Move to Staged
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id); }}
                                className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                              >
                                Delete
                              </button>
                            </>
                          )}
                          {/* Run AI button (queues AI job and starts polling) */}
                          {/* AI job is triggered elsewhere; polling starts automatically when runAI is called */}
                        </div>
                      </div>
                      {/* AI metadata row */}
                      {(photo.caption || photo.description || photo.keywords) && (
                        <div className="mt-2 ml-4 p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                          {photo.caption && <div><span className="font-semibold">Caption:</span> {photo.caption}</div>}
                          {photo.description && <div className="mt-1"><span className="font-semibold">Description:</span> {photo.description}</div>}
                          {photo.keywords && <div className="mt-1"><span className="font-semibold">Keywords:</span> {photo.keywords}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

export default App;
