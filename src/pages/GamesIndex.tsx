import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMyGames, createChessGame } from '../api/games'
import { searchUsers } from '../api/chat'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { onGamesChanged } from '../events/gamesEvents'
import { Sparkles, BookOpen, Play, UserPlus, Clock, Inbox } from 'lucide-react'

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

  const inviteGames = games.filter((g) => inviteStatuses.has((g.status || '').toLowerCase()))
  const activeGames = games.filter((g) => activeStatuses.has((g.status || '').toLowerCase()))

  return (
    <div className="space-y-6 px-4">
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

      {/* Discovery section */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Discovery</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => navigate('/games/local')}
            className="w-full min-h-[48px] rounded-lg bg-amber-50 flex items-center gap-3 p-4 md:p-6 text-left"
          >
            <div className="flex-shrink-0">
              <Sparkles size={28} className="text-amber-500" />
            </div>
            <div>
              <div className="font-semibold">Start Story Mode</div>
              <div className="text-sm text-slate-600">Narrative-driven challenges and tutorials</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigate('/games/local')}
            className="w-full min-h-[48px] rounded-lg bg-green-50 flex items-center gap-3 p-4 md:p-6 text-left"
          >
            <div className="flex-shrink-0">
              <BookOpen size={28} className="text-green-500" />
            </div>
            <div>
              <div className="font-semibold">View Lessons</div>
              <div className="text-sm text-slate-600">Short tutorials and practice puzzles</div>
            </div>
          </button>
        </div>
      </section>

      {/* Quick Play */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Quick Play</h3>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate('/games/local')}
            className="w-full min-h-[48px] rounded-lg bg-slate-800 text-white flex items-center justify-center gap-2 px-4 py-3"
          >
            <Play size={18} />
            <span className="font-medium">Play vs computer</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/games')}
            className="w-full min-h-[48px] rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center gap-2 px-4 py-3"
          >
            <UserPlus size={18} />
            <span className="font-medium">Invite a player</span>
          </button>
        </div>
      </section>

      {/* Invite form (existing) */}
      <section>
        <label className="block text-xs text-slate-600 mb-2">Invite by username</label>
        <div className="flex flex-col md:flex-row gap-2">
          <input value={query} onChange={handleSearch} className="border rounded-md p-2 flex-1" placeholder="Search users" />
        </div>
        <div className="mt-2 space-y-2">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <span className="flex-1">{r.username || r.id}</span>
              <button onClick={() => void handleCreate(r.id)} className="px-3 py-1 bg-indigo-600 text-white rounded text-sm">Invite</button>
            </div>
          ))}
        </div>
      </section>

      {/* Lists: Invitations & In Progress */}
      <section>
        <h3 className="text-sm font-medium mb-2">Invitations</h3>
        {inviteGames.length ? (
          <ul className="space-y-2">
            {inviteGames.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => navigate(`/games/${g.id}`)}
                  className="w-full text-left rounded-md p-3 bg-white border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Inbox size={18} />
                    <div>
                      <div className="font-medium">{formatGameLabel(g)}</div>
                      <div className="text-xs text-slate-500">{g.type}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{g.updated_at ? new Date(g.updated_at).toLocaleString() : ''}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">No invitations.</div>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2">In Progress</h3>
        {activeGames.length ? (
          <ul className="space-y-2">
            {activeGames.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => navigate(`/games/${g.id}`)}
                  className="w-full text-left rounded-md p-3 bg-white border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Clock size={18} />
                    <div>
                      <div className="font-medium">{formatGameLabel(g)}</div>
                      <div className="text-xs text-slate-500">{g.type}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">{g.updated_at ? new Date(g.updated_at).toLocaleString() : ''}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">No active games.</div>
        )}
      </section>
    </div>
  )
}
