import React, { useState, useEffect } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL, fetchProtectedBlobUrl, revokeBlobUrl } from './api.js'
import useStore from './store.js'

export default function EditPage({ photo, onClose, onSave, onFinished }) {
  // AuthContext no longer exposes client-side token (httpOnly cookies are used).
  useAuth();
  const [caption, setCaption] = useState(photo?.caption || '')
  const [description, setDescription] = useState(photo?.description || '')
  const [keywords, setKeywords] = useState(photo?.keywords || '')
  const [textStyle, setTextStyle] = useState(photo?.textStyle || null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setCaption(photo?.caption || '')
    setDescription(photo?.description || '')
    setKeywords(photo?.keywords || '')
    setTextStyle(photo?.textStyle || null)
  }, [photo])

  // Lock background scroll while this full-page editor is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    try { 
      document.body.style.overflow = 'hidden'; 
    } catch (error) {
      console.warn('Failed to set body overflow:', error);
    }
    return () => { 
      try { 
        document.body.style.overflow = prev || ''; 
      } catch (error) {
        console.warn('Failed to restore body overflow:', error);
      }
    };
  }, []);

  // Zustand polling flags: support either a Set `pollingPhotoIds` or the legacy `pollingPhotoId`
  const pollingPhotoIds = useStore(state => state.pollingPhotoIds)
  const pollingPhotoId = useStore(state => state.pollingPhotoId)
  const isPolling = (pollingPhotoIds && pollingPhotoIds.has && pollingPhotoIds.has(photo?.id)) || pollingPhotoId === photo?.id

  const displayUrl = `${API_BASE_URL}${photo.url}`
  const [imageBlobUrl, setImageBlobUrl] = useState(null)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    if (!photo || !photo.url) return undefined
    let mounted = true
    let currentObjectUrl = null
    setFetchError(false)

    ;(async () => {
      try {
        const objUrl = await fetchProtectedBlobUrl(displayUrl)
        if (!mounted) {
          if (objUrl) revokeBlobUrl(objUrl)
          return
        }
        currentObjectUrl = objUrl
        if (objUrl) {
          setImageBlobUrl(objUrl)
        } else {
          setFetchError(true)
        }
      } catch (err) {
        console.error('Failed to fetch protected image', err)
        if (mounted) setFetchError(true)
      }
    })()

    return () => {
      mounted = false
      if (currentObjectUrl) revokeBlobUrl(currentObjectUrl)
      setImageBlobUrl(null)
    }
  }, [displayUrl, photo])

  if (!photo) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save metadata to backend
      const response = await fetch(`http://localhost:3001/photos/${photo.id}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption, description, keywords, textStyle }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to save metadata');
      }
      
      // Update local state
      const updated = { ...photo, caption, description, keywords, textStyle };
      await onSave(updated);
      
      alert('Metadata saved successfully!');
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save metadata: ' + e.message);
    } finally {
      setSaving(false)
    }
  }

  const handleCanvasSave = async (dataURL, newTextStyle) => {
    console.log('Canvas saved with caption overlay!');
    setSaving(true);
    try {
      // Save the text styling locally
      setTextStyle(newTextStyle);
      
      // Send captioned image to backend
      const response = await fetch('http://localhost:3001/save-captioned-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoId: photo.id,
          dataURL,
          caption,
          description,
          keywords,
          textStyle: newTextStyle
        }),
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to save captioned image');
      }
      
      const result = await response.json();
      console.log('Captioned image saved:', result);
      
      // Update the photo with the new text style
      const updated = { ...photo, caption, description, keywords, textStyle: newTextStyle };
      await onSave(updated);
      
      alert(`Captioned image saved to inprogress as ${result.filename}`);
    } catch (e) {
      console.error('Canvas save failed', e);
      alert('Failed to save captioned image: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="bg-white overflow-hidden flex flex-col"
      style={{
        height: '100%',
        boxSizing: 'border-box',
        borderRadius: '8px',
        border: '2px solid #4a5568',
        boxShadow: '0 2px 10px rgba(0,0,0,0.16)',
      }}
    >
      {/* Header with buttons - compact */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <h1 className="text-lg font-bold">Edit Photo — {photo.filename}</h1>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">Back</button>
          <button onClick={() => { onFinished(photo.id); }} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Mark as Finished</button>
        </div>
      </div>

      {/* 2-column layout with right side split into top/bottom panels */}
      <div className="flex-1 flex overflow-hidden" style={{ gap: '7px', padding: '7px 7px 7px 7px', backgroundColor: 'white' }}>
        {/* Left column: Interactive Canvas Editor (50%) */}
        <div className="w-1/2 rounded border overflow-hidden relative" style={{ backgroundColor: '#f5f5f5' }}>
          {/* Spinner overlay when this photo is being polled for AI results */}
          {isPolling && (
            <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center rounded z-50">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
              <span className="sr-only">Processing...</span>
            </div>
          )}
          {!imageBlobUrl && !fetchError && (
            <div className="text-center p-8">Loading image...</div>
          )}

          {fetchError && (
            <div className="text-center p-8 text-red-500">Failed to load image.</div>
          )}

          {imageBlobUrl && (
            <ImageCanvasEditor 
              imageUrl={imageBlobUrl}
              caption={caption}
              textStyle={textStyle}
              onSave={handleCanvasSave}
            />
          )}
        </div>

        {/* Right column: Split into top (metadata/form) and bottom (chat) - (50%) */}
        <div className="w-1/2 flex flex-col" style={{ gap: '7px' }}>
          {/* Top right: Metadata and form (50% of right side) */}
          <div className="h-1/2 flex flex-col p-6 overflow-y-auto overflow-x-hidden rounded border" style={{ backgroundColor: '#f5f5f5' }}>
            <div className="mb-2">
              <label className="block font-semibold mb-1 text-sm">Caption</label>
              <textarea 
                className="w-full border rounded p-2 text-sm" 
                rows={2}
                value={caption} 
                onChange={e => setCaption(e.target.value)} 
              />
            </div>
            
            <div className="mb-2">
              <label className="block font-semibold mb-1 text-sm">Description</label>
              <textarea 
                className="w-full border rounded p-2 text-sm" 
                rows={4}
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
            </div>
            
            <div className="mb-3">
              <label className="block font-semibold mb-1 text-sm">Keywords</label>
              <textarea 
                className="w-full border rounded p-2 text-sm resize-none overflow-hidden" 
                rows={2}
                value={keywords} 
                onChange={e => setKeywords(e.target.value)}
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>
            
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
            </div>
          </div>

          {/* Bottom right: Chat placeholder (50% of right side) */}
          <div className="h-1/2 flex flex-col p-6 rounded border" style={{ backgroundColor: '#f5f5f5' }}>
            <h3 className="font-semibold mb-2 text-sm">AI Chat (Coming Soon)</h3>
            <div className="flex-1 border rounded p-3 bg-white text-sm text-gray-500 flex items-center justify-center">
              Chat interface will appear here
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
