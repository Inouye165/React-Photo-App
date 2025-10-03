import { useState, useEffect, useRef } from 'react'
import { parse } from 'exifr'
import { uploadPhotoToServer, checkPrivilege, getPhotos, updatePhotoState } from './api.js'
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

  // Fetch backend photos on load
  useEffect(() => {
    async function fetchPhotos() {
      setLoading(true);
      try {
        const res = await getPhotos();
        const backendOrigin = 'http://localhost:3001';
        const photosWithFullUrls = (res.photos || []).map(p => ({
          ...p,
          url: p.url && p.url.startsWith('/') ? `${backendOrigin}${p.url}` : p.url,
          thumbnail: p.thumbnail && p.thumbnail.startsWith('/') ? `${backendOrigin}${p.thumbnail}` : p.thumbnail
        }));
        setPhotos(photosWithFullUrls);
      } catch (err) {
        setToastMsg('Failed to fetch photos from backend.');
      } finally {
        setLoading(false);
      }
    }
    fetchPhotos();
  }, []);

  // Fetch privileges for all backend photos
  useEffect(() => {
    async function fetchPrivileges() {
      const map = {};
      for (const photo of photos) {
        try {
          const res = await checkPrivilege(photo.filename);
          if (res.success && res.privileges) {
            const privArr = [];
            if (res.privileges.read) privArr.push('read');
            if (res.privileges.write) privArr.push('write');
            if (res.privileges.execute) privArr.push('execute');
            map[photo.id] = privArr.join('/');
          } else {
            map[photo.id] = 'none';
          }
        } catch {
          map[photo.id] = 'error';
        }
      }
      setPrivilegesMap(map);
    }
    if (photos.length > 0) fetchPrivileges();
  }, [photos]);

  // Folder picker handler
  const handleSelectFolder = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await window.showDirectoryPicker();
        const files = [];
        for await (const [name, handle] of dirHandle.entries()) {
          if (handle.kind === 'file') {
            const file = await handle.getFile();
            let exifDate = null;
            try {
              const exif = await parse(file);
              exifDate = exif?.DateTimeOriginal || exif?.CreateDate || exif?.ModifyDate || null;
            } catch {}
            files.push({ file, name, exifDate, lastModified: file.lastModified });
          }
        }
        setLocalPhotos(files);
        setShowLocalPicker(true);
      } else {
        setToastMsg('Your browser does not support folder picking.');
      }
    } catch (err) {
      setToastMsg('Error selecting folder.');
    }
  };

  // Date filter for local photos
  const filteredLocalPhotos = localPhotos.filter(p => {
    if (!startDate && !endDate) return true;
    let date = p.exifDate ? new Date(p.exifDate) : new Date(p.lastModified);
    if (startDate && date < new Date(startDate)) return false;
    if (endDate && date > new Date(endDate + 'T23:59:59')) return false;
    return true;
  });

  // Handle upload of filtered local photos
  const handleUploadFiltered = async () => {
    if (filteredLocalPhotos.length === 0) return;
    setUploading(true);
    try {
      for (const p of filteredLocalPhotos) {
        await uploadPhotoToServer(p.file);
      }
      setToastMsg('Upload complete!');
      setLocalPhotos([]);
      setShowLocalPicker(false);
      // Refresh backend list
      const res = await getPhotos();
      setPhotos(res.photos || []);
    } catch (err) {
      setToastMsg('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  // Move photo to inprogress
  const handleMoveToInprogress = async (id) => {
    try {
      await updatePhotoState(id, 'inprogress');
      const res = await getPhotos();
      setPhotos(res.photos || []);
    } catch (err) {
      setToastMsg('Failed to move photo to inprogress.');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
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
        {showLocalPicker && (
          <>
            <div className="flex items-center gap-2 ml-4">
              <label htmlFor="startDate" className="text-sm font-medium">Start Date:</label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1"
              />
              <label htmlFor="endDate" className="text-sm font-medium ml-2">End Date:</label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1"
              />
              <button
                onClick={handleUploadFiltered}
                disabled={uploading || filteredLocalPhotos.length === 0}
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2"
              >
                {uploading ? 'Uploading...' : `Upload ${filteredLocalPhotos.length} Photos`}
              </button>
              <button
                onClick={() => { setShowLocalPicker(false); setLocalPhotos([]); }}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-2 py-1 rounded ml-2"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
      {showLocalPicker && (
        <div className="p-4">
          <div className="bg-white rounded shadow p-4 mb-4">
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
      )}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-lg shadow-md">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading photos...</div>
          ) : photos.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No photos found in backend.</div>
          ) : (
            <div>
              <div className="border-b border-gray-200 px-4 py-2 bg-gray-50 font-medium text-sm">
                <div className="grid grid-cols-14 gap-4">
                  <div className="col-span-2">Preview</div>
                  <div className="col-span-2">Filename</div>
                  <div className="col-span-3">Date Taken</div>
                  <div className="col-span-2">State</div>
                  <div className="col-span-2">Privileges</div>
                  <div className="col-span-1">Hash</div>
                  <div className="col-span-2">Actions</div>
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {photos.map(photo => (
                  <div key={photo.id} className="px-4 py-3 hover:bg-gray-50">
                    <div className="grid grid-cols-14 gap-4 text-sm items-center">
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
                      <div className="col-span-2 text-gray-600">{photo.state}</div>
                      <div className="col-span-2 text-gray-600">{privilegesMap[photo.id] || '...'}</div>
                      <div className="col-span-1 text-green-700 font-mono text-xs">
                        {photo.hash ? <span title={photo.hash}>✔ {photo.hash.slice(-5)}</span> : '...'}
                      </div>
                      <div className="col-span-2">
                        {photo.state === 'working' && (
                          <button
                            onClick={() => handleMoveToInprogress(photo.id)}
                            className="bg-green-500 hover:bg-green-700 text-white px-3 py-1 rounded"
                          >
                            Move to Inprogress
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
