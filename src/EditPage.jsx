import React, { useState, useEffect } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL, fetchProtectedBlobUrl, revokeBlobUrl } from './api.js'
import useStore from './store.js'
import ModelSelect from './components/ModelSelect'
import { DEFAULT_MODEL } from './config/modelCatalog'

export default function EditPage({ photo, onClose, onSave, onFinished, onRecheckAI, setToast }) {
  // AuthContext no longer exposes client-side token (httpOnly cookies are used).
  useAuth();
  // Prefer the live photo from the global store when available so this editor
  // always displays the freshest AI-updated content. Fall back to the prop.
  const reactivePhoto = useStore(state => state.photos.find(p => String(p.id) === String(photo?.id)) || photo)
  const sourcePhoto = reactivePhoto || photo

  const [caption, setCaption] = useState(sourcePhoto?.caption || '')
  const [description, setDescription] = useState(sourcePhoto?.description || '')
  const [keywords, setKeywords] = useState(sourcePhoto?.keywords || '')
  const [textStyle, setTextStyle] = useState(photo?.textStyle || null)
  const [saving, setSaving] = useState(false)
  const [recheckingAI, setRecheckingAI] = useState(false)
  // Button visual status: 'idle' | 'in-progress' | 'done' | 'error'
  const [recheckStatus, setRecheckStatus] = useState('idle')
  const prevPhotoRef = React.useRef(photo)
  const doneTimeoutRef = React.useRef(null)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)

  

  // Keep the editor fields in sync with the incoming photo prop.
  // CRITICAL DEBUG LOG: Confirms prop is reactive and update is running
  useEffect(() => {
    console.debug('[EditPage SYNC] Photo source updated. New Caption:', (sourcePhoto || photo)?.caption, 'New ID:', (sourcePhoto || photo)?.id);

    const latest = sourcePhoto || photo
    setCaption(latest?.caption || '')
    setDescription(latest?.description || '')
    setKeywords(latest?.keywords || '')
    setTextStyle(latest?.textStyle || null)

    // Note: Include all setters in the dependency array if your linter complains,
    // but for this photo-sync hook, only the reactive photo references are required for the intended behavior.
  }, [photo, sourcePhoto])

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
  const isPolling = (pollingPhotoIds && pollingPhotoIds.has && pollingPhotoIds.has(sourcePhoto?.id)) || pollingPhotoId === sourcePhoto?.id

  // Prefer the setToast passed from parent (App) but fall back to store if not provided
  const storeSetToast = useStore(state => state.setToast)
  const toast = typeof setToast === 'function' ? setToast : storeSetToast

  // Use ?v=hash for cache busting. Prefer hash, fallback to updated_at if needed.
  // This ensures browsers do not show stale pixels after image bytes change.
  // If hash is unavailable, updated_at is used as a fallback (may be less reliable).
  const version = sourcePhoto?.hash || sourcePhoto?.updated_at || '';
  const displayUrl = `${API_BASE_URL}${sourcePhoto?.url || photo?.url}${version ? `?v=${version}` : ''}`;
  const [imageBlobUrl, setImageBlobUrl] = useState(null)
  const [fetchError, setFetchError] = useState(false)

  // Dev double-fetch guard: only fetch once per image in dev/StrictMode
  const fetchRanRef = React.useRef({});
  useEffect(() => {
    if (!sourcePhoto || !sourcePhoto.url) return undefined;
    let mounted = true;
    let currentObjectUrl = null;
    setFetchError(false);

    const key = displayUrl;
    const fetchRan = fetchRanRef.current; // Capture ref value in effect scope
    if (fetchRan[key]) {
      if (import.meta.env.VITE_DEBUG_IMAGES === 'true') {
        console.log('[DEBUG_IMAGES] Skipping duplicate fetch for', key);
      }
      return;
    }
    fetchRan[key] = true;
    if (import.meta.env.VITE_DEBUG_IMAGES === 'true') {
      console.log('[DEBUG_IMAGES] Fetching image for', key);
    }

    (async () => {
      try {
        const objUrl = await fetchProtectedBlobUrl(displayUrl);
        if (!mounted) {
          if (objUrl) revokeBlobUrl(objUrl);
          return;
        }
        currentObjectUrl = objUrl;
        if (objUrl) {
          setImageBlobUrl(objUrl);
        } else {
          setFetchError(true);
        }
      } catch (err) {
        console.error('Failed to fetch protected image', err);
        if (mounted) setFetchError(true);
      }
    })();

    return () => {
      mounted = false;
      if (currentObjectUrl) revokeBlobUrl(currentObjectUrl);
      setImageBlobUrl(null);
      // Reset guard for next image (safe for this use case)
      fetchRan[key] = false;
    };
  }, [displayUrl, sourcePhoto]);

  // Watch polling state and photo updates to change the recheck button status
  useEffect(() => {
    // If polling started for this photo, show in-progress
    if (isPolling) {
      // clear any pending done timeout
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current)
        doneTimeoutRef.current = null
      }
      setRecheckStatus('in-progress')
      return
    }
    // polling stopped; if previously was polling, determine if AI updated the photo
    const prev = prevPhotoRef.current
    if (prev && (prev.caption !== sourcePhoto?.caption || prev.description !== sourcePhoto?.description || prev.keywords !== sourcePhoto?.keywords)) {
      // AI updated fields -> update form fields immediately then mark done briefly
      // Force form to reflect latest AI-generated values from the photo prop
      try {
        setCaption(sourcePhoto?.caption || '')
        setDescription(sourcePhoto?.description || '')
        setKeywords(sourcePhoto?.keywords || '')
      } catch {
        // swallow errors from missing values
      }
      setRecheckStatus('done')
      // show 'done' for 2.5s then switch to idle (label 'Recheck AI again')
      doneTimeoutRef.current = setTimeout(() => {
        setRecheckStatus('idle')
        doneTimeoutRef.current = null
      }, 2500)
    } else {
      // No update observed; revert to idle
      setRecheckStatus('idle')
    }
  }, [isPolling, sourcePhoto])

  
  
  // Keep previous photo for comparison when prop changes
  useEffect(() => {
    prevPhotoRef.current = sourcePhoto
    return () => {
      // clear timeout on unmount
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current)
        doneTimeoutRef.current = null
      }
    }
  }, [sourcePhoto])

  if (!sourcePhoto) return null

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

      toast({ message: 'Metadata saved successfully!', severity: 'success' });
    } catch (e) {
      console.error('Save failed', e);
      toast({ message: 'Failed to save metadata: ' + e.message, severity: 'error' });
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
      
      toast({ message: `Captioned image saved to inprogress as ${result.filename}`, severity: 'success' });
    } catch (e) {
      console.error('Canvas save failed', e);
      toast({ message: 'Failed to save captioned image: ' + e.message, severity: 'error' });
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
  <h1 className="text-lg font-bold">Edit Photo — {sourcePhoto?.filename || photo?.filename}</h1>
        <div className="flex gap-2">
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300">Back</button>
          <div className="relative inline-block">
            <button
              onClick={async () => {
                try {
                  // immediate visual change
                  setRecheckStatus('in-progress')
                  setRecheckingAI(true)
                  if (typeof onRecheckAI === 'function') {
                    // Explicitly pass photo id and null model to request default (cheaper) model
                    await onRecheckAI(sourcePhoto?.id || photo.id, null)
                    toast({ message: 'AI recheck started.', severity: 'info' })
                  } else {
                    toast({ message: 'Recheck handler not available', severity: 'warning' })
                  }
                } catch (err) {
                  console.error('Recheck failed', err)
                  setRecheckStatus('error')
                  toast({ message: 'AI recheck failed: ' + (err && err.message ? err.message : err), severity: 'error' })
                } finally {
                  setRecheckingAI(false)
                }
              }}
              disabled={recheckingAI || isPolling}
              className={
                'px-3 py-1 text-sm rounded disabled:opacity-50 ' + (
                  recheckStatus === 'in-progress' ? 'bg-yellow-500 text-black hover:bg-yellow-600' :
                  recheckStatus === 'done' ? 'bg-green-600 text-white hover:bg-green-700' :
                  recheckStatus === 'error' ? 'bg-red-600 text-white hover:bg-red-700' :
                  'bg-green-600 text-white hover:bg-green-700'
                )
              }
            >
              {recheckingAI || recheckStatus === 'in-progress' ? 'Rechecking...' : (recheckStatus === 'done' ? 'Done' : (recheckStatus === 'error' ? 'Error - Retry' : 'Recheck AI'))}
            </button>
            <button
              onClick={() => {
                const model = selectedModel || DEFAULT_MODEL
                try {
                  if (typeof onRecheckAI === 'function') onRecheckAI(sourcePhoto?.id || photo.id, model);
                } catch (err) {
                  console.warn('recheck failed', err);
                }
              }}
              title="Recheck with selected model"
              className="ml-1 px-2 py-1 bg-purple-700 text-white rounded text-sm"
            >
              ▾
            </button>
            <div className="ml-2">
              <ModelSelect value={selectedModel} onChange={setSelectedModel} compact />
            </div>
          </div>
          <button onClick={() => { onFinished(sourcePhoto?.id || photo.id); }} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">Mark as Finished</button>
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
          <div
            className="h-1/2 flex flex-col p-6 overflow-hidden rounded border"
            style={{ backgroundColor: '#f5f5f5', minHeight: 0 }}
          >
            <div className="mb-2">
              <label className="block font-semibold mb-1 text-sm">Caption</label>
              <textarea
                className="w-full border rounded p-2 text-sm"
                rows={2}
                value={caption}
                onChange={e => setCaption(e.target.value)}
              />
            </div>

            <div className="mb-2 flex-1 min-h-0" style={{ display: 'flex', flexDirection: 'column' }}>
              <label className="block font-semibold mb-1 text-sm">Description</label>
              <textarea
                className="w-full border rounded p-2 text-sm flex-1 min-h-0"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ resize: 'vertical', overflow: 'auto', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>

            <div className="mb-3">
              <label className="block font-semibold mb-1 text-sm">Keywords</label>
              <textarea
                className="w-full border rounded p-2 text-sm resize-none overflow-hidden"
                rows={1}
                value={keywords}
                onChange={e => setKeywords(e.target.value)}
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
              />
            </div>

            <div className="flex gap-2 mt-auto">
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
