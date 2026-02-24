import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { listMyGamesWithMembers } from '../api/games'
import { useUnreadMessages } from '../hooks/useUnreadMessages'
import {
  PREMIUM_FOCUS_RING,
  PREMIUM_PAGE_CONTAINER,
  PREMIUM_PAGE_SHELL,
  PREMIUM_SURFACE,
  PREMIUM_SURFACE_PADDED,
} from '../styles/ui'

type GameCatalogItem = {
  id: string
  label: string
  description: string
  available: boolean
}

const GAME_CATALOG: GameCatalogItem[] = [
  { id: 'chess', label: 'Chess', description: 'Live matches, invites, and tutor/story modes.', available: true },
  { id: 'checkers', label: 'Checkers', description: 'Planned next game mode.', available: false },
  { id: 'wordplay', label: 'Wordplay', description: 'Planned social word game.', available: false },
]

export default function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { unreadCount, loading: unreadLoading } = useUnreadMessages(user?.id)

  const [inviteCount, setInviteCount] = useState<number>(0)
  const [yourMoveCount, setYourMoveCount] = useState<number>(0)

  useEffect(() => {
    let cancelled = false

    const loadGamesMeta = async () => {
      try {
        const rows = await listMyGamesWithMembers()
        if (cancelled) return
        let invites = 0
        let yourMove = 0
        for (const r of rows) {
          const status = (r.status || '').toLowerCase()
          if (status === 'waiting' || status === 'invited' || status === 'pending') invites += 1
          const me = r.members.find((m) => m.user_id === user?.id)
          if (me && r.current_turn) {
            const myRole = (me.role || '').toLowerCase() === 'black' ? 'b' : 'w'
            if (r.current_turn === myRole) yourMove += 1
          }
        }
        setInviteCount(invites)
        setYourMoveCount(yourMove)
      } catch {
        setInviteCount(0)
        setYourMoveCount(0)
      }
    }

    void loadGamesMeta()
    return () => { cancelled = true }
  }, [user?.id])

  return (
    <main className={PREMIUM_PAGE_SHELL}>
      <div className={PREMIUM_PAGE_CONTAINER}>
        <div className="flex flex-col gap-5 sm:gap-6">
          <section className={PREMIUM_SURFACE_PADDED} aria-labelledby="home-hero-title">
            <h1 id="home-hero-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Home</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-200 sm:text-base">Messaging and games front and center.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
              >
                Open Messages{!unreadLoading && unreadCount > 0 ? <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{unreadCount}</span> : null}
              </button>

              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/games')}
                  className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
                >
                  Open Games{(inviteCount + yourMoveCount) > 0 ? <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-slate-900">{inviteCount + yourMoveCount}</span> : null}
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/games?suggest=true')}
                  className={`inline-flex min-h-11 items-center rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/80 ${PREMIUM_FOCUS_RING}`}
                >
                  Suggest Game
                </button>
              </div>
            </div>
          </section>

          <section className={`${PREMIUM_SURFACE} p-5`} aria-labelledby="home-quick-start">
            <h2 id="home-quick-start" className="text-xl font-semibold text-white">Quick start</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Start here</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Jump into collaboration and play</h3>
                <p className="mt-1 text-sm text-slate-300">Open your chat rooms, then launch games from the shared games hub.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Messages{!unreadLoading && unreadCount > 0 ? <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">{unreadCount}</span> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/games')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Games{(inviteCount + yourMoveCount) > 0 ? <span className="ml-2 inline-flex items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-slate-900">{inviteCount + yourMoveCount}</span> : null}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Recent</h3>
                <p className="mt-3 text-sm text-slate-300">Focus is on conversations and games; other media are available in Other.</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="home-spotlight" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 id="home-spotlight" className="text-lg font-semibold text-white">Other</h2>
              <p className="mt-2 text-sm text-slate-300">Contains media and other less-frequently used features.</p>
              <button
                type="button"
                onClick={() => navigate('/gallery')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Other
              </button>
            </div>

            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 className="text-lg font-semibold text-white">Messages</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                <li>Chat in dedicated rooms</li>
                <li>Share context while reviewing content</li>
                <li>Stay synced with unread indicators</li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Messages
              </button>
            </div>

            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 className="text-lg font-semibold text-white">Games</h2>
              <ul className="mt-2 space-y-2 text-sm text-slate-200" aria-label="Games catalog">
                {GAME_CATALOG.map((game) => (
                  <li key={game.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-100">{game.label}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${game.available ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}>
                        {game.available ? 'Available' : 'Coming soon'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{game.description}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/games')}
                  className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
                >
                  Open Games
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/games?suggest=true')}
                  className={`inline-flex min-h-11 items-center rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800/80 ${PREMIUM_FOCUS_RING}`}
                >
                  Suggest Game
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
