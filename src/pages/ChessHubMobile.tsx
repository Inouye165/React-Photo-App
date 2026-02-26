import React from 'react'
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
  const mobileDesignTokens = {
    '--chess-hub-space-1': '4px',
    '--chess-hub-space-2': '8px',
    '--chess-hub-space-3': '12px',
    '--chess-hub-space-4': '16px',
    '--chess-hub-space-5': '20px',
    '--chess-hub-space-6': '24px',
    '--chess-hub-type-display': '1.5rem',
    '--chess-hub-type-section': '1.25rem',
    '--chess-hub-type-body': '0.875rem',
    '--chess-hub-type-label': '0.75rem',
    '--chess-hub-color-bg': '#0b1220',
    '--chess-hub-color-surface': '#1e293b',
    '--chess-hub-color-surface-soft': '#273449',
    '--chess-hub-color-text-primary': '#f8fafc',
    '--chess-hub-color-text-secondary': '#cbd5e1',
    '--chess-hub-color-accent': '#e7ba53',
    '--chess-hub-color-accent-text': '#1a1305',
    '--chess-hub-color-border': 'rgba(255, 255, 255, 0.14)',
    '--chess-hub-shadow': '0 10px 24px rgba(2, 6, 23, 0.32)',
    '--chess-hub-radius-card': '14px',
    '--chess-hub-radius-button': '10px',
    '--chess-mode-thumb': 'clamp(48px, 7vw, 56px)',
  } as React.CSSProperties

  const mobilePrimaryActionClass = 'inline-flex min-h-11 items-center justify-center rounded-[var(--chess-hub-radius-button)] bg-[var(--chess-hub-color-accent)] px-[var(--chess-hub-space-4)] py-[var(--chess-hub-space-2)] text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-accent-text)] transition hover:brightness-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)] disabled:cursor-not-allowed disabled:opacity-60'

  return (
    <>
      <header className="sticky top-0 z-50 h-14 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-[var(--chess-hub-space-4)] sm:px-5 lg:px-6" aria-label="Chess header navigation" style={mobileDesignTokens}>
          <button
            type="button"
            onClick={onOpenHome}
            aria-label="Back to Home"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--chess-hub-color-surface)] text-[var(--chess-hub-color-text-primary)] ring-1 ring-[var(--chess-hub-color-border)] transition hover:bg-[var(--chess-hub-color-surface-soft)] active:bg-[var(--chess-hub-color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)]"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <h1 className="font-display text-[length:var(--chess-hub-type-section)] tracking-wide text-[var(--chess-hub-color-text-primary)]">Chess</h1>
          <ChessHeaderAccountIndicator
            isAuthenticated={isAuthenticated}
            displayName={accountDisplayName}
            initials={accountInitials}
            onSignIn={onOpenSignIn}
          />
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-[var(--chess-hub-space-4)] pb-5 pt-4 sm:px-5 lg:gap-7 lg:px-6 lg:pt-6" style={mobileDesignTokens}>
        <section className="rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)] sm:px-5 sm:py-5" aria-labelledby="chess-hero-title">
          <h2 id="chess-hero-title" className="font-display text-[length:var(--chess-hub-type-display)] leading-tight text-[var(--chess-hub-color-text-primary)] sm:text-3xl">Match Table</h2>
          <p className="mt-1 text-[length:var(--chess-hub-type-body)] text-[var(--chess-hub-color-text-secondary)]">Find the right seat quickly and keep your rhythm between turns.</p>

          {isLoading ? (
            <div className="mt-4 h-28 rounded-xl bg-chess-surfaceSoft/70 ring-1 ring-white/5" aria-label="Loading matches" />
          ) : loadError ? (
            <div className="mt-4 rounded-xl bg-red-400/10 p-3 text-[length:var(--chess-hub-type-body)] text-red-100 ring-1 ring-red-200/25" role="status" aria-live="polite">
              <p>{loadError}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-3 inline-flex min-h-11 items-center justify-center rounded-[var(--chess-hub-radius-button)] border border-white/20 px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-text-primary)] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)]"
              >
                Try Again
              </button>
            </div>
          ) : heroState === 'hasActiveGame' && singleActiveGame ? (
            <article
              data-testid="chess-mobile-resume-card"
              className="mt-3 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface-soft)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]"
              aria-label="Resume match"
            >
              <p className="text-[length:var(--chess-hub-type-label)] font-semibold uppercase tracking-wide text-[var(--chess-hub-color-accent)]">Resume Match</p>
              <h3 className="mt-1 font-display text-[length:var(--chess-hub-type-section)] leading-tight text-[var(--chess-hub-color-text-primary)]">VS {getOpponentLabel(singleActiveGame)}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[length:var(--chess-hub-type-label)] font-semibold text-amber-100" aria-label="Current turn status">
                  Your turn
                </span>
                <p className={`text-[length:var(--chess-hub-type-body)] text-[var(--chess-hub-color-text-secondary)] ${prefersReducedMotion ? '' : 'motion-safe:animate-pulse'}`}>Last move {formatRelative(singleActiveGame.updated_at)}</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenGame(singleActiveGame.id)}
                className={`${mobilePrimaryActionClass} mt-3 w-full sm:w-auto`}
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
            <h2 id="chess-modes-title" className="font-display text-[length:var(--chess-hub-type-display)] leading-tight text-[var(--chess-hub-color-text-primary)]">Modes</h2>
            <p className="text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">Choose your focus</p>
          </div>

          <ul className="lg:hidden">
            {modeItems.map((mode) => {
              return (
                <li key={`mobile-${mode.key}`} className="mt-2 first:mt-0">
                  <button
                    type="button"
                    onClick={() => onOpenMode(mode.onClick)}
                    className="flex min-h-14 w-full items-center gap-[var(--chess-hub-space-3)] rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] text-left shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)] transition hover:bg-[var(--chess-hub-color-surface-soft)] active:bg-[var(--chess-hub-color-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)]"
                  >
                    <div data-testid="chess-mobile-mode-thumb" className="h-[var(--chess-mode-thumb)] w-[var(--chess-mode-thumb)] shrink-0 overflow-hidden rounded-lg bg-[var(--chess-hub-color-surface-soft)] ring-1 ring-white/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                      <img
                        src={mode.imageSrc}
                        alt={mode.imageAlt}
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-text-primary)]">{mode.title}</p>
                      <p className="truncate text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">{mode.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--chess-hub-color-text-secondary)]" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          {gotwEntry ? (
            <article className="mt-3 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] p-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" aria-labelledby="chess-gotw-title">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[length:var(--chess-hub-type-label)] font-semibold uppercase tracking-wide text-[var(--chess-hub-color-accent)]">Game of the Week</p>
                  <h3 id="chess-gotw-title" className="truncate font-display text-[length:var(--chess-hub-type-section)] text-[var(--chess-hub-color-text-primary)]">{gotwEntry.playersLabel}</h3>
                  <p className="truncate text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">{gotwEntry.event} · {gotwEntry.year}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenGotw(gotwEntry.slug)}
                  className={mobilePrimaryActionClass}
                >
                  Watch full game
                </button>
              </div>
              <p className="mt-2 line-clamp-2 text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">{gotwEntry.subtitle}</p>
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
            className="inline-flex min-h-11 items-center gap-2 text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-accent)] underline-offset-4 transition hover:text-[var(--chess-hub-color-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)]"
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