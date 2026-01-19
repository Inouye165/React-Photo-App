import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import type { Photo } from '../types/photo'
import useStore from '../store'

import { getPhoto } from '../api'
import { API_BASE_URL, request } from '../api/httpClient'
import { getHeadersForGetRequestAsync } from '../api/auth'
import { useCollectiblesForPhoto } from '../hooks/useCollectiblesForPhoto'
import AuthenticatedImage from '../components/AuthenticatedImage'

type Id = string | number

type CollectiblePhotoDto = {
  id: Id
  url?: string
  thumbnail?: string | null
  smallThumbnail?: string | null
  filename?: string
  created_at?: string
  [key: string]: unknown
}

function resolveMediaUrl(maybeUrl: unknown): string | null {
  if (typeof maybeUrl !== 'string') return null
  const url = maybeUrl.trim()
  if (!url) return null
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url
  const normalized = url.startsWith('/') ? url : `/${url}`
  return `${API_BASE_URL}${normalized}`
}

function buildVersionedPhotoUrl(maybeUrl: string | null, version: string): string | null {
  if (!maybeUrl) return null

  if (maybeUrl.startsWith('http') || maybeUrl.startsWith('blob:') || maybeUrl.startsWith('data:')) return maybeUrl

  const normalized = maybeUrl.startsWith('/') ? maybeUrl : `/${maybeUrl}`
  const baseUrl = `${API_BASE_URL}${normalized}`

  if (!version) return baseUrl
  if (normalized.includes('sig=') || normalized.includes('exp=')) return baseUrl

  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
}

export default function CollectiblePhotoPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const photos = useStore((state) => state.photos) as Photo[]
  const updatePhoto = useStore((state) => state.updatePhoto)

  const photo = useMemo(() => {
    return (Array.isArray(photos) ? photos : []).find((p) => String(p?.id) === String(id))
  }, [photos, id])

  useEffect(() => {
    if (!id) return

    // Fetch fresh photo details (ensures we have collectible_insights/poi_analysis if needed)
    getPhoto(Number(id))
      .then((res) => {
        if (res?.success && res.photo) {
          updatePhoto({ ...res.photo, id: Number(id) })
        }
      })
      .catch((err) => {
        console.error('[CollectiblePhotoPage] Failed to fetch photo details:', err)
      })
  }, [id, updatePhoto])

  const {
    collectibleData,
    collectibleLoading,
    collectibleAiAnalysis,
    isCollectiblePhoto,
    hasCollectibleData,
  } = useCollectiblesForPhoto({ photo, enabled: true })

  const [referencePhotos, setReferencePhotos] = useState<CollectiblePhotoDto[]>([])
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const [selectedRefId, setSelectedRefId] = useState<string | null>(null)
  const [useFullRes, setUseFullRes] = useState(false)

  useEffect(() => {
    setSelectedRefId(null)
    setUseFullRes(false)
  }, [photo?.id])

  useEffect(() => {
    const collectibleId = collectibleData?.id
    if (!collectibleId) {
      setReferencePhotos([])
      return
    }

    let cancelled = false

    async function load() {
      setReferenceLoading(true)
      setReferenceError(null)

      try {
        const headers = await getHeadersForGetRequestAsync()
        const json = await request<{ success: boolean; error?: string; photos?: CollectiblePhotoDto[] }>({
          path: `/collectibles/${collectibleId}/photos`,
          headers: headers || {},
        })

        if (!json.success) throw new Error(json.error || 'Failed to load reference photos')
        if (cancelled) return

        const next = Array.isArray(json.photos) ? json.photos : []
        setReferencePhotos(next)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setReferenceError(message || 'Failed to load reference photos')
        setReferencePhotos([])
      } finally {
        if (!cancelled) setReferenceLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [collectibleData?.id])

  const primaryVersion = String(photo?.hash || photo?.updated_at || '')

  const primaryThumb = (photo?.thumbnailUrl ?? photo?.thumbnail ?? null) as string | null
  const primaryFull = (photo?.fullUrl ?? photo?.url ?? null) as string | null
  const primaryCandidate = useFullRes ? primaryFull : primaryThumb || primaryFull
  const primaryDisplayUrl = buildVersionedPhotoUrl(primaryCandidate, primaryVersion)

  const selectedRef = useMemo(() => {
    if (!selectedRefId) return null
    return (Array.isArray(referencePhotos) ? referencePhotos : []).find((p) => String(p?.id) === String(selectedRefId)) || null
  }, [referencePhotos, selectedRefId])

  const mainImageUrl = useMemo(() => {
    if (selectedRef) {
      return resolveMediaUrl(selectedRef.url) || resolveMediaUrl(selectedRef.thumbnail) || resolveMediaUrl(selectedRef.smallThumbnail)
    }
    return primaryDisplayUrl
  }, [primaryDisplayUrl, selectedRef])

  if (!photo) {
    return (
      <div className="bg-white rounded-3xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-slate-800">Photo not found</h2>
        <p className="text-slate-600 mt-2">This photo may have been removed or is no longer available.</p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate('/gallery')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800"
          >
            <ArrowLeft size={16} />
            <span>Back to Gallery</span>
          </button>
        </div>
      </div>
    )
  }

  const headerTitle = String(photo.caption || photo.filename || 'Collectible')

  return (
    <div className="bg-white rounded-3xl shadow-lg overflow-hidden" data-testid="collectible-photo-page">
      <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-slate-200">
        <button
          onClick={() => {
            if (window.history.length > 1) navigate(-1)
            else navigate('/gallery')
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="text-sm text-slate-600">
          {collectibleLoading ? 'Loading collectible…' : hasCollectibleData ? 'Collectible' : isCollectiblePhoto ? 'Collectible (AI)' : 'Photo'}
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">{headerTitle}</h1>
              {(collectibleData?.category || collectibleAiAnalysis?.category) && (
                <p className="mt-1 text-sm text-slate-600">
                  Category: {String(collectibleData?.category || collectibleAiAnalysis?.category)}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate(`/photos/${photo.id}`)}
              className="shrink-0 inline-flex items-center px-3 py-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 text-sm"
            >
              Open Details
            </button>
          </div>

          {/* Main image */}
          <div className="rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden">
            <div className="w-full flex items-center justify-center" style={{ maxHeight: '60vh' }}>
              {mainImageUrl ? (
                <AuthenticatedImage
                  src={mainImageUrl}
                  alt={headerTitle}
                  className="w-full h-full object-contain"
                  style={{ maxHeight: '60vh' }}
                />
              ) : (
                <div className="p-10 text-slate-500">No image available.</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-200 bg-white">
              <div className="text-xs text-slate-600">
                {selectedRef ? 'Viewing reference photo' : 'Viewing main photo'}
              </div>

              <div className="flex items-center gap-2">
                {selectedRef && (
                  <button
                    type="button"
                    onClick={() => setSelectedRefId(null)}
                    className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs"
                  >
                    Back to main
                  </button>
                )}

                {!selectedRef && primaryFull && primaryThumb && !useFullRes && (
                  <button
                    type="button"
                    onClick={() => setUseFullRes(true)}
                    className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
                  >
                    Load full resolution
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Reference carousel */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-slate-900">Reference photos</h2>
              {referenceLoading && <span className="text-xs text-slate-500">Loading…</span>}
            </div>

            {referenceError && <div className="mt-3 text-sm text-red-600">{referenceError}</div>}

            {!referenceLoading && referencePhotos.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No reference photos yet.</p>
            ) : (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
                {referencePhotos.map((p) => {
                  const thumb =
                    resolveMediaUrl(p.smallThumbnail) ||
                    resolveMediaUrl(p.thumbnail) ||
                    resolveMediaUrl(p.url)

                  const isSelected = selectedRefId != null && String(selectedRefId) === String(p.id)

                  return (
                    <button
                      key={String(p.id)}
                      type="button"
                      onClick={() => setSelectedRefId(String(p.id))}
                      className={
                        isSelected
                          ? 'shrink-0 rounded-xl border-2 border-indigo-500 bg-white overflow-hidden'
                          : 'shrink-0 rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300'
                      }
                      style={{ width: 96, height: 96 }}
                      title={typeof p.filename === 'string' ? p.filename : undefined}
                      aria-label={typeof p.filename === 'string' ? p.filename : 'Reference photo'}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={typeof p.filename === 'string' ? p.filename : 'Reference photo'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 bg-slate-50">
                          No preview
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <p className="mt-2 text-xs text-slate-500">
              Tip: click a reference thumbnail to view it larger.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
