import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop, type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import * as Y from 'yjs'
import type { WhiteboardEvent, WhiteboardHistoryCursor, WhiteboardServerError, WhiteboardStrokeAck, WhiteboardStrokeEvent } from '../../types/whiteboard'
import type { WhiteboardTransport } from '../../realtime/whiteboardTransport'
import { API_BASE_URL } from '../../api'
import { fetchWhiteboardSnapshot, fetchWhiteboardWsToken } from '../../api/whiteboard'
import { normalizeHistoryEvents } from '../../realtime/whiteboardReplay'
import { whiteboardDebugLog } from '../../realtime/whiteboardDebug'
import { BOARD_ASPECT, computeContainedRect, type ContainedRect } from './whiteboardAspect'
import LuminaCaptureSession from '../LuminaCaptureSession'
import { createStrokePersistenceQueue, createStrokeSegmenter } from '../../realtime/whiteboardStrokeQueue'
import { createWhiteboardYjsProvider } from '../../realtime/whiteboardYjsProvider'
import type { WhiteboardYjsProvider } from '../../realtime/whiteboardYjsProvider'
import {
  appendWhiteboardSnapshotCache,
  clearWhiteboardSnapshotCache,
  getWhiteboardSnapshotCache,
  setWhiteboardSnapshotCache,
} from '../../realtime/whiteboardSnapshotCache'
import { createCroppedBlob } from '../../utils/avatarCropper'
import { compressForUpload } from '../../utils/clientImageProcessing'

const DEFAULT_COLOR = '#111827'
const DEFAULT_WIDTH = 2
const MAX_BUFFERED_EVENTS = 5000
const MIN_MOVE_INTERVAL_MS = import.meta.env.DEV ? 12 : 25
const MIN_MOVE_DISTANCE = 0.002
const RATE_LIMIT_BACKOFF_MS = 2000
const RATE_LIMIT_BACKOFF_INTERVAL_MS = 40
const MAX_RATE_LIMIT_INTERVAL_MS = 80

type WhiteboardCanvasProps = {
  boardId: string
  token: string | null
  transport: WhiteboardTransport
  mode: 'viewer' | 'pad'
  sourceId?: string
  className?: string
}

type StrokeState = {
  x: number
  y: number
  color: string
  width: number
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/**
 * @deprecated Legacy point-stream canvas retained for reference.
 */
export function LegacyWhiteboardCanvas({
  boardId,
  token,
  transport,
  mode,
  sourceId,
  className,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const drawingBufferRef = useRef<WhiteboardStrokeEvent[]>([])
  const activeStrokesRef = useRef<Map<string, StrokeState>>(new Map())
  const pointerStatesRef = useRef<Map<number, { strokeId: string; lastSentAt: number; x: number; y: number }>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const historyCursorRef = useRef<WhiteboardHistoryCursor | null>(null)
  const isLoadingSnapshotRef = useRef(false)
  const pendingEventsRef = useRef<WhiteboardEvent[]>([])
  const surfaceRectRef = useRef<ContainedRect>({ left: 0, top: 0, width: 0, height: 0 })
  const tokenReady = Boolean(token)
  const strokeQueueRef = useRef<ReturnType<typeof createStrokePersistenceQueue> | null>(null)
  const segmenterRef = useRef(createStrokeSegmenter())
  const rateLimitUntilRef = useRef(0)
  const rateLimitIntervalRef = useRef(MIN_MOVE_INTERVAL_MS)
  const errorCountersRef = useRef({
    rateLimited: 0,
    payloadTooLarge: 0,
    invalidPayload: 0,
    other: 0,
  })
  
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  
  // FIX 4: Use a ref for token so background refreshes don't kill the socket
  const tokenRef = useRef(token)
  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const effectiveSourceId = useMemo(() => sourceId ?? null, [sourceId])
  const generateId = useCallback(() => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  const getContext = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }, [])

  const resetCanvasState = useCallback(() => {
    drawingBufferRef.current = []
    activeStrokesRef.current = new Map()
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [getContext])

  const normalizePoint = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return null
    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const surface = surfaceRectRef.current
    if (surface.width <= 0 || surface.height <= 0) return null

    const offsetX = clientX - rect.left - surface.left
    const offsetY = clientY - rect.top - surface.top
    if (offsetX < 0 || offsetY < 0 || offsetX > surface.width || offsetY > surface.height) return null

    const x = clamp01(offsetX / surface.width)
    const y = clamp01(offsetY / surface.height)
    return { x, y }
  }, [])

  const enqueueEvent = useCallback((evt: WhiteboardStrokeEvent) => {
    const list = drawingBufferRef.current
    const last = list[list.length - 1]
    if (typeof evt.seq === 'number' && typeof last?.seq === 'number' && evt.seq < last.seq) {
      const normalized = normalizeHistoryEvents([...list, evt])
      drawingBufferRef.current = normalized.slice(-MAX_BUFFERED_EVENTS)
      return
    }
    list.push(evt)
    if (list.length > MAX_BUFFERED_EVENTS) {
      list.splice(0, list.length - MAX_BUFFERED_EVENTS)
    }
  }, [])

  const redrawFromBuffer = useCallback(() => {
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const tempActive = new Map<string, StrokeState>()

    for (const evt of drawingBufferRef.current) {
      const color = evt.color ?? DEFAULT_COLOR
      const width = evt.width ?? DEFAULT_WIDTH
      if (evt.type === 'stroke:start') {
        tempActive.set(evt.strokeId, { x: evt.x, y: evt.y, color, width })
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
        ctx.lineTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
        ctx.stroke()
      } else {
        const prev = tempActive.get(evt.strokeId)
        const start = prev ?? { x: evt.x, y: evt.y, color, width }
        ctx.strokeStyle = start.color
        ctx.lineWidth = start.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(start.x * canvas.width / window.devicePixelRatio, start.y * canvas.height / window.devicePixelRatio)
        ctx.lineTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
        ctx.stroke()
        tempActive.set(evt.strokeId, { x: evt.x, y: evt.y, color: start.color, width: start.width })
        if (evt.type === 'stroke:end') {
          tempActive.delete(evt.strokeId)
        }
      }
    }

    activeStrokesRef.current = tempActive
  }, [getContext])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const rect = wrapper.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const surface = computeContainedRect(rect.width, rect.height, BOARD_ASPECT)
    surfaceRectRef.current = surface

    canvas.style.position = 'absolute'
    canvas.style.left = `${surface.left}px`
    canvas.style.top = `${surface.top}px`
    canvas.style.width = `${surface.width}px`
    canvas.style.height = `${surface.height}px`

    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(surface.width * dpr))
    const height = Math.max(1, Math.floor(surface.height * dpr))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      redrawFromBuffer()
    }
  }, [redrawFromBuffer])

  useEffect(() => {
    resizeCanvas()
    const wrapper = wrapperRef.current
    if (!wrapper || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => resizeCanvas())
    observer.observe(wrapper)

    return () => {
      observer.disconnect()
    }
  }, [resizeCanvas])

  useEffect(() => {
    const loop = () => {
      redrawFromBuffer()
      animationFrameRef.current = requestAnimationFrame(loop)
    }
    animationFrameRef.current = requestAnimationFrame(loop)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [redrawFromBuffer])

  useEffect(() => {
    // Check initial token
    const activeToken = tokenRef.current
    if (!activeToken) {
      setStatus('idle')
      return
    }

    let cancelled = false
    const abortController = new AbortController()
    setStatus('connecting')
    resetCanvasState()

    const handleIncoming = (evt: WhiteboardEvent) => {
      if (effectiveSourceId && evt.sourceId && evt.sourceId === effectiveSourceId) return

      if (isLoadingSnapshotRef.current) {
        if (pendingEventsRef.current.length === 0) {
          whiteboardDebugLog('snapshot:buffer:start', { boardId })
        }
        pendingEventsRef.current.push(evt)
        return
      }

      if (evt.type === 'whiteboard:clear') {
        drawingBufferRef.current = []
        activeStrokesRef.current = new Map()
        const ctx = getContext()
        const canvas = canvasRef.current
        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
        }
        clearWhiteboardSnapshotCache(boardId)
        return
      }
      enqueueEvent(evt)
      appendWhiteboardSnapshotCache(boardId, evt)
    }

    const unsubscribe = transport.onEvent(handleIncoming)
    const unsubscribeAck = transport.onAck((ack: WhiteboardStrokeAck) => {
      strokeQueueRef.current?.ack(ack)
    })

    const applyPendingEvents = () => {
      if (!pendingEventsRef.current.length) return
      const buffered = pendingEventsRef.current
      pendingEventsRef.current = []
      let strokeCount = 0
      let clearCount = 0
      for (const evt of buffered) {
        if (effectiveSourceId && evt.sourceId && evt.sourceId === effectiveSourceId) continue
        if (evt.type === 'whiteboard:clear') {
          clearCount += 1
          drawingBufferRef.current = []
          activeStrokesRef.current = new Map()
          const ctx = getContext()
          const canvas = canvasRef.current
          if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height)
          }
          clearWhiteboardSnapshotCache(boardId)
          continue
        }
        strokeCount += 1
        enqueueEvent(evt)
        appendWhiteboardSnapshotCache(boardId, evt)
      }
      whiteboardDebugLog('snapshot:buffer:replay', { boardId, strokes: strokeCount, clears: clearCount })
    }

    const loadSnapshot = async () => {
      isLoadingSnapshotRef.current = true
      whiteboardDebugLog('snapshot:load:start', { boardId })
      try {
        const cached = getWhiteboardSnapshotCache(boardId)
        if (cached?.events.length) {
          drawingBufferRef.current = cached.events
          historyCursorRef.current = cached.cursor ?? null
          redrawFromBuffer()
          whiteboardDebugLog('snapshot:cache:events', { boardId, count: cached.events.length })
        } else if (cached?.cursor) {
          historyCursorRef.current = cached.cursor
          whiteboardDebugLog('snapshot:cache:cursor', { boardId, cursor: cached.cursor })
        }

        const snapshot = await fetchWhiteboardSnapshot({
          boardId,
          token: activeToken,
          signal: abortController.signal,
        })
        if (cancelled) return
        if (Array.isArray(snapshot.events)) {
          const normalized = normalizeHistoryEvents(snapshot.events)
          const trimmed = normalized.slice(-MAX_BUFFERED_EVENTS)
          drawingBufferRef.current = trimmed
          historyCursorRef.current = snapshot.cursor ?? null
          setWhiteboardSnapshotCache(boardId, trimmed, snapshot.cursor ?? null)
          redrawFromBuffer()
          whiteboardDebugLog('snapshot:load:success', { boardId, count: trimmed.length })
        }
      } catch (err) {
        if (cancelled) return
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: unknown }).name) : ''
        if (name === 'AbortError') return
        if (!cancelled) setStatus('error')
        return
      } finally {
        isLoadingSnapshotRef.current = false
        whiteboardDebugLog('snapshot:load:complete', { boardId, pending: pendingEventsRef.current.length })
        applyPendingEvents()
      }
    }

    const loadAndConnect = async () => {
      await loadSnapshot()
      if (cancelled) return
      try {
        await transport.connect(boardId, activeToken, historyCursorRef.current)
        if (!cancelled) setStatus('connected')
      } catch {
        if (!cancelled) setStatus('error')
      }
    }

    // Pass the initial token. Subsequent refreshes won't trigger this effect.
    loadAndConnect().catch(() => undefined)

    return () => {
      cancelled = true
      abortController.abort()
      unsubscribe()
      unsubscribeAck()
      transport.disconnect()
    }
    // We intentionally exclude 'token' to prevent the refresh loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, transport, effectiveSourceId, resetCanvasState, redrawFromBuffer, tokenReady]) 

  useEffect(() => {
    const queue = createStrokePersistenceQueue({
      send: (event) => transport.send(event),
    })
    strokeQueueRef.current = queue

    const unsubscribeError = transport.onServerError((error: WhiteboardServerError) => {
      const counters = errorCountersRef.current
      let reason: 'rate_limited' | 'payload_too_large' | 'invalid_payload' | 'other' = 'other'
      if (error.code === 'rate_limited') {
        counters.rateLimited += 1
        reason = 'rate_limited'
        const now = performance.now()
        rateLimitUntilRef.current = now + RATE_LIMIT_BACKOFF_MS
        rateLimitIntervalRef.current = Math.min(
          Math.max(rateLimitIntervalRef.current, RATE_LIMIT_BACKOFF_INTERVAL_MS),
          MAX_RATE_LIMIT_INTERVAL_MS,
        )
        queue.backoff(RATE_LIMIT_BACKOFF_MS)
      } else if (error.code === 'payload_too_large') {
        counters.payloadTooLarge += 1
        reason = 'payload_too_large'
      } else if (error.code === 'invalid_request' || error.code === 'invalid_payload') {
        counters.invalidPayload += 1
        reason = 'invalid_payload'
      } else {
        counters.other += 1
      }

      const activeIterator = pointerStatesRef.current.values().next()
      const activeStrokeId = activeIterator.done ? undefined : activeIterator.value.strokeId
      const now = performance.now()
      const backoffActive = now < rateLimitUntilRef.current
      const minIntervalMs = backoffActive ? rateLimitIntervalRef.current : MIN_MOVE_INTERVAL_MS

      whiteboardDebugLog('stroke:error', {
        code: error.code,
        reason,
        strokeId: activeStrokeId,
        sendMode: 'segment-queue',
        minIntervalMs,
        baseMinIntervalMs: MIN_MOVE_INTERVAL_MS,
        minDistance: MIN_MOVE_DISTANCE,
      })
    })

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        queue.flush('visibility')
      }
    }

    const handlePageHide = () => {
      queue.flush('unmount')
    }

    const handleOnline = () => {
      queue.flush('manual')
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('online', handleOnline)
      unsubscribeError()
      queue.flush('unmount')
      queue.stop()
      segmenterRef.current.reset()
    }
  }, [transport])

  const emitEvent = useCallback((evt: WhiteboardStrokeEvent) => {
    enqueueEvent(evt)
    if (typeof evt.segmentIndex !== 'number') {
      return
    }
    strokeQueueRef.current?.enqueue({ ...evt, segmentIndex: evt.segmentIndex })
  }, [enqueueEvent])

  const handleErase = useCallback(() => {
    drawingBufferRef.current = []
    activeStrokesRef.current = new Map()
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    transport.send({
      type: 'whiteboard:clear',
      boardId,
      t: Date.now(),
      sourceId: effectiveSourceId ?? undefined,
    })
  }, [boardId, effectiveSourceId, getContext, transport])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pad') return
    if (event.pointerType === 'mouse' && event.button !== 0) return

    event.preventDefault()
    const point = normalizePoint(event.clientX, event.clientY)
    if (!point) return

    const strokeId = generateId()
    pointerStatesRef.current.set(event.pointerId, {
      strokeId,
      lastSentAt: performance.now(),
      x: point.x,
      y: point.y,
    })

    event.currentTarget.setPointerCapture(event.pointerId)

    const segmentIndex = segmenterRef.current.nextSegmentIndex(strokeId)
    emitEvent({
      type: 'stroke:start',
      boardId,
      strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
      segmentIndex,
      sourceId: effectiveSourceId ?? undefined,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
    })
  }, [boardId, effectiveSourceId, emitEvent, mode, normalizePoint])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pad') return
    const state = pointerStatesRef.current.get(event.pointerId)
    if (!state) return

    event.preventDefault()
    const point = normalizePoint(event.clientX, event.clientY)
    if (!point) return

    const now = performance.now()
    const dx = point.x - state.x
    const dy = point.y - state.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (now >= rateLimitUntilRef.current && rateLimitIntervalRef.current !== MIN_MOVE_INTERVAL_MS) {
      rateLimitIntervalRef.current = MIN_MOVE_INTERVAL_MS
    }
    const minIntervalMs = now < rateLimitUntilRef.current ? rateLimitIntervalRef.current : MIN_MOVE_INTERVAL_MS
    if (now - state.lastSentAt < minIntervalMs && distance < MIN_MOVE_DISTANCE) return

    state.lastSentAt = now
    state.x = point.x
    state.y = point.y

    const segmentIndex = segmenterRef.current.nextSegmentIndex(state.strokeId)
    emitEvent({
      type: 'stroke:move',
      boardId,
      strokeId: state.strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
      segmentIndex,
      sourceId: effectiveSourceId ?? undefined,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
    })
  }, [boardId, effectiveSourceId, emitEvent, mode, normalizePoint])

  const finishStroke = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const state = pointerStatesRef.current.get(pointerId)
    if (!state) return
    pointerStatesRef.current.delete(pointerId)

    const point = normalizePoint(clientX, clientY) ?? { x: state.x, y: state.y }
    const segmentIndex = segmenterRef.current.nextSegmentIndex(state.strokeId)

    emitEvent({
      type: 'stroke:end',
      boardId,
      strokeId: state.strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
      segmentIndex,
      sourceId: effectiveSourceId ?? undefined,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
    })
    strokeQueueRef.current?.flush('stroke-end')
    segmenterRef.current.clearStroke(state.strokeId)
  }, [boardId, effectiveSourceId, emitEvent, normalizePoint])

  const handlePointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pad') return
    event.preventDefault()
    finishStroke(event.pointerId, event.clientX, event.clientY)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [finishStroke, mode])

  const handlePointerCancel = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'pad') return
    event.preventDefault()
    finishStroke(event.pointerId, event.clientX, event.clientY)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [finishStroke, mode])

  return (
    <div
      ref={wrapperRef}
      className={`relative ${className || ''}`}
      style={{ touchAction: mode === 'pad' ? 'none' : 'auto' }}
    >
      <canvas
        ref={canvasRef}
        className="bg-white rounded-2xl"
        aria-label={mode === 'pad' ? 'Whiteboard pad' : 'Whiteboard view'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      <div className="absolute right-3 top-3 z-10">
        <button
          type="button"
          onClick={handleErase}
          className="rounded-md border border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm hover:bg-white"
          aria-label="Erase whiteboard"
        >
          Erase
        </button>
      </div>
      {status !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 text-sm text-slate-600">
          {status === 'error'
            ? 'Unable to connect to whiteboard.'
            : token
              ? 'Connecting whiteboard…'
              : 'Sign in to use the whiteboard.'}
        </div>
      )}
    </div>
  )
}

const LOCAL_ORIGIN = { origin: 'local' } as const

const DEFAULT_APP_STATE: Pick<AppState, 'viewBackgroundColor' | 'gridSize' | 'theme'> = {
  viewBackgroundColor: '#ffffff',
  gridSize: 0,
  theme: 'light',
}

const STROKE_WIDTH_REMAP: Record<number, number> = {
  1: 0.1,
  2: 1.0,
  3: 5.0,
}

function toWebpFileName(originalName: string): string {
  const lastDot = originalName.lastIndexOf('.')
  if (lastDot === -1) return `${originalName}.webp`
  return `${originalName.slice(0, lastDot)}.webp`
}

type ExcalidrawWhiteboardCanvasProps = {
  boardId: string
  token: string | null
  mode: 'viewer' | 'pad'
  className?: string
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
  onBackgroundInfoChange?: (info: BackgroundInfo | null) => void
}

type PersistedAppState = Pick<AppState, 'viewBackgroundColor' | 'gridSize' | 'theme'>
type ExcalidrawElement = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number]

const isBackgroundElement = (element: { type?: string; locked?: boolean }) =>
  element.type === 'image' && element.locked === true

type BackgroundFitMode = 'width' | 'contain'

export type BackgroundInfo = {
  name: string
  sizeBytes: number
  fileId?: string
  originalSizeBytes?: number
  originalType?: string
  convertedSizeBytes?: number
  convertedType?: string
  convertedName?: string
}

export type WhiteboardCanvasHandle = {
  openBackgroundPicker: () => void
  clearBackground: () => void
  toggleBackgroundFitMode: () => void
  toggleViewMode: () => void
}

function resolveAppState(value: unknown): PersistedAppState {
  if (!value || typeof value !== 'object') return DEFAULT_APP_STATE
  const candidate = value as Partial<PersistedAppState>
  const theme = candidate.theme
  return {
    viewBackgroundColor:
      typeof candidate.viewBackgroundColor === 'string'
        ? candidate.viewBackgroundColor
        : DEFAULT_APP_STATE.viewBackgroundColor,
    gridSize:
      typeof candidate.gridSize === 'number'
        ? candidate.gridSize
        : DEFAULT_APP_STATE.gridSize,
    theme: theme === 'dark' || theme === 'light' || theme === 'system' ? theme : DEFAULT_APP_STATE.theme,
  }
}

function resolveFiles(value: unknown): BinaryFiles {
  if (!value || typeof value !== 'object') return {}
  return value as BinaryFiles
}

function resolveElements(value: unknown): ExcalidrawElement[] | null {
  if (!Array.isArray(value)) return null
  return value as ExcalidrawElement[]
}

function resolveBackgroundInfo(value: unknown): BackgroundInfo | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<BackgroundInfo>
  if (typeof candidate.name !== 'string' || candidate.name.trim().length === 0) return null
  const sizeBytes =
    typeof candidate.sizeBytes === 'number' && Number.isFinite(candidate.sizeBytes) && candidate.sizeBytes >= 0
      ? candidate.sizeBytes
      : typeof candidate.convertedSizeBytes === 'number' && Number.isFinite(candidate.convertedSizeBytes) && candidate.convertedSizeBytes >= 0
        ? candidate.convertedSizeBytes
        : null
  if (sizeBytes === null) {
    return null
  }
  const info: BackgroundInfo = {
    name: candidate.name.trim(),
    sizeBytes,
  }
  if (typeof candidate.fileId === 'string') {
    info.fileId = candidate.fileId
  }
  if (typeof candidate.originalSizeBytes === 'number') {
    info.originalSizeBytes = candidate.originalSizeBytes
  }
  if (typeof candidate.originalType === 'string') {
    info.originalType = candidate.originalType
  }
  if (typeof candidate.convertedSizeBytes === 'number') {
    info.convertedSizeBytes = candidate.convertedSizeBytes
  }
  if (typeof candidate.convertedType === 'string') {
    info.convertedType = candidate.convertedType
  }
  if (typeof candidate.convertedName === 'string') {
    info.convertedName = candidate.convertedName
  }
  return info
}

function pickPersistedAppState(appState: AppState): PersistedAppState {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    theme: appState.theme,
  }
}

const FREEDRAW_MIN_POINT_DISTANCE = 0
const SYNC_THROTTLE_MS = 80

function simplifyFreedrawPoints(points: ReadonlyArray<[number, number]>) {
  if (points.length <= 2) return points
  const simplified: [number, number][] = [points[0]]
  let last = points[0]
  for (let i = 1; i < points.length - 1; i += 1) {
    const current = points[i]
    const dx = current[0] - last[0]
    const dy = current[1] - last[1]
    if (Math.hypot(dx, dy) >= FREEDRAW_MIN_POINT_DISTANCE) {
      simplified.push(current)
      last = current
    }
  }
  simplified.push(points[points.length - 1])
  return simplified
}

function simplifyFreedrawElements(elements: readonly ExcalidrawElement[]) {
  let changed = false
  const next = elements.map((element) => {
    if (element.type !== 'freedraw') return element
    const points = (element as { points?: ReadonlyArray<[number, number]> }).points
    if (!points || !Array.isArray(points)) return element
    const simplified = simplifyFreedrawPoints(points)
    if (simplified.length === points.length) return element
    changed = true
    return { ...element, points: simplified }
  })
  return { elements: next, changed }
}

function summarizeFreedraw(elements: readonly ExcalidrawElement[]) {
  let count = 0
  let totalPoints = 0
  let maxPoints = 0
  for (const element of elements) {
    if (element.type !== 'freedraw') continue
    const points = (element as { points?: ReadonlyArray<[number, number]> }).points
    if (!points || !Array.isArray(points)) continue
    count += 1
    totalPoints += points.length
    if (points.length > maxPoints) maxPoints = points.length
  }
  return { count, totalPoints, maxPoints }
}

function arePersistedAppStatesEqual(a: PersistedAppState | null, b: PersistedAppState | null) {
  if (!a || !b) return false
  return a.viewBackgroundColor === b.viewBackgroundColor && a.gridSize === b.gridSize && a.theme === b.theme
}

function buildElementVersionMap(elements: readonly ExcalidrawElement[]) {
  const map = new Map<string, { version: number; versionNonce: number }>()
  for (const element of elements) {
    const version = typeof element.version === 'number' ? element.version : -1
    const versionNonce = typeof element.versionNonce === 'number' ? element.versionNonce : -1
    map.set(element.id, { version, versionNonce })
  }
  return map
}

function haveElementsChanged(
  elements: readonly ExcalidrawElement[],
  lastMap: Map<string, { version: number; versionNonce: number }> | null,
) {
  if (!lastMap || lastMap.size !== elements.length) return true
  for (const element of elements) {
    const prev = lastMap.get(element.id)
    if (!prev) return true
    const version = typeof element.version === 'number' ? element.version : -1
    const versionNonce = typeof element.versionNonce === 'number' ? element.versionNonce : -1
    if (prev.version !== version || prev.versionNonce !== versionNonce) return true
  }
  return false
}

function getFileKeys(files: BinaryFiles) {
  return Object.keys(files).sort()
}

function areFileKeysEqual(a: string[] | null, b: string[]) {
  if (!a || a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const WhiteboardCanvas = forwardRef<WhiteboardCanvasHandle, ExcalidrawWhiteboardCanvasProps>(
  (
    {
      boardId,
      token,
      mode,
      className,
      onViewModeChange,
      onBackgroundFitModeChange,
      onHasBackgroundChange,
      onBackgroundInfoChange,
    },
    ref,
  ) => {
  const [viewModeEnabled, setViewModeEnabled] = useState(mode === 'viewer')
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null)
  const [isSynced, setIsSynced] = useState(false)
  const [hasBackground, setHasBackground] = useState(false)
  const [backgroundInfo, setBackgroundInfo] = useState<BackgroundInfo | null>(null)
  const [boardRect, setBoardRect] = useState<ContainedRect>({ left: 0, top: 0, width: 0, height: 0 })
  const [backgroundFitMode, setBackgroundFitMode] = useState<BackgroundFitMode>('width')

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const yjsProviderRef = useRef<WhiteboardYjsProvider | null>(null)
  const viewModeEnabledRef = useRef(viewModeEnabled)
  const docRef = useRef<Y.Doc | null>(null)
  const mapRef = useRef<Y.Map<unknown> | null>(null)
  const boardFrameRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const suppressSyncRef = useRef(false)
  const isLocallyDrawingRef = useRef(false)
  const pendingRemoteSyncRef = useRef(false)
  const isResettingRef = useRef(false)
  const lastNonEmptySceneRef = useRef(false)
  const pendingLocalSceneRef = useRef<{
    elements: readonly ExcalidrawElement[]
    appState: AppState
    files: BinaryFiles
  } | null>(null)
  const needsFinalCommitRef = useRef(false)
  const pendingSyncRef = useRef<{
    elements: readonly ExcalidrawElement[]
    appState: AppState
    files: BinaryFiles
  } | null>(null)
  const syncThrottleTimerRef = useRef<number | null>(null)
  const lastSyncedElementsRef = useRef<Map<string, { version: number; versionNonce: number }> | null>(null)
  const lastSyncedAppStateRef = useRef<PersistedAppState | null>(null)
  const lastSyncedFilesRef = useRef<string[] | null>(null)
  const pointerGuardCleanupRef = useRef<(() => void) | null>(null)
  const excalidrawReadyRef = useRef(false)
  const idleCommitTimerRef = useRef<number | null>(null)

  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false)
  const [backgroundCaptureOpen, setBackgroundCaptureOpen] = useState(false)
  const [backgroundCropSource, setBackgroundCropSource] = useState<{ file: File; url: string } | null>(null)
  const [backgroundCropError, setBackgroundCropError] = useState<string | null>(null)
  const [backgroundCrop, setBackgroundCrop] = useState<Crop>({ unit: '%', width: 90, height: 90, x: 5, y: 5 })
  const [backgroundCompletedCrop, setBackgroundCompletedCrop] = useState<PixelCrop | null>(null)
  const [backgroundImageSize, setBackgroundImageSize] = useState<{ width: number; height: number } | null>(null)
  const [backgroundZoom, setBackgroundZoom] = useState(1)
  const [backgroundAspect, setBackgroundAspect] = useState<'landscape' | 'portrait' | 'free'>('landscape')
  const [backgroundSaving, setBackgroundSaving] = useState(false)

  useEffect(() => {
    return () => {
      if (backgroundCropSource) {
        URL.revokeObjectURL(backgroundCropSource.url)
      }
    }
  }, [backgroundCropSource])

  useEffect(() => {
    setViewModeEnabled(mode === 'viewer')
  }, [mode])

  useEffect(() => {
    if (!token) {
      setIsSynced(false)
    }
  }, [token])

  useEffect(() => {
    whiteboardDebugLog('whiteboard:mount', { boardId, mode })
  }, [boardId, mode])

  useEffect(() => {
    viewModeEnabledRef.current = viewModeEnabled
  }, [viewModeEnabled])

  useEffect(() => {
    onViewModeChange?.(viewModeEnabled)
  }, [onViewModeChange, viewModeEnabled])

  useEffect(() => {
    onBackgroundFitModeChange?.(backgroundFitMode)
  }, [backgroundFitMode, onBackgroundFitModeChange])

  useEffect(() => {
    onHasBackgroundChange?.(hasBackground)
  }, [hasBackground, onHasBackgroundChange])

  useEffect(() => {
    onBackgroundInfoChange?.(backgroundInfo)
  }, [backgroundInfo, onBackgroundInfoChange])

  const updateBoardRect = useCallback(() => {
    const frame = boardFrameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    setBoardRect({
      left: 0,
      top: 0,
      width: rect.width,
      height: rect.height,
    })
  }, [])

  useEffect(() => {
    updateBoardRect()
    const frame = boardFrameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => updateBoardRect())
    observer.observe(frame)
    return () => observer.disconnect()
  }, [updateBoardRect])

  const computeBackgroundRect = useCallback(
    (imageWidth: number, imageHeight: number, mode: BackgroundFitMode) => {
      if (boardRect.width <= 0 || boardRect.height <= 0 || imageWidth <= 0 || imageHeight <= 0) {
        return { x: 0, y: 0, width: imageWidth, height: imageHeight }
      }

      const aspect = imageWidth / imageHeight
      if (!Number.isFinite(aspect) || aspect <= 0) {
        return { x: 0, y: 0, width: imageWidth, height: imageHeight }
      }

      if (mode === 'contain') {
        const width = Math.min(boardRect.width, boardRect.height * aspect)
        const height = width / aspect
        return {
          x: (boardRect.width - width) / 2,
          y: (boardRect.height - height) / 2,
          width,
          height,
        }
      }

      const width = boardRect.width
      const height = width / aspect
      return {
        x: 0,
        y: (boardRect.height - height) / 2,
        width,
        height,
      }
    },
    [boardRect.height, boardRect.width],
  )

  const resizeBackgroundToFit = useCallback(
    (mode: BackgroundFitMode) => {
      const api = excalidrawApiRef.current
      if (!api) return
      const elements = api.getSceneElements()
      const background = elements.find((element) => isBackgroundElement(element))
      if (!background || typeof background.width !== 'number' || typeof background.height !== 'number') return

      const rect = computeBackgroundRect(background.width, background.height, mode)
      const updated = {
        ...background,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }

      const elementsToKeep = elements.filter((element) => element.id !== background.id)
      api.updateScene({ elements: [updated, ...elementsToKeep] })
    },
    [computeBackgroundRect],
  )

  useEffect(() => {
    if (!hasBackground) return
    resizeBackgroundToFit(backgroundFitMode)
  }, [backgroundFitMode, boardRect, hasBackground, resizeBackgroundToFit])

  const generateId = useCallback(() => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID()
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  const applySceneFromYjs = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (isLocallyDrawingRef.current) {
      pendingRemoteSyncRef.current = true
      return
    }

    const elements = resolveElements(map.get('elements'))
    if (!elements) return

    const appState = resolveAppState(map.get('appState'))
    const files = resolveFiles(map.get('files'))
    const nextBackgroundInfo = resolveBackgroundInfo(map.get('backgroundInfo'))

    const scene: ExcalidrawInitialDataState = {
      elements,
      appState: {
        ...appState,
        viewModeEnabled,
        zenModeEnabled: false,
      },
      files,
    }

    const hasBackgroundElement = elements.some(isBackgroundElement)
    setHasBackground(hasBackgroundElement)
    setBackgroundInfo(hasBackgroundElement ? nextBackgroundInfo : null)
    whiteboardDebugLog('whiteboard:remote:apply', {
      boardId,
      elements: elements.length,
      files: Object.keys(files).length,
      hasBackground: hasBackgroundElement,
      backgroundFileId: nextBackgroundInfo?.fileId ?? null,
    })
    lastSyncedElementsRef.current = buildElementVersionMap(elements)
    lastSyncedAppStateRef.current = appState
    lastSyncedFilesRef.current = getFileKeys(files)

    if (!excalidrawApiRef.current) {
      setInitialData(scene)
      return
    }

    const currentState = excalidrawApiRef.current.getAppState()
    const fileEntries = Object.values(files)
    if (fileEntries.length) {
      excalidrawApiRef.current.addFiles(fileEntries)
    }
    suppressSyncRef.current = true
    excalidrawApiRef.current.updateScene({
      elements: scene.elements,
      appState: {
        ...currentState,
        ...scene.appState,
        viewModeEnabled,
        zenModeEnabled: false,
      },
    })
    requestAnimationFrame(() => {
      suppressSyncRef.current = false
    })
  }, [viewModeEnabled])

  const applyPendingRemoteScene = useCallback(() => {
    if (!pendingRemoteSyncRef.current) return
    pendingRemoteSyncRef.current = false
    applySceneFromYjs()
  }, [applySceneFromYjs])

  const updateAwarenessState = useCallback((isViewMode: boolean) => {
    const awareness = yjsProviderRef.current?.provider.awareness
    if (!awareness) return
    awareness.setLocalStateField('mode', isViewMode ? 'viewer' : 'draw')
    awareness.setLocalStateField('canWrite', !isViewMode)
  }, [])

  const readFileAsDataUrl = useCallback((file: Blob) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result)
        } else {
          reject(new Error('Unable to read image data.'))
        }
      }
      reader.onerror = () => {
        reject(reader.error ?? new Error('Unable to read image data.'))
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const loadImageDimensions = useCallback((dataUrl: string) => {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => {
        resolve({
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
        })
      }
      image.onerror = () => reject(new Error('Unable to load image.'))
      image.src = dataUrl
    })
  }, [])

  const startBackgroundCrop = useCallback((file: File) => {
    setBackgroundCropError(null)
    setBackgroundCrop({ unit: '%', width: 90, height: 90, x: 5, y: 5 })
    setBackgroundCompletedCrop(null)
    setBackgroundImageSize(null)
    setBackgroundZoom(1)
    setBackgroundAspect('landscape')
    const url = URL.createObjectURL(file)
    setBackgroundCropSource({ file, url })
  }, [])

  const handleBackgroundFilePick = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      setBackgroundPickerOpen(false)
      startBackgroundCrop(file)
    },
    [startBackgroundCrop],
  )

  const applyBackgroundFile = useCallback(
    async (file: File) => {
      const api = excalidrawApiRef.current
      if (!api) return

      try {
        const originalName = file.name?.trim() || 'Background image'
        const originalType = file.type || 'image/*'
        const originalSizeBytes = file.size
        const compression = await compressForUpload(file)
        const convertedName = toWebpFileName(originalName)
        const convertedType = 'image/webp'
        const convertedSizeBytes = compression.compressedSize
        const convertedFile = new File([compression.blob], convertedName, {
          type: convertedType,
          lastModified: file.lastModified,
        })

        const dataUrl = await readFileAsDataUrl(convertedFile)
        const dimensions = await loadImageDimensions(dataUrl)
        const rawWidth = Math.max(1, dimensions.width)
        const rawHeight = Math.max(1, dimensions.height)
        const fitted = computeBackgroundRect(rawWidth, rawHeight, backgroundFitMode)
        const fileId = generateId() as BinaryFileData['id']
        const elementId = generateId()
        const now = Date.now()
        const elements = api.getSceneElements()
        const elementsToKeep = elements.filter((element) => !isBackgroundElement(element))
        const imageIndex = typeof elementsToKeep[0]?.index === 'string' ? elementsToKeep[0]?.index : undefined

        whiteboardDebugLog('whiteboard:background:upload:start', {
          boardId,
          fileType: convertedType,
          width: fitted.width,
          height: fitted.height,
          hasIndex: typeof imageIndex === 'string',
          elementCount: elements.length,
        })

        const fileData: BinaryFileData = {
          id: fileId,
          dataURL: dataUrl as BinaryFileData['dataURL'],
          mimeType: convertedType as BinaryFileData['mimeType'],
          created: now,
          lastRetrieved: now,
        }

        api.addFiles([fileData])

        const imageElement = {
          id: elementId,
          type: 'image',
          x: fitted.x,
          y: fitted.y,
          width: fitted.width,
          height: fitted.height,
          angle: 0,
          strokeColor: 'transparent',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: Math.floor(Math.random() * 2 ** 31),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          ...(imageIndex ? { index: imageIndex } : {}),
          isDeleted: false,
          boundElements: null,
          updated: now,
          link: null,
          locked: true,
          fileId,
          scale: [1, 1],
          crop: null,
          status: 'pending',
        } as ExcalidrawElement

        api.updateScene({
          elements: [imageElement, ...elementsToKeep],
        })
        setHasBackground(true)
        const nextBackgroundInfo: BackgroundInfo = {
          name: originalName,
          sizeBytes: convertedSizeBytes,
          fileId,
          originalSizeBytes,
          originalType,
          convertedSizeBytes,
          convertedType,
          convertedName,
        }
        setBackgroundInfo(nextBackgroundInfo)

        const doc = docRef.current
        const map = mapRef.current
        if (doc && map) {
          doc.transact(() => {
            map.set('backgroundInfo', nextBackgroundInfo)
            map.set('updatedAt', Date.now())
          }, LOCAL_ORIGIN)
        }
        whiteboardDebugLog('whiteboard:background:upload:success', {
          boardId,
          elementId,
          fileId,
          hasIndex: Boolean(imageIndex),
          elementCount: elementsToKeep.length + 1,
        })
      } catch (error) {
        whiteboardDebugLog('whiteboard:background:upload:error', {
          boardId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [backgroundFitMode, boardId, computeBackgroundRect, generateId, loadImageDimensions, readFileAsDataUrl],
  )

  const backgroundAspectValue = useMemo(() => {
    if (backgroundAspect === 'free') return undefined
    return backgroundAspect === 'landscape' ? 16 / 9 : 9 / 16
  }, [backgroundAspect])

  const buildBackgroundCrop = useCallback(
    (imageWidth: number, imageHeight: number, aspect?: number) => {
      if (!imageWidth || !imageHeight) {
        return { unit: '%', width: 90, height: 90, x: 5, y: 5 } as Crop
      }
      if (aspect) {
        return centerCrop(
          makeAspectCrop({ unit: '%', width: 90 }, aspect, imageWidth, imageHeight),
          imageWidth,
          imageHeight,
        )
      }
      return centerCrop({ unit: '%', width: 90, height: 90 }, imageWidth, imageHeight)
    },
    [],
  )

  useEffect(() => {
    if (!backgroundImageSize) return
    const nextCrop = buildBackgroundCrop(backgroundImageSize.width, backgroundImageSize.height, backgroundAspectValue)
    setBackgroundCrop(nextCrop)
    setBackgroundCompletedCrop(convertToPixelCrop(nextCrop, backgroundImageSize.width, backgroundImageSize.height))
  }, [backgroundAspectValue, backgroundImageSize, buildBackgroundCrop])

  const handleBackgroundCropSave = useCallback(async () => {
    if (!backgroundCropSource || !backgroundCompletedCrop || backgroundCompletedCrop.width <= 0 || backgroundCompletedCrop.height <= 0) {
      setBackgroundCropError('Please select a crop area first')
      return
    }

    setBackgroundSaving(true)
    setBackgroundCropError(null)

    try {
      const outputWidth = Math.max(1, Math.round(backgroundCompletedCrop.width))
      const outputHeight = Math.max(1, Math.round(backgroundCompletedCrop.height))
      const blob = await createCroppedBlob(
        backgroundCropSource.url,
        {
          x: backgroundCompletedCrop.x,
          y: backgroundCompletedCrop.y,
          width: backgroundCompletedCrop.width,
          height: backgroundCompletedCrop.height,
        },
        { width: outputWidth, height: outputHeight },
      )
      const croppedFile = new File([blob], `background-${Date.now()}.jpg`, {
        type: blob.type || 'image/jpeg',
        lastModified: Date.now(),
      })
      await applyBackgroundFile(croppedFile)
      setBackgroundCropSource(null)
    } catch (error) {
      setBackgroundCropError(error instanceof Error ? error.message : 'Failed to crop image')
    } finally {
      setBackgroundSaving(false)
    }
  }, [applyBackgroundFile, backgroundCropSource, backgroundCompletedCrop])

  const handleBackgroundCropCancel = useCallback(() => {
    setBackgroundCropSource(null)
    setBackgroundCropError(null)
    setBackgroundSaving(false)
  }, [])

  const handleBackgroundClear = useCallback(() => {
    const api = excalidrawApiRef.current
    if (!api) return

    const elements = api.getSceneElements()
    const backgroundElements = elements.filter(isBackgroundElement)
    if (!backgroundElements.length) return

    const elementsToKeep = elements.filter((element) => !isBackgroundElement(element))
    const currentState = api.getAppState()

    suppressSyncRef.current = true
    api.updateScene({
      elements: elementsToKeep,
      appState: currentState,
    })
    requestAnimationFrame(() => {
      suppressSyncRef.current = false
    })

    lastNonEmptySceneRef.current = elementsToKeep.length > 0
    setHasBackground(false)
    setBackgroundInfo(null)

    const doc = docRef.current
    const map = mapRef.current
    if (!doc || !map) return

    const currentFiles = resolveFiles(map.get('files'))
    const backgroundFileIds = new Set(
      backgroundElements
        .map((element) => ('fileId' in element ? String(element.fileId) : undefined))
        .filter((fileId): fileId is string => typeof fileId === 'string'),
    )
    const nextFiles = Object.fromEntries(
      Object.entries(currentFiles).filter(([id]) => !backgroundFileIds.has(id)),
    ) as BinaryFiles

    doc.transact(() => {
      map.set('elements', elementsToKeep)
      map.set('appState', pickPersistedAppState(currentState))
      map.set('files', nextFiles)
      map.delete('backgroundInfo')
      map.set('updatedAt', Date.now())
    }, LOCAL_ORIGIN)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      openBackgroundPicker: () => {
        setBackgroundPickerOpen(true)
      },
      clearBackground: () => {
        handleBackgroundClear()
      },
      toggleBackgroundFitMode: () => {
        setBackgroundFitMode((prev) => (prev === 'width' ? 'contain' : 'width'))
      },
      toggleViewMode: () => {
        setViewModeEnabled((prev) => !prev)
      },
    }),
    [handleBackgroundClear],
  )

  const flushSceneToYjs = useCallback(
    (scene: { elements: readonly ExcalidrawElement[]; appState: AppState; files: BinaryFiles }) => {
      const doc = docRef.current
      const map = mapRef.current
      if (!doc || !map) return

      const persistedAppState = pickPersistedAppState(scene.appState)
      const fileKeys = getFileKeys(scene.files)
      const elementsChanged = haveElementsChanged(scene.elements, lastSyncedElementsRef.current)
      const appStateChanged = !arePersistedAppStatesEqual(lastSyncedAppStateRef.current, persistedAppState)
      const filesChanged = !areFileKeysEqual(lastSyncedFilesRef.current, fileKeys)

      if (!elementsChanged && !appStateChanged && !filesChanged) return

      whiteboardDebugLog('yjs:flush', {
        elementsChanged,
        appStateChanged,
        filesChanged,
      })

      doc.transact(() => {
        let didSet = false
        if (elementsChanged) {
          map.set('elements', scene.elements)
          didSet = true
        }
        if (appStateChanged) {
          map.set('appState', persistedAppState)
          didSet = true
        }
        if (filesChanged) {
          map.set('files', scene.files)
          didSet = true
        }
        if (didSet) {
          map.set('updatedAt', Date.now())
        }
      }, LOCAL_ORIGIN)

      if (elementsChanged) {
        lastSyncedElementsRef.current = buildElementVersionMap(scene.elements)
      }
      if (appStateChanged) {
        lastSyncedAppStateRef.current = persistedAppState
      }
      if (filesChanged) {
        lastSyncedFilesRef.current = fileKeys
      }
    },
    [],
  )

  const scheduleSceneSync = useCallback(
    (scene: { elements: readonly ExcalidrawElement[]; appState: AppState; files: BinaryFiles }) => {
      pendingSyncRef.current = scene
      if (syncThrottleTimerRef.current !== null) return
      syncThrottleTimerRef.current = window.setTimeout(() => {
        syncThrottleTimerRef.current = null
        const pending = pendingSyncRef.current
        if (!pending) return
        pendingSyncRef.current = null
        flushSceneToYjs(pending)
      }, SYNC_THROTTLE_MS)
    },
    [flushSceneToYjs],
  )

  const commitPendingLocalScene = useCallback((scene?: {
    elements: readonly ExcalidrawElement[]
    appState: AppState
    files: BinaryFiles
  }) => {
    const pending = scene ?? pendingLocalSceneRef.current
    let resolved = pending
    if (!resolved) {
      const api = excalidrawApiRef.current
      const map = mapRef.current
      if (!api || !map) return
      resolved = {
        elements: api.getSceneElements(),
        appState: api.getAppState(),
        files: resolveFiles(map.get('files')),
      }
    }
    const api = excalidrawApiRef.current
    const latest = api
      ? {
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          files: resolved.files,
        }
      : resolved
    if (syncThrottleTimerRef.current !== null) {
      window.clearTimeout(syncThrottleTimerRef.current)
      syncThrottleTimerRef.current = null
    }
    pendingSyncRef.current = null
    // Apply stroke-width remap for any pending selected elements (do this off the hot-path)
    let nextElements = latest.elements
    let nextAppState = latest.appState
    const remappedWidth = STROKE_WIDTH_REMAP[latest.appState.currentItemStrokeWidth]
    if (remappedWidth && latest.appState.currentItemStrokeWidth !== remappedWidth) {
      const selectedIds = latest.appState.selectedElementIds ?? {}
      if (Object.keys(selectedIds).length) {
        nextElements = latest.elements.map((element) =>
          selectedIds[element.id] ? { ...element, strokeWidth: remappedWidth } : element,
        )
      }
      nextAppState = { ...latest.appState, currentItemStrokeWidth: remappedWidth }
    }

    // Run freedraw simplification only on commit (pointer-up / idle)
    const beforeSummary = summarizeFreedraw(nextElements)
    const simplified = simplifyFreedrawElements(nextElements)
    const afterSummary = summarizeFreedraw(simplified.elements)

    pendingLocalSceneRef.current = null
    if (simplified.changed && excalidrawApiRef.current) {
      suppressSyncRef.current = true
      excalidrawApiRef.current.updateScene({
        elements: simplified.elements,
        appState: nextAppState,
      })
      requestAnimationFrame(() => {
        suppressSyncRef.current = false
      })
    }

    // Reflect background presence after commit to avoid React churn while drawing
    setHasBackground((simplified.elements ?? nextElements).some(isBackgroundElement))

    flushSceneToYjs({ elements: simplified.elements, appState: nextAppState, files: latest.files })
    whiteboardDebugLog('whiteboard:commit', {
      elements: simplified.elements.length,
      files: Object.keys(latest.files || {}).length,
      background: (simplified.elements ?? nextElements).some(isBackgroundElement),
      freedrawBefore: beforeSummary,
      freedrawAfter: afterSummary,
    })
  }, [flushSceneToYjs])

  const registerPointerGuard = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      if (!api || pointerGuardCleanupRef.current) return

      // Sync pause: keep remote updates from clobbering local pointer strokes mid-draw.
      const offPointerDown = api.onPointerDown(() => {
        isLocallyDrawingRef.current = true
        needsFinalCommitRef.current = false
        whiteboardDebugLog('whiteboard:pointer:down', { boardId })
      })

      const offPointerUp = api.onPointerUp(() => {
        // Keep local-drawing guard enabled until after the final commit.
        isLocallyDrawingRef.current = true
        needsFinalCommitRef.current = false
        const finalize = () => {
          const apiSnapshot = excalidrawApiRef.current
          const elementCount = apiSnapshot ? apiSnapshot.getSceneElements().length : 0
          const pendingCount = pendingLocalSceneRef.current?.elements.length ?? null
          commitPendingLocalScene()
          applyPendingRemoteScene()
          isLocallyDrawingRef.current = false
          whiteboardDebugLog('whiteboard:pointer:commit', {
            boardId,
            elementCount,
            pendingCount,
            viewMode: viewModeEnabledRef.current,
          })
        }
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => finalize())
        } else {
          setTimeout(() => finalize(), 0)
        }
      })

      pointerGuardCleanupRef.current = () => {
        offPointerDown()
        offPointerUp()
      }
    },
    [applyPendingRemoteScene, commitPendingLocalScene],
  )

  const handleReset = useCallback(() => {
    const doc = docRef.current
    const map = mapRef.current
    const api = excalidrawApiRef.current

    isResettingRef.current = true
    pendingLocalSceneRef.current = null

    if (api) {
      const currentState = api.getAppState()
      if (api.getSceneElements().length) {
        suppressSyncRef.current = true
        api.updateScene({
          elements: [],
          appState: currentState,
        })
        requestAnimationFrame(() => {
          suppressSyncRef.current = false
        })
      }
    }

    if (doc && map) {
      doc.transact(() => {
        map.set('elements', [])
        map.set('files', {})
        map.set('appState', api ? pickPersistedAppState(api.getAppState()) : DEFAULT_APP_STATE)
        map.set('updatedAt', Date.now())
        const shared = doc.getArray('excalidraw')
        if (shared.length) {
          shared.delete(0, shared.length)
        }
      }, LOCAL_ORIGIN)
    }

    pendingSyncRef.current = null
    if (syncThrottleTimerRef.current !== null) {
      window.clearTimeout(syncThrottleTimerRef.current)
      syncThrottleTimerRef.current = null
    }
    lastSyncedElementsRef.current = new Map()
    lastSyncedAppStateRef.current = api ? pickPersistedAppState(api.getAppState()) : DEFAULT_APP_STATE
    lastSyncedFilesRef.current = []

    requestAnimationFrame(() => {
      isResettingRef.current = false
      lastNonEmptySceneRef.current = false
    })
    setHasBackground(false)
  }, [])

  useEffect(() => {
    if (!token) {
      return
    }

    let canceled = false
    let cleanupProvider: (() => void) | null = null
    const controller = new AbortController()

    const startProvider = (wsToken?: string) => {
      if (canceled) return
      setIsSynced(false)

      const provider = createWhiteboardYjsProvider({
        apiBaseUrl: API_BASE_URL,
        boardId,
        token,
        wsToken,
      })

      docRef.current = provider.doc
      mapRef.current = provider.doc.getMap('excalidraw')
      yjsProviderRef.current = provider
      updateAwarenessState(viewModeEnabledRef.current)

      const handleSync = (synced: boolean) => {
        if (!synced) return
        // Sync handshake: only render Excalidraw after the provider reports a full sync.
        setIsSynced(true)
        whiteboardDebugLog('whiteboard:sync', { boardId })
        if (isLocallyDrawingRef.current) {
          // Sync pause: delay remote scene application while the local stroke is active.
          pendingRemoteSyncRef.current = true
          return
        }
        applySceneFromYjs()
      }

      const handleUpdate = (_update: Uint8Array, origin: unknown) => {
        if (origin === LOCAL_ORIGIN) return
        if (isLocallyDrawingRef.current) {
          // Sync pause: delay remote scene application while the local stroke is active.
          pendingRemoteSyncRef.current = true
          return
        }
        applySceneFromYjs()
      }

      provider.provider.on('sync', handleSync)
      provider.doc.on('update', handleUpdate)

      cleanupProvider = () => {
        provider.provider.off('sync', handleSync)
        provider.doc.off('update', handleUpdate)
        provider.destroy()
        yjsProviderRef.current = null
        docRef.current = null
        mapRef.current = null
        setIsSynced(false)
        pendingSyncRef.current = null
        lastSyncedElementsRef.current = null
        lastSyncedAppStateRef.current = null
        lastSyncedFilesRef.current = null
        if (syncThrottleTimerRef.current !== null) {
          window.clearTimeout(syncThrottleTimerRef.current)
          syncThrottleTimerRef.current = null
        }
      }
    }

    const init = async () => {
      try {
        const ticket = await fetchWhiteboardWsToken({ boardId, token, signal: controller.signal })
        startProvider(ticket.token)
      } catch {
        startProvider()
      }
    }

    void init()

    return () => {
      canceled = true
      controller.abort()
      cleanupProvider?.()
    }
  }, [applySceneFromYjs, boardId, token, updateAwarenessState])

  useEffect(() => {
    return () => {
      pointerGuardCleanupRef.current?.()
      pointerGuardCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (syncThrottleTimerRef.current !== null) {
        window.clearTimeout(syncThrottleTimerRef.current)
        syncThrottleTimerRef.current = null
      }
      if (idleCommitTimerRef.current !== null) {
        window.clearTimeout(idleCommitTimerRef.current)
        idleCommitTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!excalidrawApiRef.current) return
    const currentState = excalidrawApiRef.current.getAppState()
    suppressSyncRef.current = true
    excalidrawApiRef.current.updateScene({
      appState: {
        ...currentState,
        viewModeEnabled,
        zenModeEnabled: false,
      },
    })
    requestAnimationFrame(() => {
      suppressSyncRef.current = false
    })
    updateAwarenessState(viewModeEnabled)
  }, [updateAwarenessState, viewModeEnabled])

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (suppressSyncRef.current) return
      if (!docRef.current || !mapRef.current) return

      isLocallyDrawingRef.current = true
      needsFinalCommitRef.current = false
      if (idleCommitTimerRef.current !== null) {
        window.clearTimeout(idleCommitTimerRef.current)
      }
      idleCommitTimerRef.current = window.setTimeout(() => {
        idleCommitTimerRef.current = null
        if (!isLocallyDrawingRef.current) return
        commitPendingLocalScene()
        applyPendingRemoteScene()
        isLocallyDrawingRef.current = false
        whiteboardDebugLog('whiteboard:idle:commit', {
          boardId,
          elementCount: excalidrawApiRef.current?.getSceneElements().length ?? 0,
        })
      }, 180)

      // Avoid heavy transforms and React churn on the hot drawing path.
      const remappedWidth = STROKE_WIDTH_REMAP[appState.currentItemStrokeWidth]
      let nextAppState = appState
      let nextElements = elements

      // If a remap is required, defer mutation of elements to commit time when drawing.
      if (remappedWidth && appState.currentItemStrokeWidth !== remappedWidth) {
        if (!isLocallyDrawingRef.current) {
          // If not actively drawing, apply remap immediately for UX consistency.
          const selectedIds = appState.selectedElementIds ?? {}
          if (Object.keys(selectedIds).length) {
            nextElements = elements.map((element) =>
              selectedIds[element.id] ? { ...element, strokeWidth: remappedWidth } : element,
            )
            suppressSyncRef.current = true
            excalidrawApiRef.current?.updateScene({
              elements: nextElements,
              appState: { ...appState, currentItemStrokeWidth: remappedWidth },
            })
            requestAnimationFrame(() => {
              suppressSyncRef.current = false
            })
            // update local values for scheduling below
            nextAppState = { ...appState, currentItemStrokeWidth: remappedWidth }
          } else {
            nextAppState = { ...appState, currentItemStrokeWidth: remappedWidth }
          }
        } else {
          // While drawing: don't run updateScene or expensive element maps here.
          nextAppState = { ...appState, currentItemStrokeWidth: remappedWidth }
        }
      }

      // Excalidraw can emit transient empty frames; don't auto-reset based on onChange.

      // When actively drawing, keep local ink immediate and still publish throttled updates to Yjs.
      if (isLocallyDrawingRef.current) {
        pendingLocalSceneRef.current = { elements: nextElements, appState: nextAppState, files }
        // Throttled publish while drawing (uses existing scheduleSceneSync logic)
        scheduleSceneSync({ elements: nextElements, appState: nextAppState, files })
        return
      }

      // Finalize the local stroke on the first change after pointer-up.
      if (needsFinalCommitRef.current) {
        needsFinalCommitRef.current = false
        commitPendingLocalScene({ elements: nextElements, appState: nextAppState, files })
        // Re-apply the latest remote state after the local stroke completes.
        applyPendingRemoteScene()
        return
      }

      // Off the hot path: simplify freedraw elements and update scene if needed.
      const simplified = simplifyFreedrawElements(nextElements)
      if (simplified.changed && excalidrawApiRef.current) {
        suppressSyncRef.current = true
        excalidrawApiRef.current.updateScene({
          elements: simplified.elements,
          appState: nextAppState,
        })
        requestAnimationFrame(() => {
          suppressSyncRef.current = false
        })
      }

      nextElements = simplified.elements
      lastNonEmptySceneRef.current = nextElements.length > 0
      setHasBackground(nextElements.some(isBackgroundElement))

      scheduleSceneSync({ elements: nextElements, appState: nextAppState, files })
    },
    [applyPendingRemoteScene, commitPendingLocalScene, handleReset, scheduleSceneSync],
  )

  return (
    <>
      {backgroundPickerOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Set background image</h3>
              <button
                type="button"
                onClick={() => setBackgroundPickerOpen(false)}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Choose a source to start cropping.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setBackgroundPickerOpen(false)
                  setBackgroundCaptureOpen(true)
                }}
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Camera
              </button>
              <button
                type="button"
                onClick={() => {
                  setBackgroundPickerOpen(false)
                  fileInputRef.current?.click()
                }}
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Library
              </button>
            </div>
          </div>
        </div>
      )}

      {backgroundCropSource && (
        <div className="fixed inset-0 z-[90] flex items-stretch justify-center overflow-auto bg-slate-950/70 px-0 py-0 sm:items-center sm:px-6 sm:py-6" role="dialog" aria-modal="true">
          <div className="flex h-full w-full flex-col rounded-none bg-white shadow-2xl sm:h-[90vh] sm:max-w-5xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Adjust background</h3>
                <p className="text-xs text-slate-500">Crop and set the orientation.</p>
              </div>
              <button
                type="button"
                onClick={handleBackgroundCropCancel}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600"
              >
                Cancel
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
              <div className="relative min-h-0 flex-1 overflow-auto rounded-xl bg-slate-900">
                <div className="flex min-h-full min-w-full items-center justify-center p-4">
                  <ReactCrop
                    crop={backgroundCrop}
                    onChange={(nextCrop) => setBackgroundCrop(nextCrop)}
                    onComplete={(crop) => setBackgroundCompletedCrop(crop)}
                    aspect={backgroundAspectValue}
                    keepSelection
                    minWidth={16}
                    minHeight={16}
                  >
                    <img
                      src={backgroundCropSource.url}
                      alt="Background crop preview"
                      onLoad={(event) => {
                        const image = event.currentTarget
                        const width = image.naturalWidth || image.width
                        const height = image.naturalHeight || image.height
                        setBackgroundImageSize({ width, height })
                        const nextCrop = buildBackgroundCrop(width, height, backgroundAspectValue)
                        setBackgroundCrop(nextCrop)
                        setBackgroundCompletedCrop(convertToPixelCrop(nextCrop, width, height))
                      }}
                      className="max-h-full max-w-full object-contain"
                      style={{ transform: `scale(${backgroundZoom})`, transformOrigin: 'center' }}
                    />
                  </ReactCrop>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBackgroundAspect('landscape')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      backgroundAspect === 'landscape'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                  >
                    Landscape 16:9
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackgroundAspect('portrait')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      backgroundAspect === 'portrait'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                  >
                    Portrait 9:16
                  </button>
                  <button
                    type="button"
                    onClick={() => setBackgroundAspect('free')}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      backgroundAspect === 'free'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 text-slate-600'
                    }`}
                  >
                    Free
                  </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <label htmlFor="background-zoom" className="whitespace-nowrap">Zoom</label>
                  <input
                    id="background-zoom"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={backgroundZoom}
                    onChange={(event) => setBackgroundZoom(Number(event.target.value))}
                    className="w-32"
                  />
                  <span>{backgroundZoom.toFixed(2)}x</span>
                </div>
              </div>
              {backgroundCropError && (
                <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {backgroundCropError}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-5 py-4">
              <button
                type="button"
                onClick={handleBackgroundCropCancel}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBackgroundCropSave}
                disabled={backgroundSaving}
                className={`rounded-lg px-4 py-2 text-xs font-semibold text-white ${
                  backgroundSaving ? 'bg-slate-300' : 'bg-slate-900'
                }`}
              >
                {backgroundSaving ? 'Saving...' : 'Save background'}
              </button>
            </div>
          </div>
        </div>
      )}

      <LuminaCaptureSession
        open={backgroundCaptureOpen}
        collectibleId={null}
        onClose={() => setBackgroundCaptureOpen(false)}
        onCaptureSingle={(file) => {
          setBackgroundCaptureOpen(false)
          startBackgroundCrop(file)
        }}
      />

      <section className={`whiteboard-shell flex h-full w-full flex-col ${className || ''}`} aria-label="Collaborative whiteboard">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif,.png,.jpg,.jpeg,.webp"
          onChange={handleBackgroundFilePick}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div ref={boardFrameRef} className="relative min-h-0 flex-1 bg-transparent p-1">
          <div
            className="relative h-full w-full overflow-visible rounded-lg bg-white"
          >
            {!isSynced ? (
              <div className="flex h-full w-full items-center justify-center rounded-xl bg-white">
                <div className="flex items-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
                  <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                  Connecting to Room…
                </div>
              </div>
            ) : (
              <Excalidraw
                excalidrawAPI={(api) => {
                  excalidrawApiRef.current = api
                  registerPointerGuard(api)
                  if (!excalidrawReadyRef.current) {
                    excalidrawReadyRef.current = true
                    whiteboardDebugLog('whiteboard:excalidraw:ready', {
                      boardId,
                      viewMode: viewModeEnabledRef.current,
                    })
                  }
                }}
                initialData={initialData ?? undefined}
                viewModeEnabled={viewModeEnabled}
                zenModeEnabled={false}
                onChange={handleChange}
              >
                <MainMenu>
                  <MainMenu.DefaultItems.LoadScene />
                  <MainMenu.DefaultItems.SaveToActiveFile />
                  <MainMenu.DefaultItems.Export />
                  <MainMenu.DefaultItems.ClearCanvas />
                  <MainMenu.Separator />
                  <MainMenu.DefaultItems.ToggleTheme />
                  <MainMenu.DefaultItems.ChangeCanvasBackground />
                </MainMenu>
              </Excalidraw>
            )}
          </div>
        </div>
      </section>
    </>
  )
  },
)

WhiteboardCanvas.displayName = 'WhiteboardCanvas'

export default WhiteboardCanvas
