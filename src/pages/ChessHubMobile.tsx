import React from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DEFAULT_GOTW_SLUG, getGotwEntry } from '../data/chessGotw'
import type { GameWithMembers } from '../api/games'
import ChessHeaderAccountIndicator from './ChessHeaderAccountIndicator'

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

type ChessHubMobileProps = {
  isLoading: boolean
  loadError: string | null
  heroState: 'hasActiveGame' | 'hasMultipleActiveGames' | 'noActiveGame'
  singleActiveGame: GameWithMembers | null
  activeGames: GameWithMembers[]
  historyGames: GameWithMembers[]
  isHistoryOpen: boolean
  modeItems: ModeItem[]
  prefersReducedMotion: boolean
  getOpponentLabel: (game: GameWithMembers) => string
  formatRelative: (value: string | null | undefined) => string
  isInviteStatus: (status: string | null | undefined) => boolean
  onRetry: () => void
  onOpenHome: () => void
  onOpenMode: (callback: () => void) => void
  onOpenGame: (gameId: string) => void
  onOpenGotw: (slug: string) => void
  onToggleHistory: () => void
  isAuthenticated: boolean
  accountDisplayName: string
  accountInitials: string
  onOpenSignIn: () => void
}

export default function ChessHubMobile({
  isLoading,
  loadError,
  heroState,
  singleActiveGame,
  activeGames,
  historyGames,
  isHistoryOpen,
  modeItems,
  prefersReducedMotion,
  getOpponentLabel,
  formatRelative,
  isInviteStatus,
  onRetry,
  onOpenHome,
  onOpenMode,
  onOpenGame,
  onOpenGotw,
  onToggleHistory,
  isAuthenticated,
  accountDisplayName,
  accountInitials,
  onOpenSignIn,
}: ChessHubMobileProps): React.JSX.Element {
  const gotwEntry = getGotwEntry(DEFAULT_GOTW_SLUG)

  return (
    <>
      <header className="sticky top-0 z-50 h-14 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-5 lg:px-6" aria-label="Chess header navigation">
          <button
            type="button"
            onClick={onOpenHome}
            aria-label="Back to Home"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-chess-surface text-chess-text shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surfaceSoft active:bg-chess-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="font-display text-xl tracking-wide text-chess-text">Chess</h1>
          <ChessHeaderAccountIndicator
            isAuthenticated={isAuthenticated}
            displayName={accountDisplayName}
            initials={accountInitials}
            onSignIn={onOpenSignIn}
          />
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 pb-5 pt-4 sm:px-5 lg:gap-7 lg:px-6 lg:pt-6">
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
                onClick={onRetry}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-chess-text transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                Try Again
              </button>
            </div>
          ) : heroState === 'hasActiveGame' && singleActiveGame ? (
            <article className="mt-4 rounded-2xl bg-chess-surfaceSoft p-4 shadow-chess-card ring-1 ring-white/5 sm:p-5" aria-label="Resume match">
              <p className="text-xs font-semibold uppercase tracking-wide text-chess-accentSoft">Resume Match</p>
              <h3 className="mt-1 font-display text-2xl text-chess-text">vs {getOpponentLabel(singleActiveGame)}</h3>
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
                onClick={() => onOpenGame(singleActiveGame.id)}
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
                      <p className="font-display text-lg text-chess-text">vs {getOpponentLabel(game)}</p>
                      <p className="mt-1 text-xs text-chess-muted">Updated {formatRelative(game.updated_at)}</p>
                      <span className="mt-2 inline-flex rounded-full bg-amber-500/25 px-2 py-0.5 text-[11px] font-semibold text-amber-100">
                        In Progress
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenGame(game.id)}
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
                  onClick={() => onOpenMode(modeItems[0].onClick)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-chess-surfaceSoft px-4 py-3 text-sm font-semibold text-chess-text shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                >
                  Play Computer
                </button>
                <button
                  type="button"
                  onClick={() => onOpenMode(modeItems[1].onClick)}
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
              return (
                <li key={`mobile-${mode.key}`} className="mt-2 first:mt-0">
                  <button
                    type="button"
                    onClick={() => onOpenMode(mode.onClick)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-chess-surface px-3 py-2.5 text-left shadow-chess-card ring-1 ring-white/5 transition hover:bg-chess-surfaceSoft active:bg-chess-surfaceSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    <div className="h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-chess-surfaceSoft ring-1 ring-white/10">
                      <img
                        src={mode.imageSrc}
                        alt={mode.imageAlt}
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                      />
                    </div>
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

          {gotwEntry ? (
            <article className="mt-3 rounded-xl bg-chess-surface p-3 shadow-chess-card ring-1 ring-white/5" aria-labelledby="chess-gotw-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-chess-accentSoft">Game of the Week</p>
                  <h3 id="chess-gotw-title" className="truncate font-display text-base text-chess-text">{gotwEntry.playersLabel}</h3>
                  <p className="truncate text-xs text-chess-muted">{gotwEntry.event} · {gotwEntry.year}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenGotw(gotwEntry.slug)}
                  className="inline-flex min-h-9 items-center justify-center rounded-md bg-chess-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                >
                  Watch full game
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-chess-text/90">{gotwEntry.subtitle}</p>
            </article>
          ) : null}

          <div className="hidden gap-4 lg:grid lg:grid-cols-3">
            {modeItems.map((mode) => {
              const Icon = mode.icon
              return (
                <article key={mode.key} className="rounded-2xl bg-chess-surface p-5 shadow-chess-card ring-1 ring-white/5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-chess-surfaceSoft p-2 ring-1 ring-white/5">
                      <Icon size={20} className="text-chess-accentSoft" aria-hidden />
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
                    onClick={() => onOpenMode(mode.onClick)}
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
            onClick={onToggleHistory}
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
                        onClick={() => onOpenGame(game.id)}
                        className="w-full rounded-lg bg-chess-surfaceSoft px-3 py-2 text-left ring-1 ring-white/5 transition hover:bg-chess-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                        aria-label={`Open game versus ${getOpponentLabel(game)}`}
                      >
                        <p className="text-sm font-semibold text-chess-text">vs {getOpponentLabel(game)}</p>
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
    </>
  )
}