import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { fetchGame, fetchGameMembers, makeMove, restartGame } from '../api/games'
import Toast from '../components/Toast'
import type { GameMemberProfile, GameRow } from '../api/games'
import { supabase } from '../supabaseClient'
import { useGameRealtime } from '../hooks/useGameRealtime'
import { useAuth } from '../contexts/AuthContext'

type MoveRow = {
  ply: number
  uci: string
  created_by: string
  created_at: string
  fen_after?: string | null
}

type MoveHistoryRow = {
  moveNumber: number
  white: string | null
  black: string | null
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

export default function ChessGame(): React.JSX.Element {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const [refreshToken, setRefreshToken] = useState(0)
  const { moves, loading: movesLoading } = useGameRealtime(gameId || null, refreshToken)
  const [boardFen, setBoardFen] = useState<string>(START_FEN)
  const [game, setGame] = useState<GameRow | null>(null)
  const [members, setMembers] = useState<GameMemberProfile[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [authError, setAuthError] = useState<boolean>(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastSeverity, setToastSeverity] = useState<'info' | 'success' | 'warning' | 'error'>('info')
  const [restartLoading, setRestartLoading] = useState(false)
  const [viewPly, setViewPly] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [showLegalMoves, setShowLegalMoves] = useState(true)
  const [showThreats, setShowThreats] = useState(false)
  const lastMoveCountRef = useRef(0)

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

  const moveRows = useMemo(() => (moves ?? []) as MoveRow[], [moves])

  useEffect(() => {
    const currentCount = moveRows.length
    const prevCount = lastMoveCountRef.current
    lastMoveCountRef.current = currentCount
    setViewPly((prev) => (prev === prevCount ? currentCount : Math.min(prev, currentCount)))
  }, [moveRows.length])

  useEffect(() => {
    setSelectedSquare(null)
  }, [viewPly])

  const displayFen = useMemo(() => {
    if (!moveRows.length) {
      return game?.current_fen || START_FEN
    }

    const sorted = moveRows.slice().sort((a, b) => (a.ply || 0) - (b.ply || 0))
    const targetPly = Math.max(0, Math.min(viewPly, sorted.length))

    if (targetPly === 0) {
      return START_FEN
    }

    const exact = sorted.find((mv) => mv.ply === targetPly && typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
    if (exact?.fen_after) return exact.fen_after

    if (targetPly === sorted.length) {
      const lastWithFen = [...sorted].reverse().find((mv) => typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
      if (lastWithFen?.fen_after) return lastWithFen.fen_after
      if (game?.current_fen) return game.current_fen
    }

    const chess = new Chess(START_FEN)
    for (const mv of sorted) {
      if ((mv.ply || 0) > targetPly) break
      try {
        chess.move({
          from: mv.uci.slice(0, 2),
          to: mv.uci.slice(2, 4),
          promotion: mv.uci.slice(4) || undefined,
        })
      } catch {
        // ignore invalid move replay
      }
    }
    return chess.fen()
  }, [game?.current_fen, moveRows, viewPly])

  const moveHistory = useMemo<MoveHistoryRow[]>(() => {
    if (!moveRows.length) return []
    const chess = new Chess()
    const history: MoveHistoryRow[] = []

    moveRows
      .slice()
      .sort((a, b) => (a.ply || 0) - (b.ply || 0))
      .forEach((mv, index) => {
        const from = mv.uci.slice(0, 2)
        const to = mv.uci.slice(2, 4)
        const promotion = mv.uci.slice(4) || undefined
        const ply = mv.ply || index + 1

        try {
          const played = chess.move({ from, to, promotion })
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
  }, [moveRows])

  useEffect(() => {
    if (moveRows.length) {
      const sorted = moveRows.slice().sort((a, b) => (a.ply || 0) - (b.ply || 0))
      const lastWithFen = [...sorted].reverse().find((mv) => typeof mv.fen_after === 'string' && mv.fen_after.length > 0)
      if (lastWithFen?.fen_after) {
        setBoardFen(lastWithFen.fen_after)
        return
      }

      const chess = new Chess(START_FEN)
      for (const mv of sorted) {
        try {
          chess.move({
            from: mv.uci.slice(0, 2),
            to: mv.uci.slice(2, 4),
            promotion: mv.uci.slice(4) || undefined,
          })
        } catch {
          // ignore invalid move replay
        }
      }
      setBoardFen(chess.fen())
      return
    }

    if (game?.current_fen) {
      setBoardFen(game.current_fen)
      return
    }

    setBoardFen(START_FEN)
  }, [game?.current_fen, moveRows])

  async function onDrop(sourceSquare: Square, targetSquare: Square) {
    if (!gameId) return false
    if (game?.status === 'aborted') return false
    if (viewPly !== moveRows.length) return false
    const c = new Chess(boardFen || START_FEN)
    const move = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' })
    if (!move) return false
    const fenAfter = c.fen()
    try {
      // compute next ply
      const ply = moveRows.length + 1
      await makeMove(gameId, ply, `${move.from}${move.to}${move.promotion ?? ''}`, fenAfter)
      setBoardFen(fenAfter)
      setViewPly(ply)
      setSelectedSquare(null)
      return true
    } catch (err) {
      return false
    }
  }

  async function handleRestartGame() {
    if (!gameId) return
    setError(null)
    setRestartLoading(true)
    try {
      const maybeGame = await restartGame(gameId)
      setBoardFen(START_FEN)
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

  const normalizedDisplayFen = displayFen || START_FEN
  const currentTurn = normalizedDisplayFen.split(' ')[1] || game?.current_turn || null
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
  const canMove = !isAborted && !isViewingPast

  useEffect(() => {
    if (!showLegalMoves) setSelectedSquare(null)
  }, [showLegalMoves, normalizedDisplayFen])

  const legalMoveStyles = useMemo(() => {
    if (!showLegalMoves || !selectedSquare) return {}
    const chess = new Chess(normalizedDisplayFen)
    const moves = chess.moves({ square: selectedSquare, verbose: true }) as Array<{ to: Square }>
    const styles: Record<string, React.CSSProperties> = {
      [selectedSquare]: { backgroundColor: 'rgba(59, 130, 246, 0.25)' },
    }
    for (const move of moves) {
      styles[move.to] = {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        boxShadow: 'inset 0 0 0 2px rgba(59, 130, 246, 0.4)',
      }
    }
    return styles
  }, [normalizedDisplayFen, selectedSquare, showLegalMoves])

  const threatStyles = useMemo(() => {
    if (!showThreats) return {}

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

    const chess = new Chess(normalizedDisplayFen)
    const board = chess.board()
    const attacksByWhite = buildAttackMap(normalizedDisplayFen, 'w')
    const attacksByBlack = buildAttackMap(normalizedDisplayFen, 'b')
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

        const defended = isDefended(normalizedDisplayFen, square, piece.color)
        const pieceValue = pieceValues[piece.type] ?? 0
        const minAttacker = Math.min(...attackers.map((type) => pieceValues[type] ?? 0))
        const valueThreat = minAttacker > 0 && minAttacker < pieceValue

        if (valueThreat) {
          styles[square] = {
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            boxShadow: 'inset 0 0 0 3px rgba(239, 68, 68, 0.55)',
          }
        } else if (!defended) {
          styles[square] = {
            backgroundColor: 'rgba(245, 158, 11, 0.18)',
            boxShadow: 'inset 0 0 0 3px rgba(245, 158, 11, 0.55)',
          }
        } else {
          styles[square] = {
            backgroundColor: 'rgba(59, 130, 246, 0.12)',
            boxShadow: 'inset 0 0 0 2px rgba(59, 130, 246, 0.45)',
          }
        }
      }
    }

    return styles
  }, [normalizedDisplayFen, showThreats])

  const customSquareStyles = useMemo(() => ({
    ...threatStyles,
    ...legalMoveStyles,
  }), [legalMoveStyles, threatStyles])

  return (
    <div className="rounded-2xl bg-slate-100/80 p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Chess</h2>
          <div className="text-xs text-slate-500">Status: {game?.status ?? 'loading'}</div>
        </div>
        <button
          onClick={() => { void handleRestartGame() }}
          disabled={restartLoading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {restartLoading ? 'Restarting…' : 'Restart game'}
        </button>
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
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md">
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
          <Chessboard
            position={normalizedDisplayFen}
            onPieceDrop={(src: Square, dst: Square) => {
              if (!canMove) return false
              try {
                const test = new Chess(boardFen || START_FEN)
                const move = test.move({ from: src, to: dst, promotion: 'q' })
                if (!move) return false
                void onDrop(src, dst)
                return true
              } catch {
                return false
              }
            }}
            onSquareClick={(square: Square) => {
              if (!showLegalMoves) return
              setSelectedSquare((prev) => (prev === square ? null : square))
            }}
            boardWidth={420}
            arePiecesDraggable={canMove}
            customSquareStyles={customSquareStyles}
          />
          <div className="flex items-center justify-between">
            {renderPlayerLabel(bottomPlayer || null, bottomIsWhite ? currentTurn === 'w' : currentTurn === 'b', bottomFallback)}
          </div>
        </div>

        <aside className="w-full max-w-md rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-md">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">Move History</div>
            {loading || movesLoading ? (
              <span className="text-xs text-slate-500">Loading…</span>
            ) : null}
          </div>
          <div className="mb-3 text-xs text-slate-500">{memberCountLabel}</div>
          <div className="max-h-[420px] overflow-y-auto">
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
                  {moveHistory.map((row) => (
                    <tr key={row.moveNumber} className="border-t border-slate-100">
                      <td className="py-2 pr-2 text-xs text-slate-500">{row.moveNumber}.</td>
                      <td className="py-2 font-medium">{row.white || ''}</td>
                      <td className="py-2 font-medium">{row.black || ''}</td>
                    </tr>
                  ))}
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
