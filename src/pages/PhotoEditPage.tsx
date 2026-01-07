import { useEffect } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import EditPage from '../EditPage'
import useStore from '../store'
import { aiPollDebug } from '../utils/aiPollDebug'
import type { Photo } from '../types/photo'

type MainLayoutOutletContext = {
  aiDependenciesReady: boolean
  setToolbarMessage: (message: string) => void
  toolbarMessage: string
}

type CollectibleOverride = {
  id: string
  category?: string
  fields?: Record<string, unknown>
  confirmedBy?: string
}

type RecheckAiOptions = {
  collectibleOverride?: CollectibleOverride
  isHumanOverride?: boolean
  [key: string]: unknown
}

/**
 * PhotoEditPage - Route component for editing a photo (/photos/:id/edit)
 * Reads photo ID from URL params and displays the full-page editor
 */
export default function PhotoEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { aiDependenciesReady } = useOutletContext<MainLayoutOutletContext>()

  // Get photo data and handlers from store
  const photos = useStore((state) => state.photos)
  const setBanner = useStore((state) => state.setBanner)
  const setEditingMode = useStore((state) => state.setEditingMode)
  const setActivePhotoId = useStore((state) => state.setActivePhotoId)
  const pollingPhotoIds = useStore((state) => state.pollingPhotoIds)

  const photo = photos.find((p) => String(p.id) === String(id))

  useEffect(() => {
    aiPollDebug('ui_photoEditPage_snapshot', {
      photoId: photo?.id ?? id ?? null,
      photoState: photo?.state ?? null,
      isPolling: Boolean(photo?.id && pollingPhotoIds?.has?.(photo.id)),
      derivedLabel:
        photo?.state === 'inprogress' ? 'Analyzing...' : photo?.state === 'finished' ? 'Done' : photo?.state ?? 'Unknown',
    })
  }, [photo?.id, photo?.state, id, pollingPhotoIds])

  const handleClose = () => {
    setEditingMode(null)
    // Navigate back to gallery or detail view
    navigate('/')
  }

  const handleSave = async (updated: Photo) => {
    console.log('[PhotoEditPage] handleSave called', {
      photoId: updated.id,
      hasCaption: Boolean(updated.caption),
      hasDescription: Boolean(updated.description),
      timestamp: new Date().toISOString(),
    })

    const store = useStore.getState()
    const next = (store.photos || []).map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
    store.setPhotos(next)

    setEditingMode(null)
    setActivePhotoId(updated.id)
    // Stay on the edit page after saving (no navigation needed)
    // User can manually navigate away when done
  }

  const handleRecheckAI = async (photoId: Photo['id'], model: string | null, options: RecheckAiOptions = {}) => {
    console.log('[PhotoEditPage] handleRecheckAI called', {
      photoId,
      model,
      options,
      isHumanOverride: Boolean(options.isHumanOverride),
      timestamp: new Date().toISOString(),
    })

    if (!aiDependenciesReady) {
      setBanner({
        message: 'AI services unavailable. Start required Docker containers to re-enable processing.',
        severity: 'warning',
      })
      return
    }

    try {
      const { recheckPhotoAI } = await import('../api')
      await recheckPhotoAI(photoId, model, options as any)
      setBanner({ message: 'AI recheck initiated. Polling for results...', severity: 'info' })
      useStore.getState().startAiPolling(photoId)
    } catch (error) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : String(error)
      setBanner({ message: `AI recheck failed: ${message || 'unknown'}`, severity: 'error' })
      throw error
    }
  }

  if (!photo) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-700">Photo not found</h2>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Return to Gallery
        </button>
      </div>
    )
  }

  return (
    <EditPage
      key={`${photo.id}:${photo.caption || ''}`}
      photo={photo}
      onClose={handleClose}
      onSave={handleSave}
      onRecheckAI={handleRecheckAI}
      aiReady={aiDependenciesReady}
    />
  )
}
