import { useState, useEffect, useRef } from 'react'
import { parse } from 'exifr'
import { uploadPhotoToServer } from './api.js'
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
    <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50">
      {message}
      <button className="ml-4 text-white underline" onClick={onClose}>Dismiss</button>
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
  const [currentFolder, setCurrentFolder] = useState('')
  const [photos, setPhotos] = useState([])
  const [filteredPhotos, setFilteredPhotos] = useState([])
  const [filteredOutPhotos, setFilteredOutPhotos] = useState([])
  const [showFilteredOut, setShowFilteredOut] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [isCopying, setIsCopying] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [copyProgress, setCopyProgress] = useState(0)
  const [copyAbortController, setCopyAbortController] = useState(null)
  const folderInputRef = useRef(null)

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.bmp', '.tiff', '.webp']

  // Filter and sort photos when dates change
  useEffect(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : null
    const end = endDate ? new Date(endDate + 'T23:59:59') : null

    const filtered = photos.filter(photo => {
      const photoDate = new Date(photo.dateTaken)
      
      if (start && photoDate < start) return false
      if (end && photoDate > end) return false
      return true
    })

    // Also compute which photos were excluded by the date filter for debugging
    const filteredOut = photos.filter(photo => {
      const photoDate = new Date(photo.dateTaken)
      if (start && photoDate < start) return true
      if (end && photoDate > end) return true
      return false
    })

    // Sort by date taken (chronological order)
    filtered.sort((a, b) => new Date(a.dateTaken) - new Date(b.dateTaken))

    setFilteredPhotos(filtered)
    setFilteredOutPhotos(filteredOut)
  }, [photos, endDate, startDate])

  const handleSelectFolder = async () => {
    try {
      // Use File System Access API if available (Chromium browsers)
      if ('showDirectoryPicker' in window) {
        const dirHandle = await window.showDirectoryPicker({
          startIn: 'pictures'
        });
        await processDirectoryHandle(dirHandle);
      } else {
        // Fallback to input method
        folderInputRef.current?.click();
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
    }
  };

  const processDirectoryHandle = async (dirHandle) => {
    const files = [];

    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        try {
          // Permission check before reading
          const perm = await ensurePermission(handle, 'read');
          if (perm !== 'granted') {
            setToastMsg(`Permission denied for file: ${name}`);
            continue;
          }
          const file = await handle.getFile();
          const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
          const isImageByExt = imageExtensions.includes(ext);
          const isImageByType = file.type && file.type.startsWith('image/');
          if (isImageByExt || isImageByType) {
            files.push({ file, privilege: perm === 'granted' ? 'read' : 'none' });
          }
        } catch (error) {
          setToastMsg(`Error reading file: ${name}`);
        }
      }
    }

    const processedPhotos = []

    for (const entry of files) {
      try {
        const photo = await processImageFile(entry.file, entry.privilege)
        if (photo) processedPhotos.push(photo)
      } catch (error) {
        console.error('Error processing file:', entry.file.name, error)
      }
    }

    setPhotos(processedPhotos)
  };

  const handleFolderChange = async (event) => {
    const files = Array.from(event.target.files)
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
      return imageExtensions.includes(ext)
    })

    const processedPhotos = []

    for (const file of imageFiles) {
      console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type)
      try {
        // Files from an <input> don't expose handles/permissions, mark as unknown
        const photo = await processImageFile(file, 'unknown')
        if (photo) {
          processedPhotos.push(photo)
          console.log('Successfully processed:', file.name)
        } else {
          console.warn('Failed to process:', file.name)
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error)
      }
    }

    console.log('Total processed photos:', processedPhotos.length)
    setPhotos(processedPhotos)
  }

  const convertDMSToDecimal = (dms, ref) => {
    const degrees = dms[0] || 0
    const minutes = dms[1] || 0
    const seconds = dms[2] || 0
    
    let decimal = degrees + minutes / 60 + seconds / 3600
    
    // Apply reference (N/S for latitude, E/W for longitude)
    if (ref === 'S' || ref === 'W') {
      decimal = -decimal
    }
    
    return decimal
  }

  const processImageFile = async (file, privilege = 'unknown', originalDateOverride = null) => {
    try {
      let exifData = null;
      let dateTaken = null;
      let gpsData = 'none';
      let errorMsg = '';
      // Robust EXIF parse with fallback
      try {
        exifData = await parse(file);
      } catch (exifError) {
        errorMsg = `EXIF parsing failed for ${file.name}`;
      }
      // Fallback order: XMP, EXIF, lastModified, filename, unknown
      if (exifData) {
        dateTaken = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate || null;
      }
      if (!dateTaken && originalDateOverride) {
        try {
          const d = new Date(originalDateOverride);
          if (!isNaN(d)) dateTaken = d;
        } catch {}
      }
      if (!dateTaken) {
        dateTaken = file.lastModified ? new Date(file.lastModified) : null;
      }
      if (!dateTaken) {
        dateTaken = extractDateFromFilename(file.name);
      }
      if (!dateTaken || isNaN(dateTaken)) {
        dateTaken = 'unknown';
        errorMsg = errorMsg || `No valid date found for ${file.name}`;
      }
      // GPS extraction
      if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
        const lat = exifData.GPSLatitude;
        const lon = exifData.GPSLongitude;
        const latRef = exifData.GPSLatitudeRef || 'N';
        const lonRef = exifData.GPSLongitudeRef || 'E';
        const latDecimal = convertDMSToDecimal(lat, latRef);
        const lonDecimal = convertDMSToDecimal(lon, lonRef);
        gpsData = `${latDecimal.toFixed(4)}° ${latRef}, ${lonDecimal.toFixed(4)}° ${lonRef}`;
      }
      const blobUrl = URL.createObjectURL(file);
      if (errorMsg) setToastMsg(errorMsg);
      return {
        id: Math.random().toString(36),
        file,
        dateTaken,
        gpsData,
        blobUrl,
        filename: file.name,
        privilege
      };
    } catch (error) {
      setToastMsg(`Error processing file: ${file.name}`);
      return null;
    }
  }

  const switchToWorkingFolder = async (workingDirHandle, folderName) => {
    try {
      const files = []

      // Attempt to read metadata file that maps original filenames to original dates
      let metaMap = {}
      try {
        const metaHandle = await workingDirHandle.getFileHandle('.photo_meta.json')
        const metaFile = await metaHandle.getFile()
        const text = await metaFile.text()
        metaMap = JSON.parse(text || '{}')
      } catch {
        // no metadata file, continue
      }

      // Read all files from the working directory and attempt to detect privileges
      for await (const [name, handle] of workingDirHandle.entries()) {
        if (handle.kind === 'file') {
          try {
            const file = await handle.getFile()
            const ext = name.toLowerCase().substring(name.lastIndexOf('.'))
            const isImageByExt = imageExtensions.includes(ext)
            const isImageByType = file.type && file.type.startsWith('image/')

            if (isImageByExt || isImageByType) {
              let privilege = 'unknown'
              try {
                if (typeof handle.queryPermission === 'function') {
                  const rw = await handle.queryPermission({ mode: 'readwrite' })
                  if (rw === 'granted') {
                    privilege = 'read/write'
                  } else {
                    const r = await handle.queryPermission({ mode: 'read' })
                    privilege = r === 'granted' ? 'read' : 'none'
                  }
                }
              } catch (permErr) {
                console.warn('Permission check failed for working folder file', name, permErr)
              }

              const originalDateOverride = metaMap[name] || null
              files.push({ file, privilege, originalDateOverride })
            }
          } catch (error) {
            console.error('Error getting file from working folder:', name, error)
          }
        }
      }

      // Process the files (same as original folder processing)
      const processedPhotos = []
      for (const entry of files) {
        const file = entry.file
        const privilege = entry.privilege || 'unknown'
        console.log('Processing working folder file:', file.name, 'Size:', file.size, 'privilege:', privilege)
        try {
          const photo = await processImageFile(file, privilege, entry.originalDateOverride)
          if (photo) {
            processedPhotos.push(photo)
            console.log('Successfully processed working folder file:', file.name)
          }
        } catch (error) {
          console.error('Error processing working folder file:', file.name, error)
        }
      }

      console.log('Working folder processed photos:', processedPhotos.length)
      setPhotos(processedPhotos)
      setCurrentFolder(folderName)
      setCopyStatus(`Now viewing working folder: ${folderName}`)
    } catch (error) {
      console.error('Error switching to working folder:', error)
      setCopyStatus('Error switching to working folder view')
    }
  }

  const handleCopyToWorking = async () => {
    if (filteredPhotos.length === 0) {
      setCopyStatus('No photos to copy')
      return
    }

    try {
      setIsCopying(true);
      setCopyStatus('Uploading photos to server...');
      setCopyProgress(0);
      // AbortController for cancellation
      const abortController = new AbortController();
      setCopyAbortController(abortController);
      
      let copiedCount = 0;
      for (let i = 0; i < filteredPhotos.length; i++) {
        if (abortController.signal.aborted) {
          setCopyStatus('Upload cancelled.');
          break;
        }
        const photo = filteredPhotos[i];
        try {
          const result = await uploadPhotoToServer(photo.file);
          if (result.success) {
            copiedCount++;
            setCopyProgress(Math.round(((i + 1) / filteredPhotos.length) * 100));
            setCopyStatus(`Uploaded ${copiedCount} of ${filteredPhotos.length} photos...`);
          } else {
            setToastMsg(`Failed to upload ${photo.filename}`);
          }
        } catch (error) {
          setToastMsg(`Error uploading ${photo.filename}: ${error.message}`);
        }
        // Add small delay between uploads to prevent server overload
        if (i < filteredPhotos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      setCopyStatus(`Successfully uploaded ${copiedCount} photos to server working directory.`);
    } catch (error) {
      setToastMsg(error.message);
      setCopyStatus('Failed to upload photos.');
    } finally {
      setIsCopying(false);
      setCopyAbortController(null);
      setCopyProgress(0);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Toast for errors/warnings */}
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
      {/* Control Panel */}
      <div className="bg-white shadow-md p-4 flex flex-wrap items-center gap-4">
        <button
          onClick={handleSelectFolder}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Select Photos Folder
        </button>
        <button
          onClick={handleCopyToWorking}
          disabled={isCopying || filteredPhotos.length === 0}
          className="bg-green-500 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded ml-4"
        >
          {isCopying ? 'Uploading...' : 'Upload to Server'}
        </button>
          {isCopying && (
            <button
              onClick={() => copyAbortController && copyAbortController.abort()}
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded ml-2"
            >
              Cancel Copy
            </button>
          )}
        {copyStatus && (
          <div className="text-sm text-gray-600 ml-2">
            {copyStatus}
          </div>
        )}
          {isCopying && (
            <div className="text-sm text-blue-600 ml-2">Progress: {copyProgress}%</div>
          )}
        {currentFolder && (
          <div className="text-sm font-medium text-blue-600 ml-4">
            📁 Viewing: {currentFolder}
          </div>
        )}
        <input
          ref={folderInputRef}
          type="file"
          webkitdirectory="true"
          multiple
          onChange={handleFolderChange}
          className="hidden"
        />
        <div className="flex items-center gap-2">
          <label htmlFor="startDate" className="text-sm font-medium">Start Date:</label>
          <input
            type="date"
            id="startDate"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="endDate" className="text-sm font-medium">End Date:</label>
          <input
            type="date"
            id="endDate"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setStartDate(''); setEndDate('') }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-2 py-1 rounded text-sm"
          >
            Clear Date Filters
          </button>
          <button
            onClick={() => setShowFilteredOut(prev => !prev)}
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm"
          >
            Toggle Filtered-Out ({filteredOutPhotos.length})
          </button>
        </div>
      </div>

      {/* Photo List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-lg shadow-md">
          {filteredPhotos.length > 0 && (
            <div className="border-b border-gray-200 px-4 py-2 bg-gray-50 font-medium text-sm">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-5 md:col-span-4 lg:col-span-3">Filename</div>
                    <div className="col-span-2 md:col-span-2 lg:col-span-2">Date Taken</div>
                    <div className="col-span-3 md:col-span-3 lg:col-span-4">GPS Location</div>
                    <div className="col-span-2 md:col-span-2 lg:col-span-3">Privileges</div>
                  </div>
            </div>
          )}
          <div className="divide-y divide-gray-200">
            {filteredPhotos.map(photo => (
              <div key={photo.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="grid grid-cols-12 gap-4 text-sm">
                  <div className="col-span-5 md:col-span-4 lg:col-span-3 font-medium text-gray-900 truncate">
                    {photo.filename}
                  </div>
                  <div className="col-span-2 md:col-span-2 lg:col-span-2 text-gray-600">
                    {photo.dateTaken.toLocaleDateString()} {photo.dateTaken.toLocaleTimeString()}
                  </div>
                  <div className="col-span-3 md:col-span-3 lg:col-span-4 text-gray-600 truncate">
                    {photo.gpsData}
                  </div>
                  <div className="col-span-2 md:col-span-2 lg:col-span-3 text-gray-600">
                    {photo.privilege}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredPhotos.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-600">
              Showing {filteredPhotos.length} of {photos.length} photos
            </div>
          )}
        </div>
        {filteredPhotos.length === 0 && photos.length > 0 && (
          <div className="text-center text-gray-500 mt-8">
            No photos match the selected date range.
          </div>
        )}
        {showFilteredOut && filteredOutPhotos.length > 0 && (
          <div className="mt-4 bg-white p-2 rounded shadow-sm text-sm">
            <div className="font-medium mb-2">Filtered out files ({filteredOutPhotos.length}):</div>
            <div className="max-h-40 overflow-auto">
              {filteredOutPhotos.map(p => (
                <div key={p.id} className="py-1 border-b">{p.filename} — {p.dateTaken.toLocaleString()}</div>
              ))}
            </div>
          </div>
        )}
        {photos.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            Select a folder to view photos.
          </div>
        )}
      </div>
    </div>
  )
}

export default App
