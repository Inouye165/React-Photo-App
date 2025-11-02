import React from 'react';
import { API_BASE_URL } from './api.js';
import { toUrl } from './utils/toUrl.js';

// Utility: Format file size in human-readable format
function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function PhotoGallery({ 
  photos, 
  privilegesMap, 
  handleMoveToInprogress,
  handleEditPhoto,
  handleMoveToWorking, 
  handleDeletePhoto
}) {
  return (
    <div className="photo-gallery">
      {photos.map((photo) => (
        <div key={photo.id || photo.name} className="px-4 py-3 hover:bg-gray-50">
          <div className="grid grid-cols-15 gap-4 text-sm items-center">
            <div className="col-span-2">
              {photo.thumbnail ? (
                <img src={toUrl(photo.thumbnail, API_BASE_URL)} alt={photo.filename} className="max-h-20 rounded shadow bg-white" />
              ) : (
                <div className="w-20 h-20 flex items-center justify-center bg-gray-200 text-gray-400 rounded shadow">No Thumb</div>
              )}
            </div>
            <div className="col-span-2 font-medium text-gray-900 truncate">{photo.filename || photo.name}</div>
            <div className="col-span-3 text-gray-600">{(photo.metadata && (photo.metadata.DateTimeOriginal || photo.metadata.CreateDate)) || 'Unknown'}</div>
            <div className="col-span-1 text-gray-600 text-xs">{formatFileSize ? formatFileSize(photo.file_size) : ''}</div>
            <div className="col-span-2 text-gray-600">{photo.state === 'working' ? 'working' : photo.state}</div>
            <div className="col-span-2 text-gray-600">{(privilegesMap && privilegesMap[photo.id]) || '...'}</div>
            <div className="col-span-1 text-green-700 font-mono text-xs">{photo.hash ? <span title={photo.hash}>✔ {photo.hash.slice(-5)}</span> : '...'}</div>
            <div className="col-span-2 flex gap-2">
              {photo.state === 'working' && (
                <button onClick={() => handleMoveToInprogress && handleMoveToInprogress(photo.id)} className="bg-green-500 hover:bg-green-700 text-white px-2 py-1 rounded text-xs">Move to Inprogress</button>
              )}
              {photo.state === 'inprogress' && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleEditPhoto && handleEditPhoto(photo); }} className="bg-blue-500 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs">Edit</button>
                  <button onClick={(e) => { e.stopPropagation(); handleMoveToWorking && handleMoveToWorking(photo.id); }} className="bg-yellow-500 hover:bg-yellow-700 text-white px-2 py-1 rounded text-xs">Move to Working</button>
                  <button onClick={(e) => { e.stopPropagation(); if (window.confirm('Are you sure you want to delete this photo? This action cannot be undone.')) { handleDeletePhoto && handleDeletePhoto(photo.id); } }} className="bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded text-xs">Delete</button>
                </>
              )}
            </div>
          </div>
          {/* Debug: log description/keywords for each photo */}
          {/* Removed noisy console.debug for cleaner test output */}

          {photo.state === 'inprogress' && (
            (!photo.description || !photo.keywords || photo.description.trim() === '' || photo.keywords.trim() === '') ? (
              // Intentionally render nothing while AI results are pending.
              null
            ) : (
              (photo.caption || photo.description || photo.keywords) && (
                <div className="mt-2 ml-4 p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
                  {photo.caption && <div><span className="font-semibold">Caption:</span> {photo.caption}</div>}
                  {photo.description && <div className="mt-1"><span className="font-semibold">Description:</span> {photo.description}</div>}
                  {photo.keywords && <div className="mt-1"><span className="font-semibold">Keywords:</span> {photo.keywords}</div>}
                </div>
              )
            )
          )}
          {photo.state !== 'inprogress' && (photo.caption || photo.description || photo.keywords) && (
            <div className="mt-2 ml-4 p-2 bg-gray-50 rounded border border-gray-200 text-xs text-gray-700">
              {photo.caption && <div><span className="font-semibold">Caption:</span> {photo.caption}</div>}
              {photo.description && <div className="mt-1"><span className="font-semibold">Description:</span> {photo.description}</div>}
              {photo.keywords && <div className="mt-1"><span className="font-semibold">Keywords:</span> {photo.keywords}</div>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
