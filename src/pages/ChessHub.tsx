import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, BookOpen, Clock3, Users } from 'lucide-react'
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

function formatUpdatedAt(value: string | null | undefined): string {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString()
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
  const [games, setGames] = useState<GameWithMembers[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const openGames = useMemo(() => (
    games
      .filter((game) => isOpenStatus(game.status))
      .sort(byUpdatedDesc)
  ), [games])

  const continueGame = openGames[0] ?? null

  const recentGames = useMemo(() => {
    const openFirst = [...openGames]
    const allByRecent = [...games].sort(byUpdatedDesc)
    const merged = [...openFirst, ...allByRecent]
    const seen = new Set<string>()

    return merged.filter((game) => {
      if (!game?.id || seen.has(game.id)) return false
      seen.add(game.id)
      return true
    }).slice(0, 3)
  }, [games, openGames])

  const modeCards = [
    {
      key: 'local',
      title: 'Play vs Computer',
      description: 'Start a local match with engine support and analysis tools.',
      bullets: ['Live board analysis', 'Practice with instant retries', 'Use tutor-ready board state'],
      ctaLabel: 'Start game',
      onClick: () => navigate('/games/local?tab=analyze'),
      icon: Bot,
    },
    {
      key: 'invite',
      title: 'Play vs Opponent (Invite)',
      description: 'Open your games dashboard to invite another player.',
      bullets: ['Send and manage invites', 'Resume active matches', 'Track game status in one place'],
      ctaLabel: 'Open games dashboard',
      onClick: () => navigate('/games'),
      icon: Users,
    },
    {
      key: 'tutorials',
      title: 'Tutorials',
      description: 'Open the local chess tutor in fullscreen mode.',
      bullets: ['Guided lessons', 'Story-based chapters', 'Built-in practice transitions'],
      ctaLabel: 'Open tutor',
      onClick: () => navigate('/games/local?tab=lesson&tutor=1&storyId=architect-of-squares'),
      icon: BookOpen,
    },
  ] as const

  return (
    <section className="flex h-full min-h-[100dvh] w-full flex-col bg-slate-900 px-3 pb-4 pt-4 text-slate-100 sm:px-6 sm:pb-6 sm:pt-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
        <div className="flex items-center justify-start">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            aria-label="Back to Home"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to Home
          </button>
        </div>

        <header className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4 sm:p-5">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-4xl">Chess</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-200 sm:text-base">Pick a mode and jump in. Continue your latest game, launch a new match, or open tutorials in a clean fullscreen flow.</p>
        </header>

        <section className="rounded-2xl border border-indigo-400/50 bg-slate-800/80 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-white">Quick start</h2>
            <Clock3 size={18} className="text-indigo-200" aria-hidden="true" />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="h-36 animate-pulse rounded-xl border border-slate-700 bg-slate-700/50" aria-label="Loading quick start" />
              </div>
              <div className="h-36 animate-pulse rounded-xl border border-slate-700 bg-slate-700/50" aria-label="Loading recent games" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4 lg:col-span-2">
                {loadError ? (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100" role="status" aria-live="polite">
                    <p>{loadError}</p>
                    <button
                      type="button"
                      onClick={() => { void loadGames(true) }}
                      className="mt-3 inline-flex min-h-10 items-center rounded-md border border-red-300/40 bg-red-500/20 px-3 py-2 text-sm font-medium text-red-50 transition hover:bg-red-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    >
                      Retry
                    </button>
                  </div>
                ) : continueGame ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Continue</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">vs {getOpponentLabel(continueGame, user?.id, profile?.username || user?.email || '')}</h3>
                      <p className="mt-1 text-sm text-slate-300">Last updated {formatUpdatedAt(continueGame.updated_at)}</p>
                    </div>
                    <span className="inline-flex rounded-full border border-indigo-300/50 bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-100">
                      {isInviteStatus(continueGame.status) ? 'Invitation' : 'In progress'}
                    </span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/games/${continueGame.id}`)}
                        className="inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        Continue
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/games')}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        View all games
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Start something</p>
                      <h3 className="mt-1 text-lg font-semibold text-white">No open games yet</h3>
                      <p className="mt-1 text-sm text-slate-300">Launch a quick local match or invite an opponent to begin.</p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => navigate('/games/local?tab=analyze')}
                        className="inline-flex min-h-11 items-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        Play vs Computer
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/games')}
                        className="inline-flex min-h-11 items-center rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                      >
                        Invite opponent
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Recent</h3>
                {loadError ? (
                  <p className="mt-3 text-sm text-slate-300">Recent games are unavailable while loading fails.</p>
                ) : recentGames.length ? (
                  <div className="mt-3 space-y-2">
                    {recentGames.map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => navigate(`/games/${game.id}`)}
                        className="w-full rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-2 text-left transition hover:border-indigo-300/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                        aria-label={`Open recent game ${getOpponentLabel(game, user?.id, profile?.username || user?.email || '')}`}
                      >
                        <p className="text-sm font-medium text-slate-100">vs {getOpponentLabel(game, user?.id, profile?.username || user?.email || '')}</p>
                        <p className="mt-0.5 text-xs text-slate-300">{isInviteStatus(game.status) ? 'Invitation' : 'In progress'} • {formatUpdatedAt(game.updated_at)}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">No recent games yet.</p>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
          {modeCards.map((card) => {
            const Icon = card.icon

            return (
              <article key={card.key} className="flex flex-col rounded-2xl border border-indigo-400/50 bg-slate-800 p-4 shadow-sm transition hover:border-indigo-300 sm:min-h-[260px] sm:p-5">
                <div className="flex items-start gap-3">
                  <Icon size={22} className="mt-0.5 text-indigo-300" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                    <p className="mt-1 hidden text-sm text-slate-300 sm:block">{card.description}</p>
                  </div>
                </div>

                <ul className="mt-3 hidden space-y-2 text-sm text-slate-200 sm:mt-4 sm:block">
                  {card.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-300" aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 sm:mt-auto sm:pt-5">
                  <button
                    type="button"
                    onClick={card.onClick}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-indigo-300/60 bg-indigo-500/20 px-3 py-2 text-sm font-semibold text-indigo-50 transition hover:bg-indigo-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                    aria-label={card.ctaLabel}
                  >
                    {card.ctaLabel}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}