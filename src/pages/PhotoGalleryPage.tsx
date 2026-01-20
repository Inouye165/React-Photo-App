import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import PhotoGallery from '../PhotoGallery'
import PhotoUploadForm from '../PhotoUploadForm.tsx'
import MetadataModal from '../components/MetadataModal.jsx'
import type { PhotoCardProps } from '../components/PhotoCard'
import usePhotoPrivileges from '../hooks/usePhotoPrivileges'
import type { PhotoPrivilegePhoto } from '../hooks/usePhotoPrivileges'
import useLocalPhotoPicker from '../hooks/useLocalPhotoPicker'
import usePhotoManagement from '../hooks/usePhotoManagement'
import useIntersectionObserver from '../hooks/useIntersectionObserver'
import useStore from '../store'
import { useAuth } from '../contexts/AuthContext'
import useSignedThumbnails from '../hooks/useSignedThumbnails'
import type { Photo } from '../types/photo'

type StatusFilter = 'all' | 'finished' | 'inprogress' | 'error'
type SortOrder = 'newest' | 'oldest' | 'name'
type Density = 'comfortable' | 'compact'

type OutletCtx = {
  setToolbarMessage: (message: string) => void
}

type PhotoCardPhoto = PhotoCardProps['photo']

/**
 * PhotoGalleryPage - Main gallery view showing the photo card grid
 * Route: /gallery
 */
export default function PhotoGalleryPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setToolbarMessage } = useOutletContext<OutletCtx>()
  const { session } = useAuth()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [density, setDensity] = useState<Density>('comfortable')

  const setBanner = useStore((state) => state.setBanner)
  const showMetadataModal = useStore((state) => state.showMetadataModal)
  const metadataPhoto = useStore((state) => state.metadataPhoto)
  const setShowMetadataModal = useStore((state) => state.setShowMetadataModal)
  const setMetadataPhoto = useStore((state) => state.setMetadataPhoto)
  const showLocalPicker = useStore((state) => state.uploadPicker.status !== 'closed')
  const pendingUploads = useStore((state) => state.pendingUploads)

  // If we navigated here from an optimistic upload redirect (e.g., /upload → /gallery),
  // make sure the picker is forced closed so it doesn't re-open/redraw unexpectedly.
  useEffect(() => {
    if (!location?.state || typeof location.state !== 'object') return
    const state = location.state as { suppressUploadPicker?: unknown }
    if (!state.suppressUploadPicker) return

    try {
      useStore.getState().pickerCommand?.closePicker?.('nav-suppress')
    } catch {
      /* no-op */
    }
    // Clear the one-time flag to avoid affecting back/forward navigation.
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [location.state, location.pathname, location.search, navigate])

  const {
    photos,
    loading,
    loadingMore,
    photosHasMore,
    loadMorePhotos,
    pollingPhotoId,
    pollingPhotoIds,
    refreshPhotos,
    handleDeletePhoto,
  } = usePhotoManagement()

  const galleryPhotos: PhotoCardPhoto[] = useMemo(() => {
    const list = Array.isArray(photos) ? photos : []
    return list as unknown as PhotoCardPhoto[]
  }, [photos])

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const isIntersecting = useIntersectionObserver(sentinelRef, { rootMargin: '400px' })

  useEffect(() => {
    if (isIntersecting && photosHasMore && !loadingMore) {
      loadMorePhotos()
    }
  }, [isIntersecting, photosHasMore, loadingMore, loadMorePhotos])

  // Listen for upload completion events to refresh the gallery
  useEffect(() => {
    const handlePhotosUploaded = () => {
      refreshPhotos()
    }

    window.addEventListener('photos-uploaded', handlePhotosUploaded)
    return () => window.removeEventListener('photos-uploaded', handlePhotosUploaded)
  }, [refreshPhotos])

  const toTimestamp = useMemo(() => {
    return (photo: PhotoCardPhoto): number => {
      const dateStr = photo?.metadata?.DateTimeOriginal || photo?.metadata?.CreateDate || photo?.created_at
      if (!dateStr) return 0
      try {
        const normalized = String(dateStr).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
        const ms = new Date(normalized).getTime()
        return Number.isFinite(ms) ? ms : 0
      } catch {
        return 0
      }
    }
  }, [])

  const getSearchHaystack = useMemo(() => {
    const safeStr = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value))
    return (photo: PhotoCardPhoto): string => {
      const extra = photo as Record<string, unknown>
      const parts = [
        safeStr(photo?.caption),
        safeStr(photo?.description),
        safeStr(photo?.filename),
        safeStr(photo?.name),
        // Some backends/legacy clients include these fields; keep them searchable when present.
        safeStr(extra.original_filename),
        safeStr(photo?.metadata?.FileName),
        safeStr(photo?.metadata?.filename),
      ]
      return parts
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    }
  }, [])

  const matchesStatusFilter = useMemo(() => {
    return (photo: PhotoCardPhoto): boolean => {
      if (statusFilter === 'all') return true
      const state = String(photo?.state || '').toLowerCase()

      if (statusFilter === 'finished') return state === 'finished'
      if (statusFilter === 'inprogress') return state === 'working' || state === 'inprogress' || state === 'uploading'
      if (statusFilter === 'error') return state === 'error'

      return true
    }
  }, [statusFilter])

  const normalizedSearch = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])
  const matchesSearch = useMemo(() => {
    return (photo: PhotoCardPhoto): boolean => {
      if (!normalizedSearch) return true
      const haystack = getSearchHaystack(photo)
      return haystack.includes(normalizedSearch)
    }
  }, [getSearchHaystack, normalizedSearch])

  const sortedPhotos = useMemo(() => {
    const list = Array.isArray(galleryPhotos) ? [...galleryPhotos] : []

    if (sortOrder === 'oldest') {
      list.sort((a, b) => toTimestamp(a) - toTimestamp(b))
      return list
    }
    if (sortOrder === 'name') {
      const nameForSort = (photo: PhotoCardPhoto) => {
        const raw =
          photo?.filename ||
          photo?.name ||
          (photo as Record<string, unknown>)?.original_filename ||
          photo?.metadata?.FileName ||
          ''
        return String(raw).toLowerCase()
      }
      list.sort((a, b) => nameForSort(a).localeCompare(nameForSort(b)))
      return list
    }

    // Default: newest first (matches current behavior)
    list.sort((a, b) => toTimestamp(b) - toTimestamp(a))
    return list
  }, [galleryPhotos, sortOrder, toTimestamp])

  const filteredPendingUploads = useMemo(() => {
    const list = Array.isArray(pendingUploads) ? pendingUploads : []
    return list.filter((p) => matchesStatusFilter(p) && matchesSearch(p))
  }, [pendingUploads, matchesStatusFilter, matchesSearch])

  const filteredPhotos = useMemo(() => {
    return sortedPhotos.filter((p) => matchesStatusFilter(p) && matchesSearch(p))
  }, [sortedPhotos, matchesStatusFilter, matchesSearch])

  // Merge pending uploads with derived photos with deduplication
  // If a real photo exists (even with state='working'), remove the pending placeholder
  const allPhotos = useMemo(() => {
    // Create a map of real photos by filename for quick lookup
    const realPhotosByFilename = new Map<string, PhotoCardPhoto>()
    filteredPhotos.forEach((photo) => {
      const extra = photo as unknown as Record<string, unknown>
      const filename =
        photo?.filename ||
        (typeof extra.original_filename === 'string' ? extra.original_filename : '') ||
        (typeof extra.name === 'string' ? extra.name : '')
      if (filename) {
        realPhotosByFilename.set(filename.toLowerCase(), photo)
      }
    })

    // Filter out pending uploads that have a matching real photo
    const deduplicatedPending = filteredPendingUploads.filter((pending) => {
      const pendingFilename = pending?.filename || pending?.name
      if (!pendingFilename) return true // Keep if no filename to match

      // Check if a real photo with this filename exists
      const hasRealPhoto = realPhotosByFilename.has(pendingFilename.toLowerCase())
      return !hasRealPhoto // Only keep pending if no real photo exists
    })

    return [...deduplicatedPending, ...filteredPhotos]
  }, [filteredPendingUploads, filteredPhotos])

  const hasCachedPhotos = allPhotos && allPhotos.length > 0

  const { getSignedUrl } = useSignedThumbnails(galleryPhotos, session?.access_token)

  const photosForPrivileges: PhotoPrivilegePhoto[] = useMemo(() => {
    const list = Array.isArray(photos) ? photos : []
    return list
      .filter((p): p is Photo & { filename: string } => typeof p?.filename === 'string' && p.filename.trim() !== '')
      .map((p) => ({ id: p.id, filename: p.filename }))
  }, [photos])

  const privilegesMap = usePhotoPrivileges(photosForPrivileges)

  const {
    filteredLocalPhotos,
    handleSelectFolder,
    handleNativeSelection,
    handleUploadFilteredOptimistic,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    uploading,
  } = useLocalPhotoPicker({
    onUploadComplete: refreshPhotos,
    onUploadSuccess: (count: number) => setToolbarMessage(`Successfully uploaded ${count} photos`),
  })

  const handleSelectPhoto = (photo: PhotoCardPhoto) => {
    if (photo) {
      const photoId = (photo as { photo_id?: unknown })?.photo_id ?? photo.id
      // Navigate to read-only detail page when clicking photo thumbnail
      navigate(`/photos/${photoId}`)
    }
  }

  const handleEditPhoto = (photo: PhotoCardPhoto) => {
    if (photo) {
      navigate(`/photos/${photo.id}/edit`)
    }
  }

  const handleMoveToInprogress = async (id: Photo['id']) => {
    const result = await useStore.getState().moveToInprogress(id)
    return result
  }

  const handleMoveToWorking = async (id: Photo['id']) => {
    try {
      const { updatePhotoState } = await import('../api')
      await updatePhotoState(id, 'working')
      await refreshPhotos()
      setBanner({ message: 'Photo moved back to working', severity: 'info' })
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error)
      setBanner({ message: `Error moving photo back to working: ${message}`, severity: 'error' })
    }
  }

  return (
    <>
      {showMetadataModal && metadataPhoto && (
        <MetadataModal
          photo={metadataPhoto}
          onClose={() => {
            setShowMetadataModal(false)
            setMetadataPhoto(null)
          }}
        />
      )}

      {showLocalPicker && (
        <PhotoUploadForm
          startDate={startDate}
          endDate={endDate}
          setStartDate={setStartDate}
          setEndDate={setEndDate}
          uploading={uploading}
          filteredLocalPhotos={filteredLocalPhotos}
          handleUploadFiltered={(subset, analysisType) => handleUploadFilteredOptimistic(subset, analysisType)}
          onReopenFolder={handleSelectFolder}
          handleNativeSelection={handleNativeSelection}
          closeReason="gallery-close"
          onClose={() => {
            // no-op: unified gallery has no view param
          }}
        />
      )}

      {loading && !hasCachedPhotos ? (
        <div className="flex items-center justify-center h-64 text-slate-500">
          <p>Loading photos...</p>
        </div>
      ) : (
        <>
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
            <div className="px-2 sm:px-6 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="gallery-search" className="block text-xs font-medium text-slate-600">
                    Search
                  </label>
                  <input
                    id="gallery-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search caption, filename, description"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    aria-label="Search photos"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <div className="min-w-[160px]">
                    <label htmlFor="gallery-filter" className="block text-xs font-medium text-slate-600">
                      Filter
                    </label>
                    <select
                      id="gallery-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                      <option value="all">All</option>
                      <option value="finished">Finished</option>
                      <option value="inprogress">In progress</option>
                      <option value="error">Error</option>
                    </select>
                  </div>

                  <div className="min-w-[180px]">
                    <label htmlFor="gallery-sort" className="block text-xs font-medium text-slate-600">
                      Sort
                    </label>
                    <select
                      id="gallery-sort"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="name">Name (A→Z)</option>
                    </select>
                  </div>

                  <div className="min-w-[200px]">
                    <span className="block text-xs font-medium text-slate-600">Density</span>
                    <div className="mt-1 inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="group" aria-label="Gallery density">
                      <button
                        type="button"
                        onClick={() => setDensity('comfortable')}
                        aria-pressed={density === 'comfortable'}
                        className={
                          `px-3 py-2 text-sm rounded-md transition-colors ` +
                          (density === 'comfortable' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')
                        }
                      >
                        Comfortable
                      </button>
                      <button
                        type="button"
                        onClick={() => setDensity('compact')}
                        aria-pressed={density === 'compact'}
                        className={
                          `px-3 py-2 text-sm rounded-md transition-colors ` +
                          (density === 'compact' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')
                        }
                      >
                        Compact
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:ml-auto">
                  {loading && hasCachedPhotos && (
                    <div className="flex items-center justify-center text-xs text-slate-400" aria-live="polite">
                      <span>Refreshing…</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={refreshPhotos}
                    className="min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg text-sm font-medium bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200"
                    aria-label="Refresh photos"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>

          <PhotoGallery
            photos={allPhotos}
            privilegesMap={privilegesMap}
            pollingPhotoId={pollingPhotoId}
            pollingPhotoIds={pollingPhotoIds}
            handleMoveToInprogress={handleMoveToInprogress}
            handleEditPhoto={handleEditPhoto}
            handleMoveToWorking={handleMoveToWorking}
            handleDeletePhoto={handleDeletePhoto}
            onSelectPhoto={handleSelectPhoto}
            getSignedUrl={(photo, variant) => getSignedUrl(photo, variant === 'thumb' ? 'thumbnail' : 'full')}
            density={density}
          />

          {photosHasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center py-8" aria-label="Load more sentinel">
              {loadingMore && (
                <div
                  className="h-8 w-8 rounded-full border-4 border-slate-200 border-t-slate-600 animate-spin"
                  aria-label="Loading more photos"
                />
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}
