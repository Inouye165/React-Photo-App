import { useState, useEffect, useRef } from 'react';
import { parse } from 'exifr';
import {
  uploadPhotoToServer,
  checkPrivilege,
  getPhotos,
  updatePhotoState,
  recheckInprogressPhotos,
  deletePhoto,
} from './api.js';
import { createAuthenticatedImageUrl } from './utils/auth.js';
import Toolbar from './Toolbar.jsx';
import PhotoGallery from './PhotoGallery.jsx';
import PhotoUploadForm from './PhotoUploadForm.jsx';

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
  const [localPhotos, setLocalPhotos] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showLocalPicker, setShowLocalPicker] = useState(false);
  const [privilegesMap, setPrivilegesMap] = useState({});
  const [showInprogress, setShowInprogress] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [showFinished, setShowFinished] = useState(false);
  const [toolbarDebugMsg, setToolbarDebugMsg] = useState('');

  const workingDirHandleRef = useRef(null);

  // Load photos
  useEffect(() => {
    const endpoint = showFinished
      ? 'finished'
      : showInprogress
      ? 'inprogress'
      : 'working';
    const loadPhotos = async () => {
      try {
        const res = await getPhotos(endpoint);
        const backendOrigin = 'http://localhost:3001';
        const photosWithFullUrls = (res.photos || []).map((p) => ({
          ...p,
          url: createAuthenticatedImageUrl(
            `${backendOrigin}/display/${p.state}/${p.filename}`,
          ),
          thumbnail: p.thumbnail
            ? createAuthenticatedImageUrl(
                `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}`,
              )
            : null,
        }));
        setPhotos(photosWithFullUrls);
        setToastMsg(`Loaded ${photosWithFullUrls.length} photos (${endpoint})`);
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
      const map = {};
      for (const photo of photos) {
        try {
          const res = await checkPrivilege(photo.filename);
          if (res && res.privilege) {
            const privArr = [];
            if (res.privilege.canRead) privArr.push('R');
            if (res.privilege.canWrite) privArr.push('W');
            if (res.privilege.canExecute) privArr.push('X');
            map[photo.id] = privArr.length > 0 ? privArr.join('') : 'None';
          } else {
            map[photo.id] = '?';
          }
        } catch {
          map[photo.id] = 'Error';
        }
      }
      setPrivilegesMap(map);
    };
    if (photos.length > 0) loadPrivileges();
  }, [photos]);

  // Handle folder selection
  const handleSelectFolder = async () => {
    try {
      if (!window.showDirectoryPicker) {
        throw new Error('File System Access API not supported');
      }
      const dirHandle = await window.showDirectoryPicker();
      const files = [];
      for await (const [name, handle] of dirHandle.entries()) {
        if (
          handle.kind === 'file' &&
          /\.(jpg|jpeg|png|gif|heic|heif)$/i.test(name)
        ) {
          const file = await handle.getFile();
          try {
            // Parse EXIF to get date taken
            const exif = await parse(file);
            const exifDate =
              exif?.DateTimeOriginal || exif?.CreateDate || exif?.DateTime;
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
      setToastMsg(`Folder selection failed: ${error.message}`);
    }
  };

  // Filter local photos by date range
  const filteredLocalPhotos = localPhotos.filter((p) => {
    if (!startDate && !endDate) return true;
    const fileDate = p.exifDate
      ? new Date(p.exifDate)
      : new Date(p.file.lastModified);
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
      setToastMsg(`Successfully uploaded ${filteredLocalPhotos.length} photos`);
      // Refresh the photo list
      const res = await getPhotos('working');
      const backendOrigin = 'http://localhost:3001';
      const photosWithFullUrls = (res.photos || []).map((p) => ({
        ...p,
        url: createAuthenticatedImageUrl(
          `${backendOrigin}/display/${p.state}/${p.filename}`,
        ),
        thumbnail: p.thumbnail
          ? createAuthenticatedImageUrl(
              `${backendOrigin}/thumbnails/${p.thumbnail.split('/').pop()}`,
            )
          : null,
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
      setPhotos((prev) => prev.filter((photo) => photo.id !== id));
      setToastMsg('Moved to Inprogress');
    } catch (error) {
      setToastMsg(`Error moving photo: ${error.message}`);
    }
  };

  const handleMoveToWorking = async (id) => {
    try {
      await updatePhotoState(id, 'working');
      setPhotos((prev) => prev.filter((photo) => photo.id !== id));
      setToastMsg('Moved back to Staged');
    } catch (error) {
      setToastMsg(`Error moving photo: ${error.message}`);
    }
  };

  const handleDeletePhoto = async (id) => {
    if (!confirm('Are you sure you want to delete this photo? This action cannot be undone.')) {
      return;
    }
    try {
      await deletePhoto(id);
      setPhotos((prev) => prev.filter((photo) => photo.id !== id));
      setToastMsg('Photo deleted');
    } catch (error) {
      setToastMsg(`Error deleting photo: ${error.message}`);
    }
  };

  // Handle edit photo
  const handleEditPhoto = (photo) => {
    console.log('Edit photo clicked:', photo);
    setEditingPhoto(photo);
  };

  // Handle move to finished
  const handleMoveToFinished = async (id) => {
    try {
      await updatePhotoState(id, 'finished');
      setToastMsg('Photo marked as finished');
      setEditingPhoto(null);
      setPhotos((prev) => prev.filter((photo) => photo.id !== id));
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
      } catch {
        setToastMsg(`Recheck failed: ${error.message}`);
      }
    } finally {
      setRechecking(false);
    }
  };

  // Photo Editing Modal Component
  const PhotoEditingModal = ({ photo, onClose, onFinished }) => {
    if (!photo) return null;

    const displayUrl = createAuthenticatedImageUrl(
      `http://localhost:3001/display/${photo.state}/${photo.filename}`,
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 pointer-events-none">
        <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col pointer-events-auto">
          <div className="flex justify-between items-center p-6 border-b bg-gray-50">
            <h2 className="text-xl font-bold text-gray-800">
              Edit Photo: {photo.filename}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Photo display */}
              <div className="flex flex-col space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <img
                    src={displayUrl}
                    alt={photo.filename}
                    className="w-full h-auto max-h-96 object-contain rounded shadow-lg"
                    onError={(_e) => { // Prefixed unused variable
                      console.error('Image failed to load:', displayUrl);
                    }}
                    onLoad={() =>
                      console.log('Image loaded successfully:', displayUrl)
                    }
                  />
                </div>
                <div className="text-sm text-gray-600 bg-white p-3 rounded border">
                  <p>
                    <strong>File Size:</strong> {formatFileSize(photo.file_size)}
                  </p>
                  <p>
                    <strong>State:</strong> {photo.state}
                  </p>
                  <p>
                    <strong>Hash:</strong>{' '}
                    {photo.hash ? photo.hash.slice(-10) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Photo metadata and AI info */}
              <div className="flex flex-col space-y-4">
                {photo.caption && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">
                      Caption
                    </h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">
                      {photo.caption}
                    </p>
                  </div>
                )}

                {photo.description && (
                  <div>
                    <h3 className="font-semibold text-lg text-gray-800">
                      Description
                    </h3>
                    <p className="text-gray-700 bg-gray-50 p-3 rounded">
                      {photo.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-4 p-6 border-t bg-gray-50">
            <button
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded"
            >
              Close
            </button>
            <button
              onClick={() => onFinished(photo.id)}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-6 rounded"
            >
              Mark as Finished
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Photo Editing Modal */}
      {editingPhoto && (
        <PhotoEditingModal
          photo={editingPhoto}
          onClose={() => setEditingPhoto(null)}
          onFinished={handleMoveToFinished}
        />
      )}

      {/* Toast at top center */}
      <div className="fixed top-6 left-1/2 transform -translate-x-1/½ z-50">
        <Toast message={toastMsg} onClose={() => setToastMsg('')} />
      </div>

      <Toolbar
        onSelectFolder={handleSelectFolder}
        onViewStaged={() => {
          console.log('[TOOLBAR] View Staged clicked');
          setToolbarDebugMsg('View Staged clicked');
          setShowInprogress(false);
          setShowFinished(false);
          setEditingPhoto(null);
        }}
        onViewInprogress={() => {
          console.log('[TOOLBAR] View Inprogress clicked');
          setToolbarDebugMsg('View Inprogress clicked');
          setShowInprogress(true);
          setShowFinished(false);
          setEditingPhoto(null);
        }}
        onViewFinished={() => {
          console.log('[TOOLBAR] View Finished clicked');
          setToolbarDebugMsg('View Finished clicked');
          setShowInprogress(false);
          setShowFinished(true);
          setEditingPhoto(null);
        }}
        showInprogress={showInprogress}
        showFinished={showFinished}
        onRecheck={handleRecheckInprogress}
        rechecking={rechecking}
        toolbarMessage={toolbarDebugMsg}
        onClearToolbarMessage={() => setToolbarDebugMsg('')}
        onShowMetadata={() => setToastMsg('Metadata view not implemented yet.')}
      />

      {/* Local Photos Selection Modal */}
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

      <div className="flex-1 overflow-auto p-4">
        {/* Toolbar debug indicator */}
        {toolbarDebugMsg && (
          <div className="fixed top-20 right-6 z-50 bg-black text-white text-sm px-3 py-1 rounded shadow">
            {toolbarDebugMsg}
          </div>
        )}
        <div className="bg-white rounded-lg shadow-md">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading photos...
            </div>
          ) : photos.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No photos found in backend.
            </div>
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
              <PhotoGallery
                photos={photos}
                privilegesMap={privilegesMap}
                handleMoveToInprogress={handleMoveToInprogress}
                handleEditPhoto={handleEditPhoto}
                handleMoveToWorking={handleMoveToWorking}
                handleDeletePhoto={handleDeletePhoto}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;