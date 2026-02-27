import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { PlyAnalysis, GotwChapter } from '../../../data/chessGotw.types'
import { CLASSIFICATION_LABELS, CLASSIFICATION_COLORS } from '../../../data/chessGotw.types'

/** Classifications that warrant an on-board popup */
const INTERESTING_SET = new Set([
  'brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'blunder',
])

type GotwBoardInsightPopupProps = {
  currentPly: number
  san: string | undefined
  analysis: PlyAnalysis | undefined
  chapter: GotwChapter | undefined
  isPlaying: boolean
  /** Destination square in algebraic notation (e.g. "e4") */
  destSquare: string | null
  /** Board width/height in px */
  boardSizePx: number
  onRequestPause: () => void
  onDismiss: () => void
}

const AUTO_DISMISS_MS = 4000
const POPUP_GAP = 6
const POINTER_SIZE = 6

/** Parse algebraic square to 0-based file/rank indices */
function parseSquare(sq: string): { file: number; rank: number } | null {
  if (sq.length !== 2) return null
  const file = sq.charCodeAt(0) - 97 // 'a'=0 .. 'h'=7
  const rank = parseInt(sq[1], 10)    // 1..8
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null
  return { file, rank }
}

export default function GotwBoardInsightPopup({
  currentPly,
  san,
  analysis,
  chapter,
  isPlaying,
  destSquare,
  boardSizePx,
  onRequestPause,
  onDismiss,
}: GotwBoardInsightPopupProps): React.JSX.Element | null {
  const isInteresting =
    (analysis && INTERESTING_SET.has(analysis.classification)) || !!chapter

  const [pinned, setPinned] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  // Reset on ply change
  useEffect(() => {
    setPinned(false)
    setDragOffset(null)
    setDragging(false)
    dragStartRef.current = null
  }, [currentPly])

  // Auto-dismiss after 4s only during autoplay and when not pinned
  useEffect(() => {
    if (!isInteresting || pinned || !isPlaying) return undefined
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [isInteresting, pinned, isPlaying, currentPly, onDismiss])

  const handlePopupClick = useCallback(
    (e: React.PointerEvent) => {
      if (dragging) return
      e.stopPropagation()
      if (!pinned) {
        setPinned(true)
        onRequestPause()
      }
    },
    [pinned, dragging, onRequestPause],
  )

  // --- Drag on header ---
  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      const popup = popupRef.current
      if (!popup) return
      const rect = popup.getBoundingClientRect()
      const parentRect = popup.offsetParent?.getBoundingClientRect() ?? rect
      dragStartRef.current = {
        px: e.clientX,
        py: e.clientY,
        ox: rect.left - parentRect.left,
        oy: rect.top - parentRect.top,
      }
      setDragging(true)
    },
    [],
  )

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      const start = dragStartRef.current
      if (!start) return
      setDragOffset({
        x: start.ox + (e.clientX - start.px),
        y: start.oy + (e.clientY - start.py),
      })
    },
    [],
  )

  const handleDragEnd = useCallback(
    (e: React.PointerEvent) => {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      dragStartRef.current = null
      window.requestAnimationFrame(() => setDragging(false))
    },
    [],
  )

  if (!isInteresting || !san) return null

  const label = analysis ? CLASSIFICATION_LABELS[analysis.classification] : 'Key Moment'
  const colors = analysis
    ? CLASSIFICATION_COLORS[analysis.classification]
    : { bg: 'bg-amber-500/20', text: 'text-amber-300' }
  const symbol = analysis?.symbol ?? '★'

  // Anchor position based on destination square
  const parsed = destSquare ? parseSquare(destSquare) : null
  const squareSize = boardSizePx / 8
  const xCenter = parsed ? (parsed.file + 0.5) * squareSize : boardSizePx / 2
  // Upper ranks → popup above; lower ranks → popup below
  const placeAbove = parsed ? parsed.rank >= 5 : true

  const popupWidth = Math.min(280, boardSizePx * 0.75)
  const clampedLeft = Math.max(4, Math.min(boardSizePx - popupWidth - 4, xCenter - popupWidth / 2))
  const pointerLeft = Math.max(12, Math.min(popupWidth - 12, xCenter - clampedLeft))

  const anchorStyle: React.CSSProperties = dragOffset
    ? { left: dragOffset.x, top: dragOffset.y, width: popupWidth }
    : {
        left: clampedLeft,
        width: popupWidth,
        ...(placeAbove
          ? { bottom: boardSizePx + POPUP_GAP + POINTER_SIZE }
          : { top: boardSizePx + POPUP_GAP + POINTER_SIZE }),
      }

  return (
    <div
      ref={popupRef}
      data-testid="gotw-board-insight-popup"
      role="status"
      onPointerDown={handlePopupClick}
      className={`
        pointer-events-auto absolute z-20 rounded-xl shadow-xl
        border border-white/15 backdrop-blur-sm
        transition-opacity duration-200
        ${pinned ? 'opacity-[0.96]' : 'opacity-[0.88] hover:opacity-95'}
        ${colors.bg} bg-chess-bg/80
      `}
      style={anchorStyle}
    >
      {/* Pointer triangle toward the destination square */}
      {!dragOffset ? (
        <span
          data-testid="gotw-popup-pointer"
          className="absolute"
          style={{
            left: pointerLeft - POINTER_SIZE,
            ...(placeAbove
              ? { bottom: -POINTER_SIZE * 2, borderTop: `${POINTER_SIZE}px solid rgba(255,255,255,0.15)` }
              : { top: -POINTER_SIZE * 2, borderBottom: `${POINTER_SIZE}px solid rgba(255,255,255,0.15)` }),
            borderLeft: `${POINTER_SIZE}px solid transparent`,
            borderRight: `${POINTER_SIZE}px solid transparent`,
            width: 0,
            height: 0,
          }}
        />
      ) : null}

      {/* Draggable header */}
      <div
        className="flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
      >
        <span className={`text-lg font-bold ${colors.text}`}>{symbol}</span>
        <span className={`text-base font-semibold ${colors.text}`}>{label}</span>
        {san ? (
          <span className="ml-auto text-sm font-medium text-chess-text/70">{san}</span>
        ) : null}
      </div>

      {/* Short description */}
      {analysis?.short ? (
        <p className="px-3 pb-2 text-sm leading-relaxed text-chess-text/80">
          {analysis.short}
        </p>
      ) : null}

      {/* Expanded detail — visible when pinned */}
      {pinned && (analysis?.detail || chapter?.prompt) ? (
        <div className="border-t border-white/10 px-3 py-2 text-sm leading-relaxed text-chess-text/90">
          {analysis?.detail ?? chapter?.prompt}
        </div>
      ) : null}
    </div>
  )
}
