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
  isAvailable?: boolean
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
  const isE2eMode = typeof window !== 'undefined' && Boolean((window as Window & { __E2E_MODE__?: boolean }).__E2E_MODE__)

  const getE2eHeroState = (): 'auto' | 'active' | 'empty' | 'error' | 'loading' => {
    if (!isE2eMode || typeof window === 'undefined') return 'auto'
    const stored = window.localStorage.getItem('chessHubHeroState')
    if (stored === 'active' || stored === 'empty' || stored === 'error' || stored === 'loading') return stored
    return 'auto'
  }

  const getE2eGotwState = (): 'ready' | 'loading' | 'missing' | 'error' => {
    if (typeof window === 'undefined' || !isE2eMode) return 'ready'
    const stored = window.localStorage.getItem('chessHubGotwState')
    if (stored === 'loading' || stored === 'missing' || stored === 'error') return stored
    return 'ready'
  }

  const e2eHeroState = getE2eHeroState()
  const gotwState = getE2eGotwState()

  const gotwError = gotwState === 'error'
  const safeGotwEntry = React.useMemo(() => {
    if (gotwState === 'loading' || gotwState === 'missing' || gotwError) return null
    return getGotwEntry(DEFAULT_GOTW_SLUG)
  }, [gotwError, gotwState])

  const mobileModes = [modeItems[0], modeItems[1], modeItems[2]].filter((mode): mode is ModeItem => Boolean(mode))
  const hasActiveMatch = heroState === 'hasActiveGame' || heroState === 'hasMultipleActiveGames'
  const heroGame = singleActiveGame
  void activeGames
  const heroOpponentOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroOpponent')
    : null
  const heroLastMoveOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroLastMove')
    : null
  const heroTurnOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroTurn')
    : null

  const effectiveIsLoading = e2eHeroState === 'loading' ? true : isLoading
  const effectiveLoadError = e2eHeroState === 'error'
    ? 'Unable to load active game.'
    : (e2eHeroState === 'active' || e2eHeroState === 'empty' || e2eHeroState === 'loading')
      ? null
      : loadError
  const effectiveHasActiveMatch = e2eHeroState === 'active'
    ? true
    : e2eHeroState === 'empty'
      ? false
      : hasActiveMatch

  const getSafeOpponentLabel = (game: GameWithMembers | null): string => {
    if (heroOpponentOverride && heroOpponentOverride.trim()) return heroOpponentOverride.trim()
    if (!game) return 'Opponent'
    const value = getOpponentLabel(game)?.trim()
    if (!value || value.toLowerCase() === 'test') return 'Opponent'
    return value
  }

  const getSafeRelativeTime = (value: string | null | undefined): string => {
    if (heroLastMoveOverride !== null) {
      const normalized = heroLastMoveOverride.trim()
      return normalized || '—'
    }
    const formatted = formatRelative(value)?.trim()
    return formatted ? formatted : '—'
  }

  const getHeroTurnLabel = (game: GameWithMembers | null): string => {
    if (heroTurnOverride !== null) {
      const normalized = heroTurnOverride.trim()
      return normalized || 'Turn unknown'
    }
    if (!game?.current_turn) return 'Turn unknown'
    return 'Your turn'
  }

  const canContinueGame = Boolean(heroGame?.id) || e2eHeroState === 'active'

  const getMobileModeSubtitle = (title: string): string => {
    if (title === 'Play Computer') return 'Fast practice with instant feedback.'
    if (title === 'Play a Friend') return 'Create a match and take turns.'
    if (title === 'Learn Chess') return 'Guided lessons and stories.'
    return 'Pick a mode and start playing.'
  }
  const mobileDesignTokens = {
    '--chess-hub-space-1': '4px',
    '--chess-hub-space-2': '8px',
    '--chess-hub-space-3': '12px',
    '--chess-hub-space-4': '16px',
    '--chess-hub-space-5': '20px',
    '--chess-hub-space-6': '24px',
    '--chess-hub-type-display': '1.375rem',
    '--chess-hub-type-section': '1.125rem',
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

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--chess-hub-space-3)] px-[var(--chess-hub-space-4)] pb-[var(--chess-hub-space-3)] pt-[var(--chess-hub-space-2)] sm:px-5 lg:gap-7 lg:px-6 lg:pt-6" style={mobileDesignTokens}>
        {effectiveIsLoading ? (
          <section data-testid="chess-mobile-hero-loading" className="rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" aria-label="Loading hero">
            <div className="h-4 w-40 rounded bg-chess-surfaceSoft/80" aria-hidden="true" />
            <div className="mt-2 h-3 w-28 rounded bg-chess-surfaceSoft/70" aria-hidden="true" />
            <div className="mt-1 h-3 w-36 rounded bg-chess-surfaceSoft/70" aria-hidden="true" />
            <button
              type="button"
              disabled
              aria-disabled="true"
              className={`${mobilePrimaryActionClass} mt-2 w-full sm:w-auto`}
            >
              Continue game
            </button>
          </section>
        ) : effectiveLoadError ? (
          <section data-testid="chess-mobile-hero-error" className="rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" role="status" aria-live="polite">
            <p className="text-[length:var(--chess-hub-type-body)] text-red-100">Unable to load active game.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex min-h-11 items-center justify-center rounded-[var(--chess-hub-radius-button)] border border-white/20 px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-text-primary)] transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mobileModes[0]) {
                    onOpenMode(mobileModes[0].onClick)
                  }
                }}
                className={mobilePrimaryActionClass}
              >
                Play Computer
              </button>
            </div>
          </section>
        ) : (
          <section
            data-testid="chess-mobile-hero-card"
            className="rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-3)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]"
            aria-labelledby="chess-hero-title"
          >
            <h2 id="chess-hero-title" className="font-display text-[length:var(--chess-hub-type-display)] leading-tight text-[var(--chess-hub-color-text-primary)]">
              {effectiveHasActiveMatch ? 'Continue your game' : 'Start a game'}
            </h2>

            {effectiveHasActiveMatch ? (
              <>
                <p className="mt-0.5 line-clamp-1 break-words text-[length:var(--chess-hub-type-body)] font-semibold text-[var(--chess-hub-color-text-primary)]">vs {getSafeOpponentLabel(heroGame)}</p>
                <p className={`mt-0.5 text-[length:var(--chess-hub-type-body)] text-[var(--chess-hub-color-text-secondary)] ${prefersReducedMotion ? '' : 'motion-safe:animate-pulse'}`}>
                  {getHeroTurnLabel(heroGame)} • Last move {getSafeRelativeTime(heroGame?.updated_at)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (heroGame?.id) {
                      onOpenGame(heroGame.id)
                    }
                  }}
                  disabled={!canContinueGame}
                  aria-disabled={!canContinueGame}
                  className={`${mobilePrimaryActionClass} mt-2 w-full sm:w-auto`}
                >
                  Continue game
                </button>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-[length:var(--chess-hub-type-body)] text-[var(--chess-hub-color-text-secondary)]">Pick a mode to begin.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (mobileModes[0] && mobileModes[0].isAvailable !== false) {
                      onOpenMode(mobileModes[0].onClick)
                    }
                  }}
                  disabled={mobileModes[0]?.isAvailable === false}
                  aria-disabled={mobileModes[0]?.isAvailable === false}
                  className={`${mobilePrimaryActionClass} mt-2 w-full sm:w-auto`}
                >
                  Play Computer
                </button>
              </>
            )}
          </section>
        )}

        <section aria-label="Game modes" className="pt-[var(--chess-hub-space-1)]">

          <ul className="space-y-2 lg:hidden">
            {mobileModes.map((mode) => {
              const isDisabled = mode.isAvailable === false
              return (
                <li key={`mobile-${mode.key}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDisabled) {
                        onOpenMode(mode.onClick)
                      }
                    }}
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    className={`flex min-h-14 w-full items-center gap-[var(--chess-hub-space-2)] rounded-[var(--chess-hub-radius-card)] px-[var(--chess-hub-space-2)] py-[var(--chess-hub-space-2)] text-left shadow-[var(--chess-hub-shadow)] ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)] ${
                      isDisabled
                        ? 'cursor-not-allowed bg-[var(--chess-hub-color-surface-soft)] text-[var(--chess-hub-color-text-secondary)] opacity-70 ring-[var(--chess-hub-color-border)]'
                        : 'bg-[var(--chess-hub-color-surface)] ring-[var(--chess-hub-color-border)] hover:bg-[var(--chess-hub-color-surface-soft)] active:bg-[var(--chess-hub-color-surface-soft)]'
                    }`}
                  >
                    <div data-testid="chess-mobile-mode-thumb" className="h-[var(--chess-mode-thumb)] w-[var(--chess-mode-thumb)] shrink-0 overflow-hidden rounded-lg bg-[var(--chess-hub-color-surface-soft)] ring-1 ring-white/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
                      <img
                        src={mode.imageSrc}
                        alt={mode.imageAlt}
                        className="h-full w-full object-cover object-center"
                        loading="lazy"
                        decoding="async"
                        width={56}
                        height={56}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[length:var(--chess-hub-type-body)] font-semibold leading-tight text-[var(--chess-hub-color-text-primary)]">{mode.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[length:var(--chess-hub-type-label)] leading-tight text-[var(--chess-hub-color-text-secondary)]">{getMobileModeSubtitle(mode.title)}</p>
                    </div>
                    <ChevronRight size={16} className="text-[var(--chess-hub-color-text-secondary)]" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>

          {gotwState === 'loading' ? (
            <article className="mt-2 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" aria-label="Loading game of the week">
              <div className="h-3 w-32 rounded bg-chess-surfaceSoft/70" aria-hidden="true" />
              <div className="mt-2 h-3 w-48 rounded bg-chess-surfaceSoft/70" aria-hidden="true" />
              <button
                type="button"
                disabled
                aria-disabled="true"
                className={`${mobilePrimaryActionClass} mt-2 w-full sm:w-auto`}
              >
                Watch full game
              </button>
            </article>
          ) : safeGotwEntry ? (
            <article className="mt-2 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" aria-labelledby="chess-gotw-title">
              <div className="min-w-0">
                <div className="min-w-0">
                  <p className="text-[length:var(--chess-hub-type-label)] font-semibold uppercase tracking-wide text-[var(--chess-hub-color-accent)]">Game of the Week</p>
                  <h3 id="chess-gotw-title" className="line-clamp-1 break-words font-display text-[length:var(--chess-hub-type-body)] font-semibold leading-tight text-[var(--chess-hub-color-text-primary)]">{safeGotwEntry.playersLabel}</h3>
                  <p className="line-clamp-1 break-words text-[length:var(--chess-hub-type-label)] leading-tight text-[var(--chess-hub-color-text-secondary)]">{safeGotwEntry.event} · {safeGotwEntry.year}</p>
                </div>
              </div>
              <p className="mt-1 line-clamp-1 break-words text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">{safeGotwEntry.subtitle}</p>
              <button
                type="button"
                onClick={() => onOpenGotw(safeGotwEntry.slug)}
                className={`${mobilePrimaryActionClass} mt-2 w-full sm:w-auto`}
              >
                Watch full game
              </button>
            </article>
          ) : (
            <article className="mt-2 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" role="status" aria-live="polite">
              <p className="text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">
                {gotwState === 'error' ? 'Unable to load game of the week.' : 'Game of the week is unavailable.'}
              </p>
            </article>
          )}

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

        <section aria-label="Match history" className="pt-0.5">
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