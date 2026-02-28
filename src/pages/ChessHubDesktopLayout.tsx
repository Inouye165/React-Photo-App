import React from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import type { GameWithMembers } from '../api/games'
import GreatestGamesCard from './GreatestGamesCard'
import ChessHeaderAccountIndicator from './ChessHeaderAccountIndicator'

const clampTwoLines: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

type StatusRowProps = {
  tone: 'active' | 'pending' | 'neutral'
  label: string
  detail?: string
}

function StatusRow({ tone, label, detail }: StatusRowProps): React.JSX.Element {
  const toneClass = tone === 'active'
    ? 'bg-emerald-300'
    : tone === 'pending'
      ? 'bg-amber-300'
      : 'bg-slate-300'

  return (
    <div className="flex items-center gap-2 text-[11px] font-medium text-chess-text/85" role="status">
      <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass}`} aria-hidden="true" />
      <span className="uppercase tracking-wide">{label}</span>
      {detail ? <span className="truncate text-chess-text/70">{detail}</span> : null}
    </div>
  )
}

type ModeItem = {
  key: string
  title: string
  description: string
  chips: string[]
  imageSrc: string
  imageAlt: string
  onClick: () => void
  icon: LucideIcon
}

type ChessHubDesktopLayoutProps = {
  isLoading: boolean
  loadError: string | null
  onRetry: () => void
  modeItems: ModeItem[]
  singleActiveGame: GameWithMembers | null
  activeGames: GameWithMembers[]
  historyGames: GameWithMembers[]
  getOpponentLabel: (game: GameWithMembers) => string
  formatRelative: (value: string | null | undefined) => string
  isInviteStatus: (status: string | null | undefined) => boolean
  onOpenHome: () => void
  onOpenGame: (gameId: string) => void
  isAuthenticated: boolean
  accountDisplayName: string
  accountInitials: string
  onOpenSignIn: () => void
}

export default function ChessHubDesktopLayout({
  isLoading,
  loadError,
  onRetry,
  modeItems,
  singleActiveGame,
  activeGames,
  historyGames,
  getOpponentLabel,
  formatRelative,
  isInviteStatus,
  onOpenHome,
  onOpenGame,
  isAuthenticated,
  accountDisplayName,
  accountInitials,
  onOpenSignIn,
}: ChessHubDesktopLayoutProps): React.JSX.Element {
  const friendQueue = [...activeGames, ...historyGames]
    .filter((game, index, collection) => game.id && collection.findIndex((row) => row.id === game.id) === index)
    .filter((game) => isInviteStatus(game.status) || game.status === 'active' || game.status === 'in_progress' || game.status === 'inprogress')
    .slice(0, 2)

  let hasLessonProgress = false
  try {
    hasLessonProgress = typeof window !== 'undefined' && window.localStorage.getItem('chess:tutorial-story-hint-seen:v1') === '1'
  } catch {
    hasLessonProgress = false
  }

  let hasComputerResume = false
  try {
    hasComputerResume = typeof window !== 'undefined' && Boolean(window.localStorage.getItem('chess:save:local'))
  } catch {
    hasComputerResume = false
  }
  const hasFriendMatch = friendQueue.length > 0

  return (
    <>
      <a
        href="#chess-hub-main-content"
        className="sr-only z-[60] rounded-md bg-chess-accent px-3 py-2 text-sm font-semibold text-black focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
      >
        Skip to main content
      </a>

      <header className="z-50 h-14 shrink-0 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between px-6 xl:px-10 2xl:px-12" aria-label="Chess header navigation">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onOpenHome}
              aria-label="Back to Home"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-chess-surface text-chess-text shadow-chess-card ring-1 ring-white/10 transition hover:bg-chess-surfaceSoft active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onOpenHome}
              className="rounded-md px-2 py-1 font-display text-lg font-semibold tracking-wide text-chess-text transition hover:text-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              aria-label="Lumina Chess home"
            >
              Lumina Chess
            </button>
          </div>
          <h1 className="font-display text-2xl text-chess-text">Chess Hub</h1>
          <ChessHeaderAccountIndicator
            isAuthenticated={isAuthenticated}
            displayName={accountDisplayName}
            initials={accountInitials}
            onSignIn={onOpenSignIn}
          />
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-[1680px] flex-1 min-h-0 px-6 pb-3 pt-3 xl:px-10 2xl:px-12">
        {/* Chosen option B: top row stays action-first for immediate play, while GOTW spans full width below for balanced desktop usage without a dead side panel. */}
        <div className="grid h-full min-h-0 w-full grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,0.86fr)] gap-3 overflow-hidden">
          <section
            className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-2 xl:[grid-template-columns:repeat(3,minmax(320px,1fr))]"
            aria-label="Start a game"
          >
            {modeItems.map((mode) => {
              const Icon = mode.icon
              const primaryStyle = mode.key === 'tutorials'
                ? 'bg-chess-accentSoft text-black hover:bg-chess-accent'
                : 'bg-chess-accent text-black hover:bg-chess-accentSoft'

              const ctaLabel = mode.key === 'local'
                ? (hasComputerResume ? 'Resume game' : 'New game')
                : mode.key === 'invite'
                  ? (hasFriendMatch ? 'Continue match' : 'Invite friend')
                  : (hasLessonProgress ? 'Continue lesson' : 'Browse lessons')

              const handlePrimaryAction = () => {
                if (mode.key === 'invite' && friendQueue[0]) {
                  onOpenGame(friendQueue[0].id)
                  return
                }

                mode.onClick()
              }

              return (
                <article
                  key={mode.key}
                  data-testid="mode-card"
                  className="group flex min-h-0 flex-col rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:ring-chess-accentSoft/40 focus-within:ring-2 focus-within:ring-chess-accentSoft"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-chess-surfaceSoft p-2 ring-1 ring-white/10">
                      <Icon size={20} className="text-chess-accentSoft" aria-hidden />
                    </div>
                    <h2 className="font-display text-[20px] leading-tight text-chess-text">{mode.title}</h2>
                  </div>

                  <p className="mt-2 text-[15px] font-medium leading-snug text-chess-text/90" style={clampTwoLines}>{mode.description}</p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {mode.chips.slice(0, 2).map((chip) => (
                      <span key={chip} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-chess-text">
                        {chip}
                      </span>
                    ))}
                  </div>

                  {mode.key === 'local' ? (
                    <div className="mt-3 space-y-1.5" data-testid="play-computer-status">
                      {hasComputerResume ? (
                        <>
                          <StatusRow tone="active" label="Saved" detail="vs Computer" />
                          <StatusRow tone="neutral" label="Status" detail="Resume your local game" />
                        </>
                      ) : (
                        <StatusRow tone="neutral" label="Last played" detail="No saved game yet" />
                      )}
                    </div>
                  ) : null}

                  {mode.key === 'invite' ? (
                    <div className="mt-3 space-y-1.5" data-testid="play-friend-status">
                      {friendQueue.length ? (
                        <ul className="space-y-1.5">
                          {friendQueue.map((game) => (
                            <li key={game.id}>
                              <StatusRow
                                tone={isInviteStatus(game.status) ? 'pending' : 'active'}
                                label={isInviteStatus(game.status) ? 'Pending' : 'Active'}
                                detail={`vs ${getOpponentLabel(game)} · ${formatRelative(game.updated_at)}`}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <StatusRow tone="neutral" label="Pending" detail="No friend matches yet" />
                      )}
                    </div>
                  ) : null}

                  {mode.key === 'tutorials' ? (
                    <div className="mt-3 space-y-1.5" data-testid="learn-chess-status">
                      {hasLessonProgress ? (
                        <>
                          <StatusRow tone="active" label="Active" detail="Architect of Squares" />
                          <StatusRow tone="neutral" label="Chapter" detail="Resume your last chapter" />
                        </>
                      ) : (
                        <StatusRow tone="neutral" label="Chapter" detail="No saved lesson yet" />
                      )}
                    </div>
                  ) : null}

                  <div className="mt-3 min-h-0 flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-chess-surfaceSoft/60 ring-1 ring-white/10">
                    <img
                      src={mode.imageSrc}
                      alt={mode.imageAlt}
                      className="h-full w-full max-h-full object-contain object-center"
                      style={{ aspectRatio: '16 / 7' }}
                      loading="lazy"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePrimaryAction}
                    className={`mt-3 inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg ${primaryStyle}`}
                  >
                    {ctaLabel}
                  </button>
                </article>
              )
            })}
          </section>

          <section className="min-h-0" aria-label="Game of the week zone">
            <GreatestGamesCard />
          </section>

          {(isLoading || loadError) ? (
            <div className="pointer-events-none absolute opacity-0" aria-live="polite">
              {isLoading ? (
                <p>Loading your active matches…</p>
              ) : loadError ? (
                <button type="button" onClick={onRetry}>Retry</button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}