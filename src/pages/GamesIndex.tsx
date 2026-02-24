import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { createChessGame, listMyGamesWithMembers, type GameWithMembers } from '../api/games'
import { searchUsers } from '../api/chat'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { onGamesChanged } from '../events/gamesEvents'
import { ArrowLeft, Clock, Inbox, UserPlus } from 'lucide-react'

const inviteStatuses = new Set(['waiting', 'invited', 'pending'])
const activeStatuses = new Set(['active', 'in_progress', 'inprogress'])

function normalizeStatus(status: string | null | undefined): string {
  return (status || '').toLowerCase()
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function pickDefaultGameId(rows: GameWithMembers[]): string | null {
  if (!rows.length) return null
  const byRecent = [...rows].sort((a, b) => getTimestamp(b.updated_at) - getTimestamp(a.updated_at))
  const openByRecent = byRecent.filter((game) => {
    const status = normalizeStatus(game.status)
    return inviteStatuses.has(status) || activeStatuses.has(status)
  })
  return openByRecent[0]?.id || byRecent[0]?.id || null
}

function getOpponentName(game: GameWithMembers | null | undefined, userId?: string | null): string {
  const fallback = 'Opponent'
  if (!game) return fallback
  if (!userId) return game.members?.[0]?.username || fallback
  return game.members?.find((member) => member.user_id !== userId)?.username || fallback
}

function formatGameLabel(game: GameWithMembers, userId?: string | null): string {
  const typeLabel = game.type ? `${game.type.charAt(0).toUpperCase()}${game.type.slice(1)}` : 'Game'
  return `${typeLabel} vs ${getOpponentName(game, userId)}`
}

function getStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  return inviteStatuses.has(normalized) ? 'Invitation' : 'In progress'
}

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
}

export default function GamesIndex(): React.JSX.Element {
  const { user } = useAuth()
  const [games, setGames] = useState<GameWithMembers[]>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; username: string | null }>>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [boardSize, setBoardSize] = useState(560)
  const navigate = useNavigate()
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inviteInputRef = useRef<HTMLInputElement | null>(null)
  const boardStageRef = useRef<HTMLDivElement | null>(null)
  const searchRequestRef = useRef(0)
  const loadInFlightRef = useRef(false)
  const pendingLoadRef = useRef(false)
  const gameIdsRef = useRef<Set<string>>(new Set())

  const loadGames = async () => {
    if (loadInFlightRef.current) {
      pendingLoadRef.current = true
      return
    }
    loadInFlightRef.current = true
    try {
      const g = await listMyGamesWithMembers()
      const nextGames = Array.isArray(g) ? g : []
      setGames(nextGames)
      setSelectedGameId((previous) => {
        if (previous && nextGames.some((game) => game.id === previous)) {
          return previous
        }
        return pickDefaultGameId(nextGames)
      })
      gameIdsRef.current = new Set(nextGames.map((game) => String(game?.id || '')).filter(Boolean))
      setLoadError(null)
    } catch {
      setLoadError('Failed to load games. Please retry.')
    } finally {
      loadInFlightRef.current = false
      if (pendingLoadRef.current) {
        pendingLoadRef.current = false
        void loadGames()
      }
    }
  }

  useEffect(() => {
    void loadGames()
  }, [])

  useEffect(() => {
    const measureBoard = () => {
      const width = boardStageRef.current?.clientWidth ?? 0
      const next = Math.max(260, Math.min(560, Math.floor(width > 0 ? width : 560)))
      setBoardSize((current) => (current === next ? current : next))
    }

    measureBoard()
    window.addEventListener('resize', measureBoard)

    return () => {
      window.removeEventListener('resize', measureBoard)
    }
  }, [])

  useEffect(() => {
    const offGamesChanged = onGamesChanged(() => {
      void loadGames()
    })

    const userId = user?.id
    if (!userId) {
      return () => {
        offGamesChanged()
      }
    }

    const channel = supabase
      .channel(`games-index:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_members', filter: `user_id=eq.${userId}` },
        () => {
          void loadGames()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        (payload: { new?: { id?: string | null }; old?: { id?: string | null } }) => {
          const gameId = payload?.new?.id || payload?.old?.id
          if (!gameId) return
          if (gameIdsRef.current.has(String(gameId))) {
            void loadGames()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chess_moves' },
        (payload: { new?: { game_id?: string | null }; old?: { game_id?: string | null } }) => {
          const gameId = payload?.new?.game_id || payload?.old?.game_id
          if (!gameId) return
          if (gameIdsRef.current.has(String(gameId))) {
            void loadGames()
          }
        }
      )
      .subscribe()

    return () => {
      offGamesChanged()
      try {
        void channel.unsubscribe()
        supabase.removeChannel(channel)
      } catch {
      }
    }
  }, [user?.id])

  useEffect(() => (
    () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
    }
  ), [])

  async function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    if (!v.trim()) {
      searchRequestRef.current += 1
      setResults([])
      return
    }

    const requestId = searchRequestRef.current + 1
    searchRequestRef.current = requestId

    searchDebounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchUsers(v)
          if (searchRequestRef.current === requestId) {
            setResults(res)
          }
        } catch {
          if (searchRequestRef.current === requestId) {
            setResults([])
          }
        }
      })()
    }, 250)
  }

  async function handleCreate(opponentId?: string) {
    const game = await createChessGame(opponentId || null, null)
    navigate(`/games/${game.id}`)
  }

  function focusInviteInput() {
    inviteInputRef.current?.focus()
  }

  const inviteGames = useMemo(() => games.filter((g) => inviteStatuses.has(normalizeStatus(g.status))), [games])
  const activeGames = useMemo(() => games.filter((g) => activeStatuses.has(normalizeStatus(g.status))), [games])
  const openGames = [...inviteGames, ...activeGames]
  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) || null,
    [games, selectedGameId]
  )
  const selectedRole = selectedGame?.members.find((member) => member.user_id === user?.id)?.role?.toLowerCase()
  const boardOrientation: 'white' | 'black' = selectedRole === 'black' ? 'black' : 'white'
  const boardPosition = selectedGame?.current_fen?.trim() ? selectedGame.current_fen : 'start'
  const hasOpenGames = openGames.length > 0

  return (
    <section className="flex min-h-[100dvh] w-full flex-col bg-slate-900 px-4 pb-6 pt-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 sm:gap-5">
        <header className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate('/games/chess')}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
              >
                <ArrowLeft size={16} aria-hidden="true" />
                Back to Chess
              </button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Play vs Opponent</h1>
                <p className="mt-1 text-sm text-slate-300 sm:text-base">Invite challengers, preview live positions, and continue your current match instantly.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectedGame && navigate(`/games/${selectedGame.id}`)}
              disabled={!selectedGame}
              className="inline-flex min-h-10 items-center rounded-lg border border-indigo-300/50 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open selected game
            </button>
          </div>
        </header>

        {loadError ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="status" aria-live="polite">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => { void loadGames() }}
              className="inline-flex min-h-9 items-center rounded-md border border-red-300/50 bg-red-500/20 px-2.5 py-1.5 text-xs font-semibold text-red-50 transition hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 sm:p-5">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-3 sm:p-4">
                <div ref={boardStageRef} className="mx-auto w-full max-w-[560px]" aria-label="Selected game board preview">
                  <Chessboard
                    id="games-index-preview-board"
                    position={boardPosition}
                    boardWidth={boardSize}
                    boardOrientation={boardOrientation}
                    arePiecesDraggable={false}
                  />
                </div>
              </div>

              {hasOpenGames && selectedGame ? (
                <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">vs {getOpponentName(selectedGame, user?.id)}</h2>
                    <span className="inline-flex rounded-full border border-indigo-300/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-100">
                      {getStatusLabel(selectedGame.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">Last updated {formatUpdatedAt(selectedGame.updated_at)}</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/games/${selectedGame.id}`)}
                    className="inline-flex min-h-11 items-center rounded-lg border border-indigo-300/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-dashed border-slate-600 bg-slate-900/55 p-4">
                  <h2 className="text-lg font-semibold text-white">No open matches yet</h2>
                  <p className="text-sm text-slate-300">Send an invite to start a game and your board preview will appear here.</p>
                  <button
                    type="button"
                    onClick={focusInviteInput}
                    className="inline-flex min-h-11 items-center rounded-lg border border-indigo-300/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    Invite a player
                  </button>
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-700 bg-slate-800/70 p-4 sm:p-5">
            <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 sm:p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Invite a player</h2>
              <div className="mt-3 space-y-2">
                <label htmlFor="invite-search" className="sr-only">Search by username</label>
                <input
                  id="invite-search"
                  ref={inviteInputRef}
                  value={query}
                  onChange={handleSearch}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                  placeholder="Search by username…"
                />
                <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                  {results.length ? results.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-2">
                      <span className="flex-1 text-sm text-slate-100">{r.username || r.id}</span>
                      <button
                        type="button"
                        onClick={() => { void handleCreate(r.id) }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-indigo-300/50 bg-indigo-500/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        <UserPlus size={14} aria-hidden="true" />
                        Invite
                      </button>
                    </div>
                  )) : (
                    <p className="text-xs text-slate-400">Search by username to send a direct chess invite.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 sm:p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Your matches</h2>
              {openGames.length ? (
                <ul className="mt-3 space-y-2">
                  {openGames.map((game) => {
                    const isInvite = inviteStatuses.has(normalizeStatus(game.status))
                    const isSelected = selectedGameId === game.id
                    return (
                      <li key={game.id}>
                        <div className={`flex items-start gap-2 rounded-lg border p-2 transition ${isSelected
                          ? 'border-indigo-300/70 bg-indigo-500/15'
                          : 'border-slate-700 bg-slate-800/80'}`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedGameId(game.id)}
                            aria-pressed={isSelected}
                            aria-current={isSelected ? 'true' : undefined}
                            className="flex-1 rounded-md p-1 text-left transition hover:bg-slate-700/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                          >
                            <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {isInvite ? <Inbox size={16} className="text-slate-300" aria-hidden="true" /> : <Clock size={16} className="text-slate-300" aria-hidden="true" />}
                              <div>
                                <div className="text-sm font-medium text-slate-100">{formatGameLabel(game, user?.id)}</div>
                                <div className="text-xs text-slate-300">{isInvite ? 'Invitation' : 'In progress'}</div>
                              </div>
                            </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-400">Updated {formatUpdatedAt(game.updated_at)}</p>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/games/${game.id}`)}
                            className="inline-flex min-h-8 items-center self-center rounded-md border border-slate-500 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-100 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                          >
                            Open
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-slate-600 bg-slate-900/50 px-3 py-4 text-sm text-slate-300">
                  No invitations or active games yet.
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </section>
  )
}
