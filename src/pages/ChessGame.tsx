import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { abortGame, fetchGame, fetchGameMembers, makeMove, restartGame } from '../api/games'
import Toast from '../components/Toast'
import type { GameMemberProfile, GameRow } from '../api/games'
import { supabase } from '../supabaseClient'
import { useGameRealtime } from '../hooks/useGameRealtime'
import { useAuth } from '../contexts/AuthContext'
import { useStockfish } from '../hooks/useStockfish'
import { findOpening } from '../data/chessOpenings'

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

type PendingPromotion = {
  from: Square
  to: Square
  fen: string
}

type GameEndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty-move'
  | 'draw'
  | 'aborted'
  | 'resigned'
  | null

type MoveRow = {
  ply: number
  uci: string
  created_by: string
  created_at: string
  fen_after?: string | null
  hint_used?: boolean | null
}

type MoveHistoryRow = {
  moveNumber: number
  white: string | null
  black: string | null
}

type HintMove = {
  uci: string
  san: string
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const CHESSBOARD_MAX_SIZE = 720

const CHESSBOARD_THEME = {
  customLightSquareStyle: { backgroundColor: 'var(--color-slate-50)' },
  customDarkSquareStyle: { backgroundColor: 'var(--color-slate-200)' },
  customBoardStyle: { borderRadius: 10 },
} as const

const PROMOTION_PIECES: { value: PromotionPiece; label: string; symbol: string }[] = [
  { value: 'q', label: 'Queen', symbol: '♛' },
  { value: 'r', label: 'Rook', symbol: '♜' },
  { value: 'b', label: 'Bishop', symbol: '♝' },
  { value: 'n', label: 'Knight', symbol: '♞' },
]

function isPromotionMove(fen: string, from: Square, to: Square): boolean {
  const chess = new Chess(fen)
  const moves = chess.moves({ square: from, verbose: true })
  return moves.some((m) => m.to === to && m.promotion)
}

function detectGameEnd(fen: string): { isOver: boolean; reason: GameEndReason; winner: 'white' | 'black' | null } {
  try {
    const chess = new Chess(fen)
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'black' : 'white'
      return { isOver: true, reason: 'checkmate', winner }
    }
    if (chess.isStalemate()) return { isOver: true, reason: 'stalemate', winner: null }
    if (chess.isInsufficientMaterial()) return { isOver: true, reason: 'insufficient', winner: null }
    if (chess.isThreefoldRepetition()) return { isOver: true, reason: 'threefold', winner: null }
    if (chess.isDraw()) return { isOver: true, reason: 'fifty-move', winner: null }
    return { isOver: false, reason: null, winner: null }
  } catch {
    return { isOver: false, reason: null, winner: null }
  }
}

function gameEndMessage(reason: GameEndReason, winner: 'white' | 'black' | null): string {
  switch (reason) {
    case 'checkmate': return `Checkmate! ${winner === 'white' ? 'White' : 'Black'} wins.`
    case 'stalemate': return 'Draw by stalemate.'
    case 'insufficient': return 'Draw by insufficient material.'
    case 'threefold': return 'Draw by threefold repetition.'
    case 'fifty-move': return 'Draw by the fifty-move rule.'
    case 'draw': return 'Game drawn.'
    case 'aborted': return 'Game aborted.'
    case 'resigned': return 'Game ended by resignation.'
    default: return ''
  }
}

function PromotionChooser({ onSelect, onCancel }: { onSelect: (piece: PromotionPiece) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel} role="dialog" aria-label="Choose promotion piece">
      <div className="rounded-xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold text-slate-700">Promote pawn to:</div>
        <div className="flex gap-2">
          {PROMOTION_PIECES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onSelect(p.value)}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-2xl hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label={`Promote to ${p.label}`}
            >
              <span>{p.symbol}</span>
              <span className="text-[10px] text-slate-500">{p.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function GameEndPanel({ reason, winner, onRestart, onQuit }: { reason: GameEndReason; winner: 'white' | 'black' | null; onRestart?: () => void; onQuit?: () => void }) {
  if (!reason) return null
  const msg = gameEndMessage(reason, winner)
  const isDraw = winner === null && reason !== 'aborted' && reason !== 'resigned'
  const bgClass = reason === 'aborted' ? 'bg-amber-50 border-amber-200' : isDraw ? 'bg-blue-50 border-blue-200' : 'bg-emerald-50 border-emerald-200'
  const textClass = reason === 'aborted' ? 'text-amber-800' : isDraw ? 'text-blue-800' : 'text-emerald-800'

  return (
    <div className={`mb-3 rounded-lg border px-4 py-3 ${bgClass}`} role="status" aria-live="polite">
      <div className={`text-sm font-semibold ${textClass}`}>{msg}</div>
      <div className="mt-2 flex gap-2">
        {onRestart ? (
          <button
            type="button"
            onClick={onRestart}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Play again
          </button>
        ) : null}
        {onQuit ? (
          <button
            type="button"
            onClick={onQuit}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back to games
          </button>
        ) : null}
      </div>
    </div>
  )
}

function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel} role="dialog" aria-label={title}>
      <div className="max-w-sm rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-base font-semibold text-slate-800">{title}</div>
        <div className="mb-4 text-sm text-slate-600">{message}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

type ParsedUci = {
  from: Square
  to: Square
  promotion?: string
}

function parseUciMove(uci: string): ParsedUci | null {
  if (!uci || uci.length < 4) return null
  const from = uci.slice(0, 2) as Square
  const to = uci.slice(2, 4) as Square
  const promotion = uci.slice(4) || undefined
  return { from, to, promotion }
}

function sortedMoveRows(moveRows: MoveRow[]): MoveRow[] {
  return moveRows.slice().sort((a, b) => (a.ply || 0) - (b.ply || 0))
}

function buildMoveHistory(moveRows: MoveRow[]): MoveHistoryRow[] {
  if (!moveRows.length) return []
  const chess = new Chess()
  const history: MoveHistoryRow[] = []

  sortedMoveRows(moveRows)
    .forEach((mv, index) => {
      const parsed = parseUciMove(mv.uci)
      const ply = mv.ply || index + 1
      if (!parsed) return

      try {
        const played = chess.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
        })
        const san = played?.san ?? mv.uci

        const moveNumber = Math.ceil(ply / 2)
        const isWhite = ply % 2 === 1
        const rowIndex = moveNumber - 1
        if (!history[rowIndex]) {
          history[rowIndex] = { moveNumber, white: null, black: null }
        }
        history[rowIndex] = {
          ...history[rowIndex],
          [isWhite ? 'white' : 'black']: san,
        }
      } catch {
        // ignore invalid move in history replay
      }
    })

  return history
}

function buildMovesUci(moveRows: MoveRow[]) {
  return sortedMoveRows(moveRows).map((mv) => mv.uci)
}

function formatUciToSan(fen: string, uci: string) {
  const parsed = parseUciMove(uci)
  if (!parsed) return uci
  try {
    const chess = new Chess(fen)
    const move = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion })
    return move?.san ?? uci
  } catch {
    return uci
  }
}

function plyFromFen(fen: string): number {
  const parts = fen.split(' ')
  const turn = parts[1] as 'w' | 'b' | undefined
  const fullmove = Number(parts[5])
  const moveNumber = Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1
  return turn === 'b' ? ((moveNumber - 1) * 2) + 1 : ((moveNumber - 1) * 2)
}

function getEvalPercent(score: number | null) {
  if (score === null) return 50
  const clamped = Math.min(9, Math.max(-9, score))
  return ((clamped + 9) / 18) * 100
}

function buildDisplayFen(sortedMoves: MoveRow[], gameFen: string | null, viewPly: number) {
  if (!sortedMoves.length) {
    return gameFen || START_FEN
  }

  const targetPly = Math.max(0, Math.min(viewPly, sortedMoves.length))

  if (targetPly === 0) {
    return START_FEN
  }

  const exact = sortedMoves.find((mv) => mv.ply === targetPly && typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
  if (exact?.fen_after) return exact.fen_after

  if (targetPly === sortedMoves.length) {
    const lastWithFen = [...sortedMoves].reverse().find((mv) => typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
    if (lastWithFen?.fen_after) return lastWithFen.fen_after
    if (gameFen) return gameFen
  }

  const chess = new Chess(START_FEN)
  for (const mv of sortedMoves) {
    if ((mv.ply || 0) > targetPly) break
    const parsed = parseUciMove(mv.uci)
    if (!parsed) continue
    try {
      chess.move({
        from: parsed.from,
        to: parsed.to,
        promotion: parsed.promotion,
      })
    } catch {
      // ignore invalid move replay
    }
  }
  return chess.fen()
}

function useChessDisplay(moveRows: MoveRow[], gameFen: string | null, hoveredHintUci: string | null = null) {
  const [boardFen, setBoardFen] = useState<string>(START_FEN)
  const [viewPly, setViewPly] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [showLegalMoves, setShowLegalMoves] = useState(true)
  const [showThreats, setShowThreats] = useState(false)
  const lastMoveCountRef = useRef(0)

  useEffect(() => {
    const currentCount = moveRows.length
    const prevCount = lastMoveCountRef.current
    lastMoveCountRef.current = currentCount
    setViewPly((prev) => (prev === prevCount ? currentCount : Math.min(prev, currentCount)))
  }, [moveRows.length])

  useEffect(() => {
    setSelectedSquare(null)
  }, [viewPly])

  const sortedMoves = useMemo(() => sortedMoveRows(moveRows), [moveRows])

  const displayFen = useMemo(() => buildDisplayFen(sortedMoves, gameFen, viewPly), [sortedMoves, gameFen, viewPly])

  const moveHistory = useMemo(() => buildMoveHistory(sortedMoves), [sortedMoves])

  useEffect(() => {
    if (moveRows.length) {
      const lastWithFen = [...sortedMoves].reverse().find((mv) => typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
      if (lastWithFen?.fen_after) {
        setBoardFen(lastWithFen.fen_after)
        return
      }

      const chess = new Chess(START_FEN)
      for (const mv of sortedMoves) {
        const parsed = parseUciMove(mv.uci)
        if (!parsed) continue
        try {
          chess.move({
            from: parsed.from,
            to: parsed.to,
            promotion: parsed.promotion,
          })
        } catch {
          // ignore invalid move replay
        }
      }
      setBoardFen(chess.fen())
      return
    }

    if (gameFen) {
      setBoardFen(gameFen)
      return
    }

    setBoardFen(START_FEN)
  }, [gameFen, sortedMoves])

  useEffect(() => {
    if (!showLegalMoves) setSelectedSquare(null)
  }, [showLegalMoves, displayFen])

  const legalMoveStyles = useMemo(() => {
    if (!showLegalMoves || !selectedSquare) return {}
    const chess = new Chess(displayFen)
    const moves = chess.moves({ square: selectedSquare, verbose: true }) as Array<{ to: Square }>
    const styles: Record<string, React.CSSProperties> = {
      [selectedSquare]: { backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 24%, transparent)' },
    }
    for (const move of moves) {
      styles[move.to] = {
        backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 14%, transparent)',
        boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-blue-500) 55%, transparent)',
      }
    }
    return styles
  }, [displayFen, selectedSquare, showLegalMoves])

  // Debounced threat computation to avoid UI lag on mobile/lower-end devices
  const [threatStyles, setThreatStyles] = useState<Record<string, React.CSSProperties>>({})
  const threatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (threatTimerRef.current) {
      clearTimeout(threatTimerRef.current)
      threatTimerRef.current = null
    }

    if (!showThreats) {
      setThreatStyles({})
      return
    }

    threatTimerRef.current = setTimeout(() => {
      const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
      const withTurn = (fen: string, turn: 'w' | 'b') => {
        const parts = fen.split(' ')
        if (parts.length >= 2) {
          parts[1] = turn
          return parts.join(' ')
        }
        return fen
      }

      const buildAttackMap = (fen: string, turn: 'w' | 'b') => {
        const chess = new Chess(withTurn(fen, turn))
        const board = chess.board()
        const attacks = new Map<string, Array<string>>()

        for (let r = 0; r < board.length; r += 1) {
          for (let c = 0; c < board[r].length; c += 1) {
            const piece = board[r][c]
            if (!piece || piece.color !== turn) continue
            const file = String.fromCharCode(97 + c)
            const rank = 8 - r
            const square = `${file}${rank}` as Square
            const moves = chess.moves({ square, verbose: true }) as Array<{ to: Square; piece: string }>
            for (const move of moves) {
              const list = attacks.get(move.to) ?? []
              list.push(move.piece)
              attacks.set(move.to, list)
            }
          }
        }
        return attacks
      }

      const chess = new Chess(displayFen)
      const board = chess.board()
      const attacksByWhite = buildAttackMap(displayFen, 'w')
      const attacksByBlack = buildAttackMap(displayFen, 'b')
      const styles: Record<string, React.CSSProperties> = {}

      const isDefended = (fen: string, square: Square, color: 'w' | 'b') => {
        const defender = new Chess(withTurn(fen, color))
        defender.remove(square)
        const moves = defender.moves({ verbose: true }) as Array<{ to: string }>
        return moves.some((move) => move.to === square)
      }

      for (let r = 0; r < board.length; r += 1) {
        for (let c = 0; c < board[r].length; c += 1) {
          const piece = board[r][c]
          if (!piece) continue
          const file = String.fromCharCode(97 + c)
          const rank = 8 - r
          const square = `${file}${rank}` as Square
          const attackedBy = piece.color === 'w' ? attacksByBlack : attacksByWhite
          const attackers = attackedBy.get(square) ?? []
          if (!attackers.length) continue

          const defended = isDefended(displayFen, square, piece.color)
          const pieceValue = pieceValues[piece.type] ?? 0
          const minAttacker = Math.min(...attackers.map((type) => pieceValues[type] ?? 0))
          const valueThreat = minAttacker > 0 && minAttacker < pieceValue

          if (valueThreat) {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-red-500) 16%, transparent)',
              boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-red-500) 65%, transparent)',
            }
          } else if (!defended) {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-amber-500) 18%, transparent)',
              boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-amber-500) 65%, transparent)',
            }
          } else {
            styles[square] = {
              backgroundColor: 'color-mix(in srgb, var(--color-blue-500) 12%, transparent)',
              boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-blue-500) 60%, transparent)',
            }
          }
        }
      }

      setThreatStyles(styles)
    }, 150) // 150ms debounce to prevent jank on rapid position changes

    return () => {
      if (threatTimerRef.current) {
        clearTimeout(threatTimerRef.current)
        threatTimerRef.current = null
      }
    }
  }, [displayFen, showThreats])

  const hintHoverStyles = useMemo(() => {
    if (!hoveredHintUci) return {}
    const parsed = parseUciMove(hoveredHintUci)
    if (!parsed) return {}

    return {
      [parsed.from]: {
        backgroundColor: 'color-mix(in srgb, var(--color-purple-500) 24%, transparent)',
        boxShadow: 'inset 0 0 0 2px color-mix(in srgb, var(--color-purple-500) 62%, transparent)',
      },
      [parsed.to]: {
        backgroundColor: 'color-mix(in srgb, var(--color-purple-500) 30%, transparent)',
        boxShadow: 'inset 0 0 0 3px color-mix(in srgb, var(--color-purple-500) 70%, transparent)',
      },
    } as Record<string, React.CSSProperties>
  }, [hoveredHintUci])

  const customSquareStyles = useMemo(() => ({
    ...threatStyles,
    ...legalMoveStyles,
    ...hintHoverStyles,
  }), [hintHoverStyles, legalMoveStyles, threatStyles])

  return {
    boardFen,
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    selectedSquare,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    customSquareStyles,
  }
}

function TopHintsList({ hintMoves, onHoverOrClick }: { hintMoves: HintMove[]; onHoverOrClick: (uci: string | null) => void }) {
  if (!hintMoves.length) return <div className="text-xs text-slate-500">No hints yet.</div>

  return (
    <ol className="space-y-1 text-sm text-slate-700">
      {hintMoves.map((move, idx) => (
        <li key={`${move.uci}-${idx}`}>
          <button
            type="button"
            className="w-full rounded px-1 py-0.5 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            onMouseEnter={() => onHoverOrClick(move.uci)}
            onMouseLeave={() => onHoverOrClick(null)}
            onClick={() => onHoverOrClick(move.uci)}
          >
            {idx + 1}. {move.san}
          </button>
        </li>
      ))}
    </ol>
  )
}

function useChessboardSize(maxSize: number) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [boardSize, setBoardSize] = useState(Math.min(maxSize, 400))

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') {
      setBoardSize(maxSize)
      return
    }

    const updateSize = () => {
      const width = container.clientWidth
      const height = container.clientHeight
      if (!width) return

      const safeWidth = Math.max(0, width - 16)

      // Desktop (lg:flex-1 gives real height from flex) → constrain to
      // both dimensions so the square board fits.  Mobile/tablet (stacked
      // layout, natural height) → width only; the board determines its own
      // height and the parent page scrolls.
      const isDesktopRow = window.innerWidth >= 1024
      let limit: number

      if (isDesktopRow && height > 100) {
        const safeHeight = Math.max(0, height - 16)
        limit = Math.min(safeWidth, safeHeight)
      } else {
        limit = safeWidth
      }

      const next = Math.max(180, Math.min(maxSize, limit))
      setBoardSize(next)
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    window.addEventListener('resize', updateSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateSize)
    }
  }, [maxSize])

  return { containerRef, boardSize }
}

export default function ChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  if (gameId === 'local') {
    return <LocalChessGame />
  }
  return <OnlineChessGame />
}

function OnlineChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [refreshToken, setRefreshToken] = useState(0)
  const { moves, loading: movesLoading } = useGameRealtime(gameId || null, refreshToken)
  const [game, setGame] = useState<GameRow | null>(null)
  const [members, setMembers] = useState<GameMemberProfile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  const [restartLoading, setRestartLoading] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [optimisticFen, setOptimisticFen] = useState<string | null>(null)
  const [debugCopied, setDebugCopied] = useState(false)
  // whether hints are currently visible (after clicking the single Show Hints button)
  const [showHintsVisible, setShowHintsVisible] = useState(false)
  // which UCI is currently hovered / tapped to highlight squares
  const [hoveredHintUci, setHoveredHintUci] = useState<string | null>(null)
  const [hintCount, setHintCount] = useState(0)
  const [pendingHintPly, setPendingHintPly] = useState<number | null>(null)

  const moveRows = useMemo(() => (moves ?? []) as MoveRow[], [moves])
  const hintedByPly = useMemo(() => {
    const map = new Map<number, boolean>()
    for (const move of moveRows) {
      const ply = Number(move.ply)
      if (!Number.isFinite(ply)) continue
      map.set(ply, move.hint_used === true)
    }
    return map
  }, [moveRows])

  useEffect(() => {
    console.table(moveRows.map((m) => ({ ply: m.ply, uci: m.uci, hinted: m.hint_used })))
  }, [moveRows])

  // Clear optimistic FEN once the realtime event delivers the new move
  useEffect(() => {
    setOptimisticFen(null)
  }, [moveRows.length])

  const loadGameData = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    setAuthError(false)

    try {
      const [g, gm] = await Promise.all([
        fetchGame(gameId),
        fetchGameMembers(gameId),
      ])
      setGame(g)
      setMembers(gm)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load game'
      const looksLikeAuth = /jwt|token|auth/i.test(message)
      setError(looksLikeAuth ? 'Session expired. Please sign in again.' : 'Failed to load game. Please try again.')
      setAuthError(looksLikeAuth)
      setGame(null)
      setMembers([])
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    void loadGameData()
  }, [loadGameData])

  // Clear active hint UI after any new move arrives from realtime state.
  useEffect(() => {
    if (moveRows.length > 0) {
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      setPendingHintPly(null)
    }
  }, [moveRows.length])

  

  const {
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    customSquareStyles,
  } = useChessDisplay(moveRows, game?.current_fen ?? null, hoveredHintUci)
  const { containerRef: boardContainerRef, boardSize } = useChessboardSize(CHESSBOARD_MAX_SIZE)

  async function onDrop(sourceSquare: Square, targetSquare: Square, currentFen: string, promotion: PromotionPiece = 'q') {
    if (!gameId) return false
    if (game?.status === 'aborted') return false
    if (viewPly !== moveRows.length) return false
    const c = new Chess(currentFen || START_FEN)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false
    const fenAfter = c.fen()
    // Show the new position immediately (optimistic) so the piece doesn't snap back
    setOptimisticFen(fenAfter)
    try {
      const ply = moveRows.length + 1
      const hintUsedForPly = pendingHintPly === ply
      await makeMove(gameId, ply, `${move.from}${move.to}${move.promotion ?? ''}`, fenAfter, hintUsedForPly)
      setPendingHintPly(null)
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      setViewPly(ply)
      setSelectedSquare(null)
      return true
    } catch (err) {
      // Revert optimistic FEN on failure
      setOptimisticFen(null)
      const message = err instanceof Error ? err.message : 'Move failed'
      setToastSeverity('error')
      setToastMessage(message)
      return false
    }
  }

  async function handleRestartGame() {
    if (!gameId) return
    setShowRestartConfirm(false)
    setError(null)
    setRestartLoading(true)
    try {
      const maybeGame = await restartGame(gameId)
      setViewPly(0)
      setSelectedSquare(null)
      void loadGameData()
      setRefreshToken((prev) => prev + 1)
      setToastSeverity('success')
      setToastMessage('Game restarted')
      if (maybeGame && typeof maybeGame === 'object') setGame(maybeGame as GameRow)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restart game'
      setError(message)
      setToastSeverity('error')
      setToastMessage(message)
    } finally {
      setRestartLoading(false)
    }
  }

  async function handleQuitGame() {
    if (!gameId) {
      navigate('/games')
      return
    }

    try {
      await abortGame(gameId)
    } catch {
      // Keep navigation resilient even if quit persistence fails.
    } finally {
      navigate('/games')
    }
  }

  const normalizedDisplayFen = optimisticFen || displayFen || START_FEN
  const currentTurn = (normalizedDisplayFen.split(' ')[1] as 'w' | 'b' | undefined) || (game?.current_turn as 'w' | 'b' | null) || null
  const currentUserId = user?.id ?? null
  const currentMember = members.find((member) => member.user_id === currentUserId) ?? null

  const whiteMember = members.find((member) => member.role === 'white') ?? null
  const blackMember = members.find((member) => member.role === 'black') ?? null

  const isCurrentWhite = currentMember?.role === 'white'
  const isCurrentBlack = currentMember?.role === 'black'

  const topPlayer = isCurrentWhite ? blackMember : whiteMember
  const bottomPlayer = isCurrentBlack ? blackMember : whiteMember

  const topIsWhite = topPlayer?.role === 'white'
  const bottomIsWhite = bottomPlayer?.role === 'white'

  const renderPlayerLabel = (label: GameMemberProfile | null, isTurn: boolean, fallback: string) => {
    const role = label?.role
    const displayName = label?.username || fallback
    const roleLabel = role === 'white' ? 'White' : role === 'black' ? 'Black' : role || 'Player'
    const roleBadgeClass = role === 'white'
      ? 'bg-slate-100 text-slate-700'
      : role === 'black'
        ? 'bg-slate-800 text-white'
        : 'bg-slate-200 text-slate-600'

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isTurn ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-slate-800">{displayName}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${roleBadgeClass}`}>
          {roleLabel}
        </span>
      </div>
    )
  }

  const topFallback = topPlayer ? 'Opponent' : 'Waiting for opponent'
  const bottomFallback = currentMember ? 'You' : 'Player'

  const memberCountLabel = `${members.length}/2 players`
  const isAborted = game?.status === 'aborted'
  const isViewingPast = viewPly < moveRows.length
  const isMember = Boolean(currentMember)
  const isUserTurn = (currentTurn === 'w' && isCurrentWhite) || (currentTurn === 'b' && isCurrentBlack)
  const gameEnd = useMemo(() => {
    if (isAborted) return { isOver: true, reason: 'aborted' as GameEndReason, winner: null }
    return detectGameEnd(normalizedDisplayFen)
  }, [isAborted, normalizedDisplayFen])
  const canMove = !isAborted && !gameEnd.isOver && !isViewingPast && isMember && isUserTurn && !pendingPromotion
  const boardOrientation: 'white' | 'black' = isCurrentBlack ? 'black' : 'white'

  const { isReady, topMoves, evaluation, analyzePosition, difficulty, setDifficulty } = useStockfish()
  const opening = useMemo(() => findOpening(buildMovesUci(moveRows)), [moveRows])
  const evalPercent = useMemo(() => getEvalPercent(evaluation.score), [evaluation.score])

  useEffect(() => {
    if (!isReady) return
    const handle = setTimeout(() => {
      analyzePosition(normalizedDisplayFen)
    }, 200)
    return () => clearTimeout(handle)
  }, [analyzePosition, isReady, normalizedDisplayFen])

  const hintMoves: HintMove[] = useMemo(() => (
    topMoves.map((move) => ({
      ...move,
      san: formatUciToSan(normalizedDisplayFen, move.uci),
    }))
  ), [normalizedDisplayFen, topMoves])

  return (
    <div className="flex flex-col rounded-2xl bg-slate-100/80 p-4 shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chess</h2>
          <div className="text-xs text-slate-500">
            Status: {game?.status ?? 'loading'}
            {currentMember?.role ? ` · You are ${currentMember.role}` : ' · Spectating'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestartConfirm(true)}
            disabled={restartLoading}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            {restartLoading ? 'Restarting…' : 'Restart game'}
          </button>
          <button
            onClick={() => { void handleQuitGame() }}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Quit
          </button>
        </div>
      </div>
      {error ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span>{error}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setRefreshToken((prev) => prev + 1)
                void loadGameData()
              }}
              className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700"
            >
              Retry
            </button>
            {authError ? (
              <button
                onClick={() => { void supabase.auth.signOut() }}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white"
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {!isMember && !loading && !movesLoading ? (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          You are signed in but not recognized as a player in this game. The board is read-only until you join.
          {import.meta.env.DEV ? (
            <div className="mt-1 text-xs text-amber-700">
              userId: {currentUserId ?? 'none'} · members: {members.map((m) => `${m.user_id}:${m.role}`).join(', ') || 'none'}
            </div>
          ) : null}
        </div>
      ) : null}
      <GameEndPanel
        reason={gameEnd.reason}
        winner={gameEnd.winner}
        onRestart={() => setShowRestartConfirm(true)}
        onQuit={() => { void handleQuitGame() }}
      />
      {showRestartConfirm ? (
        <ConfirmDialog
          title="Restart game?"
          message="This will reset the board and clear all moves. Both players will start over."
          confirmLabel="Restart"
          onConfirm={() => { void handleRestartGame() }}
          onCancel={() => setShowRestartConfirm(false)}
        />
      ) : null}
      {pendingPromotion ? (
        <PromotionChooser
          onSelect={(piece) => {
            const { from, to, fen } = pendingPromotion
            setPendingPromotion(null)
            void onDrop(from, to, fen, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:min-h-0 lg:min-w-0 lg:flex-1">
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', topFallback)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewPly((prev) => Math.max(0, prev - 1))}
                disabled={viewPly === 0}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Undo
              </button>
              <button
                onClick={() => setViewPly((prev) => Math.min(moveRows.length, prev + 1))}
                disabled={viewPly >= moveRows.length}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Redo
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLegalMoves}
                  onChange={(event) => setShowLegalMoves(event.target.checked)}
                  className="h-4 w-4"
                />
                Show legal moves
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showThreats}
                  onChange={(event) => setShowThreats(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight threats
              </label>
            </div>
            {isViewingPast ? (
              <span className="text-xs text-slate-500">Viewing move {viewPly}/{moveRows.length}</span>
            ) : (
              <span className="text-xs text-slate-500">Live</span>
            )}
          </div>
          <div ref={boardContainerRef} className="flex w-full items-center justify-center overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm" style={{ maxWidth: boardSize + 8 }}>
              <Chessboard
                position={normalizedDisplayFen}
                boardOrientation={boardOrientation}
                showBoardNotation
                {...CHESSBOARD_THEME}
                onPieceDrop={(src: Square, dst: Square) => {
                  if (!canMove) return false
                  try {
                    if (isPromotionMove(normalizedDisplayFen, src, dst)) {
                      setPendingPromotion({ from: src, to: dst, fen: normalizedDisplayFen })
                      return false
                    }
                    const test = new Chess(normalizedDisplayFen || START_FEN)
                    const move = test.move({ from: src, to: dst })
                    if (!move) return false
                    void onDrop(src, dst, normalizedDisplayFen)
                    return true
                  } catch {
                    return false
                  }
                }}
                onSquareClick={(square: Square) => {
                  if (!showLegalMoves) return
                  setSelectedSquare((prev) => (prev === square ? null : square))
                }}
                boardWidth={boardSize}
                arePiecesDraggable={canMove}
                customSquareStyles={customSquareStyles}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(bottomPlayer || null, bottomIsWhite ? currentTurn === 'w' : currentTurn === 'b', bottomFallback)}
          </div>
        </div>

        <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:w-[360px] lg:shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
            {loading || movesLoading ? (
              <span className="text-xs text-slate-500">Loading…</span>
            ) : null}
          </div>
            <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>
          {import.meta.env.DEV ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Debug</span>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                  onClick={() => {
                    const summary = [
                      `game=${gameId ?? 'none'}`,
                      `user=${currentUserId ?? 'none'}`,
                      `members=${members.length ? members.map((m) => `${m.user_id}:${m.role}`).join(', ') : 'none'}`,
                      `turn=${currentTurn ?? 'unknown'}`,
                      `status=${game?.status ?? 'unknown'}`,
                    ].join(' | ')
                    void navigator.clipboard?.writeText(summary)
                    setDebugCopied(true)
                    setTimeout(() => setDebugCopied(false), 1500)
                  }}
                >
                  {debugCopied ? 'Copied' : 'Copy debug'}
                </button>
              </div>
              <div>game {gameId ?? 'none'}</div>
              <div>user {currentUserId ?? 'none'}</div>
              <div>members {members.length ? members.map((m) => `${m.user_id}:${m.role}`).join(', ') : 'none'}</div>
              <div>turn {currentTurn ?? 'unknown'}</div>
              <div>status {game?.status ?? 'unknown'}</div>
            </div>
          ) : null}
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold text-slate-600">Opening</div>
            <div className="text-sm text-slate-800">{opening?.name ?? 'Unknown'}</div>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600">Engine</div>
              <span className="text-[11px] text-slate-500">{isReady ? 'ready' : 'loading'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="text-xs text-slate-600">Difficulty</label>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Evaluation</div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${evalPercent}%` }} />
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Top hints <span className="text-xs text-slate-500">(used: {hintCount})</span></div>
              {!showHintsVisible ? (
                <div className="flex">
                  <button
                    type="button"
                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!isUserTurn}
                    onClick={() => {
                      if (!isUserTurn) return
                      const nextPly = moveRows.length + 1
                      setPendingHintPly(nextPly)
                      setShowHintsVisible(true)
                      setHintCount((c) => c + 1)
                    }}
                  >
                    Show hints
                  </button>
                </div>
              ) : (
                <TopHintsList hintMoves={hintMoves} onHoverOrClick={(uci) => setHoveredHintUci(uci)} />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {moveHistory.length ? (
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="w-10 py-2">#</th>
                    <th className="py-2">White</th>
                    <th className="py-2">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {moveHistory.map((row) => {
                    const whitePly = (row.moveNumber * 2) - 1
                    const blackPly = row.moveNumber * 2
                    const whiteHint = hintedByPly.get(whitePly) === true
                    const blackHint = hintedByPly.get(blackPly) === true
                    return (
                      <tr key={row.moveNumber} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-xs text-slate-500">{row.moveNumber}.</td>
                        <td className={`py-2 font-medium ${whiteHint ? 'text-purple-600' : ''}`}>
                          {row.white ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(whitePly)}
                            >
                              <span>{row.white}</span>
                              {whiteHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                        <td className={`py-2 font-medium ${blackHint ? 'text-purple-600' : ''}`}>
                          {row.black ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(blackPly)}
                            >
                              <span>{row.black}</span>
                              {blackHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">No moves yet.</div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Game: {gameId}
          </div>
        </aside>
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
  )
}

function LocalChessGame(): React.JSX.Element {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [localMoves, setLocalMoves] = useState<MoveRow[]>([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  const [engineThinking, setEngineThinking] = useState(false)
  const [pendingEngineFen, setPendingEngineFen] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  // hint visibility and hover state for local game
  const [showHintsVisible, setShowHintsVisible] = useState(false)
  const [hoveredHintUci, setHoveredHintUci] = useState<string | null>(null)
  const [hintCount, setHintCount] = useState(0)
  const [hintedPlys, setHintedPlys] = useState<number[]>([])
  const lastShownPlyRef = useRef<number | null>(null)

  const moveRows = useMemo(() => localMoves, [localMoves])
  const {
    displayFen,
    moveHistory,
    viewPly,
    setViewPly,
    setSelectedSquare,
    showLegalMoves,
    setShowLegalMoves,
    showThreats,
    setShowThreats,
    customSquareStyles,
  } = useChessDisplay(moveRows, START_FEN, hoveredHintUci)
  const { containerRef: boardContainerRef, boardSize } = useChessboardSize(CHESSBOARD_MAX_SIZE)

  const normalizedDisplayFen = displayFen || START_FEN
  const currentTurn = normalizedDisplayFen.split(' ')[1] || 'w'

  const currentUserId = user?.id ?? 'local-user'
  const members: GameMemberProfile[] = [
    { user_id: currentUserId, role: 'white', username: user?.email ?? 'You' },
    { user_id: 'stockfish', role: 'black', username: 'Stockfish' },
  ]

  const whiteMember = members.find((member) => member.role === 'white') ?? null
  const blackMember = members.find((member) => member.role === 'black') ?? null

  const topPlayer = blackMember
  const bottomPlayer = whiteMember

  const topIsWhite = topPlayer?.role === 'white'
  const bottomIsWhite = bottomPlayer?.role === 'white'

  const renderPlayerLabel = (label: GameMemberProfile | null, isTurn: boolean, fallback: string) => {
    const role = label?.role
    const displayName = label?.username || fallback
    const roleLabel = role === 'white' ? 'White' : role === 'black' ? 'Black' : role || 'Player'
    const roleBadgeClass = role === 'white'
      ? 'bg-slate-100 text-slate-700'
      : role === 'black'
        ? 'bg-slate-800 text-white'
        : 'bg-slate-200 text-slate-600'

    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isTurn ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
          <span className="text-lg font-semibold text-slate-800">{displayName}</span>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${roleBadgeClass}`}>
          {roleLabel}
        </span>
      </div>
    )
  }

  const memberCountLabel = 'Local game'
  const isViewingPast = viewPly < moveRows.length
  const gameEnd = useMemo(() => detectGameEnd(normalizedDisplayFen), [normalizedDisplayFen])
  const canMove = !engineThinking && !isViewingPast && !gameEnd.isOver && !pendingPromotion

  const { isReady, topMoves, evaluation, analyzePosition, getEngineMove, cancelPendingMove, difficulty, setDifficulty } = useStockfish()
  const opening = useMemo(() => findOpening(buildMovesUci(moveRows)), [moveRows])
  const evalPercent = useMemo(() => getEvalPercent(evaluation.score), [evaluation.score])

  useEffect(() => {
    if (!isReady || engineThinking) return
    const handle = setTimeout(() => {
      analyzePosition(normalizedDisplayFen)
    }, 200)
    return () => clearTimeout(handle)
  }, [analyzePosition, engineThinking, isReady, normalizedDisplayFen])

  useEffect(() => {
    if (!isReady || !pendingEngineFen || engineThinking) return
    const fen = pendingEngineFen
    setPendingEngineFen(null)
    void applyEngineMove(fen)
  }, [engineThinking, isReady, pendingEngineFen])

  // Clear any visible hints after the move that the hints were shown for occurs
  useEffect(() => {
    if (lastShownPlyRef.current != null && moveRows.length > lastShownPlyRef.current) {
      setShowHintsVisible(false)
      setHoveredHintUci(null)
      lastShownPlyRef.current = null
    }
  }, [moveRows.length])

  const hintMoves: HintMove[] = useMemo(() => (
    topMoves.map((move) => ({
      ...move,
      san: formatUciToSan(normalizedDisplayFen, move.uci),
    }))
  ), [normalizedDisplayFen, topMoves])

  const truncateMoves = (targetPly: number) => {
    cancelPendingMove()
    setPendingEngineFen(null)
    setEngineThinking(false)
    setLocalMoves((prev) => prev.slice(0, Math.max(0, targetPly)))
    setViewPly(Math.max(0, targetPly))
    setSelectedSquare(null)
  }

  async function applyEngineMove(fen: string) {
    if (!isReady) {
      setPendingEngineFen(fen)
      setToastSeverity('info')
      setToastMessage('Engine is warming up...')
      return
    }
    setEngineThinking(true)
    try {
      const bestMove = await getEngineMove(fen)
      if (!bestMove || bestMove === '0000') return
      const parsed = parseUciMove(bestMove)
      if (!parsed) return
      const chess = new Chess(fen)
      const move = chess.move({ from: parsed.from, to: parsed.to, promotion: parsed.promotion })
      if (!move) return
      const fenAfter = chess.fen()
      const ply = plyFromFen(fenAfter)
      const row: MoveRow = {
        ply,
        uci: `${move.from}${move.to}${move.promotion ?? ''}`,
        created_by: 'stockfish',
        created_at: new Date().toISOString(),
        fen_after: fenAfter,
      }
      setLocalMoves((prev) => [...prev, row])
      setViewPly(ply)
    } catch {
      setToastSeverity('error')
      setToastMessage('Engine failed to make a move')
    } finally {
      setEngineThinking(false)
    }
  }

  async function onDrop(sourceSquare: Square, targetSquare: Square, currentFen: string, promotion: PromotionPiece = 'q') {
    if (viewPly !== moveRows.length) {
      truncateMoves(viewPly)
    }
    if (engineThinking) return false

    const c = new Chess(currentFen || START_FEN)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion })
    if (!move) return false
    const fenAfter = c.fen()
    const ply = plyFromFen(fenAfter)
    const row: MoveRow = {
      ply,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      created_by: currentUserId,
      created_at: new Date().toISOString(),
      fen_after: fenAfter,
    }
    setLocalMoves((prev) => [...prev, row])
    setViewPly(ply)
    setSelectedSquare(null)

    if (c.isGameOver()) {
      return true
    }

    void applyEngineMove(fenAfter)
    return true
  }

  function handleRestartGame() {
    setShowRestartConfirm(false)
    truncateMoves(0)
    setToastSeverity('success')
    setToastMessage('Local game restarted')
  }

  function handleUndoMove() {
    if (!moveRows.length) return
    truncateMoves(Math.max(0, viewPly - 1))
  }

  function handleQuitGame() {
    truncateMoves(0)
    navigate('/games')
  }

  return (
    <div className="flex flex-col rounded-2xl bg-slate-100/80 p-4 shadow-sm lg:h-full lg:min-h-0 lg:overflow-hidden">
      <div className="mb-4 flex flex-none flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chess (Local)</h2>
          <div className="text-xs text-slate-500">Status: {engineThinking ? 'thinking' : 'ready'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRestartConfirm(true)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
          >
            Restart
          </button>
          <button
            onClick={handleQuitGame}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600"
          >
            Quit
          </button>
        </div>
      </div>
      <GameEndPanel
        reason={gameEnd.reason}
        winner={gameEnd.winner}
        onRestart={() => setShowRestartConfirm(true)}
        onQuit={handleQuitGame}
      />
      {showRestartConfirm ? (
        <ConfirmDialog
          title="Restart game?"
          message="This will reset the board and clear all moves."
          confirmLabel="Restart"
          onConfirm={handleRestartGame}
          onCancel={() => setShowRestartConfirm(false)}
        />
      ) : null}
      {pendingPromotion ? (
        <PromotionChooser
          onSelect={(piece) => {
            const { from, to, fen } = pendingPromotion
            setPendingPromotion(null)
            void onDrop(from, to, fen, piece)
          }}
          onCancel={() => setPendingPromotion(null)}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row lg:items-stretch">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:min-h-0 lg:min-w-0 lg:flex-1">
          <div className="flex items-center justify-between">
            {renderPlayerLabel(topPlayer || null, topIsWhite ? currentTurn === 'w' : currentTurn === 'b', 'Stockfish')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <button
                onClick={handleUndoMove}
                disabled={viewPly === 0}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              >
                Undo
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showLegalMoves}
                  onChange={(event) => setShowLegalMoves(event.target.checked)}
                  className="h-4 w-4"
                />
                Show legal moves
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showThreats}
                  onChange={(event) => setShowThreats(event.target.checked)}
                  className="h-4 w-4"
                />
                Highlight threats
              </label>
            </div>
            {isViewingPast ? (
              <span className="text-xs text-slate-500">Viewing move {viewPly}/{moveRows.length}</span>
            ) : (
              <span className="text-xs text-slate-500">Live</span>
            )}
          </div>
          <div ref={boardContainerRef} className="flex w-full items-center justify-center overflow-hidden lg:min-h-0 lg:flex-1">
            <div className="w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm" style={{ maxWidth: boardSize + 8 }}>
              <Chessboard
                position={normalizedDisplayFen}
                boardOrientation="white"
                showBoardNotation
                {...CHESSBOARD_THEME}
                onPieceDrop={(src: Square, dst: Square) => {
                  if (!canMove) return false
                  try {
                    if (isPromotionMove(normalizedDisplayFen, src, dst)) {
                      setPendingPromotion({ from: src, to: dst, fen: normalizedDisplayFen })
                      return false
                    }
                    const test = new Chess(normalizedDisplayFen || START_FEN)
                    const move = test.move({ from: src, to: dst })
                    if (!move) return false
                    void onDrop(src, dst, normalizedDisplayFen)
                    return true
                  } catch {
                    return false
                  }
                }}
                onSquareClick={(square: Square) => {
                  if (!showLegalMoves) return
                  setSelectedSquare((prev) => (prev === square ? null : square))
                }}
                boardWidth={boardSize}
                arePiecesDraggable={canMove}
                customSquareStyles={customSquareStyles}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            {renderPlayerLabel(bottomPlayer || null, bottomIsWhite ? currentTurn === 'w' : currentTurn === 'b', 'You')}
          </div>
        </div>

        <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md lg:w-[360px] lg:shrink-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
          </div>
          <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold text-slate-600">Opening</div>
            <div className="text-sm text-slate-800">{opening?.name ?? 'Unknown'}</div>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-600">Engine</div>
              <span className="text-[11px] text-slate-500">{isReady ? 'ready' : 'loading'}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="text-xs text-slate-600">Opponent level</label>
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Evaluation</div>
              <div className="h-2 w-full rounded-full bg-slate-200">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${evalPercent}%` }} />
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 text-xs text-slate-600">Top hints <span className="text-xs text-slate-500">(used: {hintCount})</span></div>
              {!showHintsVisible ? (
                <div className="flex">
                  <button
                    type="button"
                    className="rounded px-2 py-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50"
                    onClick={() => {
                      const nextPly = moveRows.length + 1
                      lastShownPlyRef.current = nextPly
                      setShowHintsVisible(true)
                      setHintCount((c) => c + 1)
                      setHintedPlys((prev) => Array.from(new Set([...prev, nextPly])))
                    }}
                  >
                    Show hints
                  </button>
                </div>
              ) : (
                <TopHintsList hintMoves={hintMoves} onHoverOrClick={(uci) => setHoveredHintUci(uci)} />
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {moveHistory.length ? (
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="w-10 py-2">#</th>
                    <th className="py-2">White</th>
                    <th className="py-2">Black</th>
                  </tr>
                </thead>
                <tbody>
                  {moveHistory.map((row) => {
                    const whitePly = (row.moveNumber * 2) - 1
                    const blackPly = row.moveNumber * 2
                    const whiteHint = hintedPlys.includes(whitePly)
                    const blackHint = hintedPlys.includes(blackPly)
                    return (
                      <tr key={row.moveNumber} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-xs text-slate-500">{row.moveNumber}.</td>
                        <td className={`py-2 font-medium ${whiteHint ? 'text-purple-600' : ''}`}>
                          {row.white ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(whitePly)}
                            >
                              <span>{row.white}</span>
                              {whiteHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                        <td className={`py-2 font-medium ${blackHint ? 'text-purple-600' : ''}`}>
                          {row.black ? (
                            <button
                              type="button"
                              className="rounded px-1 py-0.5 text-left hover:bg-slate-100"
                              onClick={() => setViewPly(blackPly)}
                            >
                              <span>{row.black}</span>
                              {blackHint ? <span className="ml-1 text-xs">*</span> : null}
                            </button>
                          ) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-sm text-slate-500">No moves yet.</div>
            )}
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Game: local
          </div>
        </aside>
      </div>
      <Toast message={toastMessage} severity={toastSeverity} onClose={() => setToastMessage(null)} />
    </div>
  )
}
