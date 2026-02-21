import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyGames, createChessGame } from '../api/games'
import { searchUsers } from '../api/chat'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { onGamesChanged } from '../events/gamesEvents'
import { UserPlus, Clock, Inbox, X } from 'lucide-react'

const inviteStatuses = new Set(['waiting', 'invited', 'pending'])
const activeStatuses = new Set(['active', 'in_progress', 'inprogress'])

function getOpponentName(game: any, userId?: string | null): string {
  const fallback = 'Opponent'
  if (!userId) return fallback
  return game.members?.find((m: any) => m.user_id !== userId)?.username || fallback
}

function formatGameLabel(game: any, userId?: string | null): string {
  const typeLabel = game.type ? `${game.type.charAt(0).toUpperCase()}${game.type.slice(1)}` : 'Game'
  return `${typeLabel} vs ${getOpponentName(game, userId)}`
}

export default function GamesIndex(): React.JSX.Element {
  const { user } = useAuth()
  const [games, setGames] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const navigate = useNavigate()
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      const g = await listMyGames()
      const nextGames = Array.isArray(g) ? g : []
      setGames(nextGames)
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

  function handleClose() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }
    navigate('/games/chess')
  }

  const inviteGames = games.filter((g) => inviteStatuses.has((g.status || '').toLowerCase()))
  const activeGames = games.filter((g) => activeStatuses.has((g.status || '').toLowerCase()))
  const openGames = [...inviteGames, ...activeGames]

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/35 px-4 py-6 sm:items-center">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Play vs opponent</h2>
            <p className="text-sm text-slate-500">Pick a player or resume an in-progress game.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {loadError ? (
          <div className="mb-3 flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span>{loadError}</span>
            <button
              type="button"
              onClick={() => { void loadGames() }}
              className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700"
            >
              Retry
            </button>
          </div>
        ) : null}

        <section className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pick a player</label>
          <div className="flex flex-col gap-2">
            <input value={query} onChange={handleSearch} className="w-full rounded-md border border-slate-200 bg-white p-2" placeholder="Search users" />
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {results.length ? results.map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                  <span className="flex-1 text-sm text-slate-700">{r.username || r.id}</span>
                  <button onClick={() => void handleCreate(r.id)} className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                    <UserPlus size={14} />
                    Invite
                  </button>
                </div>
              )) : (
                <div className="text-xs text-slate-500">Search by username to invite a player.</div>
              )}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">In-progress games</h3>
          {openGames.length ? (
            <ul className="space-y-2">
              {openGames.map((g) => {
                const isInvite = inviteStatuses.has((g.status || '').toLowerCase())
                return (
                  <li key={g.id}>
                    <button
                      onClick={() => navigate(`/games/${g.id}`)}
                      className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {isInvite ? <Inbox size={16} className="text-slate-500" /> : <Clock size={16} className="text-slate-500" />}
                          <div>
                            <div className="font-medium text-slate-800">{formatGameLabel(g, user?.id)}</div>
                            <div className="text-xs text-slate-500">{isInvite ? 'Invitation' : 'In progress'}</div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">{g.updated_at ? new Date(g.updated_at).toLocaleString() : ''}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">No in-progress games yet.</div>
          )}
        </section>
      </div>
    </div>
  )
}
