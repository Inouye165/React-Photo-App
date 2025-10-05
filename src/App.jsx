import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { parse } from 'exifr'
import { uploadPhotoToServer, checkPrivilege, getPhotos, updatePhotoState, recheckInprogressPhotos, updatePhotoCaption } from './api.js'
import EditPage from './EditPage'

// Utility: Get or create a guaranteed local folder (default: C:\Users\<User>\working)
async function getLocalWorkingFolder(customPath) {
  // Default to C:\Users\<User>\working if no custom path provided
  const user = (window.navigator.userName || window.navigator.user || 'User');
  const defaultPath = `C:\\Users\\${user}\\working`;
  // File System Access API does not allow direct path, so prompt user to select
  try {
    const dirHandle = await window.showDirectoryPicker({
      id: 'local-working-folder',
      startIn: 'desktop' // closest to local, not OneDrive
    });
    return dirHandle;
  } catch (error) {
    throw new Error('Failed to access local working folder. Please select a local directory.');
  }
}

// Utility: Save photo file to local folder, preserving metadata
async function savePhotoFileToLocalFolder(photo, workingDirHandle) {
  try {
    // Permission check for writing
    const perm = await ensurePermission(workingDirHandle, 'readwrite');
    if (perm !== 'granted') throw new Error('Permission denied for working folder.');
    // Guard against overwrite: generate unique filename
    let targetName = photo.filename;
    let suffix = 1;
    while (true) {
      try {
        await workingDirHandle.getFileHandle(targetName);
        // Exists, try next
        const dotIdx = photo.filename.lastIndexOf('.');
        const base = dotIdx > 0 ? photo.filename.slice(0, dotIdx) : photo.filename;
        const ext = dotIdx > 0 ? photo.filename.slice(dotIdx) : '';
        targetName = `${base}(${suffix})${ext}`;
        suffix++;
      } catch {
        break;
      }
    }
    // Create file and write original file data (preserves EXIF/XMP)
    const fileHandle = await workingDirHandle.getFileHandle(targetName, { create: true });
    const permFile = await ensurePermission(fileHandle, 'readwrite');
    if (permFile !== 'granted') throw new Error(`Permission denied for file: ${targetName}`);
    const writable = await fileHandle.createWritable();
    // Write the original file's ArrayBuffer directly (no re-encoding, preserves metadata)
    const fileData = await photo.file.arrayBuffer();
    await writable.write(fileData);
    await writable.close();
    return targetName;
  } catch (error) {
    throw new Error(`Error saving photo: ${photo.filename}. ${error.message}`);
  }
}

// Utility: Extract date from filename (YYYYMMDD or YYYY-MM-DD)
function extractDateFromFilename(filename) {
  const patterns = [
    /([12]\d{3})(\d{2})(\d{2})/, // YYYYMMDD
    /([12]\d{3})-(\d{2})-(\d{2})/, // YYYY-MM-DD
  ];
  for (const re of patterns) {
    const match = filename.match(re);
    if (match) {
      const [_, y, m, d] = match;
      const dateStr = `${y}-${m}-${d}`;
      const date = new Date(dateStr);
      if (!isNaN(date)) return date;
    }
  }
  return null;
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

// Utility: Permission check/request for File System Access API
async function ensurePermission(handle, mode = 'read') {
  if (!handle || typeof handle.queryPermission !== 'function') return 'unknown';
  let perm = await handle.queryPermission({ mode });
  if (perm === 'granted') return 'granted';
  perm = await handle.requestPermission({ mode });
  return perm;
}

// Utility: Format file size in human-readable format
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function App() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
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
  const lastActiveElementRef = useRef(null);
  const [useFullPageEditor, setUseFullPageEditor] = useState(true);

  const workingDirHandleRef = useRef(null);
  
  // Load photos
  useEffect(() => {
    const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
    const loadPhotos = async () => {
      try {
        const serverUrl = `http://localhost:3001/photos?state=${endpoint}`;
        const res = await getPhotos(serverUrl);
        const backendOrigin = 'http://localhost:3001';
        const photosWithFullUrls = (res.photos || []).map(p => ({
          ...p,
          url: `${backendOrigin}/${p.state}/${p.filename}`,
          thumbnail: p.thumbnail ? `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}` : null
        }));
        setPhotos(photosWithFullUrls);
      } catch (error) {
        console.error('Error loading photos:', error);
        setToastMsg('Error loading photos from backend');
      } finally {
        setLoading(false);
      }
    };
    loadPhotos();
  }, [showInprogress, showFinished]);

  // Load privileges after photos are loaded
  useEffect(() => {
    const loadPrivileges = async () => {
      // initialize to Loading so UI shows progress
      const initial = {};
      for (const p of photos) initial[p.id] = 'Loading...';
      setPrivilegesMap(initial);

      const map = {};
      for (const photo of photos) {
        try {
          const res = await checkPrivilege(photo.filename);
          // support shapes: { privileges: { read, write, execute } }
          // { privilege: { canRead, canWrite, canExecute } }
          // or legacy flat { canRead, canWrite, canExecute }
          const privObj = res && (
            res.privileges ||
            res.privilege ||
            ((res.canRead || res.canWrite || res.canExecute) ? res : null)
          );
          // normalize server 'privileges' shape: { read, write, execute } -> canRead/canWrite/canExecute
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
            // keep previous fallback symbol to make regressions obvious
            console.debug('checkPrivilege returned unexpected shape for', photo.filename, res);
            map[photo.id] = '?';
          }
        } catch (error) {
          console.warn('Privilege check failed for', photo.filename, error);
          map[photo.id] = 'Err';
        }
        // update progressively so user sees results as they arrive
        setPrivilegesMap(prev => ({ ...prev, [photo.id]: map[photo.id] }));
      }
    };
    if (photos.length > 0) loadPrivileges();
  }, [photos]);

  // Manual retry for privileges
  const retryPrivileges = async () => {
    try {
      const res = await getPhotos('http://localhost:3001/photos?state=working');
      // trigger the effect by updating photos state (or simply call the loader)
      setPhotos(prev => [...prev]);
      setToastMsg('Retrying privileges...');
    } catch (e) {
      setToastMsg('Cannot retry privileges: backend not available');
    }
  };

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
          } catch (e) {
            files.push({ name, file, exifDate: null, handle });
          }
        }
      }
      workingDirHandleRef.current = dirHandle;
      setLocalPhotos(files);
      setShowLocalPicker(true);
    } catch (error) {
      setToastMsg(`Folder selection failed: ${error.message}`);
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
        await uploadPhotoToServer(p.file, p.name);
      }
      setToastMsg(`Successfully uploaded ${filteredLocalPhotos.length} photos`);
      // Refresh the photo list
      const res = await getPhotos('http://localhost:3001/photos?state=working');
      const backendOrigin = 'http://localhost:3001';
      const photosWithFullUrls = (res.photos || []).map(p => ({
        ...p,
        url: `${backendOrigin}/${p.state}/${p.filename}`,
        thumbnail: p.thumbnail ? `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}` : null
      }));
      setPhotos(photosWithFullUrls);
      setLocalPhotos([]);
      setShowLocalPicker(false);
    } catch (error) {
      setToastMsg(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Handle move to inprogress
  const handleMoveToInprogress = async (id) => {
    try {
      await updatePhotoState(id, 'inprogress');
      setToastMsg('Photo moved to inprogress');
      // Refresh photos
      const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
      const serverUrl = `http://localhost:3001/photos?state=${endpoint}`;
      const res = await getPhotos(serverUrl);
      const backendOrigin = 'http://localhost:3001';
      const photosWithFullUrls = (res.photos || []).map(p => ({
        ...p,
        url: `${backendOrigin}/${p.state}/${p.filename}`,
        thumbnail: p.thumbnail ? `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}` : null
      }));
      setPhotos(photosWithFullUrls);
    } catch (error) {
      setToastMsg(`Error moving photo: ${error.message}`);
    }
  };

  // Handle edit photo
  const handleEditPhoto = (photo, openFullPage = false) => {
    // remember the element that opened the editor so we can restore focus later
    try { lastActiveElementRef.current = document.activeElement; } catch (e) {}
    // Default to in-app editor unless openFullPage=true
    setUseFullPageEditor(Boolean(openFullPage));
    setEditingPhoto(photo);
    // Also set selectedPhoto so the two-column view is shown for the photo being edited
    try { setSelectedPhoto(photo); } catch (e) {}
  };

  // keep editable fields synced when editingPhoto changes
  useEffect(() => {
    if (editingPhoto) {
      setEditedCaption(editingPhoto.caption || '');
      setEditedDescription(editingPhoto.description || '');
      setEditedKeywords(editingPhoto.keywords || '');
    }
  }, [editingPhoto]);

  // Open a minimal edit UI in a new browser tab/window. The new tab will postMessage
  // updates (caption, markFinished) back to this opener window which will then
  // perform state updates and backend calls.
  const openEditorInNewTab = (photo) => {
    const displayUrl = `http://localhost:3001/display/${photo.state}/${photo.filename}`;
    const id = photo.id;
    const caption = (photo.caption || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Edit ${photo.filename}</title>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:16px;background:#fff;color:#111}
        .container{max-width:900px;margin:0 auto}
        img{max-width:100%;height:auto;border:1px solid #ddd;padding:8px;background:#f9f9f9}
        textarea{width:100%;min-height:120px;margin-top:8px;padding:8px;font-size:14px}
        .controls{margin-top:12px;display:flex;gap:8px}
        button{padding:8px 12px;font-size:14px;cursor:pointer}
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Edit: ${photo.filename}</h1>
              </div>

              {/* vertical divider between image and data panel */}
              <div className="w-px bg-gray-200 mx-3" style={{height: '100%'}} />

              <aside className="w-1/3 bg-white rounded shadow-sm border p-4 flex flex-col" style={{maxHeight: '100%'}}>
        <div>
          <label for="caption"><strong>Caption</strong></label>
          <textarea id="caption">${caption}</textarea>
        </div>
        <div class="controls">
          <button id="saveBtn">Save (to app)</button>
          <button id="markBtn">Mark as Finished</button>
          <button id="closeBtn">Close</button>
        </div>
        <div id="status" style="margin-top:12px;color:#666"></div>
      </div>

        <script>
        const id = ${JSON.stringify(id)};
        const saveBtn = document.getElementById('saveBtn');
        const markBtn = document.getElementById('markBtn');
        const closeBtn = document.getElementById('closeBtn');
        const status = document.getElementById('status');
        saveBtn.addEventListener('click', () => {
          const caption = document.getElementById('caption').value;
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ type: 'updateCaption', id, caption }, '*');
              status.textContent = 'Saved locally in app.';
            } else {
              status.textContent = 'Opener not available; cannot save to app.';
            }
          } catch (e) { status.textContent = 'Save failed: ' + e.message; }
        });
        // Listen for acknowledgements from opener
        window.addEventListener('message', (ev) => {
          const m = ev.data || {};
          if (m.type === 'markFinishedAck' && m.id === id) {
            if (m.success) {
              status.textContent = 'Marked finished successfully. Closing...';
              setTimeout(() => window.close(), 700);
            } else {
              status.textContent = 'Mark finished failed: ' + (m.error || 'unknown');
            }
          } else if (m.type === 'updateCaptionAck' && m.id === id) {
            status.textContent = m.success ? 'Saved in app.' : 'Save failed.';
          }
        });
        markBtn.addEventListener('click', () => {
          try {
            if (window.opener && !window.opener.closed) {
              window.opener.postMessage({ type: 'markFinished', id }, '*');
              status.textContent = 'Requested mark as finished.';
            } else {
              status.textContent = 'Opener not available; cannot mark finished.';
            }
          } catch (e) { status.textContent = 'Request failed: ' + e.message; }
        });
        closeBtn.addEventListener('click', () => { window.close(); });
      </script>
    </body>
    </html>`;

    const w = window.open('', '_blank');
    if (!w) {
      // Popup blocked; fallback to in-app full-page editor so user can still edit
      try {
        setUseFullPageEditor(true);
        setEditingPhoto(photo);
      } catch (e) {
        alert('Popup blocked and cannot open in-app editor. Please allow popups.');
      }
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  // Listen for messages from edit tabs/windows
  React.useEffect(() => {
    const onMessage = async (ev) => {
      const msg = ev.data || {};
      if (!msg.type) return;
      // ev.source is the window object of the sender (the editor tab)
      const source = ev.source;
      if (msg.type === 'updateCaption') {
        const { id, caption } = msg;
        let ok = true;
        try {
          await updatePhotoCaption(id, caption);
        } catch (e) {
          ok = false;
          console.error('Failed to persist caption to backend:', e.message || e);
        }
        setPhotos(prev => prev.map(p => p.id === id ? { ...p, caption } : p));
        try { if (source && source.postMessage) source.postMessage({ type: 'updateCaptionAck', id, success: ok }, '*'); } catch (e) {}
      } else if (msg.type === 'markFinished') {
        const { id } = msg;
        try {
          await handleMoveToFinished(id);
          try { if (source && source.postMessage) source.postMessage({ type: 'markFinishedAck', id, success: true }, '*'); } catch (e) {}
        } catch (err) {
          try { if (source && source.postMessage) source.postMessage({ type: 'markFinishedAck', id, success: false, error: err.message }, '*'); } catch (e) {}
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Handle move to finished
  const handleMoveToFinished = async (id) => {
    try {
      await updatePhotoState(id, 'finished');
      setToastMsg('Photo marked as finished');
      setEditingPhoto(null);
      // Refresh photos
      const endpoint = showFinished ? 'finished' : (showInprogress ? 'inprogress' : 'working');
      const serverUrl = `http://localhost:3001/photos?state=${endpoint}`;
      const res = await getPhotos(serverUrl);
      const backendOrigin = 'http://localhost:3001';
      const photosWithFullUrls = (res.photos || []).map(p => ({
        ...p,
        url: `${backendOrigin}/${p.state}/${p.filename}`,
        thumbnail: p.thumbnail ? `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}` : null
      }));
      setPhotos(photosWithFullUrls);
    } catch (error) {
      setToastMsg(`Error marking photo as finished: ${error.message}`);
    }
  };

  // Handle recheck inprogress
  const handleRecheckInprogress = async () => {
    setRechecking(true);
    try {
      const res = await recheckInprogressPhotos();
      setToastMsg(res.message || 'Rechecked inprogress photos');
    } catch (error) {
      try {
        if (error.response && error.response.json) {
          const data = await error.response.json();
          setToastMsg(`Recheck failed: ${data.error || error.message}`);
        } else {
          setToastMsg(`Recheck failed: ${error.message}`);
        }
      } catch (parseError) {
        setToastMsg(`Recheck failed: ${error.message}`);
      }
    } finally {
      setRechecking(false);
    }
  };

  // Photo Editing Modal Component
  const PhotoEditingModal = ({ photo, onClose, onFinished, restoreFocusRef }) => {
    if (!photo) return null;

    // Disable body scroll when modal is open and trap focus inside the modal
    React.useEffect(() => {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);

      // Focus trap: keep focus within modal
      const focusableSelector = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const modalNode = document.getElementById('photo-editing-modal');
      let firstFocusable = null;
      let lastFocusable = null;
      if (modalNode) {
        const nodes = modalNode.querySelectorAll(focusableSelector);
        if (nodes.length > 0) {
          firstFocusable = nodes[0];
          lastFocusable = nodes[nodes.length - 1];
          try { firstFocusable.focus(); } catch (e) {}
        }
      }

      const onKeyTrap = (e) => {
        if (e.key !== 'Tab') return;
        if (!firstFocusable || !lastFocusable) return;
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      };
      window.addEventListener('keydown', onKeyTrap);

      return () => {
        document.body.style.overflow = prev;
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keydown', onKeyTrap);
      };
    }, [onClose, photo]);

    const displayUrl = `http://localhost:3001/display/${photo.state}/${photo.filename}`;

    const modalContent = (
      <div id="photo-editing-modal" className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[200000]" role="dialog" aria-modal="true" aria-label={`Edit ${photo.filename}`}>
        <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[95vh] m-4 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-6 border-b bg-gray-50">
            <h2 className="text-xl font-bold text-gray-800">Edit Photo: {photo.filename}</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.open(displayUrl, '_blank')}
                className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
              >
                Open Full
              </button>
              <button 
                onClick={() => {
                  onClose();
                  try { if (restoreFocusRef && restoreFocusRef.current) restoreFocusRef.current.focus(); } catch (e) {}
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6" tabIndex={-1}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Photo display */}
              <div className="flex flex-col space-y-4">
                <div className="bg-gray-50 rounded-lg px-2 py-3">
                  <img 
                    src={`http://localhost:3001/display/${photo.state}/${photo.filename}`} 
                    alt={photo.filename}
                    className="h-auto max-h-96 object-contain rounded shadow-lg"
                    style={{maxWidth: '98%'}}
                  />
                </div>
                <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                  <p><strong>File Size:</strong> {formatFileSize(photo.file_size)}</p>
                  <p><strong>State:</strong> {photo.state}</p>
                  <p><strong>Hash:</strong> {photo.hash ? photo.hash.slice(-10) : 'N/A'}</p>
                </div>
              </div>
            
              {/* Photo metadata and AI info */}
              <div className="flex flex-col space-y-4">
                {photo.caption && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">Caption</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{photo.caption}</p>
                  </div>
                )}
                
                {photo.description && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">Description</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{photo.description}</p>
                  </div>
                )}
                
                {photo.keywords && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">Keywords</h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">{photo.keywords}</p>
                  </div>
                )}
                
                {photo.metadata && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">EXIF Data</h3>
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded max-h-40 overflow-y-auto">
                      {photo.metadata.DateTimeOriginal && <p><strong>Date Taken:</strong> {photo.metadata.DateTimeOriginal}</p>}
                      {photo.metadata.Make && <p><strong>Camera:</strong> {photo.metadata.Make} {photo.metadata.Model}</p>}
                      {photo.metadata.LensModel && <p><strong>Lens:</strong> {photo.metadata.LensModel}</p>}
                      {photo.metadata.FNumber && <p><strong>Aperture:</strong> f/{photo.metadata.FNumber}</p>}
                      {photo.metadata.ExposureTime && <p><strong>Shutter:</strong> {photo.metadata.ExposureTime}s</p>}
                      {photo.metadata.ISO && <p><strong>ISO:</strong> {photo.metadata.ISO}</p>}
                      {photo.metadata.FocalLength && <p><strong>Focal Length:</strong> {photo.metadata.FocalLength}mm</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Action buttons */}
          <div className="flex justify-end space-x-4 p-6 border-t bg-gray-50">
            <button
              onClick={() => {
                onClose();
                try { if (restoreFocusRef && restoreFocusRef.current) restoreFocusRef.current.focus(); } catch (e) {}
              }}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded"
            >
              Close
            </button>
            <button
              onClick={async () => {
                try {
                  await onFinished(photo.id);
                } catch (e) {
                  // onFinished should handle errors itself
                }
                try { if (restoreFocusRef && restoreFocusRef.current) restoreFocusRef.current.focus(); } catch (e) {}
              }}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-6 rounded"
            >
              Mark as Finished
            </button>
          </div>
        </div>
      </div>
    );

    return ReactDOM.createPortal(modalContent, document.body);
  };

  // ...existing code...

  return (
    <div
      className="h-screen flex flex-col bg-gray-100"
      id="main-app-container"
    >
      {/* Photo Editing Modal or Full-page Editor */}
      {editingPhoto && useFullPageEditor ? (
        // Lazy load EditPage to keep file small
        <EditPage 
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onFinished={async (id) => { await handleMoveToFinished(id); setEditingPhoto(null); }}
          onSave={async (updated) => {
            // Update local photos array
            setPhotos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
            setEditingPhoto(null);
          }}
        />
      ) : (
        editingPhoto && (
          <PhotoEditingModal 
            photo={editingPhoto} 
            onClose={() => setEditingPhoto(null)}
            onFinished={handleMoveToFinished}
            restoreFocusRef={lastActiveElementRef}
          />
        )
      )}
      
      {/* Toast at top center */}
      <div className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50">
        <Toast message={toastMsg} onClose={() => setToastMsg('')} />
      </div>

      <div className="bg-white shadow-md p-4 flex flex-wrap items-center gap-4">
        <div className="text-lg font-bold">Photo App (Backend View)</div>
        <button
          onClick={handleSelectFolder}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded ml-2"
        >
          Select Folder for Upload
        </button>
        <button
          onClick={() => {setShowInprogress(false); setShowFinished(false);}}
          className={`font-bold py-2 px-4 rounded ml-2 ${!showInprogress && !showFinished ? 'bg-green-500 hover:bg-green-700' : 'bg-gray-500 hover:bg-gray-700'} text-white`}
        >
          View Staged
        </button>
        <button
          onClick={() => {setShowInprogress(true); setShowFinished(false);}}
          className={`font-bold py-2 px-4 rounded ml-2 ${showInprogress ? 'bg-yellow-500 hover:bg-yellow-700' : 'bg-gray-500 hover:bg-gray-700'} text-white`}
        >
          View Inprogress
        </button>
        <button
          onClick={() => {setShowInprogress(false); setShowFinished(true);}}
          className={`font-bold py-2 px-4 rounded ml-2 ${showFinished ? 'bg-blue-500 hover:bg-blue-700' : 'bg-gray-500 hover:bg-gray-700'} text-white`}
        >
          View Finished
        </button>
        {showInprogress && (
          <button
            onClick={handleRecheckInprogress}
            disabled={rechecking}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
          >
            {rechecking ? 'Rechecking...' : 'Recheck AI'}
          </button>
        )}
      </div>

      {/* Local Photos Selection Modal */}
      {showLocalPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto m-4">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold">Select Photos to Upload</h2>
              <button
                onClick={() => setShowLocalPicker(false)}
                className="text-gray-500 hover:text-gray-700 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4 flex gap-4 items-center">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border rounded px-2 py-1"
                  placeholder="Start Date"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
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
              <div className="grid grid-cols-4 gap-4">
                {filteredLocalPhotos.map((p, i) => (
                  <div key={i} className="border rounded p-2 flex flex-col items-center">
                    <div className="truncate w-full text-xs mb-1">{p.name}</div>
                    <div className="text-xs text-gray-500 mb-1">{p.exifDate ? new Date(p.exifDate).toLocaleString() : new Date(p.lastModified).toLocaleString()}</div>
                    <img src={URL.createObjectURL(p.file)} alt={p.name} className="max-h-24 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {/* If a photo is selected open single-page viewer; otherwise show list */}
        {selectedPhoto ? (
          <div className="bg-white rounded-lg shadow-md h-full p-6">
            <div className="flex items-start h-full gap-4" style={{height: 'calc(100vh - 140px)'}}>
                  {/* Left: Image */}
                  <div className="w-3/5 bg-gray-100 rounded overflow-hidden flex items-center justify-center px-2 py-3" style={{maxHeight: '100%'}}>
                    <img
                      src={`http://localhost:3001/display/${selectedPhoto.state}/${selectedPhoto.filename}`}
                      alt={selectedPhoto.filename}
                      className="max-h-full object-contain"
                      style={{maxWidth: '98%', height: 'auto'}}
                    />
                  </div>

                  {/* Divider / gutter (visible) */}
                  <div className="mx-3" style={{width: '3px', backgroundColor: '#e5e7eb', height: '100%'}} />

                {/* Right: Top (caption/description/keywords) and Bottom (AI chat placeholder) */}
                <aside className="w-2/5 bg-white rounded shadow-sm border p-8 flex flex-col" style={{maxHeight: '100%', borderLeft: '1px solid #e5e7eb'}}>
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
                    ) : (
                      <div className="rounded border p-2 bg-gray-50 text-sm text-gray-700">{selectedPhoto.description || <span className="text-gray-400">No description</span>}</div>
                    )}
                  </section>

                  <section>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
                    {editingPhoto && editingPhoto.id === selectedPhoto.id && !useFullPageEditor ? (
                      <input value={editedKeywords} onChange={(e) => setEditedKeywords(e.target.value)} className="w-full rounded border p-2 text-sm bg-gray-50" />
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
                          // update local state
                          setPhotos(prev => prev.map(p => p.id === selectedPhoto.id ? { ...p, caption: editedCaption, description: editedDescription, keywords: editedKeywords } : p));
                          setEditingPhoto(null);
                          setToastMsg('Saved in app');
                        } catch (e) {
                          setToastMsg('Save failed: ' + (e.message || e));
                        }
                      }} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Save</button>
                    <button onClick={async () => {
                        try {
                          await handleMoveToFinished(selectedPhoto.id);
                        } catch (e) { setToastMsg('Mark finished failed'); }
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
                          {photo.thumbnail ? (
                            <img src={photo.thumbnail} alt={photo.filename} className="max-h-20 rounded shadow bg-white" />
                          ) : (
                            <div className="w-20 h-20 flex items-center justify-center bg-gray-200 text-gray-400 rounded shadow">No Thumb</div>
                          )}
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
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEditPhoto(photo, false); }}
                              className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                            >
                              Edit
                            </button>
                          )}
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
      </div>
    </div>
  );
}

export default App;