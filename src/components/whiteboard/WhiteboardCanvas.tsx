import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import * as Y from 'yjs'
import type { WhiteboardEvent, WhiteboardHistoryCursor, WhiteboardStrokeAck, WhiteboardStrokeEvent } from '../../types/whiteboard'
import type { WhiteboardTransport } from '../../realtime/whiteboardTransport'
import { API_BASE_URL } from '../../api'
import { fetchWhiteboardSnapshot } from '../../api/whiteboard'
import { normalizeHistoryEvents } from '../../realtime/whiteboardReplay'
import { whiteboardDebugLog } from '../../realtime/whiteboardDebug'
import { BOARD_ASPECT, computeContainedRect, type ContainedRect } from './whiteboardAspect'
import { createStrokePersistenceQueue, createStrokeSegmenter } from '../../realtime/whiteboardStrokeQueue'
import { createWhiteboardYjsProvider } from '../../realtime/whiteboardYjsProvider'
import {
  appendWhiteboardSnapshotCache,
  clearWhiteboardSnapshotCache,
  getWhiteboardSnapshotCache,
  setWhiteboardSnapshotCache,
} from '../../realtime/whiteboardSnapshotCache'

const DEFAULT_COLOR = '#111827'
const DEFAULT_WIDTH = 2
const MAX_BUFFERED_EVENTS = 5000
const MIN_MOVE_INTERVAL_MS = 12
const MIN_MOVE_DISTANCE = 0.002

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

    if (now - state.lastSentAt < MIN_MOVE_INTERVAL_MS && distance < MIN_MOVE_DISTANCE) return

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

const LOCAL_ORIGIN = Symbol('whiteboard-local')

const DEFAULT_APP_STATE: Pick<AppState, 'viewBackgroundColor' | 'gridSize' | 'theme'> = {
  viewBackgroundColor: '#ffffff',
  gridSize: 0,
  theme: 'light',
}

type ExcalidrawWhiteboardCanvasProps = {
  boardId: string
  token: string | null
  mode: 'viewer' | 'pad'
  className?: string
}

type PersistedAppState = Pick<AppState, 'viewBackgroundColor' | 'gridSize' | 'theme'>
type ExcalidrawElement = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>[number]

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

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

export default function WhiteboardCanvas({ boardId, token, mode, className }: ExcalidrawWhiteboardCanvasProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [viewModeEnabled, setViewModeEnabled] = useState(mode === 'viewer')
  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null)

  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const mapRef = useRef<Y.Map<unknown> | null>(null)
  const suppressSyncRef = useRef(false)
  const isLocallyDrawingRef = useRef(false)
  const pendingRemoteSyncRef = useRef(false)
  const pointerGuardCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    setViewModeEnabled(mode === 'viewer')
  }, [mode])

  const applySceneFromYjs = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const elements = resolveElements(map.get('elements'))
    if (!elements) return

    const appState = resolveAppState(map.get('appState'))
    const files = resolveFiles(map.get('files'))

    const scene: ExcalidrawInitialDataState = {
      elements,
      appState: {
        ...appState,
        viewModeEnabled,
      },
      files,
    }

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

  const registerPointerGuard = useCallback(
    (api: ExcalidrawImperativeAPI | null) => {
      if (!api || pointerGuardCleanupRef.current) return

      // Guard: If the local user is actively drawing, pause remote scene updates.
      const offPointerDown = api.onPointerDown(() => {
        isLocallyDrawingRef.current = true
      })

      const offPointerUp = api.onPointerUp(() => {
        isLocallyDrawingRef.current = false
        // Re-apply the latest remote state after the local stroke completes.
        applyPendingRemoteScene()
      })

      pointerGuardCleanupRef.current = () => {
        offPointerDown()
        offPointerUp()
      }
    },
    [applyPendingRemoteScene],
  )

  useEffect(() => {
    if (!token) {
      setConnectionStatus('idle')
      return
    }

    setConnectionStatus('connecting')
    const provider = createWhiteboardYjsProvider({
      apiBaseUrl: API_BASE_URL,
      boardId,
      token,
      onStatus: (status) => {
        setConnectionStatus(status === 'connected' ? 'connected' : 'disconnected')
      },
    })

    docRef.current = provider.doc
    mapRef.current = provider.doc.getMap('excalidraw')

    const handleSync = (isSynced: boolean) => {
      if (!isSynced) return
      if (isLocallyDrawingRef.current) {
        pendingRemoteSyncRef.current = true
        return
      }
      applySceneFromYjs()
    }

    const handleUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === LOCAL_ORIGIN) return
      if (isLocallyDrawingRef.current) {
        pendingRemoteSyncRef.current = true
        return
      }
      applySceneFromYjs()
    }

    provider.provider.on('sync', handleSync)
    provider.doc.on('update', handleUpdate)

    return () => {
      provider.provider.off('sync', handleSync)
      provider.doc.off('update', handleUpdate)
      provider.destroy()
      docRef.current = null
      mapRef.current = null
    }
  }, [applySceneFromYjs, boardId, token])

  useEffect(() => {
    return () => {
      pointerGuardCleanupRef.current?.()
      pointerGuardCleanupRef.current = null
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
      },
    })
    requestAnimationFrame(() => {
      suppressSyncRef.current = false
    })
  }, [viewModeEnabled])

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      if (suppressSyncRef.current) return
      const doc = docRef.current
      const map = mapRef.current
      if (!doc || !map) return

      doc.transact(() => {
        map.set('elements', elements)
        map.set('appState', pickPersistedAppState(appState))
        map.set('files', files)
        map.set('updatedAt', Date.now())
      }, LOCAL_ORIGIN)
    },
    [],
  )

  const toggleLabel = viewModeEnabled ? 'Switch to draw mode' : 'Switch to view mode'
  const statusLabel = useMemo(() => {
    switch (connectionStatus) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting…'
      case 'disconnected':
        return 'Disconnected'
      case 'error':
        return 'Error'
      default:
        return 'Idle'
    }
  }, [connectionStatus])

  return (
    <section className={`flex h-full w-full flex-col gap-3 ${className || ''}`} aria-label="Collaborative whiteboard">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">Whiteboard</p>
          <p className="text-xs text-slate-500" aria-live="polite">
            Status: {statusLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
            onClick={() => setViewModeEnabled((prev) => !prev)}
            aria-pressed={viewModeEnabled}
            aria-label={toggleLabel}
          >
            {viewModeEnabled ? 'View mode' : 'Draw mode'}
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 rounded-2xl border border-slate-200 bg-white">
        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawApiRef.current = api
            registerPointerGuard(api)
          }}
          initialData={initialData ?? undefined}
          viewModeEnabled={viewModeEnabled}
          zenModeEnabled={viewModeEnabled}
          onChange={handleChange}
        />
      </div>
    </section>
  )
}
