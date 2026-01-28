import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { WhiteboardStrokeEvent } from '../../types/whiteboard'
import type { WhiteboardTransport } from '../../realtime/whiteboardTransport'

const DEFAULT_COLOR = '#111827'
const DEFAULT_WIDTH = 2
const MAX_BUFFERED_EVENTS = 5000
const MIN_MOVE_INTERVAL_MS = 12
const MIN_MOVE_DISTANCE = 0.002
const HEARTBEAT_INTERVAL_MS = 5000 // Safety margin against load balancer timeouts (usually 10-60s)

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

export default function WhiteboardCanvas({
  boardId,
  token,
  transport,
  mode,
  sourceId,
  className,
}: WhiteboardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const eventsRef = useRef<WhiteboardStrokeEvent[]>([])
  const activeStrokesRef = useRef<Map<string, StrokeState>>(new Map())
  const pointerStatesRef = useRef<Map<number, { strokeId: string; lastSentAt: number; x: number; y: number }>>(new Map())
  
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  // We use a "version" counter to force reconnection when the socket dies
  const [connectionVersion, setConnectionVersion] = useState(0)

  // Keep a ref to the latest token so we can reconnect with it 
  // WITHOUT adding 'token' to the useEffect dependency array (which causes loops)
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
    eventsRef.current = []
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

    const x = clamp01((clientX - rect.left) / rect.width)
    const y = clamp01((clientY - rect.top) / rect.height)
    return { x, y }
  }, [])

  const drawEvent = useCallback((evt: WhiteboardStrokeEvent, recordEvent: boolean) => {
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    const color = evt.color ?? DEFAULT_COLOR
    const width = evt.width ?? DEFAULT_WIDTH
    const active = activeStrokesRef.current

    if (evt.type === 'stroke:start') {
      active.set(evt.strokeId, { x: evt.x, y: evt.y, color, width })
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
      ctx.lineTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
      ctx.stroke()
    } else {
      const prev = active.get(evt.strokeId)
      const start = prev ?? { x: evt.x, y: evt.y, color, width }
      ctx.strokeStyle = start.color
      ctx.lineWidth = start.width
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(start.x * canvas.width / window.devicePixelRatio, start.y * canvas.height / window.devicePixelRatio)
      ctx.lineTo(evt.x * canvas.width / window.devicePixelRatio, evt.y * canvas.height / window.devicePixelRatio)
      ctx.stroke()
      active.set(evt.strokeId, { x: evt.x, y: evt.y, color: start.color, width: start.width })
      if (evt.type === 'stroke:end') {
        active.delete(evt.strokeId)
      }
    }

    if (recordEvent) {
      const list = eventsRef.current
      list.push(evt)
      if (list.length > MAX_BUFFERED_EVENTS) {
        list.splice(0, list.length - MAX_BUFFERED_EVENTS)
      }
    }
  }, [getContext])

  const replayEvents = useCallback(() => {
    const ctx = getContext()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const tempActive = new Map<string, StrokeState>()

    for (const evt of eventsRef.current) {
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
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(rect.width * dpr))
    const height = Math.max(1, Math.floor(rect.height * dpr))

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      replayEvents()
    }
  }, [replayEvents])

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

  // --- CONNECTION MANAGEMENT ---
  useEffect(() => {
    // 1. If no token, we can't connect.
    const activeToken = tokenRef.current
    if (!activeToken) {
      setStatus('idle')
      return
    }

    let cancelled = false
    setStatus('connecting')
    
    // Only reset canvas if we are connecting to a NEW board, 
    // otherwise we might want to keep the strokes during a quick reconnect.
    // For safety, we just reset to avoid dupes.
    resetCanvasState()

    const handleIncoming = (evt: WhiteboardStrokeEvent) => {
      if (effectiveSourceId && evt.sourceId && evt.sourceId === effectiveSourceId) return
      drawEvent(evt, true)
    }

    transport.onEvent(handleIncoming)

    transport
      .connect(boardId, activeToken)
      .then(() => {
        if (!cancelled) setStatus('connected')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    // --- WATCHDOG / HEARTBEAT ---
    const pingInterval = setInterval(() => {
      if (cancelled) return

      // Try to send a ping with valid schema fields to pass server validation
      try {
        transport.send({ 
          type: 'ping', 
          boardId,
          strokeId: 'ping',
          x: 0, 
          y: 0, 
          t: 0 
        } as any)
      } catch (err) {
        console.warn('[whiteboard] ping failed, forcing reconnect', err)
        // If ping fails (socket closed), increment version to trigger useEffect re-run
        setConnectionVersion(v => v + 1)
      }
    }, HEARTBEAT_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(pingInterval)
      transport.disconnect()
    }
    // Dependency on 'connectionVersion' ensures we reconnect when the watchdog barks
    // We intentionally OMIT 'token' from deps to avoid the refresh loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, connectionVersion, transport, effectiveSourceId, resetCanvasState])

  const emitEvent = useCallback((evt: WhiteboardStrokeEvent) => {
    drawEvent(evt, true)
    try {
      transport.send(evt)
    } catch (e) {
      // If send fails, assume disconnected -> trigger reconnect
      console.warn("Send failed, reconnecting...")
      setConnectionVersion(v => v + 1)
    }
  }, [drawEvent, transport])

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

    emitEvent({
      type: 'stroke:start',
      boardId,
      strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
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

    emitEvent({
      type: 'stroke:move',
      boardId,
      strokeId: state.strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
      sourceId: effectiveSourceId ?? undefined,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
    })
  }, [boardId, effectiveSourceId, emitEvent, mode, normalizePoint])

  const finishStroke = useCallback((pointerId: number, clientX: number, clientY: number) => {
    const state = pointerStatesRef.current.get(pointerId)
    if (!state) return
    pointerStatesRef.current.delete(pointerId)

    const point = normalizePoint(clientX, clientY)
    if (!point) return

    emitEvent({
      type: 'stroke:end',
      boardId,
      strokeId: state.strokeId,
      x: point.x,
      y: point.y,
      t: Date.now(),
      sourceId: effectiveSourceId ?? undefined,
      color: DEFAULT_COLOR,
      width: DEFAULT_WIDTH,
    })
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
        className="h-full w-full bg-white rounded-2xl"
        aria-label={mode === 'pad' ? 'Whiteboard pad' : 'Whiteboard view'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      {status !== 'connected' && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 text-sm text-slate-600">
          {status === 'error'
            ? 'Reconnecting...'
            : token
              ? 'Connecting whiteboard…'
              : 'Sign in to use the whiteboard.'}
        </div>
      )}
    </div>
  )
}