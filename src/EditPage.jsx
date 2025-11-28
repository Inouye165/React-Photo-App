import React, { useState, useEffect, useCallback, useRef } from 'react'
import ImageCanvasEditor from './ImageCanvasEditor'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL, fetchProtectedBlobUrl, revokeBlobUrl, fetchCollectibles, upsertCollectible } from './api.js'
import useStore from './store.js'
import AppHeader from './components/AppHeader.jsx'
import LocationMapPanel from './components/LocationMapPanel'
import FlipCard from './components/FlipCard'
import PhotoMetadataBack from './components/PhotoMetadataBack'
import CollectibleEditorPanel from './components/CollectibleEditorPanel.jsx'

// Feature flag for collectibles UI
const COLLECTIBLES_UI_ENABLED = import.meta.env.VITE_ENABLE_COLLECTIBLES_UI === 'true';

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
  const [isFlipped, setIsFlipped] = useState(false) // Flip card state
  // Button visual status: 'idle' | 'in-progress' | 'done' | 'error'
  // const [recheckStatus, setRecheckStatus] = useState('idle') // Removed unused
  const prevPhotoRef = useRef(photo)
  const doneTimeoutRef = useRef(null)
  // const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL) // Removed unused

  // === Collectibles Tab State ===
  const [activeTab, setActiveTab] = useState('story'); // 'story' | 'location' | 'collectibles'
  const [collectibleData, setCollectibleData] = useState(null);
  const [collectibleFormState, setCollectibleFormState] = useState(null);
  const [collectibleLoading, setCollectibleLoading] = useState(false);
  const collectibleFetchedRef = useRef(false);

  // Check if photo is classified as a collectible or has existing collectible data
  const isCollectiblePhoto = sourcePhoto?.ai_analysis?.classification === 'collectables' || 
                              sourcePhoto?.ai_analysis?.classification === 'collectible' ||
                              sourcePhoto?.classification === 'collectables' ||
                              sourcePhoto?.classification === 'collectible';
  const hasCollectibleData = collectibleData !== null;
  const showCollectiblesTab = COLLECTIBLES_UI_ENABLED && (isCollectiblePhoto || hasCollectibleData);

  // Extract AI analysis for collectibles from photo data
  const collectibleAiAnalysis = sourcePhoto?.ai_analysis?.collectibleInsights || 
                                 sourcePhoto?.collectible_insights || null;

  // Load existing collectible data when photo changes
  useEffect(() => {
    if (!COLLECTIBLES_UI_ENABLED || !sourcePhoto?.id || collectibleFetchedRef.current) return;
    
    const loadCollectibleData = async () => {
      setCollectibleLoading(true);
      try {
        const collectibles = await fetchCollectibles(sourcePhoto.id);
        if (collectibles && collectibles.length > 0) {
          setCollectibleData(collectibles[0]); // Use first collectible for this photo
        }
      } catch (err) {
        console.debug('[EditPage] No collectible data found:', err.message);
      } finally {
        setCollectibleLoading(false);
        collectibleFetchedRef.current = true;
      }
    };
    
    loadCollectibleData();
  }, [sourcePhoto?.id]);

  // Reset collectible fetch flag when photo changes
  useEffect(() => {
    collectibleFetchedRef.current = false;
  }, [photo?.id]);

  // Handle collectible form state changes
  const handleCollectibleChange = useCallback((formState) => {
    setCollectibleFormState(formState);
  }, []);

  // Save collectible data
  const saveCollectible = useCallback(async () => {
    if (!collectibleFormState || !sourcePhoto?.id) return;
    
    try {
      const result = await upsertCollectible(sourcePhoto.id, {
        formState: {
          category: collectibleFormState.category,
          name: collectibleFormState.name,
          conditionLabel: collectibleFormState.conditionLabel,
          valueMin: collectibleFormState.valueMin,
          valueMax: collectibleFormState.valueMax,
          specifics: collectibleFormState.specifics
        }
      }, { recordAi: true });
      
      setCollectibleData(result);
      return result;
    } catch (err) {
      console.error('[EditPage] Failed to save collectible:', err);
      throw err;
    }
  }, [collectibleFormState, sourcePhoto?.id]);

  

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

      // Save collectible data if present
      if (COLLECTIBLES_UI_ENABLED && collectibleFormState) {
        try {
          await saveCollectible();
        } catch (collectibleErr) {
          console.warn('[EditPage] Collectible save failed (non-blocking):', collectibleErr.message);
        }
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
          
          {/* ========================================
              LEFT COLUMN: Caption + Flip Card (Photo Stack)
              ======================================== */}
          <div 
            className="bg-slate-100 relative flex flex-col overflow-hidden border-r border-slate-200"
            style={{ 
              flex: 1,
              backgroundColor: '#f1f5f9',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              borderRight: '1px solid #e2e8f0',
              padding: '20px',
            }}
          >
            {/* Caption Input - Above the Photo (styled as header) */}
            <div style={{ marginBottom: '16px', flexShrink: 0 }}>
              <input
                type="text"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                placeholder="Add a caption..."
                style={{
                  width: '100%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid transparent',
                  padding: '8px 4px',
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  color: '#1e293b',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s ease',
                }}
                onFocus={(e) => {
                  e.target.style.borderBottomColor = '#3b82f6';
                }}
                onBlur={(e) => {
                  e.target.style.borderBottomColor = 'transparent';
                }}
              />
            </div>

            {/* Flip Card Container - Photo / Metadata */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <FlipCard
                isFlipped={isFlipped}
                onFlip={() => setIsFlipped(!isFlipped)}
                frontContent={
                  /* Front Face: Photo with Burn Caption functionality */
                  <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    backgroundColor: '#0f172a',
                    position: 'relative',
                  }}>
                    {!imageBlobUrl && !fetchError && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#94a3b8',
                      }}>
                        Loading...
                      </div>
                    )}
                    
                    {fetchError && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ef4444',
                      }}>
                        Unable to load image
                      </div>
                    )}

                    {imageBlobUrl && (
                      <ImageCanvasEditor 
                        imageUrl={imageBlobUrl}
                        caption={caption}
                        textStyle={textStyle}
                        onSave={handleCanvasSave}
                        isFlipped={isFlipped}
                        onFlip={() => setIsFlipped(!isFlipped)}
                      />
                    )}
                  </div>
                }
                backContent={
                  /* Back Face: Keywords + Technical Metadata */
                  <PhotoMetadataBack
                    keywords={keywords}
                    onKeywordsChange={setKeywords}
                    photo={sourcePhoto}
                  />
                }
              />
            </div>
          </div>

          {/* ========================================
              RIGHT COLUMN: Tabbed Interface (Story / Location / Collectibles)
              ======================================== */}
          <div 
            className="bg-white flex flex-col h-full overflow-hidden shadow-xl z-10"
            style={{ 
              flex: 1, // Equal width columns
              backgroundColor: 'white',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden'
            }}
          >
            {/* Tab Navigation */}
            <div 
              style={{
                display: 'flex',
                borderBottom: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setActiveTab('story')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: activeTab === 'story' ? 600 : 500,
                  color: activeTab === 'story' ? '#1e293b' : '#64748b',
                  backgroundColor: activeTab === 'story' ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'story' ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Story
              </button>
              <button
                onClick={() => setActiveTab('location')}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: '13px',
                  fontWeight: activeTab === 'location' ? 600 : 500,
                  color: activeTab === 'location' ? '#1e293b' : '#64748b',
                  backgroundColor: activeTab === 'location' ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderBottom: activeTab === 'location' ? '2px solid #3b82f6' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Location
              </button>
              {(showCollectiblesTab || COLLECTIBLES_UI_ENABLED) && (
                <button
                  onClick={() => setActiveTab('collectibles')}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: activeTab === 'collectibles' ? 600 : 500,
                    color: activeTab === 'collectibles' ? '#1e293b' : '#64748b',
                    backgroundColor: activeTab === 'collectibles' ? '#ffffff' : 'transparent',
                    border: 'none',
                    borderBottom: activeTab === 'collectibles' ? '2px solid #3b82f6' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                >
                  Collectibles
                  {isCollectiblePhoto && !hasCollectibleData && (
                    <span style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '8px',
                      height: '8px',
                      backgroundColor: '#f59e0b',
                      borderRadius: '50%',
                    }} title="AI detected collectible" />
                  )}
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Story Tab */}
              {activeTab === 'story' && (
                <div 
                  className="flex-1 overflow-y-auto p-6 min-h-0" 
                  style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    height: '100%',
                  }}>
                    <label 
                      style={{ 
                        display: 'block', 
                        fontSize: '11px', 
                        fontWeight: 700, 
                        color: '#94a3b8', 
                        textTransform: 'uppercase', 
                        letterSpacing: '0.05em', 
                        marginBottom: '12px',
                      }}
                    >
                      Photo Story
                    </label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-700 outline-none focus:border-blue-500"
                      style={{ 
                        flex: 1,
                        width: '100%', 
                        backgroundColor: '#f8fafc', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '16px', 
                        padding: '16px', 
                        fontSize: '15px', 
                        lineHeight: '1.6',
                        color: '#334155', 
                        outline: 'none', 
                        resize: 'none',
                        minHeight: '200px',
                      }}
                      placeholder="Tell the story behind this photo... What were you doing? Who was there? What made this moment special?"
                    />
                  </div>
                </div>
              )}

              {/* Location Tab */}
              {activeTab === 'location' && (
                <div 
                  className="flex-1 bg-slate-50 p-4" 
                  style={{ 
                    flex: 1,
                    backgroundColor: '#f8fafc', 
                    padding: '20px',
                  }}
                >
                  <div 
                    style={{ 
                      height: '100%', 
                      width: '100%', 
                      borderRadius: '16px', 
                      overflow: 'hidden', 
                      border: '1px solid rgba(226, 232, 240, 0.6)', 
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <LocationMapPanel photo={sourcePhoto} />
                  </div>
                </div>
              )}

              {/* Collectibles Tab */}
              {activeTab === 'collectibles' && COLLECTIBLES_UI_ENABLED && (
                <div 
                  className="flex-1 overflow-y-auto p-4" 
                  style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    padding: '16px',
                  }}
                >
                  {collectibleLoading ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '200px',
                      color: '#64748b',
                    }}>
                      Loading collectible data...
                    </div>
                  ) : (
                    <CollectibleEditorPanel
                      photoId={sourcePhoto.id}
                      aiAnalysis={collectibleAiAnalysis}
                      initialData={collectibleData}
                      onChange={handleCollectibleChange}
                    />
                  )}
                  {!isCollectiblePhoto && !hasCollectibleData && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#64748b',
                    }}>
                      <strong>Tip:</strong> Add collectible details to track estimated values and condition. 
                      This data will be saved when you click "Save Changes".
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}