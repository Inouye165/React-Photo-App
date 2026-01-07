import React from 'react';
import formatFileSize from '../utils/formatFileSize';
import { toUrl } from '../utils/toUrl';
import AuthenticatedImage from './AuthenticatedImage.jsx';

export default function PhotoTable({
  photos,
  loading,
  privilegesMap,
  pollingPhotoId,
  onSelectPhoto,
  onEditPhoto,
  onMoveToInprogress,
  onMoveToWorking,
  onDeletePhoto,
  apiBaseUrl,
  getSignedUrl,
}) {
  // Authentication now handled via httpOnly cookies OR signed URLs
  // For thumbnails, use signed URLs if getSignedUrl is provided

  const getAccessLevel = (photoId) => {
    if (!privilegesMap) return '';
    if (privilegesMap instanceof Map) return privilegesMap.get(photoId) || '';
    return privilegesMap?.[photoId] || '';
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-600">Loading photos...</div>;
  }

  if (!Array.isArray(photos) || photos.length === 0) {
    return <div className="p-8 text-center text-gray-600">No photos found in backend.</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md">
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
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
            onClick={() => onSelectPhoto(photo)}
          >
            <div className="grid grid-cols-15 gap-4 text-sm items-center">
              <div className="col-span-2">
                <div className="relative inline-block">
                  {photo.thumbnail ? (
                    (() => {
                      const signedUrl = getSignedUrl ? getSignedUrl(photo) : null;
                      const imageUrl = signedUrl || toUrl(photo.thumbnail, apiBaseUrl);
                      const needsAuth = !signedUrl;
                      
                      return needsAuth ? (
                        <AuthenticatedImage
                          src={imageUrl}
                          alt={photo.filename}
                          className="max-h-20 rounded shadow bg-white"
                        />
                      ) : (
                        <img
                          src={imageUrl}
                          alt={photo.filename}
                          className="max-h-20 rounded shadow bg-white"
                        />
                      );
                    })()
                  ) : (
                    <div className="w-20 h-20 flex items-center justify-center bg-gray-200 text-gray-400 rounded shadow">
                      No Thumb
                    </div>
                  )}
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
              <div className="col-span-1 text-gray-600 text-xs">{formatFileSize(photo.file_size)}</div>
              <div className="col-span-2 text-gray-600">{photo.state === 'working' ? 'working' : photo.state}</div>
              <div className="col-span-2 text-gray-600">{getAccessLevel(photo.id) || '...'}</div>
              <div className="col-span-1 text-green-700 font-mono text-xs">
                {photo.hash ? <span title={photo.hash}>✔ {photo.hash.slice(-5)}</span> : '...'}
              </div>
              <div className="col-span-2 flex gap-2">
                {photo.state === 'working' && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onMoveToInprogress(photo.id);
                    }}
                    className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                  >
                    Move to Inprogress
                  </button>
                )}
                {photo.state === 'inprogress' && (
                  <>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditPhoto(photo);
                      }}
                      className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Edit
                      </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onMoveToWorking(photo.id);
                      }}
                      className="bg-yellow-500 hover:bg-yellow-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Move to Working
                    </button>
                  </>
                )}
                {/* Delete button - Available in all states */}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeletePhoto(photo.id);
                  }}
                  className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                  data-testid="photo-table-delete-btn"
                >
                  Delete
                </button>
              </div>
            </div>
            {(photo.caption || photo.description || photo.keywords) && (
              <div className="mt-2 ml-4 p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                {photo.caption && (
                  <div>
                    <span className="font-semibold">Caption:</span> {photo.caption}
                  </div>
                )}
                {photo.description && (
                  <div className="mt-1">
                    <span className="font-semibold">Description:</span> {photo.description}
                  </div>
                )}
                {photo.keywords && (
                  <div className="mt-1">
                    <span className="font-semibold">Keywords:</span> {photo.keywords}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
