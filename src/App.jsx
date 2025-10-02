import { useState, useEffect, useRef } from 'react'
import { parse } from 'exifr'

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
          // Get the File first to inspect MIME type as a fallback
          const file = await handle.getFile()
          const ext = name.toLowerCase().substring(name.lastIndexOf('.'))
          const isImageByExt = imageExtensions.includes(ext)
          const isImageByType = file.type && file.type.startsWith('image/')

          if (isImageByExt || isImageByType) {
            // Determine permissions where possible (File System Access API handles)
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
              // Non-fatal: leave privilege as unknown
              console.warn('Permission check failed for', name, permErr)
            }

            files.push({ file, privilege })
          }
        } catch (error) {
          console.error('Error getting file from directory handle:', name, error)
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
      let exifData = null
      let dateTaken = new Date(file.lastModified)
      let gpsData = 'none'

      // Try to parse EXIF data, but don't fail if it doesn't work
      try {
        exifData = await parse(file)
      } catch (exifError) {
        console.warn(`EXIF parsing failed for ${file.name}:`, exifError.message)
        // Continue with file modification date
      }

      if (exifData?.DateTimeOriginal) {
        dateTaken = new Date(exifData.DateTimeOriginal)
      } else if (originalDateOverride) {
        try {
          const d = new Date(originalDateOverride)
          if (!isNaN(d)) dateTaken = d
        } catch {
          // ignore
        }
      }

      // Extract GPS data
      if (exifData?.GPSLatitude && exifData?.GPSLongitude) {
        const lat = exifData.GPSLatitude
        const lon = exifData.GPSLongitude
        const latRef = exifData.GPSLatitudeRef || 'N'
        const lonRef = exifData.GPSLongitudeRef || 'E'
        
        // Convert DMS to decimal degrees
        const latDecimal = convertDMSToDecimal(lat, latRef)
        const lonDecimal = convertDMSToDecimal(lon, lonRef)
        
        gpsData = `${latDecimal.toFixed(4)}° ${latRef}, ${lonDecimal.toFixed(4)}° ${lonRef}`
      }

      const blobUrl = URL.createObjectURL(file)

      return {
        id: Math.random().toString(36),
        file,
        dateTaken,
        gpsData,
        blobUrl,
        filename: file.name,
        privilege
      }
    } catch (error) {
      console.error('Error processing file:', file.name, error)
      return null
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
      setIsCopying(true)
      setCopyStatus('Requesting folder access...')

      // Request permission to create working folder
      const dirHandle = await window.showDirectoryPicker({
        startIn: 'documents',
        mode: 'readwrite'
      })

      // Create working folder
      const workingFolderName = `PhotoWorking_${new Date().toISOString().split('T')[0]}`
      const workingDirHandle = await dirHandle.getDirectoryHandle(workingFolderName, { create: true })

      setCopyStatus(`Copying ${filteredPhotos.length} photos...`)

  let copiedCount = 0
  const meta = {}
  for (const photo of filteredPhotos) {
        console.log('Attempting to copy:', photo.filename, 'Size:', photo.file.size)
        try {
          // Create file in working directory
          const fileHandle = await workingDirHandle.getFileHandle(photo.filename, { create: true })
          const writable = await fileHandle.createWritable()
          
          // Use the original file data directly instead of blob URL
          const fileData = await photo.file.arrayBuffer()
          
          await writable.write(fileData)
          await writable.close()
          
          copiedCount++
          console.log('Successfully copied:', photo.filename)
          setCopyStatus(`Copied ${copiedCount} of ${filteredPhotos.length} photos...`)
          try {
            meta[photo.filename] = (photo.dateTaken instanceof Date) ? photo.dateTaken.toISOString() : new Date(photo.dateTaken).toISOString()
          } catch {
            // ignore metadata issues
          }
        } catch (error) {
          console.error('Error copying file:', photo.filename, error)
          setCopyStatus(`Error copying ${photo.filename}: ${error.message}`)
          // Continue with other files instead of stopping
        }
      }

      // write metadata mapping original filenames to original dates
      try {
        const metaHandle = await workingDirHandle.getFileHandle('.photo_meta.json', { create: true })
        const metaWritable = await metaHandle.createWritable()
        await metaWritable.write(JSON.stringify(meta))
        await metaWritable.close()
      } catch (metaErr) {
        console.warn('Failed to write metadata file:', metaErr)
      }

      setCopyStatus(`Successfully copied ${copiedCount} photos to "${workingFolderName}" folder (originals preserved)`)
      
      // Automatically switch to viewing the working folder
      await switchToWorkingFolder(workingDirHandle, workingFolderName)
    } catch (error) {
      console.error('Error creating working folder:', error)
      setCopyStatus('Failed to create working folder. File System Access API may not be supported.')
    } finally {
      setIsCopying(false)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
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
          {isCopying ? 'Copying...' : 'Copy to Working'}
        </button>
        {copyStatus && (
          <div className="text-sm text-gray-600 ml-2">
            {copyStatus}
          </div>
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
