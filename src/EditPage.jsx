import React, { useState, useEffect } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL, fetchProtectedBlobUrl, revokeBlobUrl } from './api.js'
import useStore from './store.js'
import AppHeader from './components/AppHeader.jsx'
import LocationMapPanel from './components/LocationMapPanel'

export default function EditPage({ photo, onClose: _onClose, onSave, onRecheckAI, aiReady = true }) {
  // AuthContext no longer exposes client-side token (httpOnly cookies are used).
  useAuth();
  // Prefer the live photo from the global store when available so this editor
  // always displays the freshest AI-updated content. Fall back to the prop.
  const reactivePhoto = useStore(state => state.photos.find(p => String(p.id) === String(photo?.id)) || photo)
  const sourcePhoto = reactivePhoto || photo
  const setLastEditedPhotoId = useStore(state => state.setLastEditedPhotoId);

  // Track this photo as the last edited
  useEffect(() => {
    if (photo?.id) {
      setLastEditedPhotoId(photo.id);
    }
  }, [photo?.id, setLastEditedPhotoId]);

  const [caption, setCaption] = useState(sourcePhoto?.caption || '')
  const [description, setDescription] = useState(sourcePhoto?.description || '')
  const [keywords, setKeywords] = useState(sourcePhoto?.keywords || '')
  const [textStyle, setTextStyle] = useState(photo?.textStyle || null)
  const [saving, setSaving] = useState(false)
  const [recheckingAI, setRecheckingAI] = useState(false)
  // Button visual status: 'idle' | 'in-progress' | 'done' | 'error'
  // const [recheckStatus, setRecheckStatus] = useState('idle') // Removed unused
  const prevPhotoRef = React.useRef(photo)
  const doneTimeoutRef = React.useRef(null)
  // const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL) // Removed unused

  

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

  // toast logic removed

  // Use ?v=hash for cache busting. Prefer hash, fallback to updated_at if needed.
  // This ensures browsers do not show stale pixels after image bytes change.
  // If hash is unavailable, updated_at is used as a fallback (may be less reliable).
  const version = sourcePhoto?.hash || sourcePhoto?.updated_at || '';
  const displayUrl = `${API_BASE_URL}${sourcePhoto?.url || photo?.url}${version ? `?v=${version}` : ''}`;
  const [imageBlobUrl, setImageBlobUrl] = useState(null)
  const [fetchError, setFetchError] = useState(false)
  const { session } = useAuth(); // Get session to trigger re-fetch on auth change

  // Dev double-fetch guard: only fetch once per image in dev/StrictMode
  const fetchRanRef = React.useRef({});
  useEffect(() => {
    if (!sourcePhoto || !sourcePhoto.url) return undefined;
    let mounted = true;
    let currentObjectUrl = null;
    setFetchError(false);

    const key = displayUrl;
    // Reset fetch guard if URL changes
    if (fetchRanRef.current.lastUrl !== key) {
      fetchRanRef.current = { lastUrl: key };
    }
    
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
      if (currentObjectUrl) {
        revokeBlobUrl(currentObjectUrl);
      }
      setImageBlobUrl(null);
      // Reset guard for next image (safe for this use case)
      fetchRan[key] = false;
    };
  }, [displayUrl, sourcePhoto, session]);

  // Watch polling state and photo updates to change the recheck button status
  useEffect(() => {
    // If polling started for this photo, show in-progress
    if (isPolling) {
      // clear any pending done timeout
      if (doneTimeoutRef.current) {
        clearTimeout(doneTimeoutRef.current)
        doneTimeoutRef.current = null
      }
      // setRecheckStatus('in-progress')
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
      // setRecheckStatus('done')
      // show 'done' for 2.5s then switch to idle (label 'Recheck AI again')
      doneTimeoutRef.current = setTimeout(() => {
        // setRecheckStatus('idle')
        doneTimeoutRef.current = null
      }, 2500)
    } else {
      // No update observed; revert to idle
      // setRecheckStatus('idle')
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

  // toast removed: Metadata saved successfully
    } catch (e) {
      console.error('Save failed', e);
  // toast removed: Failed to save metadata
    } finally {
      setSaving(false)
    }
  }

  const handleCanvasSave = async (dataURL, newTextStyle) => {
    console.log('Canvas saved with caption overlay!');
    setSaving(true);
    try {
      setTextStyle(newTextStyle);
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

      const updated = { ...photo, caption, description, keywords, textStyle: newTextStyle };
      await onSave(updated);
  // toast removed: Captioned image saved
    } catch (e) {
      console.error('Canvas save failed', e);
  // toast removed: Failed to save captioned image
    } finally {
      setSaving(false);
    }
  }

  
  return (
    <div 
      className="fixed inset-0 z-50 font-sans text-slate-900"
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        zIndex: 9999, 
        backgroundColor: '#cbd5e1', // slate-300 for background contrast
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* Consistent App Header */}
      <AppHeader 
        rightContent={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* AI Recheck Status */}
            {isPolling || recheckingAI ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: '#fef3c7',
                color: '#d97706',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 500,
                border: '1px solid #fde68a',
              }}>
                <span>Processing...</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  setRecheckingAI(true);
                  if (onRecheckAI) onRecheckAI(sourcePhoto?.id || photo.id, null).finally(() => setRecheckingAI(false));
                }}
                disabled={!aiReady}
                style={{ 
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff',
                  cursor: aiReady ? 'pointer' : 'not-allowed', 
                  color: aiReady ? '#475569' : '#cbd5e1', 
                  fontSize: '12px', 
                  fontWeight: 500,
                  transition: 'all 0.15s ease',
                }}
              >
                Recheck AI
              </button>
            )}

            {/* Save Button */}
            <button 
              onClick={handleSave} 
              disabled={saving}
              style={{
                backgroundColor: '#0f172a',
                color: 'white',
                fontSize: '12px',
                fontWeight: 500,
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'all 0.15s ease',
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      />

      {/* Main App Window / Card */}
      <div style={{
        flex: 1,
        margin: '16px',
        marginTop: '68px', // Account for fixed 52px AppHeader + 16px spacing
        backgroundColor: 'white',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Main Content Grid */}
        <main 
          className="flex-1 overflow-hidden flex flex-col lg:flex-row"
          style={{ 
            flex: 1, 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'row' 
          }}
        >
          
          {/* Left Panel: Image Canvas (1/3 width) */}
          <div 
            className="bg-slate-100 relative flex flex-col overflow-hidden border-r border-slate-200"
            style={{ 
              flex: 1, // 1/3 of the space
              backgroundColor: '#f1f5f9',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRight: '1px solid #e2e8f0'
            }}
          >
            {!imageBlobUrl && !fetchError && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                Loading...
              </div>
            )}
            
            {fetchError && (
              <div className="absolute inset-0 flex items-center justify-center text-red-500">
                Unable to load image
              </div>
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

          {/* Right Panel: Metadata & Map (2/3 width) */}
          <div 
            className="bg-white flex flex-col h-full overflow-hidden shadow-xl z-10"
            style={{ 
              flex: 2, // 2/3 of the space
              backgroundColor: 'white',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            
            {/* Top Half: Metadata Form */}
            <div className="flex-1 overflow-y-auto p-6 min-h-0" style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
              <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', margin: '0 auto' }}>
                
                {/* Caption Field */}
                <div className="group">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Caption</label>
                  <textarea
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 outline-none focus:border-blue-500"
                    style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', fontSize: '16px', color: '#334155', outline: 'none', resize: 'none' }}
                    placeholder="Write a caption..."
                  />
                </div>

                {/* Description Field */}
                <div className="group">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={6}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 outline-none focus:border-blue-500"
                    style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '16px', fontSize: '16px', color: '#334155', outline: 'none', resize: 'none' }}
                    placeholder="Add a detailed description..."
                  />
                </div>

                {/* Keywords Field */}
                <div className="group">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1" style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Keywords</label>
                  <input
                    type="text"
                    value={keywords}
                    onChange={e => setKeywords(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-500"
                    style={{ width: '100%', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px 16px', fontSize: '16px', color: '#334155', outline: 'none' }}
                    placeholder="nature, landscape, memory..."
                  />
                </div>

              </div>
            </div>

            {/* Bottom Half: Map (Fixed height) */}
            <div className="h-64 flex-none border-t border-slate-100 bg-slate-50 p-4" style={{ height: '300px', flex: 'none', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', padding: '24px' }}>
               <div className="h-full w-full rounded-xl overflow-hidden shadow-sm border border-slate-200/60 relative" style={{ height: '100%', width: '100%', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(226, 232, 240, 0.6)', position: 'relative' }}>
                  <LocationMapPanel photo={sourcePhoto} />
               </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}