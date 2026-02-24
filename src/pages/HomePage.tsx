import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPhotoStatus } from '../api'
import { request } from '../api/httpClient'
import UserMenu from '../components/UserMenu'
import { useAuth } from '../contexts/AuthContext'
import {
  PREMIUM_FOCUS_RING,
  PREMIUM_PAGE_CONTAINER,
  PREMIUM_PAGE_SHELL,
  PREMIUM_SURFACE,
  PREMIUM_SURFACE_PADDED,
} from '../styles/ui'

type HomeLoadState = {
  loading: boolean
  totalPhotos: number
}

type GameCatalogItem = {
  id: string
  label: string
  description: string
  available: boolean
  path?: string
}

const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'chess',
    label: 'Chess',
    description: 'Live matches, invites, and tutor/story modes.',
    available: true,
    path: '/chess',
  },
  {
    id: 'checkers',
    label: 'Checkers',
    description: 'Planned next game mode.',
    available: false,
  },
  {
    id: 'wordplay',
    label: 'Wordplay',
    description: 'Planned social word game.',
    available: false,
  },
]

export default function HomePage(): React.JSX.Element {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<HomeLoadState>({
    loading: true,
    totalPhotos: 0,
  })
  const [selectedGameId, setSelectedGameId] = useState('chess')
  const [gameSuggestion, setGameSuggestion] = useState('')
  const [suggestionSubmitting, setSuggestionSubmitting] = useState(false)
  const [suggestionStatus, setSuggestionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      try {
        const statusResult = await getPhotoStatus()

        if (cancelled) return

        setState({
          loading: false,
          totalPhotos: Math.max(0, Number(statusResult?.total || 0)),
        })
      } catch {
        if (cancelled) return
        setState({
          loading: false,
          totalPhotos: 0,
        })
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSuggestionSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = gameSuggestion.trim()
    if (!trimmed) {
      setSuggestionStatus({ type: 'error', message: 'Please enter a game suggestion.' })
      return
    }

    setSuggestionSubmitting(true)
    setSuggestionStatus(null)
    try {
      const response = await request<{ success?: boolean; error?: string }>({
        path: '/api/feedback',
        method: 'POST',
        body: {
          message: trimmed,
          category: 'game-suggestion',
          url: '/',
          context: {
            source: 'home-page',
          },
        },
      })

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to submit suggestion')
      }

      setGameSuggestion('')
      setSuggestionStatus({ type: 'success', message: 'Suggestion submitted. Thank you!' })
    } catch {
      setSuggestionStatus({ type: 'error', message: 'Could not submit suggestion right now. Please try again.' })
    } finally {
      setSuggestionSubmitting(false)
    }
  }

  const selectedGame = GAME_CATALOG.find((game) => game.id === selectedGameId)
  const canOpenSelectedGame = !!(selectedGame && selectedGame.available && selectedGame.path)

  return (
    <main className={PREMIUM_PAGE_SHELL}>
      <div className={PREMIUM_PAGE_CONTAINER}>
        <div className="flex flex-col gap-5 sm:gap-6">
          <section className={PREMIUM_SURFACE_PADDED} aria-labelledby="home-hero-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 id="home-hero-title" className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Home</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-200 sm:text-base">
                  Messaging and games are front and center.
                </p>
              </div>
              <div className="shrink-0">
                <UserMenu
                  theme="dark"
                  onOpenPhotos={() => navigate('/gallery')}
                  onOpenEdit={() => navigate('/upload')}
                  onOpenAdmin={user?.app_metadata?.role === 'admin' ? () => navigate('/admin') : undefined}
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
              >
                Open Messages
              </button>
              <button
                type="button"
                onClick={() => navigate('/chess')}
                className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Chess Hub
              </button>
            </div>
          </section>

          <section className={`${PREMIUM_SURFACE} p-5`} aria-labelledby="home-quick-start">
            <h2 id="home-quick-start" className="text-xl font-semibold text-white">Quick start</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 lg:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Start here</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Jump into collaboration and play</h3>
                <p className="mt-1 text-sm text-slate-300">Open your chat rooms, then launch chess directly from the game selector.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Messages
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/chess')}
                    className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Chess Hub
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Other (experimental)</h3>
                <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                  <p className="text-sm text-slate-200">Photos are still available and will continue to evolve.</p>
                  <button
                    type="button"
                    onClick={() => navigate('/gallery')}
                    className={`mt-2 inline-flex min-h-10 items-center rounded-md border border-slate-600 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-slate-500 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open Experimental Photos
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="home-spotlight" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 id="home-spotlight" className="text-lg font-semibold text-white">Messages</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                <li>Chat in dedicated rooms</li>
                <li>Share context while reviewing ideas</li>
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
              <div className="mt-4 space-y-2">
                <label htmlFor="home-game-select" className="text-xs font-semibold uppercase tracking-wide text-slate-300">Choose game</label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="home-game-select"
                    value={selectedGameId}
                    onChange={(e) => setSelectedGameId(e.target.value)}
                    className={`min-h-11 flex-1 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 ${PREMIUM_FOCUS_RING}`}
                  >
                    {GAME_CATALOG.map((game) => (
                      <option key={game.id} value={game.id}>
                        {game.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (canOpenSelectedGame && selectedGame?.path) {
                        navigate(selectedGame.path)
                      }
                    }}
                    disabled={!canOpenSelectedGame}
                    className={`inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 ${PREMIUM_FOCUS_RING}`}
                  >
                    Open selected game
                  </button>
                </div>
              </div>

              <form className="mt-3 space-y-2" onSubmit={handleSuggestionSubmit}>
                <label htmlFor="home-game-suggestion" className="text-xs font-semibold uppercase tracking-wide text-slate-300">Suggest a game</label>
                <textarea
                  id="home-game-suggestion"
                  value={gameSuggestion}
                  onChange={(e) => setGameSuggestion(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Example: Add cooperative trivia with room-based teams."
                  className={`w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 ${PREMIUM_FOCUS_RING}`}
                />
                <button
                  type="submit"
                  disabled={suggestionSubmitting}
                  className={`inline-flex min-h-10 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-50 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 ${PREMIUM_FOCUS_RING}`}
                >
                  {suggestionSubmitting ? 'Submitting…' : 'Submit suggestion'}
                </button>
                {suggestionStatus ? (
                  <p
                    className={`text-xs ${suggestionStatus.type === 'success' ? 'text-emerald-300' : 'text-rose-300'}`}
                    role="status"
                    aria-live="polite"
                  >
                    {suggestionStatus.message}
                  </p>
                ) : null}
              </form>
            </div>

            <div className={`${PREMIUM_SURFACE_PADDED}`}>
              <h2 className="text-lg font-semibold text-white">Other (experimental)</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-300">
                <li>Photos remain available while this area evolves</li>
                <li>{state.loading ? 'Checking photo workspace status…' : `${state.totalPhotos} item${state.totalPhotos === 1 ? '' : 's'} in photos`}</li>
                <li>Use when needed, while collaboration stays primary</li>
              </ul>
              <button
                type="button"
                onClick={() => navigate('/gallery')}
                className={`mt-4 inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 ${PREMIUM_FOCUS_RING}`}
              >
                Open Experimental Photos
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
