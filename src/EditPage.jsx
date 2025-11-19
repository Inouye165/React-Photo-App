import React, { useState, useEffect } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL, fetchProtectedBlobUrl, revokeBlobUrl } from './api.js'
import useStore from './store.js'
// import ModelSelect from './components/ModelSelect' // Removed unused
// import { DEFAULT_MODEL } from './config/modelCatalog' // Removed unused
import LocationMapPanel from './components/LocationMapPanel'

export default function EditPage({ photo, onClose, onSave, onRecheckAI, aiReady = true }) {
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
        padding: '32px', // Equal margin all around (floating window effect)
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
      }}
    >
      {/* Main App Window / Card */}
      <div style={{
        flex: 1,
        backgroundColor: 'white',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Apple-esque Header */}
        <header 
          className="flex-none h-16 px-6 flex items-center justify-between bg-white/80 backdrop-blur-md border-b border-slate-200/60 z-20"
          style={{
            height: '64px',
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 32px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(226, 232, 240, 0.6)'
          }}
        >
          <div className="flex-1 flex items-center justify-start" style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
            <button 
              onClick={onClose} 
              className="text-slate-500 hover:text-slate-900 transition-colors text-sm font-medium flex items-center gap-1"
              style={{ 
                background: 'none', 
                border: 'none', 
                cursor: 'pointer', 
                color: '#64748b', 
                fontSize: '14px', 
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '20px', height: '20px' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              Back
            </button>
          </div>
          
          <div className="flex-1 flex justify-center" style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <h1 
              className="text-sm font-semibold tracking-wide uppercase text-slate-800"
              style={{ 
                fontSize: '14px', 
                fontWeight: 600, 
                letterSpacing: '0.05em', 
                textTransform: 'uppercase', 
                color: '#1e293b',
                margin: 0
              }}
            >
              Edit Photo
            </h1>
          </div>

          <div className="flex-1 flex items-center justify-end gap-3" style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
            {/* AI Recheck Status Indicator */}
            <div className="flex items-center mr-2">
             {isPolling || recheckingAI ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-medium border border-amber-100">
                  <span style={{ fontSize: '12px' }}>Processing...</span>
                </div>
             ) : (
               <button
                 onClick={() => {
                    setRecheckingAI(true);
                    if (onRecheckAI) onRecheckAI(sourcePhoto?.id || photo.id, null).finally(() => setRecheckingAI(false));
                 }}
                 disabled={!aiReady}
                 style={{ 
                   background: 'none', 
                   border: 'none', 
                   cursor: aiReady ? 'pointer' : 'not-allowed', 
                   color: '#94a3b8', 
                   fontSize: '12px', 
                   fontWeight: 500 
                 }}
               >
                 Recheck AI
               </button>
             )}
            </div>

            <button 
              onClick={handleSave} 
              disabled={saving}
              className="bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-5 py-2 rounded-full shadow-sm hover:shadow transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: '#0f172a',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                padding: '8px 20px',
                borderRadius: '9999px',
                border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                opacity: saving ? 0.7 : 1,
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
              }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </header>

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