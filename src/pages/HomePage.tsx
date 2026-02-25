import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPhotoStatus } from '../api'
import { request } from '../api/httpClient'
import UserMenu from '../components/UserMenu'
import { useAuth } from '../contexts/AuthContext'
import { navigateWithTransition } from '../utils/navigateWithTransition'
import {
  PREMIUM_BUTTON_PRIMARY,
  PREMIUM_BUTTON_SECONDARY,
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

type HomeMobilePanel = 'games' | 'labs' | 'feedback' | null

type GameCatalogItem = {
  id: string
  label: string
  description: string
  status: 'available' | 'coming-soon'
  path?: string
}

const GAME_CATALOG: GameCatalogItem[] = [
  {
    id: 'chess',
    label: 'Chess',
    description: 'Live matches, invites, and tutor/story modes.',
    status: 'available',
    path: '/chess',
  },
  {
    id: 'checkers',
    label: 'Checkers',
    description: 'Planned next game mode.',
    status: 'coming-soon',
  },
  {
    id: 'wordplay',
    label: 'Wordplay',
    description: 'Planned social word game.',
    status: 'coming-soon',
  },
]

const CONTINUE_STORAGE_KEY = 'home:continue-route'
const DEFAULT_CONTINUE_ROUTE = '/chess'

type ContinueActionMeta = {
  path: '/chat' | '/chess' | '/gallery'
  label: string
  description: string
}

const CONTINUE_ACTIONS: Record<ContinueActionMeta['path'], ContinueActionMeta> = {
  '/chat': {
    path: '/chat',
    label: 'Continue to Messages',
    description: 'Pick up room conversations where you left off.',
  },
  '/chess': {
    path: '/chess',
    label: 'Continue to Chess Hub',
    description: 'Jump back into matches and game invites.',
  },
  '/gallery': {
    path: '/gallery',
    label: 'Continue to Experimental Photos',
    description: 'Return to Labs photo tools and experiments.',
  },
}

function getStoredContinueRoute(): ContinueActionMeta['path'] {
  if (typeof window === 'undefined') return DEFAULT_CONTINUE_ROUTE
  const storedRoute = window.localStorage.getItem(CONTINUE_STORAGE_KEY)
  if (storedRoute === '/chat' || storedRoute === '/chess' || storedRoute === '/gallery') {
    return storedRoute
  }
  return DEFAULT_CONTINUE_ROUTE
}

export default function HomePage(): React.JSX.Element {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<HomeLoadState>({
    loading: true,
    totalPhotos: 0,
  })
  const [continueRoute, setContinueRoute] = useState<ContinueActionMeta['path']>(getStoredContinueRoute)
  const [isMobileLayout, setIsMobileLayout] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false))
  const [mobilePanel, setMobilePanel] = useState<HomeMobilePanel>(null)
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      setIsMobileLayout(window.innerWidth < 768)
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isMobileLayout) {
      setMobilePanel(null)
    }
  }, [isMobileLayout])

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

  const continueAction = CONTINUE_ACTIONS[continueRoute] || CONTINUE_ACTIONS[DEFAULT_CONTINUE_ROUTE]

  const handleNavigate = (path: ContinueActionMeta['path']) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONTINUE_STORAGE_KEY, path)
    }
    setContinueRoute(path)
    navigate(path)
  }

  const focusActionsGrid = () => {
    const actionsGrid = document.getElementById('home-actions-grid')
    actionsGrid?.focus()
  }

  const openAdmin = () => navigateWithTransition(navigate, '/admin')

  return (
    <main className={`${PREMIUM_PAGE_SHELL} h-[100dvh] overflow-hidden`}>
      <div className={`${PREMIUM_PAGE_CONTAINER} h-full overflow-hidden py-3 sm:py-3`}>
        <div className="flex h-full min-h-0 flex-col gap-2.5 sm:gap-3">
          <section className={PREMIUM_SURFACE_PADDED} aria-labelledby="home-hero-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 id="home-hero-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Home</h1>
                <p className="mt-1 text-sm text-slate-200">
                  Continue where you left off, then explore all core actions below.
                </p>
              </div>
              <div className="shrink-0">
                <UserMenu
                  theme="dark"
                  onOpenPhotos={() => handleNavigate('/gallery')}
                  onOpenEdit={() => navigate('/upload')}
                  onOpenAdmin={user?.app_metadata?.role === 'admin' ? openAdmin : undefined}
                  showAdminQuickAction={false}
                />
              </div>
            </div>

            <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/50 p-3 sm:p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Primary action</p>
              <h2 className="mt-1 text-lg font-semibold text-white">{continueAction.label}</h2>
              <p className="mt-1 text-sm text-slate-300">{continueAction.description}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate(continueAction.path)}
                  className={PREMIUM_BUTTON_PRIMARY}
                >
                  {continueAction.label}
                </button>
                <button
                  type="button"
                  onClick={focusActionsGrid}
                  className={PREMIUM_BUTTON_SECONDARY}
                >
                  {isMobileLayout ? 'Open launcher' : 'Browse actions'}
                </button>
              </div>
            </div>
          </section>

          {isMobileLayout ? (
            <section id="home-actions-grid" tabIndex={-1} aria-label="Home actions" className={`${PREMIUM_SURFACE} p-3`}>
              <h2 className="text-base font-semibold text-white">Launcher</h2>
              <p className="mt-1 text-xs text-slate-300">Open one area at a time.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('/chat')}
                  className={PREMIUM_BUTTON_SECONDARY}
                >
                  Messages
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel('games')}
                  className={PREMIUM_BUTTON_SECONDARY}
                >
                  Games
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel('labs')}
                  className={PREMIUM_BUTTON_SECONDARY}
                >
                  Labs
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel('feedback')}
                  className={PREMIUM_BUTTON_SECONDARY}
                >
                  Suggest Game
                </button>
              </div>
            </section>
          ) : null}

          {!isMobileLayout ? (
          <section
            id="home-actions-grid"
            tabIndex={-1}
            aria-label="Home actions"
            className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 overflow-hidden outline-none md:grid-cols-2"
          >
            <article className={`${PREMIUM_SURFACE} min-h-0 p-3.5 sm:p-4`} aria-labelledby="home-messages-title">
              <h2 id="home-messages-title" className="text-base font-semibold text-white sm:text-lg">Messages</h2>
              <p className="mt-1 text-sm text-slate-300">Chat in rooms and stay synced with unread indicators.</p>
              <button
                type="button"
                onClick={() => handleNavigate('/chat')}
                className={PREMIUM_BUTTON_SECONDARY}
              >
                Open Messages
              </button>
            </article>

            <article className={`${PREMIUM_SURFACE} min-h-0 p-3.5 sm:p-4`} aria-labelledby="home-games-title">
              <h2 id="home-games-title" className="text-base font-semibold text-white sm:text-lg">Games</h2>
              <p className="mt-1 text-sm text-slate-300">Choose an available game below.</p>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-200" aria-label="Games catalog">
                {GAME_CATALOG.map((game) => (
                  <li key={game.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-100">{game.label}</p>
                        <p className="mt-1 text-xs text-slate-300">{game.description}</p>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${game.status === 'available' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}
                      >
                        {game.status === 'available' ? 'Available' : 'Coming soon'}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      {game.status === 'available' && game.path ? (
                        <button
                          type="button"
                          onClick={() => handleNavigate(game.path as ContinueActionMeta['path'])}
                          className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs`}
                        >
                          Open {game.label}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-55`}
                          aria-label={`${game.label} coming soon`}
                        >
                          Coming soon
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${PREMIUM_SURFACE} min-h-0 p-3.5 sm:p-4`} aria-labelledby="home-labs-title">
              <h2 id="home-labs-title" className="text-base font-semibold text-white sm:text-lg">Labs</h2>
              <p className="mt-1 text-sm text-slate-300">Labs: early features you can try.</p>
              <p className="mt-2 text-xs text-slate-300">
                {state.loading ? 'Checking photo workspace status…' : `${state.totalPhotos} item${state.totalPhotos === 1 ? '' : 's'} in photos`}
              </p>
              <button
                type="button"
                onClick={() => handleNavigate('/gallery')}
                className={`${PREMIUM_BUTTON_SECONDARY} mt-3`}
              >
                Open Experimental Photos
              </button>
            </article>

            <article className={`${PREMIUM_SURFACE} min-h-0 p-3.5 sm:p-4`} aria-labelledby="home-feedback-title">
              <h2 id="home-feedback-title" className="text-base font-semibold text-white sm:text-lg">Feedback</h2>
              <p className="mt-1 text-sm text-slate-300">Tell us what game you want next.</p>
              <form className="mt-2 space-y-2" onSubmit={handleSuggestionSubmit}>
                <label htmlFor="home-game-suggestion" className="text-xs font-semibold uppercase tracking-wide text-slate-300">Suggest a game</label>
                <textarea
                  id="home-game-suggestion"
                  value={gameSuggestion}
                  onChange={(e) => setGameSuggestion(e.target.value)}
                  rows={1}
                  maxLength={1000}
                  placeholder="Example: Add cooperative trivia with room-based teams."
                  className={`w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 ${PREMIUM_FOCUS_RING}`}
                />
                <button
                  type="submit"
                  disabled={suggestionSubmitting}
                  className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {suggestionSubmitting ? 'Submitting…' : 'Suggest a Game'}
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
            </article>
          </section>
          ) : null}

          {isMobileLayout && mobilePanel ? (
            <section className="fixed inset-0 z-40 animate-in fade-in slide-in-from-right-2 duration-200 bg-chess-bg px-3 pb-3 pt-3">
              <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-3">
                <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setMobilePanel(null)}
                    className={PREMIUM_BUTTON_SECONDARY}
                  >
                    Back
                  </button>
                  <h2 className="text-sm font-semibold text-white">
                    {mobilePanel === 'games' ? 'Games' : mobilePanel === 'labs' ? 'Labs' : 'Feedback'}
                  </h2>
                </div>

                {mobilePanel === 'games' ? (
                  <article className={`${PREMIUM_SURFACE} flex-1 p-4`} aria-label="Games panel">
                    <ul className="space-y-2 text-sm text-slate-200" aria-label="Games catalog">
                      {GAME_CATALOG.map((game) => (
                        <li key={game.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-100">{game.label}</p>
                              <p className="mt-1 text-xs text-slate-300">{game.description}</p>
                            </div>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-semibold ${game.status === 'available' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-300'}`}
                            >
                              {game.status === 'available' ? 'Available' : 'Coming soon'}
                            </span>
                          </div>
                          <div className="mt-2">
                            {game.status === 'available' && game.path ? (
                              <button
                                type="button"
                                onClick={() => handleNavigate(game.path as ContinueActionMeta['path'])}
                                className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs`}
                              >
                                Open {game.label}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-55`}
                                aria-label={`${game.label} coming soon`}
                              >
                                Coming soon
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </article>
                ) : null}

                {mobilePanel === 'labs' ? (
                  <article className={`${PREMIUM_SURFACE} flex-1 p-4`} aria-label="Labs panel">
                    <p className="text-sm text-slate-300">Labs: early features you can try.</p>
                    <p className="mt-2 text-xs text-slate-300">
                      {state.loading ? 'Checking photo workspace status…' : `${state.totalPhotos} item${state.totalPhotos === 1 ? '' : 's'} in photos`}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleNavigate('/gallery')}
                      className={`${PREMIUM_BUTTON_SECONDARY} mt-3`}
                    >
                      Open Experimental Photos
                    </button>
                  </article>
                ) : null}

                {mobilePanel === 'feedback' ? (
                  <article className={`${PREMIUM_SURFACE} flex-1 p-4`} aria-label="Feedback panel">
                    <p className="text-sm text-slate-300">Tell us what game you want next.</p>
                    <form className="mt-3 space-y-2" onSubmit={handleSuggestionSubmit}>
                      <label htmlFor="home-game-suggestion-mobile" className="text-xs font-semibold uppercase tracking-wide text-slate-300">Suggest a game</label>
                      <textarea
                        id="home-game-suggestion-mobile"
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
                        className={`${PREMIUM_BUTTON_SECONDARY} min-h-10 text-xs disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        {suggestionSubmitting ? 'Submitting…' : 'Suggest a Game'}
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
                  </article>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  )
}
