import { create } from 'zustand'
import type { Photo } from './types/photo'
import type { PhotoState } from './types/api'
import { getPhoto, updatePhotoState } from './api'
import { createUploadPickerSlice } from './store/uploadPickerSlice'
import type { UploadPickerSlice } from './store/uploadPickerSlice'
import { aiPollDebug } from './utils/aiPollDebug'

type Severity = 'info' | 'success' | 'warning' | 'error'

export interface ToastState {
  message: string
  severity: Severity
}

export interface BannerState {
  message: string
  severity: Severity
}

export type ViewState = null | 'working' | 'inprogress' | 'finished'
export type EditingMode = null | 'inline' | 'full'

type PendingUploadState = 'uploading' | PhotoState

export interface PendingUpload extends Omit<Photo, 'state'> {
  id: string
  file: File
  url: string
  name: string
  filename: string
  state: PendingUploadState
  created_at: string
  file_size: number
  caption: string
  isTemporary: true
}

export type BackgroundUploadStatus = 'uploading' | 'success' | 'error'

export interface BackgroundUploadEntry {
  id: string
  file: File
  filename: string
  size: number
  startedAt: string
  status: BackgroundUploadStatus
  errorMessage?: string
  classification?: string
}

export interface AiPollingOptions {
  intervalMs?: number
  maxIntervalMs?: number
  softTimeoutMs?: number
  hardTimeoutMs?: number
}

export interface StoreState extends UploadPickerSlice {
  photos: Photo[]
  toast: ToastState
  pollingPhotoId: Photo['id'] | null
  pollingPhotoIds: Set<Photo['id']>
  // Phase 3: when true, client-side SSE updates are active and we should avoid
  // running store-level HTTP polling loops to prevent duplicate network traffic.
  // Spinner state is still represented by pollingPhotoIds.
  photoEventsStreamingActive: boolean
  pendingUploads: PendingUpload[]
  backgroundUploads: BackgroundUploadEntry[]
  banner: BannerState
  view: ViewState
  activePhotoId: Photo['id'] | null
  editingMode: EditingMode
  lastEditedPhotoId: Photo['id'] | null
  showMetadataModal: boolean
  metadataPhoto: Photo | null
  toolbarMessage: string
  toolbarSeverity: Severity
  photosCursor: string | null
  photosHasMore: boolean

  addPendingUploads: (files: File[]) => PendingUpload[]
  removePendingUpload: (tempId: string) => void
  clearPendingUploads: () => void

  addBackgroundUploads: (files: File[], classification?: string) => string[]
  markBackgroundUploadSuccess: (id: string) => void
  markBackgroundUploadError: (id: string, message?: string) => void
  clearCompletedBackgroundUploads: () => void
  retryFailedBackgroundUploads: () => string[]
  removeBackgroundUpload: (id: string) => void

  setBanner: (value: string | Partial<BannerState> | null | undefined) => void
  setView: (view: ViewState) => void
  setActivePhotoId: (id: Photo['id'] | null) => void
  setEditingMode: (mode: EditingMode) => void
  setLastEditedPhotoId: (id: Photo['id'] | null) => void
  setShowMetadataModal: (show: boolean) => void
  setMetadataPhoto: (photo: Photo | null) => void
  setToolbarMessage: (message: string) => void
  setToolbarSeverity: (severity: Severity) => void

  setPhotos: (photos: Photo[]) => void
  appendPhotos: (photos: Photo[], nextCursor: string | null, hasMore: boolean) => void
  resetPhotos: (photos: Photo[], nextCursor: string | null, hasMore: boolean) => void
  removePhotoById: (id: Photo['id']) => void
  updatePhotoData: (id: Photo['id'], newData: Partial<Photo> & Record<string, unknown>) => void
  updatePhoto: (updatedPhoto: Partial<Photo> & { id: Photo['id'] }) => void

  setToast: (value: string | Partial<ToastState> | null | undefined) => void
  setPollingPhotoId: (id: Photo['id'] | null) => void
  addPollingId: (id: Photo['id']) => void
  removePollingId: (id: Photo['id']) => void

  setPhotoEventsStreamingActive: (active: boolean, reason?: string) => void

  startAiPolling: (id: Photo['id'], opts?: AiPollingOptions) => void
  stopAiPolling: (id: Photo['id'], stopReason?: string) => void
  moveToInprogress: (id: Photo['id']) => Promise<{ success: true } | { success: false; error: unknown }>
}

const debug = (...args: unknown[]) => {
  if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(...args)
  }
}

// Module-level timer registry for AI polling so we can stop polling
// when analysis completes.
//
// IMPORTANT: This store-level poller is the single source of truth.
// Avoid adding additional polling loops in hooks/components (they can
// race, stop early, and leave photo.state stale).
const aiPollingTimers: Map<string, ReturnType<typeof setTimeout> | null> = new Map()

const getErrorStatus = (err: unknown): number | null => {
  if (!err || typeof err !== 'object') return null
  const maybe = err as { status?: unknown; response?: { status?: unknown } }
  const status = maybe.status ?? maybe.response?.status
  return Number.isFinite(status as number) ? (status as number) : null
}

const isAiAnalysisComplete = (photo: Photo | null | undefined): boolean => {
  if (!photo) return false
  // Prefer the explicit state machine from the backend.
  if (photo.state === 'finished' || photo.state === 'error') return true

  // Backstop: some AI failures may be encoded in text fields.
  const caption = typeof photo.caption === 'string' ? photo.caption.trim().toLowerCase() : ''
  const description = typeof photo.description === 'string' ? photo.description.trim().toLowerCase() : ''
  const failedMarker = 'ai processing failed'
  if (caption === failedMarker || description === failedMarker) return true

  return false
}

// Minimal Zustand store for photos and ui state (polling, toast)
const useStore = create<StoreState>((set, get) => ({
  ...createUploadPickerSlice(set, get),
  photos: [],
  photosCursor: null,
  photosHasMore: false,
  toast: { message: '', severity: 'info' },
  // Support both a single legacy polling id and a Set of polling ids for concurrent polling
  pollingPhotoId: null,
  pollingPhotoIds: new Set(),

  photoEventsStreamingActive: false,

  // Optimistic uploads - pending photos being uploaded
  pendingUploads: [],
  addPendingUploads: (files: File[]) => {
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : []
    const now = Date.now()
    const createdAt = new Date().toISOString()

    const newPending: PendingUpload[] = safeFiles.map((file) => {
      const id = `temp-${now}-${Math.random().toString(36).substr(2, 9)}`
      return {
        id,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        filename: file.name,
        state: 'uploading',
        created_at: createdAt,
        file_size: file.size,
        caption: '',
        isTemporary: true,
      }
    })

    set((state) => ({ pendingUploads: [...newPending, ...(state.pendingUploads || [])] }))
    return newPending
  },
  removePendingUpload: (tempId: string) =>
    set((state) => {
      // Revoke blob URL to prevent memory leak
      const pending = state.pendingUploads.find((p) => p.id === tempId)
      if (pending?.url && pending.url.startsWith('blob:')) {
        URL.revokeObjectURL(pending.url)
      }
      return { pendingUploads: state.pendingUploads.filter((p) => p.id !== tempId) }
    }),
  clearPendingUploads: () =>
    set((state) => {
      // Revoke all blob URLs
      state.pendingUploads.forEach((p) => {
        if (p.url && p.url.startsWith('blob:')) {
          URL.revokeObjectURL(p.url)
        }
      })
      return { pendingUploads: [] }
    }),

  // Background uploads - persistent per-file status tracking (does not reuse pendingUploads)
  backgroundUploads: [],
  addBackgroundUploads: (files: File[], classification?: string) => {
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : []
    const now = Date.now()
    const startedAt = new Date().toISOString()

    const newEntries: BackgroundUploadEntry[] = safeFiles.map((file) => {
      const id = `bg-${now}-${Math.random().toString(36).substr(2, 9)}`
      return {
        id,
        file,
        filename: file.name,
        size: file.size,
        startedAt,
        status: 'uploading',
        classification,
      }
    })

    set((state) => ({ backgroundUploads: [...newEntries, ...(state.backgroundUploads || [])] }))
    return newEntries.map((e) => e.id)
  },
  markBackgroundUploadSuccess: (id: string) =>
    set((state) => ({
      backgroundUploads: (state.backgroundUploads || []).map((u) =>
        u.id === id
          ? {
              ...u,
              status: 'success',
              errorMessage: undefined,
            }
          : u,
      ),
    })),
  markBackgroundUploadError: (id: string, message?: string) =>
    set((state) => ({
      backgroundUploads: (state.backgroundUploads || []).map((u) =>
        u.id === id
          ? {
              ...u,
              status: 'error',
              errorMessage: typeof message === 'string' ? message : u.errorMessage,
            }
          : u,
      ),
    })),
  clearCompletedBackgroundUploads: () =>
    set((state) => ({
      backgroundUploads: (state.backgroundUploads || []).filter((u) => u.status !== 'success'),
    })),
  retryFailedBackgroundUploads: () => {
    const failedIds = (get().backgroundUploads || []).filter((u) => u.status === 'error').map((u) => u.id)
    const restartedAt = new Date().toISOString()
    set((state) => ({
      backgroundUploads: (state.backgroundUploads || []).map((u) =>
        u.status === 'error'
          ? {
              ...u,
              status: 'uploading',
              errorMessage: undefined,
              startedAt: restartedAt,
            }
          : u,
      ),
    }))
    return failedIds
  },
  removeBackgroundUpload: (id: string) =>
    set((state) => ({
      backgroundUploads: (state.backgroundUploads || []).filter((u) => u.id !== id),
    })),

  // Persistent banner notification (alternative to toast)
  banner: { message: '', severity: 'info' },
  setBanner: (value: string | Partial<BannerState> | null | undefined) =>
    set((state) => {
      const base = state.banner || { message: '', severity: 'info' }
      if (!value) return { banner: { message: '', severity: base.severity || 'info' } }
      if (typeof value === 'string') {
        return { banner: { message: value, severity: base.severity || 'info' } }
      }
      const message = typeof value.message === 'string' ? value.message : ''
      const severity = typeof value.severity === 'string' ? (value.severity as Severity) : (base.severity || 'info')
      return { banner: { message, severity } }
    }),

  // UI State Slice - View Management
  // NOTE: Initial view is null - URL params are the source of truth
  // SmartRouter determines the initial view and sets it via URL
  view: null,
  setView: (view: ViewState) => set({ view }),

  // UI State Slice - Active Photo & Editing
  activePhotoId: null,
  setActivePhotoId: (id: Photo['id'] | null) => set({ activePhotoId: id }),
  editingMode: null,
  setEditingMode: (mode: EditingMode) => set({ editingMode: mode }),

  // Last edited photo - persists across navigation for quick return
  lastEditedPhotoId: null,
  setLastEditedPhotoId: (id: Photo['id'] | null) => set({ lastEditedPhotoId: id }),

  // UI State Slice - Modals
  showMetadataModal: false,
  setShowMetadataModal: (show: boolean) => set({ showMetadataModal: show }),
  metadataPhoto: null,
  setMetadataPhoto: (photo: Photo | null) => set({ metadataPhoto: photo }),

  // UI State Slice - Toolbar Messages
  toolbarMessage: '',
  setToolbarMessage: (message: string) => set({ toolbarMessage: message }),
  toolbarSeverity: 'info',
  setToolbarSeverity: (severity: Severity) => set({ toolbarSeverity: severity }),

  // Photos slice
  setPhotos: (photos: Photo[]) => set({ photos }),
  appendPhotos: (photos: Photo[], nextCursor: string | null, hasMore: boolean) =>
    set((state) => {
      // Deduplicate by photo ID
      const existingIds = new Set(state.photos.map((p) => String(p.id)))
      const newPhotos = photos.filter((p) => !existingIds.has(String(p.id)))
      return {
        photos: [...state.photos, ...newPhotos],
        photosCursor: nextCursor,
        photosHasMore: hasMore,
      }
    }),
  resetPhotos: (photos: Photo[], nextCursor: string | null, hasMore: boolean) =>
    set({ photos, photosCursor: nextCursor, photosHasMore: hasMore }),
  removePhotoById: (id: Photo['id']) => set((state) => ({ photos: state.photos.filter((p) => p.id !== id) })),
  // Update existing photo data or insert if missing (upsert)
  updatePhotoData: (id: Photo['id'], newData: Partial<Photo> & Record<string, unknown>) =>
    set((state) => {
      const normalizeId = (value: unknown) => (value != null ? String(value) : value)
      const targetId = normalizeId(id)
      const exists = state.photos.some((p) => normalizeId(p.id) === targetId)
      debug('[store] updatePhotoData', { id, exists, newData, prePhotos: state.photos })
      if (exists) {
        const out = {
          photos: state.photos.map((p) => {
            if (normalizeId(p.id) !== targetId) return p
            const merged = { ...p, ...newData }
            merged.id = p.id
            debug('[store] merged photo', merged)
            return merged
          }),
        }
        debug('[store] post-update photos', out.photos)
        return out
      }
      // Append updated/inserted photo to the list so editors can observe it
      const appended = {
        photos: [...state.photos, typeof newData === 'object' ? ({ ...newData, id } as Photo) : (newData as unknown as Photo)],
      }
      debug('[store] appending new photo:', appended, 'to', state.photos)
      return appended
    }),
  // Replace an existing photo object in the photos array with the full updated object
  updatePhoto: (updatedPhoto: Partial<Photo> & { id: Photo['id'] }) =>
    set((state) => {
      if (!updatedPhoto || typeof updatedPhoto.id === 'undefined') return {}
      const normalizeId = (value: unknown) => (value != null ? String(value) : value)
      const targetId = normalizeId(updatedPhoto.id)
      const prevPhotos = state.photos
      const existing = prevPhotos.find((p) => normalizeId(p.id) === targetId) || null
      const found = Boolean(existing)

      const photos = prevPhotos.map((p) => {
        if (normalizeId(p.id) !== targetId) return p
        const merged = { ...p, ...updatedPhoto }
        merged.id = p.id
        debug('[store] updatePhoto merged', { prev: p, next: merged })
        return merged as Photo
      })

      const updated = found ? photos.find((p) => normalizeId(p.id) === targetId) || null : null
      const oldState = existing ? existing.state ?? null : null
      const newState = updated ? updated.state ?? null : null
      aiPollDebug('store_updatePhoto', {
        photoId: updatedPhoto.id,
        found,
        oldState,
        newState,
        arrayRefChanged: prevPhotos !== photos,
        objectRefChanged: found ? existing !== updated : null,
      })

      debug('[store] updatePhoto', { id: updatedPhoto.id, photos })
      return { photos }
    }),

  // UI slice
  // setToast accepts either a string (legacy) or an object { message, severity }
  setToast: (value: string | Partial<ToastState> | null | undefined) =>
    set((state) => {
      const base = state.toast || { message: '', severity: 'info' }
      if (!value) return { toast: { message: '', severity: base.severity || 'info' } }
      if (typeof value === 'string') {
        return { toast: { message: value, severity: base.severity || 'info' } }
      }
      const message = typeof value.message === 'string' ? value.message : ''
      const severity = typeof value.severity === 'string' ? (value.severity as Severity) : (base.severity || 'info')
      return { toast: { message, severity } }
    }),
  setPollingPhotoId: (id: Photo['id'] | null) => set({ pollingPhotoId: id }),

  // Manage pollingPhotoIds immutably so Zustand subscribers detect changes
  addPollingId: (id: Photo['id']) =>
    set((state) => {
      const newSet = new Set(state.pollingPhotoIds || [])
      newSet.add(id)
      return { pollingPhotoIds: newSet }
    }),
  removePollingId: (id: Photo['id']) =>
    set((state) => {
      const current = state.pollingPhotoIds || new Set()
      const filtered = Array.from(current).filter((value) => String(value) !== String(id))
      return { pollingPhotoIds: new Set(filtered) }
    }),

  setPhotoEventsStreamingActive: (active: boolean, reason?: string) => {
    // SECURITY: never log tokens or event payloads.
    aiPollDebug('photo_events_streaming_active', { active: Boolean(active), reason: reason || 'unknown' })
    set({ photoEventsStreamingActive: Boolean(active) })
  },

  // Start polling /photos/:id until the backend reports a terminal state.
  startAiPolling: (id: Photo['id'], opts: AiPollingOptions = {}) => {
    const key = String(id)
    if (aiPollingTimers.has(key)) {
      aiPollDebug('store_poll_start_skipped_already_running', { photoId: id })
      return
    }

    const baseIntervalMs = Number.isFinite(opts?.intervalMs) ? (opts.intervalMs as number) : 1500
    const maxIntervalMs = Number.isFinite(opts?.maxIntervalMs) ? (opts.maxIntervalMs as number) : 15000
    const softTimeoutMs = Number.isFinite(opts?.softTimeoutMs) ? (opts.softTimeoutMs as number) : 180000
    // Treat hardTimeoutMs as the total polling timeout (aka timeoutMs).
    const hardTimeoutMs = Number.isFinite(opts?.hardTimeoutMs) ? (opts.hardTimeoutMs as number) : 1800000
    const startedAt = Date.now()
    let inFlight = false
    let consecutiveErrors = 0
    let attempt = 0
    let nextAllowedAt = 0

    // Update the store to show we're polling this ID.
    set((state) => {
      const current = state.pollingPhotoIds || new Set()
      const filtered = Array.from(current).filter((value) => String(value) !== key)
      const next = new Set(filtered)
      next.add(id)
      return { pollingPhotoId: id, pollingPhotoIds: next }
    })

    // When SSE streaming is active, keep spinner flags but do not start
    // an HTTP polling loop. This prevents duplicate traffic.
    if (get().photoEventsStreamingActive) {
      aiPollDebug('store_poll_start_skipped_streaming_active', { photoId: id })
      return
    }

    // Mark active immediately so repeated calls don't start competing pollers
    // before the first tick has a chance to schedule the next timeout.
    aiPollingTimers.set(key, null)

    aiPollDebug('store_poll_start', {
      photoId: id,
      baseIntervalMs,
      maxIntervalMs,
      softTimeoutMs,
      hardTimeoutMs,
    })

    aiPollDebug('poll_start', {
      photoId: id,
      intervalMs: baseIntervalMs,
      timeoutMs: hardTimeoutMs,
    })

    const stopWithReason = (stopReason: string, extra: Record<string, unknown> = {}) => {
      aiPollDebug('store_poll_stop_decision', { photoId: id, stopReason, ...extra })
      debug('[store] stopAiPolling', { id, reason: stopReason, ...extra })
      get().stopAiPolling(id, stopReason)
    }

    const nextDelayMs = () => {
      if (consecutiveErrors <= 0) return baseIntervalMs
      const backoff = baseIntervalMs * Math.pow(2, Math.min(consecutiveErrors, 5))
      return Math.min(maxIntervalMs, Math.max(baseIntervalMs, backoff))
    }

    const scheduleNext = (delayMs: number) => {
      if (get().photoEventsStreamingActive) {
        aiPollDebug('store_poll_schedule_skipped_streaming_active', { photoId: id, delayMs })
        if (aiPollingTimers.has(key)) aiPollingTimers.delete(key)
        return
      }
      const timer = setTimeout(tick, delayMs)
      aiPollingTimers.set(key, timer)
    }

    const tick = async () => {
      if (get().photoEventsStreamingActive) {
        // Pause/stop the poller without clearing spinner flags. Polling will be
        // resumed by a future startAiPolling call if we fall back.
        aiPollDebug('store_poll_tick_paused_streaming_active', { photoId: id })
        const timer = aiPollingTimers.get(key)
        if (timer) {
          try {
            clearTimeout(timer)
          } catch {
            /* ignore */
          }
          try {
            clearInterval(timer)
          } catch {
            /* ignore */
          }
        }
        if (aiPollingTimers.has(key)) aiPollingTimers.delete(key)
        inFlight = false
        return
      }

      const elapsedMs = Date.now() - startedAt
      if (inFlight) {
        aiPollDebug('store_poll_tick_skipped_inFlight', {
          photoId: id,
          attempt,
          elapsedMs,
          inFlight: true,
        })
        // Don't get stuck if we're still waiting for the last request.
        scheduleNext(baseIntervalMs)
        return
      }

      if (nextAllowedAt && Date.now() < nextAllowedAt) {
        const delayMs = Math.max(0, nextAllowedAt - Date.now())
        aiPollDebug('store_poll_tick_skipped_backoff', {
          photoId: id,
          attempt,
          elapsedMs,
          backoffDelayMs: delayMs,
        })
        scheduleNext(delayMs)
        return
      }

      if (elapsedMs > hardTimeoutMs) {
        // Explicit (non-silent) hard timeout: stop polling and make sure we don't
        // leave the UI stuck showing "Analyzing..." forever.
        try {
          const existing = (get().photos || []).find((p) => String(p?.id) === String(id))
          if (existing && existing.state === 'inprogress') {
            get().updatePhoto({ ...existing, state: 'error' })
          }
        } catch {
          // ignore local update errors
        }
        aiPollDebug('poll_timeout', { photoId: id, elapsedMs, timeoutMs: hardTimeoutMs })
        stopWithReason('timeout', { elapsedMs, hardTimeoutMs })
        return
      }
      inFlight = true
      attempt += 1

      aiPollDebug('store_poll_tick', {
        photoId: id,
        attempt,
        elapsedMs,
        inFlight: true,
      })

      aiPollDebug('poll_tick', { photoId: id, attempt, elapsedMs })

      try {
        const result = await getPhoto(id, { cacheBust: true })
        const photo = result && result.photo ? (result.photo as Photo) : null
        if (!photo) {
          // Treat missing payload as transient; keep polling with backoff.
          const nextDelay = nextDelayMs()
          consecutiveErrors += 1
          const backoffMs = Math.min(5000, nextDelay)
          nextAllowedAt = Date.now() + backoffMs

          aiPollDebug('store_poll_result', {
            photoId: id,
            attempt,
            elapsedMs,
            outcome: 'error',
            errorType: 'empty_payload',
            consecutiveErrors,
            nextDelayMs: nextDelay,
          })

          aiPollDebug('poll_fetch_err', {
            photoId: id,
            message: 'Empty payload',
            consecutiveErrors,
          })

          if (consecutiveErrors >= 5) {
            stopWithReason('unexpected_error', { consecutiveErrors, lastError: 'empty_payload' })
            return
          }

          scheduleNext(nextDelay)
          return
        }

        consecutiveErrors = 0
        nextAllowedAt = 0

        const stateValue = (photo?.state ?? null) as PhotoState | null
        const updatedAt = (photo as Photo & { updatedAt?: unknown })?.updated_at ?? (photo as Photo & { updatedAt?: unknown })?.updatedAt ?? null
        const captionLen = typeof photo?.caption === 'string' ? photo.caption.length : null
        const descriptionLen = typeof photo?.description === 'string' ? photo.description.length : null
        const keywordLen = Array.isArray((photo as Photo & { keywords?: unknown })?.keywords)
          ? ((photo as Photo & { keywords: unknown[] }).keywords.length as number)
          : typeof (photo as Photo & { keywords?: unknown })?.keywords === 'string'
            ? ((photo as Photo & { keywords: string }).keywords.length as number)
            : null

        const isTerminal = stateValue === 'finished' || stateValue === 'error'
        const isAiComplete = isAiAnalysisComplete(photo)

        aiPollDebug('store_poll_result', {
          photoId: id,
          attempt,
          elapsedMs,
          outcome: 'ok',
          state: stateValue,
          updated_at: updatedAt,
          captionLen,
          descriptionLen,
          keywordLen,
          isTerminal,
          isAiComplete,
        })

        aiPollDebug('poll_fetch_ok', {
          photoId: id,
          state: stateValue,
          updated_at: updatedAt,
        })

        // Merge the latest photo data into the store so UI updates.
        try {
          get().updatePhoto(photo)
        } catch {
          // ignore update errors
        }

        if (isTerminal) {
          aiPollDebug('poll_complete', { photoId: id, finalState: stateValue })
          stopWithReason('terminal_state', { state: stateValue, updated_at: updatedAt })
          return
        }

        if (isAiComplete) {
          aiPollDebug('poll_complete', { photoId: id, finalState: stateValue })
          stopWithReason('ai_complete_predicate', { state: stateValue, updated_at: updatedAt })
          return
        }

        // Past the soft timeout, slow down polling but keep going.
        if (elapsedMs > softTimeoutMs) {
          scheduleNext(Math.min(maxIntervalMs, Math.max(baseIntervalMs, 5000)))
          return
        }

        scheduleNext(baseIntervalMs)
      } catch (err: unknown) {
        const e = err as { name?: unknown; code?: unknown; message?: unknown; status?: unknown; response?: { status?: unknown } }
        if (e && (e.name === 'AbortError' || e.code === 'ERR_CANCELED')) {
          // Request was canceled; do not count as a polling failure.
          aiPollDebug('poll_fetch_err', {
            photoId: id,
            message: 'Request aborted',
            consecutiveErrors,
          })
          scheduleNext(baseIntervalMs)
          return
        }

        const status = getErrorStatus(err)
        if (status === 401 || status === 403) {
          aiPollDebug('store_poll_result', {
            photoId: id,
            attempt,
            elapsedMs,
            outcome: 'error',
            errorType: 'http',
            status,
          })
          aiPollDebug('poll_fetch_err', {
            photoId: id,
            message: `HTTP ${status}`,
            consecutiveErrors,
          })
          stopWithReason('auth_error', { status })
          return
        }
        if (status === 404) {
          aiPollDebug('store_poll_result', {
            photoId: id,
            attempt,
            elapsedMs,
            outcome: 'error',
            errorType: 'http',
            status,
          })
          aiPollDebug('poll_fetch_err', {
            photoId: id,
            message: `HTTP ${status}`,
            consecutiveErrors,
          })
          stopWithReason('not_found', { status })
          return
        }

        consecutiveErrors += 1
        const nextDelay = nextDelayMs()
        const backoffMs = Math.min(5000, nextDelay)
        nextAllowedAt = Date.now() + backoffMs

        aiPollDebug('store_poll_result', {
          photoId: id,
          attempt,
          elapsedMs,
          outcome: 'error',
          errorType: 'unexpected_error',
          status,
          consecutiveErrors,
          nextDelayMs: nextDelay,
        })

        aiPollDebug('poll_fetch_err', {
          photoId: id,
          message: typeof e?.message === 'string' ? e.message : 'Unknown error',
          consecutiveErrors,
        })

        if (consecutiveErrors >= 5) {
          stopWithReason('unexpected_error', { consecutiveErrors })
          return
        }

        scheduleNext(nextDelay)
      } finally {
        inFlight = false
      }
    }

    // Kick off immediately and then self-schedule.
    void tick()
  },

  stopAiPolling: (id: Photo['id'], stopReason?: string) => {
    const key = String(id)
    aiPollDebug('store_poll_stop', {
      photoId: id,
      stopReason: stopReason || 'manual_stop',
      hadTimer: aiPollingTimers.has(key),
    })
    const timer = aiPollingTimers.get(key)
    if (timer) {
      try {
        clearInterval(timer)
      } catch {
        /* ignore */
      }
      try {
        clearTimeout(timer)
      } catch {
        /* ignore */
      }
    }
    if (aiPollingTimers.has(key)) {
      aiPollingTimers.delete(key)
    }

    set((state) => {
      const current = state.pollingPhotoIds || new Set()
      const filtered = Array.from(current).filter((value) => String(value) !== key)
      const next = new Set(filtered)
      const shouldClearLegacy = state.pollingPhotoId != null && String(state.pollingPhotoId) === key
      return {
        pollingPhotoIds: next,
        pollingPhotoId: shouldClearLegacy ? null : state.pollingPhotoId,
      }
    })
  },

  // Action: move a photo to inprogress and start polling for AI results
  moveToInprogress: async (id: Photo['id']) => {
    try {
      await updatePhotoState(id, 'inprogress')
      // Update locally (keep photo visible) and set polling trigger
      set((state) => {
        const normalizeId = (value: unknown) => (value != null ? String(value) : value)
        const targetId = normalizeId(id)
        const currentPhotos: Photo[] = Array.isArray(state.photos) ? state.photos : []

        const photos = currentPhotos.map((p) => {
          if (normalizeId(p.id) !== targetId) return p
          return { ...p, state: 'inprogress' } as Photo
        })

        return { photos }
      })

      // Poll until AI fields appear so "Analyzing..." clears when done.
      try {
        get().startAiPolling(id)
      } catch {
        // ignore polling start errors
      }
      return { success: true }
    } catch (err: unknown) {
      // ...toast error removed...
      return { success: false, error: err }
    }
  },
}))

export default useStore
