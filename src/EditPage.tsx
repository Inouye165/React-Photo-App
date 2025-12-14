import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { API_BASE_URL } from './api.js'
import useStore from './store.js'
import AppHeader from './components/AppHeader.jsx'
import { useProtectedImageBlobUrl } from './hooks/useProtectedImageBlobUrl.js'
import { useLockBodyScroll } from './hooks/useLockBodyScroll.js'
import { COLLECTIBLES_UI_ENABLED } from './config/featureFlags'
import { useCollectiblesForPhoto } from './hooks/useCollectiblesForPhoto'
import { useAiRecheckForPhoto } from './hooks/useAiRecheckForPhoto'
import EditPageShell from './components/edit/EditPageShell'
import EditHeaderActions from './components/edit/EditHeaderActions'
import EditTabs from './components/edit/EditTabs'
import StoryTabPanel from './components/edit/StoryTabPanel'
import LocationTabPanel from './components/edit/LocationTabPanel'
import PhotoStackPanel from './components/edit/PhotoStackPanel'
import CollectiblesTabPanel from './components/edit/CollectiblesTabPanel'
import type { Photo, TextStyle } from './types/photo'

interface EditPageProps {
  photo: Photo;
  onClose?: () => void;
  onSave: (photo: Photo) => Promise<void>;
  onRecheckAI?: (photoId: number | string, model: string | null) => Promise<void>;
  aiReady?: boolean;
}

export default function EditPage({ photo, onClose: _onClose, onSave, onRecheckAI, aiReady = true }: EditPageProps) {
  // AuthContext no longer exposes client-side token (httpOnly cookies are used).
  const authContext = useAuth();
  const session = authContext?.session || null;
  
  // Prefer the live photo from the global store when available so this editor
  // always displays the freshest AI-updated content. Fall back to the prop.
  const reactivePhoto = useStore(state => state.photos.find((p: Photo) => String(p.id) === String(photo?.id)) || photo)
  const sourcePhoto = reactivePhoto || photo
  const setLastEditedPhotoId = useStore(state => state.setLastEditedPhotoId);

  // Track this photo as the last edited
  useEffect(() => {
    if (photo?.id) {
      setLastEditedPhotoId(photo.id);
    }
  }, [photo?.id, setLastEditedPhotoId]);

  const [caption, setCaption] = useState<string>(sourcePhoto?.caption || '')
  const [description, setDescription] = useState<string>(sourcePhoto?.description || '')
  const [keywords, setKeywords] = useState<string>(sourcePhoto?.keywords || '')
  const [textStyle, setTextStyle] = useState<TextStyle | null>(photo?.textStyle || null)
  const [saving, setSaving] = useState<boolean>(false)
  const [isFlipped, setIsFlipped] = useState<boolean>(false) // Flip card state

  // === Collectibles Tab State (via hook) ===
  const [activeTab, setActiveTab] = useState<'story' | 'location' | 'collectibles'>('story');
  const {
    collectibleData,
    collectibleLoading,
    collectibleViewMode,
    collectibleFormState,
    isCollectiblePhoto,
    hasCollectibleData,
    collectibleAiAnalysis,
    showCollectiblesTab,
    setCollectibleViewMode,
    handleCollectibleChange,
    saveCollectible,
  } = useCollectiblesForPhoto({ photo: sourcePhoto, enabled: COLLECTIBLES_UI_ENABLED });

  // === AI Recheck + Polling Logic (Phase 3: extracted to hook) ===
  const { isPolling, recheckingAI, handleRecheckAi } = useAiRecheckForPhoto({
    photoId: sourcePhoto?.id || photo.id,
    aiReady,
    onRecheckAI,
    sourcePhoto,
    onAiUpdateDetected: (updates) => {
      // Apply AI-generated updates to form state
      if (updates.caption !== undefined) setCaption(updates.caption)
      if (updates.description !== undefined) setDescription(updates.description)
      if (updates.keywords !== undefined) setKeywords(updates.keywords)
    },
  });

  

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
  useLockBodyScroll(true)

  // toast logic removed

  // Use ?v=hash for cache busting. Prefer hash, fallback to updated_at if needed.
  // This ensures browsers do not show stale pixels after image bytes change.
  // If hash is unavailable, updated_at is used as a fallback (may be less reliable).
  const version = sourcePhoto?.hash || sourcePhoto?.updated_at || '';
  const displayUrl = `${API_BASE_URL}${sourcePhoto?.url || photo?.url}${version ? `?v=${version}` : ''}`;

  // Preserve previous gating behavior: only start blob fetching when the live
  // `sourcePhoto.url` exists (even if `photo.url` is present as a fallback).
  const gatedDisplayUrl = sourcePhoto?.url ? displayUrl : null

  const { imageBlobUrl, fetchError, isLoading, retry } = useProtectedImageBlobUrl(gatedDisplayUrl, {
    // Maintain prior parity: session was part of the effect dependency list.
    deps: [session],
  })

  // AI polling watch effects removed (Phase 3: moved to useAiRecheckForPhoto hook)

  if (!sourcePhoto) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save metadata to backend
      const response = await fetch(`${API_BASE_URL}/photos/${photo.id}/metadata`, {
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
          console.warn('[EditPage] Collectible save failed (non-blocking):', (collectibleErr as Error).message);
        }
      }

      // Update local state
      const updated: Photo = { ...photo, caption, description, keywords, textStyle };
      await onSave(updated);

  // toast removed: Metadata saved successfully
    } catch (e) {
      console.error('Save failed', e);
  // toast removed: Failed to save metadata
    } finally {
      setSaving(false)
    }
  }

  const handleCanvasSave = async (dataURL: string, newTextStyle: TextStyle) => {
    console.log('Canvas saved with caption overlay!');
    setSaving(true);
    try {
      setTextStyle(newTextStyle);
      const response = await fetch(`${API_BASE_URL}/save-captioned-image`, {
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

      const updated: Photo = { ...photo, caption, description, keywords, textStyle: newTextStyle };
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
    <EditPageShell>
      {/* Consistent App Header */}
      <AppHeader 
        rightContent={
          <EditHeaderActions
            isPolling={isPolling}
            recheckingAI={recheckingAI}
            aiReady={aiReady}
            saving={saving}
            onRecheckClick={handleRecheckAi}
            onSaveClick={handleSave}
          />
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
        >
          
          {/* ========================================
              LEFT COLUMN: Caption + Flip Card (Photo Stack)
              ======================================== */}
          <PhotoStackPanel
            caption={caption}
            onCaptionChange={setCaption}
            isFlipped={isFlipped}
            onFlip={() => setIsFlipped(!isFlipped)}
            imageBlobUrl={imageBlobUrl}
            isLoading={isLoading}
            fetchError={fetchError}
            onRetry={retry}
            textStyle={textStyle}
            onCanvasSave={handleCanvasSave}
            keywords={keywords}
            onKeywordsChange={setKeywords}
            photo={sourcePhoto}
          />

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
            <EditTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showCollectiblesTab={showCollectiblesTab || COLLECTIBLES_UI_ENABLED}
              isCollectiblePhoto={isCollectiblePhoto}
              hasCollectibleData={hasCollectibleData}
            />

            {/* Tab Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Story Tab */}
              {activeTab === 'story' && (
                <StoryTabPanel
                  description={description}
                  onDescriptionChange={setDescription}
                />
              )}

              {/* Location Tab */}
              {activeTab === 'location' && (
                <LocationTabPanel photo={sourcePhoto} />
              )}

              {/* Collectibles Tab */}
              {activeTab === 'collectibles' && COLLECTIBLES_UI_ENABLED && (
                <CollectiblesTabPanel
                  photo={sourcePhoto}
                  collectibleData={collectibleData}
                  collectibleLoading={collectibleLoading}
                  collectibleViewMode={collectibleViewMode}
                  collectibleFormState={collectibleFormState}
                  collectibleAiAnalysis={collectibleAiAnalysis}
                  isCollectiblePhoto={isCollectiblePhoto}
                  hasCollectibleData={hasCollectibleData}
                  onViewModeChange={setCollectibleViewMode}
                  onCollectibleChange={handleCollectibleChange}
                />
              )}
            </div>

          </div>
        </main>
      </div>
    </EditPageShell>
  )
}
