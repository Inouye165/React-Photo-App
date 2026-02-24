import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Bot, BookOpen, ChevronRight, History, Users } from 'lucide-react'
import { listMyGamesWithMembers, type GameWithMembers } from '../api/games'
import { onGamesChanged } from '../events/gamesEvents'
import { useAuth } from '../contexts/AuthContext'

const inviteStatuses = new Set(['waiting', 'invited', 'pending'])
const activeStatuses = new Set(['active', 'in_progress', 'inprogress'])

function normalizeStatus(status: string | null | undefined): string {
  return (status || '').toLowerCase()
}

function isOpenStatus(status: string | null | undefined): boolean {
  const normalized = normalizeStatus(status)
  return inviteStatuses.has(normalized) || activeStatuses.has(normalized)
}

function isInviteStatus(status: string | null | undefined): boolean {
  return inviteStatuses.has(normalizeStatus(status))
}

function getTimestamp(value: string | null | undefined): number {
  if (!value) return 0
  const time = Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

function byUpdatedDesc(a: GameWithMembers, b: GameWithMembers): number {
  return getTimestamp(b.updated_at) - getTimestamp(a.updated_at)
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return 'Recently'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return formatDistanceToNow(date, { addSuffix: true })
}

function getOpponentLabel(game: GameWithMembers, currentUserId?: string, currentUsername?: string): string {
  const currentId = currentUserId || ''
  const currentName = (currentUsername || '').trim().toLowerCase()

  const opponent = game.members.find((member) => {
    if (currentId && member.user_id === currentId) return false
    if (!currentId && currentName && (member.username || '').trim().toLowerCase() === currentName) return false
    return true
  })

  return opponent?.username || 'Opponent'
}

export default function ChessHub(): React.JSX.Element {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [games, setGames] = useState<GameWithMembers[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  const loadGames = useCallback(async (showLoading: boolean) => {
    if (showLoading) setIsLoading(true)
    setLoadError(null)

    try {
      const rows = await listMyGamesWithMembers()
      setGames(Array.isArray(rows) ? rows : [])
    } catch {
      setLoadError('Unable to load your recent chess games right now.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const runInitialLoad = async () => {
      try {
        const rows = await listMyGamesWithMembers()
        if (!isMounted) return
        setGames(Array.isArray(rows) ? rows : [])
        setLoadError(null)
      } catch {
        if (!isMounted) return
        setLoadError('Unable to load your recent chess games right now.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void runInitialLoad()

    const offGamesChanged = onGamesChanged(() => {
      void loadGames(false)
    })

    return () => {
      isMounted = false
      offGamesChanged()
    }
  }, [loadGames])

  // Human decision: API does not expose turn-owner, so the top active match is treated as the actionable "Your Turn" hero target.
  const activeGames = useMemo(() => (
    games
      .filter((game) => activeStatuses.has(normalizeStatus(game.status)))
      .sort(byUpdatedDesc)
  ), [games])

  const singleActiveGame = activeGames[0] ?? null

  const heroState = useMemo<'hasActiveGame' | 'hasMultipleActiveGames' | 'noActiveGame'>(() => {
    if (activeGames.length === 1) return 'hasActiveGame'
    if (activeGames.length >= 2) return 'hasMultipleActiveGames'
    return 'noActiveGame'
  }, [activeGames.length])

  const historyGames = useMemo(() => {
    const activeIds = new Set(activeGames.map((game) => game.id))
    return games
      .filter((game) => game?.id && !activeIds.has(game.id) && isOpenStatus(game.status))
      .sort(byUpdatedDesc)
      .slice(0, 8)
  }, [activeGames, games])

  const modeItems = [
    {
      key: 'local',
      title: 'Play Computer',
      description: 'Sharpen openings with immediate feedback and rematch speed.',
      chips: ['Engine Support', 'Practice Scenarios', 'Instant Rematch'],
      onClick: () => navigate('/games/local?tab=analyze'),
      icon: Bot,
    },
    {
      key: 'invite',
      title: 'Play a Friend',
      description: 'Set up a serious match and keep momentum across turns.',
      chips: ['Invite Match', 'Live Opponent', 'Match Continuity'],
      onClick: () => navigate('/games'),
      icon: Users,
    },
    {
      key: 'tutorials',
      title: 'Learn Chess',
      description: 'Build pattern recognition with guided lessons and stories.',
      chips: ['Guided Lessons', 'Story Chapters', 'Focused Drills'],
      onClick: () => navigate('/games/local?tab=lesson&tutor=1&storyId=architect-of-squares'),
      icon: BookOpen,
    },
  ] as const

  return (
    <motion.main
      className="min-h-[100dvh] bg-chess-bg font-body text-chess-text"
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={prefersReducedMotion ? undefined : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="sticky top-0 z-50 h-14 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-5 lg:px-6" aria-label="Chess header navigation">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to Home"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-chess-surface text-chess-text shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surfaceSoft active:bg-chess-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="font-display text-xl tracking-wide text-chess-text">Chess</h1>
          <div className="w-10" aria-hidden="true" />
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 pb-8 pt-4 sm:px-5 lg:gap-7 lg:px-6 lg:pt-6">
        <section className="rounded-2xl bg-chess-surface px-4 py-4 shadow-chess-card ring-1 ring-white/5 sm:px-5 sm:py-5" aria-labelledby="chess-hero-title">
          <h2 id="chess-hero-title" className="font-display text-2xl text-chess-text sm:text-3xl">Match Table</h2>
          <p className="mt-1 text-sm text-chess-muted">Find the right seat quickly and keep your rhythm between turns.</p>

          {isLoading ? (
            <div className="mt-4 h-28 rounded-xl bg-chess-surfaceSoft/70 ring-1 ring-white/5" aria-label="Loading matches" />
          ) : loadError ? (
            <div className="mt-4 rounded-xl bg-red-400/10 p-3 text-sm text-red-100 ring-1 ring-red-200/25" role="status" aria-live="polite">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={() => { void loadGames(true) }}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-chess-text transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                Try Again
              </button>
            </div>
          ) : heroState === 'hasActiveGame' && singleActiveGame ? (
            <article className="mt-4 rounded-2xl bg-chess-surfaceSoft p-4 shadow-chess-card ring-1 ring-white/5 sm:p-5" aria-label="Resume match">
              <p className="text-xs font-semibold uppercase tracking-wide text-chess-accentSoft">Resume Match</p>
              <h3 className="mt-1 font-display text-2xl text-chess-text">vs {getOpponentLabel(singleActiveGame, user?.id, profile?.username || user?.email || '')}</h3>
              <p className="mt-1 text-sm text-chess-muted">Last move {formatRelative(singleActiveGame.updated_at)}</p>
              <div className="mt-4 flex items-center gap-3">
                <motion.span
                  className="inline-flex items-center rounded-full bg-chess-turn/30 px-2.5 py-1 text-xs font-semibold text-amber-100"
                  animate={prefersReducedMotion ? undefined : { opacity: [1, 0.76, 1], scale: [1, 1.02, 1] }}
                  transition={prefersReducedMotion ? undefined : { duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  Your Turn
                </motion.span>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/games/${singleActiveGame.id}`)}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-chess-accent px-4 py-2 text-sm font-semibold text-black shadow-chess-card transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                Continue Game
              </button>
            </article>
          ) : heroState === 'hasMultipleActiveGames' ? (
            <section className="mt-4" aria-label="Active matches">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-display text-xl text-chess-text">Active Matches</h3>
                <span className="text-xs text-chess-muted">{activeGames.length} ongoing</span>
              </div>
              <div className="-mx-1 overflow-x-auto pb-2">
                <ul className="flex min-w-full gap-3 px-1">
                  {activeGames.map((game) => (
                    <li key={game.id} className="w-[15.75rem] shrink-0 rounded-xl bg-chess-surfaceSoft p-3 shadow-chess-card ring-1 ring-white/5">
                      <p className="font-display text-lg text-chess-text">vs {getOpponentLabel(game, user?.id, profile?.username || user?.email || '')}</p>
                      <p className="mt-1 text-xs text-chess-muted">Updated {formatRelative(game.updated_at)}</p>
                      <span className="mt-2 inline-flex rounded-full bg-amber-500/25 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                        In Progress
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate(`/games/${game.id}`)}
                        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-md bg-chess-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                      >
                        Continue
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <section className="mt-4" aria-label="Choose how to play">
              <h3 className="font-display text-xl text-chess-text">How do you want to play?</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => navigate('/games/local?tab=analyze')}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-chess-surfaceSoft px-4 py-3 text-sm font-semibold text-chess-text shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                >
                  Play Computer
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/games')}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-chess-surfaceSoft px-4 py-3 text-sm font-semibold text-chess-text shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                >
                  Play a Friend
                </button>
              </div>
            </section>
          )}
        </section>

        <section aria-labelledby="chess-modes-title">
          <div className="mb-2 flex items-end justify-between">
            <h2 id="chess-modes-title" className="font-display text-2xl text-chess-text">Modes</h2>
            <p className="text-xs text-chess-muted">Choose your focus</p>
          </div>

          <ul className="lg:hidden">
            {modeItems.map((mode) => {
              const Icon = mode.icon
              return (
                <li key={`mobile-${mode.key}`} className="mt-2 first:mt-0">
                  <button
                    type="button"
                    onClick={mode.onClick}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-chess-surface px-3 py-2 text-left shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surfaceSoft active:bg-chess-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    <Icon size={18} className="text-chess-accentSoft" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-chess-text">{mode.title}</p>
                      <p className="truncate text-xs text-chess-muted">{mode.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-chess-muted" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="hidden gap-4 lg:grid lg:grid-cols-3">
            {modeItems.map((mode) => {
              const Icon = mode.icon
              return (
                <article key={mode.key} className="rounded-2xl bg-chess-surface p-5 shadow-chess-card ring-1 ring-white/5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-chess-surfaceSoft p-2 ring-1 ring-white/5">
                      <Icon size={20} className="text-chess-accentSoft" aria-hidden="true" />
                    </div>
                    <h3 className="font-display text-2xl text-chess-text">{mode.title}</h3>
                  </div>
                  <p className="mt-3 text-sm text-chess-muted">{mode.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {mode.chips.map((chip) => (
                      <span key={chip} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-chess-text">
                        {chip}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={mode.onClick}
                    className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-chess-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    {mode.title}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section aria-label="Match history" className="pt-1">
          <button
            type="button"
            onClick={() => setIsHistoryOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-chess-accentSoft underline-offset-4 transition hover:text-chess-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            <History size={14} aria-hidden="true" />
            {isHistoryOpen ? 'Hide History' : 'View History'}
          </button>

          {isHistoryOpen ? (
            <div className="mt-3 rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/5">
              {historyGames.length ? (
                <ul className="space-y-2">
                  {historyGames.map((game) => (
                    <li key={game.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/games/${game.id}`)}
                        className="w-full rounded-lg bg-chess-surfaceSoft px-3 py-2 text-left ring-1 ring-white/5 transition hover:bg-chess-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                        aria-label={`Open game versus ${getOpponentLabel(game, user?.id, profile?.username || user?.email || '')}`}
                      >
                        <p className="text-sm font-semibold text-chess-text">vs {getOpponentLabel(game, user?.id, profile?.username || user?.email || '')}</p>
                        <p className="text-xs text-chess-muted">
                          {isInviteStatus(game.status) ? 'Invitation' : 'In progress'} · {formatRelative(game.updated_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-chess-muted">No history yet. Your finished and archived matches will appear here.</p>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </motion.main>
  )
}