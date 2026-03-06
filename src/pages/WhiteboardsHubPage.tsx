import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Plus, Search, MoreVertical, Clock, Edit3, Copy, Share2, Trash2, Check, X, Link } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import { listMyWhiteboards, createWhiteboard, updateWhiteboardTitle, deleteWhiteboard } from '../api/whiteboards'
import { fetchWhiteboardSnapshot } from '../api/whiteboard'
import { listRoomMembers, RoomMemberDetails } from '../api/chat'
import { ApiError } from '../api/httpClient'
import ChessUserMenu from '../components/ChessUserMenu'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../supabaseClient'
import { normalizeHistoryEvents } from '../realtime/whiteboardReplay'

// ─── Module-level pure helpers — never re-created on render ──────────────────

function getBoardGradient(name: string): { from: string; to: string } {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return {
    from: `hsl(${hue}, 70%, 25%)`,
    to: `hsl(${(hue + 40) % 360}, 60%, 15%)`,
  }
}

function getBoardInitials(name: string): string {
  const cleanName = name || 'Untitled'
  const words = cleanName.trim().split(/\s+/)
  if (words.length >= 2) {
    return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  }
  return cleanName.slice(0, 2).toUpperCase()
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Stable empty array — avoids a fresh reference on every parent render
const EMPTY_MEMBERS: RoomMemberDetails[] = []

// ─── Skeleton shimmer keyframes ──────────────────────────────────────────────

const SHIMMER_STYLE_ID = 'wb-skeleton-shimmer'

function ensureShimmerStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = '@keyframes wb-shimmer { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.7; } }'
  document.head.appendChild(style)
}

function SkeletonCard({ index }: { index: number }) {
  useEffect(() => { ensureShimmerStyle() }, [])
  const delay = `${index * 0.15}s`
  return (
    <div
      className="bg-[#1A1A1A] border border-[#252525] rounded-xl overflow-hidden"
      style={{ boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)' }}
    >
      <div
        className="h-40"
        style={{ backgroundColor: '#252525', animation: 'wb-shimmer 1.5s ease-in-out infinite', animationDelay: delay }}
      />
      <div className="p-4 border-t border-[#222]">
        <div className="flex items-center justify-between mb-3">
          <div
            className="h-4 rounded"
            style={{ width: '60%', backgroundColor: '#252525', animation: 'wb-shimmer 1.5s ease-in-out infinite', animationDelay: delay }}
          />
          <div
            className="h-3 rounded"
            style={{ width: '30%', backgroundColor: '#252525', animation: 'wb-shimmer 1.5s ease-in-out infinite', animationDelay: `${0.3 + index * 0.15}s` }}
          />
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div
            className="w-8 h-8 rounded-full"
            style={{ backgroundColor: '#252525', animation: 'wb-shimmer 1.5s ease-in-out infinite', animationDelay: `${0.5 + index * 0.15}s` }}
          />
          <div
            className="w-8 h-8 rounded-full"
            style={{ backgroundColor: '#252525', animation: 'wb-shimmer 1.5s ease-in-out infinite', animationDelay: `${0.7 + index * 0.15}s` }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sortable DnD wrapper ────────────────────────────────────────────────────

function SortableCardWrapper({ id, children }: { id: string; children: (isDragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: isDragging
      ? `${DndCSS.Transform.toString(transform)} scale(1.03)`
      : DndCSS.Transform.toString(transform) ?? undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative',
    boxShadow: isDragging ? '0 20px 60px rgba(0, 0, 0, 0.6)' : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {children(isDragging)}
    </div>
  )
}

// ─── Card context-menu dropdown ──────────────────────────────────────────────

interface CardContextMenuProps {
  onRename: () => void
  onDuplicate: () => void
  onShare: () => void
  onDelete: () => void
  onClose: () => void
  canRename?: boolean
  canDelete?: boolean
}

const CardContextMenu = React.memo(function CardContextMenu({
  onRename,
  onDuplicate,
  onShare,
  onDelete,
  onClose,
  canRename = true,
  canDelete = true,
}: CardContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const items: Array<{ label: string; icon: typeof Edit3; action: () => void; danger?: boolean; disabled?: boolean }> = [
    ...(canRename ? [{ label: 'Rename', icon: Edit3, action: onRename }] : []),
    { label: 'Duplicate', icon: Copy, action: onDuplicate },
    { label: 'Share', icon: Share2, action: onShare },
    ...(canDelete ? [{ label: 'Delete', icon: Trash2, action: onDelete, danger: true }] : []),
  ]

  return (
    <div
      ref={menuRef}
      className="absolute top-full right-0 mt-1 w-44 bg-[#1A1A1A] border border-[#333] rounded-lg shadow-2xl py-1 z-50"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            item.action()
            onClose()
          }}
          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
            item.danger
              ? 'text-red-400 hover:bg-red-500/10'
              : 'text-[#ccc] hover:bg-[#252525] hover:text-white'
          }`}
        >
          <item.icon className="w-4 h-4" />
          {item.label}
        </button>
      ))}
    </div>
  )
})

// ─── Share modal ─────────────────────────────────────────────────────────────

interface ShareModalProps {
  boardId: string
  boardName: string
  onClose: () => void
}

function ShareModal({ boardId, boardName, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const shareUrl = `${window.location.origin}/whiteboards/${boardId}`

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = shareUrl
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [shareUrl])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-[#1A1A1A] border border-[#333] rounded-xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white truncate pr-4">Share &ldquo;{boardName}&rdquo;</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[#252525] transition-colors flex-shrink-0">
            <X className="w-5 h-5 text-[#666]" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-[#111] border border-[#333] rounded-lg min-w-0">
            <Link className="w-4 h-4 text-[#666] flex-shrink-0" />
            <span className="text-sm text-[#ccc] truncate">{shareUrl}</span>
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm transition-colors flex-shrink-0 ${
              copied ? 'bg-green-600 text-white' : 'bg-[#F59E0B] hover:bg-[#d97706] text-black'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Delete confirmation dialog ──────────────────────────────────────────────

interface DeleteConfirmDialogProps {
  boardName: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmDialog({ boardName, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-[#1A1A1A] border border-[#333] rounded-xl p-6 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white mb-2">Delete &ldquo;{boardName}&rdquo;?</h2>
        <p className="text-sm text-[#999] mb-6">This cannot be undone.</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[#ccc] bg-[#252525] hover:bg-[#333] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Delete
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Order persistence (localStorage) ────────────────────────────────────────

const BOARD_ORDER_KEY = 'wb-board-order'

function loadBoardOrder(): string[] {
  try {
    const raw = localStorage.getItem(BOARD_ORDER_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return []
}

function saveBoardOrder(ids: string[]): void {
  try {
    localStorage.setItem(BOARD_ORDER_KEY, JSON.stringify(ids))
  } catch { /* ignore */ }
}

function applyBoardOrder(boards: any[], savedOrder: string[]): any[] {
  if (!savedOrder.length) return boards
  const byId = new Map(boards.map((b) => [b.id, b]))
  const ordered: any[] = []
  for (const id of savedOrder) {
    const board = byId.get(id)
    if (board) ordered.push(board)
  }
  for (const board of boards) {
    if (!savedOrder.includes(board.id)) ordered.push(board)
  }
  return ordered
}

// ─── useDesktopLayout ────────────────────────────────────────────────────────

function useDesktopLayout(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= 1024
  })

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const mediaQuery = typeof window.matchMedia === 'function'
      ? window.matchMedia('(min-width: 1024px)')
      : null

    const updateLayout = () => {
      setIsDesktop(mediaQuery ? mediaQuery.matches : window.innerWidth >= 1024)
    }

    updateLayout()

    if (mediaQuery) {
      const onChange = () => updateLayout()
      mediaQuery.addEventListener('change', onChange)
      return () => mediaQuery.removeEventListener('change', onChange)
    }

    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [])

  return isDesktop
}

// ─── WhiteboardThumbnail ─────────────────────────────────────────────────────
// Lives at module scope so React never sees a new component type on re-render.
// React.memo ensures it only re-renders when boardId or boardName changes —
// typing in the rename input does not touch this component at all.

interface WhiteboardThumbnailProps {
  boardId: string
  boardName: string
}

const WhiteboardThumbnail = React.memo(function WhiteboardThumbnail({
  boardId,
  boardName,
}: WhiteboardThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const emptySnapshotAttemptsRef = useRef(0)
  const MAX_EMPTY_SNAPSHOT_ATTEMPTS = 6

  useEffect(() => {
    let cancelled = false
    let loadTimeout: ReturnType<typeof setTimeout> | null = null
    // eslint-disable-next-line no-console
    console.log('[WB-THUMB] effect mount', { boardId })

    const loadThumbnail = async () => {
      if (!canvasRef.current || hasLoaded || cancelled) return

      try {
        setIsLoading(true)
        setError(false)

        const { data: { session } } = await supabase.auth.getSession()
        // eslint-disable-next-line no-console
        console.log('[WB-THUMB] session', { boardId, hasSession: Boolean(session?.access_token), session: session ? { expires_at: session.expires_at } : null })
        if (cancelled) return
        if (!session?.access_token) {
          // eslint-disable-next-line no-console
          console.warn('[WB-THUMB] no auth token available', { boardId, session })
          throw new Error('No auth token')
        }

        const snapshot = await fetchWhiteboardSnapshot({ boardId, token: session.access_token })
        // eslint-disable-next-line no-console
        console.log('[WB-THUMB] fetched snapshot', { boardId, snapshot })
        // eslint-disable-next-line no-console
        console.log('[WB-THUMB] snapshot.events', { boardId, eventsLength: Array.isArray(snapshot?.events) ? snapshot.events.length : null })
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) {
          setIsLoading(false)
          return
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          if (!cancelled) {
            setError(true)
            setIsLoading(false)
          }
          return
        }

        canvas.width = 320
        canvas.height = 200
        // Ensure the displayed canvas fills the thumbnail container while
        // keeping the internal pixel buffer for crisp rendering.
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        const events = Array.isArray(snapshot.events) ? normalizeHistoryEvents(snapshot.events as any) : []
        const drawableEvents = events.filter(
          (event) =>
            (event.type === 'stroke:start' || event.type === 'stroke:move' || event.type === 'stroke:end')
            && Number.isFinite(event.x)
            && Number.isFinite(event.y),
        )
        const excalidrawElements = Array.isArray(snapshot.excalidrawElements) ? snapshot.excalidrawElements : []
        // eslint-disable-next-line no-console
        console.log('[WB-THUMB] events counts', {
          boardId,
          normalized: events.length,
          drawable: drawableEvents.length,
          excalidraw: excalidrawElements.length,
        })
        // Helpful debug for text rendering issues
        // eslint-disable-next-line no-console
        if (excalidrawElements.length > 0) {
          console.log('[WB-THUMB] excalidraw sample', {
            boardId,
            sample: excalidrawElements.slice(0, 5),
          })
        }

        if (drawableEvents.length > 0) {
          emptySnapshotAttemptsRef.current = 0
          const usesNormalizedCoords = drawableEvents.every(
            (event) => event.x >= -0.01 && event.x <= 1.01 && event.y >= -0.01 && event.y <= 1.01,
          )
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] usesNormalizedCoords', { boardId, usesNormalizedCoords })

          let minX = 0
          let maxX = 1
          let minY = 0
          let maxY = 1

          if (!usesNormalizedCoords) {
            minX = Math.min(...drawableEvents.map((event) => event.x))
            maxX = Math.max(...drawableEvents.map((event) => event.x))
            minY = Math.min(...drawableEvents.map((event) => event.y))
            maxY = Math.max(...drawableEvents.map((event) => event.y))
          }

          const padding = 10
          const spanX = Math.max(0.0001, maxX - minX)
          const spanY = Math.max(0.0001, maxY - minY)
          const scaleX = (canvas.width - padding * 2) / spanX
          const scaleY = (canvas.height - padding * 2) / spanY
          const absoluteScale = Math.min(scaleX, scaleY)

          const toCanvasPoint = (x: number, y: number): { x: number; y: number } => {
            if (usesNormalizedCoords) {
              return { x: x * canvas.width, y: y * canvas.height }
            }
            return {
              x: padding + (x - minX) * absoluteScale,
              y: padding + (y - minY) * absoluteScale,
            }
          }

          const activeStrokes = new Map<string, { x: number; y: number; color: string; width: number }>()

          for (const event of drawableEvents) {
            const strokeKey = event.strokeId || '__thumbnail_stroke__'
            const color = event.color || '#000000'
            const baseWidth = event.width || 2
            const width = usesNormalizedCoords ? baseWidth : Math.max(1, Math.min(8, baseWidth * absoluteScale))
            const point = toCanvasPoint(event.x, event.y)

            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'

            if (event.type === 'stroke:start') {
              activeStrokes.set(strokeKey, { x: event.x, y: event.y, color, width })
              ctx.strokeStyle = color
              ctx.lineWidth = width
              ctx.beginPath()
              ctx.moveTo(point.x, point.y)
              ctx.lineTo(point.x, point.y)
              ctx.stroke()
              continue
            }

            const previous = activeStrokes.get(strokeKey) || { x: event.x, y: event.y, color, width }
            const previousPoint = toCanvasPoint(previous.x, previous.y)
            ctx.strokeStyle = previous.color
            ctx.lineWidth = previous.width
            ctx.beginPath()
            ctx.moveTo(previousPoint.x, previousPoint.y)
            ctx.lineTo(point.x, point.y)
            ctx.stroke()
            activeStrokes.set(strokeKey, { x: event.x, y: event.y, color: previous.color, width: previous.width })

            if (event.type === 'stroke:end') {
              activeStrokes.delete(strokeKey)
            }
          }

          if (!cancelled) {
            setIsLoading(false)
            setHasLoaded(true)
          }
          return
        } else if (excalidrawElements.length > 0) {
          emptySnapshotAttemptsRef.current = 0

          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity

          for (const el of excalidrawElements) {
            const elMinX = el.x
            const elMinY = el.y
            let elMaxX = el.x + (el.width || 0)
            let elMaxY = el.y + (el.height || 0)

            if (Array.isArray(el.points)) {
              for (const pt of el.points) {
                if (Array.isArray(pt) && pt.length >= 2) {
                  const px = el.x + pt[0]
                  const py = el.y + pt[1]
                  if (px < minX) minX = px
                  if (px > maxX) maxX = px
                  if (py < minY) minY = py
                  if (py > maxY) maxY = py
                }
              }
            }

            if (elMinX < minX) minX = elMinX
            if (elMaxX > maxX) maxX = elMaxX
            if (elMinY < minY) minY = elMinY
            if (elMaxY > maxY) maxY = elMaxY
          }

          const padding = 10
          const spanX = Math.max(1, maxX - minX)
          const spanY = Math.max(1, maxY - minY)
          const scaleX = (canvas.width - padding * 2) / spanX
          const scaleY = (canvas.height - padding * 2) / spanY
          const scale = Math.min(scaleX, scaleY)

          const toCanvas = (x: number, y: number) => ({
            x: padding + (x - minX) * scale,
            y: padding + (y - minY) * scale,
          })

          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          for (const el of excalidrawElements) {
            const color = el.strokeColor || '#000000'
            const lineWidth = Math.max(1, (el.strokeWidth || 2) * scale)
            const opacity = typeof el.opacity === 'number' ? el.opacity / 100 : 1
            ctx.globalAlpha = opacity
            ctx.strokeStyle = color
            ctx.lineWidth = lineWidth

            if ((el.type === 'freedraw' || el.type === 'line' || el.type === 'arrow') && Array.isArray(el.points) && el.points.length >= 2) {
              ctx.beginPath()
              const first = toCanvas(el.x + el.points[0][0], el.y + el.points[0][1])
              ctx.moveTo(first.x, first.y)
              for (let i = 1; i < el.points.length; i++) {
                const pt = el.points[i]
                if (Array.isArray(pt) && pt.length >= 2) {
                  const cp = toCanvas(el.x + pt[0], el.y + pt[1])
                  ctx.lineTo(cp.x, cp.y)
                }
              }
              ctx.stroke()
            } else if (el.type === 'rectangle') {
              const tl = toCanvas(el.x, el.y)
              const w = el.width * scale
              const h = el.height * scale
              if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                ctx.fillStyle = el.backgroundColor
                ctx.fillRect(tl.x, tl.y, w, h)
              }
              ctx.strokeRect(tl.x, tl.y, w, h)
            } else if (el.type === 'ellipse') {
              const cx = el.x + el.width / 2
              const cy = el.y + el.height / 2
              const center = toCanvas(cx, cy)
              const rx = (el.width / 2) * scale
              const ry = (el.height / 2) * scale
              ctx.beginPath()
              ctx.ellipse(center.x, center.y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2)
              if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                ctx.fillStyle = el.backgroundColor
                ctx.fill()
              }
              ctx.stroke()
            } else if (el.type === 'diamond') {
              const tl = toCanvas(el.x, el.y)
              const w = el.width * scale
              const h = el.height * scale
              ctx.beginPath()
              ctx.moveTo(tl.x + w / 2, tl.y)
              ctx.lineTo(tl.x + w, tl.y + h / 2)
              ctx.lineTo(tl.x + w / 2, tl.y + h)
              ctx.lineTo(tl.x, tl.y + h / 2)
              ctx.closePath()
              if (el.backgroundColor && el.backgroundColor !== 'transparent') {
                ctx.fillStyle = el.backgroundColor
                ctx.fill()
              }
              ctx.stroke()
            } else if (el.type === 'text' || typeof (el as any).text === 'string') {
              const anyEl = el as any
              const rawText = typeof anyEl.text === 'string' ? anyEl.text : ''
              const trimmed = rawText.trim()
              if (trimmed) {
                const tl = toCanvas(el.x, el.y)
                const w = el.width * scale
                const h = el.height * scale
                const baseFontSize =
                  typeof anyEl.fontSize === 'number' && Number.isFinite(anyEl.fontSize)
                    ? anyEl.fontSize
                    : h
                const fontSize = Math.max(8, Math.min(48, baseFontSize * scale * 0.6))
                const fontFamily =
                  typeof anyEl.fontFamily === 'string' && anyEl.fontFamily.trim().length > 0
                    ? anyEl.fontFamily
                    : 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
                ctx.font = `${fontSize}px ${fontFamily}`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillStyle = anyEl.textColor || color
                const cx = tl.x + w / 2
                const cy = tl.y + h / 2
                const text = trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed
                if (typeof ctx.fillText === 'function') {
                  ctx.fillText(text, cx, cy)
                } else if (typeof ctx.strokeText === 'function') {
                  ctx.strokeText(text, cx, cy)
                }
              }
            }
            // Skip image elements for thumbnail
          }

          ctx.globalAlpha = 1

          if (!cancelled) {
            setIsLoading(false)
            setHasLoaded(true)
          }
          return
        } else if (!cancelled) {
          emptySnapshotAttemptsRef.current += 1
          // eslint-disable-next-line no-console
          console.log('[WB-THUMB] empty snapshot - attempt', { boardId, attempt: emptySnapshotAttemptsRef.current })
          const shouldRetry = emptySnapshotAttemptsRef.current < MAX_EMPTY_SNAPSHOT_ATTEMPTS
          if (shouldRetry) {
            if (loadTimeout) clearTimeout(loadTimeout)
            loadTimeout = setTimeout(() => { void loadThumbnail() }, 400)
            return
          }
          setError(true)
          setIsLoading(false)
          setHasLoaded(true)
          return
        }
      } catch (err) {
        if (cancelled) return
        console.warn('Failed to load whiteboard thumbnail:', err)
        setError(true)
        setIsLoading(false)
      }
    }

    if (!containerRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoaded) {
            // eslint-disable-next-line no-console
            console.log('[WB-THUMB] observer triggered', { boardId, isIntersecting: entry.isIntersecting })
            if (loadTimeout) clearTimeout(loadTimeout)
            loadTimeout = setTimeout(() => { void loadThumbnail() }, Math.random() * 200)
          }
        })
      },
      { threshold: 0.1 },
    )

    observer.observe(containerRef.current)

    return () => {
      cancelled = true
      if (loadTimeout) {
        clearTimeout(loadTimeout)
        loadTimeout = null
      }
      observer.disconnect()
    }
  }, [boardId, hasLoaded])

  const gradient = getBoardGradient(boardName)

  return (
    <div ref={containerRef} className="h-40 relative overflow-hidden bg-[#111111]">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover block"
        style={{ imageRendering: 'crisp-edges' as any, width: '100%', height: '100%' }}
        width={320}
        height={200}
      />
      {(error || isLoading) && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        >
          <div className="absolute inset-0" />
          <span className="text-white text-2xl font-light drop-shadow-lg relative">
            {getBoardInitials(boardName)}
          </span>
        </div>
      )}
    </div>
  )
})

// ─── WhiteboardCard ───────────────────────────────────────────────────────────
// Lives at module scope so React never sees a new component type on re-render.
// Local editing state means typing only re-renders THIS card — siblings and
// their thumbnails are completely unaffected.

interface WhiteboardCardProps {
  board: any
  index: number
  isPlaceholder?: boolean
  members: RoomMemberDetails[]
  isDragging?: boolean
  isOwner?: boolean
  onNavigate: (boardId: string) => void
  onSave: (boardId: string, newTitle: string) => Promise<void>
  onDelete: (boardId: string) => void
  onDuplicate: (boardId: string) => void
  onShare: (boardId: string) => void
}

const WhiteboardCard = React.memo(function WhiteboardCard({
  board,
  index,
  isPlaceholder = false,
  members,
  isDragging = false,
  isOwner = true,
  onNavigate,
  onSave,
  onDelete,
  onDuplicate,
  onShare,
}: WhiteboardCardProps) {
  const prefersReducedMotion = useReducedMotion()
  const [isEditing, setIsEditing] = useState(false)
  const [editingTitle, setEditingTitle] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input only when first entering edit mode
  useEffect(() => {
    if (isEditing) {
      try {
        inputRef.current?.focus()
        const len = inputRef.current?.value.length ?? 0
        inputRef.current?.setSelectionRange(len, len)
      } catch {
        // ignore
      }
    }
  }, [isEditing])

  const handleEdit = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (!isOwner) {
        setSaveError('Only the board owner can rename this whiteboard.')
        return
      }
      setSaveError(null)
      setEditingTitle(board.name || 'Untitled')
      setIsEditing(true)
    },
    [board.name, isOwner],
  )

  const handleSave = useCallback(async () => {
    const trimmed = editingTitle.trim()
    const currentTitle = (board.name || 'Untitled').trim()
    if (!trimmed) {
      setSaveError('Name cannot be empty')
      return
    }
    setIsEditing(false)
    if (trimmed === currentTitle) return
    setSaveError(null)
    try {
      await onSave(board.id, trimmed)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSaveError('Only the board owner can rename this whiteboard.')
      } else {
        setSaveError(err instanceof Error ? err.message : 'Unable to rename')
      }
    }
  }, [editingTitle, board.name, board.id, onSave])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditingTitle('')
    setSaveError(null)
  }, [])

  const gradient = getBoardGradient(board.name || 'Untitled')
  const initials = getBoardInitials(board.name || 'Untitled')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isPlaceholder ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
      transition={{
        duration: 0.3,
        delay: prefersReducedMotion ? 0 : index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={isDragging ? undefined : {
        y: -3,
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
        borderColor: '#444',
        transition: { duration: 0.2, ease: 'easeOut' },
      }}
      onClick={() => !isPlaceholder && !isEditing && !menuOpen && onNavigate(board.id)}
      className={`relative bg-[#1A1A1A] border border-[#252525] rounded-xl overflow-hidden transition-all duration-200 ${
        isPlaceholder ? 'cursor-default' : 'cursor-pointer'
      }`}
      style={{ boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)', border: '1px solid #252525' }}
    >
      {/* Thumbnail Area */}
      {!isPlaceholder ? (
        <div className="relative">
          <div className="border border-[#e5e5e5] rounded-[4px] overflow-hidden">
            <WhiteboardThumbnail boardId={board.id} boardName={board.name || 'Untitled'} />
          </div>
          <div className="absolute top-3 right-3 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((prev) => !prev)
              }}
              className="p-1.5 rounded-lg bg-black/20 hover:bg-black/40 transition-colors"
            >
              <MoreVertical className="w-4 h-4 text-white" />
            </button>
            {menuOpen && (
              <CardContextMenu
                onRename={() => { setMenuOpen(false); handleEdit() }}
                onDuplicate={() => onDuplicate(board.id)}
                onShare={() => onShare(board.id)}
                onDelete={() => onDelete(board.id)}
                onClose={() => setMenuOpen(false)}
                canRename={isOwner}
                canDelete={isOwner}
              />
            )}
          </div>
        </div>
      ) : (
        <div
          className="h-40 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-2xl font-light drop-shadow-lg">{initials}</span>
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="p-3 xs:p-4 border-t border-[#222]">
        {saveError && <p className="mb-1.5 text-xs text-red-400">{saveError}</p>}
        <div className="flex items-center justify-between">
          {/* Title */}
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editingTitle}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSave()
                else if (e.key === 'Escape') handleCancel()
              }}
              onBlur={() => void handleSave()}
              className="flex-1 text-sm font-medium text-white bg-transparent border-b border-[#444] outline-none"
            />
          ) : (
            <div
              className={`flex items-center gap-2 flex-1 group ${
                isOwner ? 'cursor-text' : 'cursor-default'
              }`}
              onClick={isOwner ? handleEdit : undefined}
            >
              <h3 className="font-medium text-white text-xs xs:text-sm truncate">
                {board.name || (isPlaceholder ? 'Example Board' : 'Untitled')}
              </h3>
              {isOwner && (
                <Edit3 className="w-3 h-3 text-[#9CA3AF] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          )}

          {/* Timestamp */}
          {!isPlaceholder && (
            <div className="flex items-center gap-1 text-[#666] text-xs ml-2 xs:ml-3 flex-shrink-0">
              <Clock className="w-3 h-3" />
              <span>{formatTimestamp(board.updated_at || board.created_at)}</span>
            </div>
          )}
        </div>

        {/* Collaborators */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center -space-x-2">
            {!isPlaceholder &&
              members.slice(0, 3).map((member, idx) => (
                <div key={member.user_id} className="relative" style={{ zIndex: 3 - idx }}>
                  <div
                    className="flex items-center justify-center rounded-full border border-[#444] bg-[#2A2A2A] text-xs xs:text-sm font-semibold text-[#E5E7EB]"
                    style={{ width: 28, height: 28 }}
                    title={member.username ?? undefined}
                  >
                    {getBoardInitials(member.username || 'User').slice(0, 1)}
                  </div>
                </div>
              ))}
            {!isPlaceholder && members.length > 3 && (
              <div
                className="w-6 h-6 xs:w-8 xs:h-8 rounded-full bg-[#2A2A2A] border border-[#444] flex items-center justify-center text-xs text-[#666]"
                style={{ zIndex: 0 }}
              >
                +{members.length - 3}
              </div>
            )}
            {(isPlaceholder || members.length === 0) && (
              <div className="text-xs text-[#666]">No collaborators</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
})

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhiteboardsHubPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [boards, setBoards] = useState<any[]>([])
  const [membersByBoard, setMembersByBoard] = useState<Record<string, RoomMemberDetails[]>>({})
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [createError, setCreateError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'recent' | 'all'>('all')
  const [shareTarget, setShareTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const prefersReducedMotion = useReducedMotion()
  const isDesktop = useDesktopLayout()

  useEffect(() => {
    console.log('[WB-HUB] ambient-glow version 1.00 loaded')
  }, [])

  // DnD sensors — require minimum drag distance so clicks still navigate
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listMyWhiteboards()
        if (cancelled) return
        // Ensure newest first by updated_at or created_at
        rows.sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))
        // Apply saved order if available
        const savedOrder = loadBoardOrder()
        const ordered = savedOrder.length ? applyBoardOrder(rows, savedOrder) : rows
        setBoards(ordered)
        // fetch members for whiteboards (non-blocking)
        void (async () => {
          const map: Record<string, RoomMemberDetails[]> = {}
          await Promise.all(
            rows.map(async (r) => {
              try {
                const m = await listRoomMembers(r.id)
                if (cancelled) return
                map[r.id] = m
              } catch {
                // ignore per-board member load failures
              }
            }),
          )
          if (cancelled) return
          setMembersByBoard(map)
        })()
      } catch (err) {
        if (!cancelled) console.warn('[WB-HUB] load failed', { message: err instanceof Error ? err.message : String(err) })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Synchronous derivation — no extra render pass, no extra state ──────────
  const filteredBoards = useMemo(() => {
    let filtered = boards
    
    // Filter by tab
    if (activeTab === 'recent') {
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
      filtered = filtered.filter(board => 
        Date.parse(board.updated_at || board.created_at) > oneWeekAgo
      )
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(board => 
        (board.name || 'Untitled').toLowerCase().includes(query)
      )
    }
    
    return filtered
  }, [boards, searchQuery, activeTab])

  const boardIds = useMemo(() => filteredBoards.map((b) => b.id), [filteredBoards])

  // Stable callbacks — setBoards setter never changes (useState guarantee)
  const handleNavigate = useCallback(
    (boardId: string) => { navigate(`/whiteboards/${boardId}`) },
    [navigate],
  )

  const handleSave = useCallback(async (boardId: string, newTitle: string) => {
    const updatedAt = new Date().toISOString()
    await updateWhiteboardTitle(boardId, newTitle)
    setBoards((prev) =>
      prev.map((b) => (b.id === boardId ? { ...b, name: newTitle, updated_at: updatedAt } : b)),
    )
  }, [])

  const handleDelete = useCallback((boardId: string) => {
    const board = boards.find((b) => b.id === boardId)
    setDeleteTarget({ id: boardId, name: board?.name || 'Untitled' })
  }, [boards])

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    const { id } = deleteTarget
    setDeletingIds((prev) => new Set(prev).add(id))
    setDeleteTarget(null)
    try {
      await deleteWhiteboard(id)
      // Wait for fade-out animation
      setTimeout(() => {
        setBoards((prev) => {
          const next = prev.filter((b) => b.id !== id)
          saveBoardOrder(next.map((b) => b.id))
          return next
        })
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 300)
    } catch (err) {
      console.warn('[WB-HUB] delete failed', { id, message: err instanceof Error ? err.message : String(err) })
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [deleteTarget])

  const handleDuplicate = useCallback(async (boardId: string) => {
    const board = boards.find((b) => b.id === boardId)
    const originalName = board?.name || 'Untitled'
    try {
      const room = await createWhiteboard(`Copy of ${originalName}`)
      setBoards((prev) => {
        const next = [{ ...room, updated_at: room.created_at }, ...prev]
        saveBoardOrder(next.map((boardItem: { id: string }) => boardItem.id))
        return next
      })
    } catch (err) {
      console.warn('[WB-HUB] duplicate failed', { boardId, message: err instanceof Error ? err.message : String(err) })
    }
  }, [boards])

  const handleShare = useCallback((boardId: string) => {
    const board = boards.find((b) => b.id === boardId)
    setShareTarget({ id: boardId, name: board?.name || 'Untitled' })
  }, [boards])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setBoards((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id)
      const newIndex = prev.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex)
      saveBoardOrder(next.map((b) => b.id))
      return next
    })
  }, [])

  // Note: placeholder boards intentionally removed — real boards only

  async function handleCreate() {
    setCreateError(null)
    try {
      const room = await createWhiteboard()
      navigate(`/whiteboards/${room.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create whiteboard'
      setCreateError(message)
    }
  }

  const pageClassName = isDesktop
    ? 'relative isolate flex h-[100dvh] min-h-screen flex-col overflow-hidden bg-[#0D0D0D] font-body text-white'
    : 'relative isolate min-h-screen min-h-[100dvh] bg-[#0D0D0D] font-body text-white'

  return (
    <motion.main
      className={pageClassName}
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(245,158,11,0.08) 0%, transparent 65%)',
      }}
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(245,158,11,0.08) 0%, transparent 65%)',
        }}
      />

      <div className="relative z-10 flex h-full min-h-screen flex-col">
      {/* Sticky Header (UI shell) */}
      <div className="sticky top-0 z-10 bg-[#0D0D0D]/80 backdrop-blur-lg border-b border-[#2A2A2A]">
        {/* Mobile Header */}
        <div className="xs:hidden px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/')}
              aria-label="Go home"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Home</span>
            </button>
            <h1 className="text-lg font-semibold">Whiteboards</h1>
            <button 
              onClick={handleCreate} 
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-[#F59E0B] hover:bg-[#d97706] transition-colors text-black font-medium text-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create</span>
            </button>
          </div>
          
          {/* Mobile Search */}
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-[#666]" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#666] focus:outline-none focus:border-[#444] transition-colors text-sm"
            />
          </div>
          
          {/* Mobile Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-all rounded-md ${
                activeTab === 'all'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`flex-1 px-2 py-1.5 text-xs font-medium transition-all rounded-md ${
                activeTab === 'recent'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              Recent
            </button>
          </div>
        </div>
        
        {/* Desktop Header */}
        <div className="hidden xs:flex items-center justify-between px-6 py-4">
          {/* Left: Title */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              aria-label="Go home"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1A1A] hover:bg-[#2A2A2A] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">Home</span>
            </button>
            <h1 className="text-2xl font-semibold">Whiteboards</h1>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input
                type="text"
                placeholder="Search whiteboards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg text-white placeholder-[#666] focus:outline-none focus:border-[#444] transition-colors"
              />
            </div>
          </div>

          {/* Right: Create Button & User Menu */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleCreate} 
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#d97706] transition-colors text-black font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Whiteboard
            </button>
            <ChessUserMenu
              onOpenPhotos={() => navigate('/photos')}
              onOpenEdit={() => navigate('/edit')}
              onOpenAdmin={() => navigate('/admin')}
              showAdminQuickAction={false}
            />
          </div>
        </div>

        {/* Desktop Tab Filters */}
        <div className="hidden xs:block px-6 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 text-sm font-medium transition-all rounded-md ${
                activeTab === 'all'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-3 py-1 text-sm font-medium transition-all rounded-md ${
                activeTab === 'recent'
                  ? 'bg-[#2a2a2a] text-white'
                  : 'text-[#666] hover:text-white'
              }`}
            >
              Recent
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto relative">
        {createError && (
          <div className="mx-6 mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {createError}
          </div>
        )}

        <div className="p-3 xs:p-6">
          {/* Skeleton loading state */}
          {loading && (
            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xs:gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} index={i} />
              ))}
            </div>
          )}
          
          {!loading && filteredBoards.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              {/* Empty State SVG Illustration */}
              <div className="w-24 h-24 mb-6">
                <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="#666" strokeWidth="1.5"/>
                  <path d="M9 9h6v6H9z" fill="#666" opacity="0.3"/>
                  <circle cx="12" cy="12" r="1" fill="#666"/>
                  <path d="M16 8l-4 4-4-4" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              
              <h2 className="text-xl font-semibold text-white mb-2">No whiteboards yet</h2>
              <p className="text-[#666] mb-6 text-center max-w-md">
                Create your first whiteboard to get started
              </p>
              <button 
                onClick={handleCreate}
                className="flex items-center gap-2 px-6 py-3 rounded-lg bg-[#F59E0B] hover:bg-[#d97706] transition-colors text-black font-medium"
              >
                <Plus className="w-5 h-5" />
                Create Your First Whiteboard
              </button>
            </div>
          )}

          {!loading && filteredBoards.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={boardIds} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 xs:gap-6">
                  <AnimatePresence mode="popLayout">
                    {filteredBoards.map((board, index) => (
                      <SortableCardWrapper key={board.id} id={board.id}>
                        {(isDragging) => (
                          !deletingIds.has(board.id) ? (
                            <WhiteboardCard
                              board={board}
                              index={index}
                              members={membersByBoard[board.id] ?? EMPTY_MEMBERS}
                              isDragging={isDragging}
                              isOwner={
                                board.owner?.user_id
                                  ? board.owner.user_id === profile?.id
                                  : (membersByBoard[board.id] ?? []).some(
                                      (m) => m.user_id === profile?.id && m.is_owner
                                    )
                              }
                              onNavigate={handleNavigate}
                              onSave={handleSave}
                              onDelete={handleDelete}
                              onDuplicate={(id) => void handleDuplicate(id)}
                              onShare={handleShare}
                            />
                          ) : (
                            <motion.div
                              key={`deleting-${board.id}`}
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="bg-[#1A1A1A] border border-[#252525] rounded-xl overflow-hidden h-64"
                            />
                          )
                        )}
                      </SortableCardWrapper>
                    ))}
                  </AnimatePresence>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Share Modal */}
      <AnimatePresence>
        {shareTarget && (
          <ShareModal
            boardId={shareTarget.id}
            boardName={shareTarget.name}
            onClose={() => setShareTarget(null)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmDialog
            boardName={deleteTarget.name}
            onConfirm={() => void confirmDelete()}
            onCancel={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </motion.main>
  )
}
