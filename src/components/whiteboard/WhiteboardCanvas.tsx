import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
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
import { createStrokePersistenceQueue, createStrokeSegmenter } from '../../realtime/whiteboardStrokeQueue'
import { createWhiteboardYjsProvider } from '../../realtime/whiteboardYjsProvider'
import type { WhiteboardYjsProvider } from '../../realtime/whiteboardYjsProvider'
import {
  appendWhiteboardSnapshotCache,
  clearWhiteboardSnapshotCache,
  getWhiteboardSnapshotCache,
  setWhiteboardSnapshotCache,
} from '../../realtime/whiteboardSnapshotCache'

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

type ExcalidrawWhiteboardCanvasProps = {
  boardId: string
  token: string | null
  mode: 'viewer' | 'pad'
  className?: string
  onViewModeChange?: (enabled: boolean) => void
  onBackgroundFitModeChange?: (mode: BackgroundFitMode) => void
  onHasBackgroundChange?: (hasBackground: boolean) => void
}

type PersistedAppState = Pick<AppState, 'viewBackgroundColor' | 'gridSize' | 'theme'>
type ExcalidrawElement = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number]

const isBackgroundElement = (element: { type?: string; locked?: boolean }) =>
  element.type === 'image' && element.locked === true

type BackgroundFitMode = 'width' | 'contain'

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

function pickPersistedAppState(appState: AppState): PersistedAppState {
  return {
    viewBackgroundColor: appState.viewBackgroundColor,
    gridSize: appState.gridSize,
    theme: appState.theme,
  }
}

const FREEDRAW_MIN_POINT_DISTANCE = 1.25
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
    },
    ref,
  ) => {
  const [viewModeEnabled, setViewModeEnabled] = useState(mode === 'viewer')
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null)
  const [isSynced, setIsSynced] = useState(false)
  const [hasBackground, setHasBackground] = useState(false)
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

  useEffect(() => {
    setViewModeEnabled(mode === 'viewer')
  }, [mode])

  useEffect(() => {
    if (!token) {
      setIsSynced(false)
    }
  }, [token])

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

    const scene: ExcalidrawInitialDataState = {
      elements,
      appState: {
        ...appState,
        viewModeEnabled,
        zenModeEnabled: false,
      },
      files,
    }

    setHasBackground(elements.some(isBackgroundElement))
    lastSyncedElementsRef.current = buildElementVersionMap(elements)
    lastSyncedAppStateRef.current = appState
    lastSyncedFilesRef.current = getFileKeys(files)

    if (!excalidrawApiRef.current) {
      setInitialData(scene)
      return
    }

    const currentState = excalidrawApiRef.current.getAppState()
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

  const readFileAsDataUrl = useCallback((file: File) => {
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

  const handleImageUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      const api = excalidrawApiRef.current
      if (!api) return

      try {
        const dataUrl = await readFileAsDataUrl(file)
        const dimensions = await loadImageDimensions(dataUrl)
        const rawWidth = Math.max(1, dimensions.width)
        const rawHeight = Math.max(1, dimensions.height)
        const fitted = computeBackgroundRect(rawWidth, rawHeight, backgroundFitMode)
        const fileId = generateId() as BinaryFileData['id']
        const elementId = generateId()
        const now = Date.now()
        const elements = api.getSceneElements()
        const elementsToKeep = elements.filter((element) => !isBackgroundElement(element))
        const imageIndex = elementsToKeep[0]?.index ?? 'a'

        const fileData: BinaryFileData = {
          id: fileId,
          dataURL: dataUrl as BinaryFileData['dataURL'],
          mimeType: (file.type || 'image/png') as BinaryFileData['mimeType'],
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
          index: imageIndex,
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
      } catch (error) {
        whiteboardDebugLog('whiteboard:background:upload:error', {
          boardId,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [backgroundFitMode, boardId, computeBackgroundRect, generateId, loadImageDimensions, readFileAsDataUrl],
  )

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
      map.set('updatedAt', Date.now())
    }, LOCAL_ORIGIN)
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      openBackgroundPicker: () => {
        fileInputRef.current?.click()
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

      doc.transact(() => {
        map.set('elements', scene.elements)
        map.set('appState', persistedAppState)
        map.set('files', scene.files)
        map.set('updatedAt', Date.now())
      }, LOCAL_ORIGIN)

      lastSyncedElementsRef.current = buildElementVersionMap(scene.elements)
      lastSyncedAppStateRef.current = persistedAppState
      lastSyncedFilesRef.current = fileKeys
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
    if (!pending) return
    const api = excalidrawApiRef.current
    const latest = api
      ? {
          elements: api.getSceneElements(),
          appState: api.getAppState(),
          files: pending.files,
        }
      : pending
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
    const simplified = simplifyFreedrawElements(nextElements)

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
  }, [flushSceneToYjs])

  const registerPointerGuard = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      if (!api || pointerGuardCleanupRef.current) return

      // Sync pause: keep remote updates from clobbering local pointer strokes mid-draw.
      const offPointerDown = api.onPointerDown(() => {
        isLocallyDrawingRef.current = true
        needsFinalCommitRef.current = false
      })

      const offPointerUp = api.onPointerUp(() => {
        isLocallyDrawingRef.current = false
        needsFinalCommitRef.current = true
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
    <section className={`whiteboard-shell flex h-full w-full flex-col ${className || ''}`} aria-label="Collaborative whiteboard">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
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
  )
  },
)

WhiteboardCanvas.displayName = 'WhiteboardCanvas'

export default WhiteboardCanvas
