import { useState, useRef, useEffect } from 'react'
import { parse } from 'exifr'

function App() {
  const [photos, setPhotos] = useState([])
  const [filteredPhotos, setFilteredPhotos] = useState([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
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

    // Sort by date taken (chronological order)
    filtered.sort((a, b) => new Date(a.dateTaken) - new Date(b.dateTaken))

    setFilteredPhotos(filtered)
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
        const ext = name.toLowerCase().substring(name.lastIndexOf('.'));
        if (imageExtensions.includes(ext)) {
          try {
            const file = await handle.getFile();
            files.push(file);
          } catch (error) {
            console.error('Error getting file:', name, error);
          }
        }
      }
    }

    const processedPhotos = [];

    for (const file of files) {
      try {
        const photo = await processImageFile(file);
        if (photo) {
          processedPhotos.push(photo);
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error);
      }
    }

    setPhotos(processedPhotos);
  };

  const handleFolderChange = async (event) => {
    const files = Array.from(event.target.files)
    const imageFiles = files.filter(file => {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
      return imageExtensions.includes(ext)
    })

    const processedPhotos = []

    for (const file of imageFiles) {
      try {
        const photo = await processImageFile(file)
        if (photo) {
          processedPhotos.push(photo)
        }
      } catch (error) {
        console.error('Error processing file:', file.name, error)
      }
    }

    setPhotos(processedPhotos)
  }

  const processImageFile = async (file) => {
    try {
      const exifData = await parse(file)
      let dateTaken = new Date(file.lastModified)

      if (exifData?.DateTimeOriginal) {
        dateTaken = new Date(exifData.DateTimeOriginal)
      }

      const blobUrl = URL.createObjectURL(file)

      return {
        id: Math.random().toString(36),
        file,
        dateTaken,
        blobUrl,
        filename: file.name
      }
    } catch (error) {
      console.error('Error reading EXIF for', file.name, error)
      return null
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
        <div className="text-xs text-gray-500 ml-2">
          Opens in your Pictures folder (Chromium browsers)
        </div>
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
      </div>

      {/* Photo List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-white rounded-lg shadow-md">
          {filteredPhotos.length > 0 && (
            <div className="border-b border-gray-200 px-4 py-2 bg-gray-50 font-medium text-sm">
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-6">Filename</div>
                <div className="col-span-4">Date Taken</div>
                <div className="col-span-2">Size</div>
              </div>
            </div>
          )}
          <div className="divide-y divide-gray-200">
            {filteredPhotos.map(photo => (
              <div key={photo.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="grid grid-cols-12 gap-4 text-sm">
                  <div className="col-span-6 font-medium text-gray-900 truncate">
                    {photo.filename}
                  </div>
                  <div className="col-span-4 text-gray-600">
                    {photo.dateTaken.toLocaleDateString()} {photo.dateTaken.toLocaleTimeString()}
                  </div>
                  <div className="col-span-2 text-gray-500">
                    {(photo.file.size / 1024 / 1024).toFixed(1)} MB
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
