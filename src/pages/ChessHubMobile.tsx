import React from 'react'
import { ArrowLeft, ChevronRight, History, UserCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Chessboard } from 'react-chessboard'
import { DEFAULT_GOTW_SLUG, getFenAtPly, getGotwEntry } from '../data/chessGotw'
import { fetchGameMembers, type GameMemberProfile, type GameWithMembers } from '../api/games'
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
  currentUserId: string | null
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
  currentUserId,
  accountDisplayName,
  accountInitials,
  onOpenSignIn,
}: ChessHubMobileProps): React.JSX.Element {
  const debugPrefix = '[ChessHubMobile]'
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
  const [gotwBoardWidth, setGotwBoardWidth] = React.useState<number>(280)
  const [gotwPreviewPly, setGotwPreviewPly] = React.useState<number>(0)
  const [heroMembersFromGame, setHeroMembersFromGame] = React.useState<GameMemberProfile[]>([])
  const gotwBoardContainerRef = React.useRef<HTMLDivElement | null>(null)
  const heroOpponentOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroOpponent')
    : null
  const heroLastMoveOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroLastMove')
    : null
  const heroTurnOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroTurn')
    : null
  const heroAvatarOverride = isE2eMode && typeof window !== 'undefined'
    ? window.localStorage.getItem('chessHubHeroAvatar')
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

  const gotwStartPly = React.useMemo(() => {
    if (!safeGotwEntry) return 0
    return Math.max(1, safeGotwEntry.moves.length - 4)
  }, [safeGotwEntry])

  const gotwEndPly = React.useMemo(() => {
    if (!safeGotwEntry) return 0
    return safeGotwEntry.moves.length
  }, [safeGotwEntry])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const updateBoardWidth = () => {
      const rectWidth = gotwBoardContainerRef.current?.getBoundingClientRect().width ?? 0
      const widthFromContainer = Math.floor(rectWidth)
      if (!widthFromContainer) {
        const fallback = Math.max(126, Math.min(window.innerWidth - 104, Math.floor(window.innerHeight * 0.24), 240))
        setGotwBoardWidth(fallback)
        return
      }
      setGotwBoardWidth(Math.max(126, widthFromContainer))
    }

    updateBoardWidth()

    const observer = new ResizeObserver(() => {
      updateBoardWidth()
    })

    if (gotwBoardContainerRef.current) {
      observer.observe(gotwBoardContainerRef.current)
    }

    window.addEventListener('resize', updateBoardWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateBoardWidth)
    }
  }, [safeGotwEntry])

  React.useEffect(() => {
    if (!safeGotwEntry) {
      setGotwPreviewPly(0)
      return
    }
    setGotwPreviewPly(prefersReducedMotion ? gotwEndPly : gotwStartPly)
  }, [gotwEndPly, gotwStartPly, prefersReducedMotion, safeGotwEntry])

  React.useEffect(() => {
    if (!safeGotwEntry || prefersReducedMotion || gotwStartPly <= 0 || gotwEndPly <= 0) return undefined

    const timer = window.setInterval(() => {
      setGotwPreviewPly((prev) => {
        if (prev >= gotwEndPly || prev < gotwStartPly) return gotwStartPly
        return prev + 1
      })
    }, 850)

    return () => window.clearInterval(timer)
  }, [gotwEndPly, gotwStartPly, prefersReducedMotion, safeGotwEntry])

  const gotwPosition = React.useMemo(() => {
    if (!safeGotwEntry) return 'start'
    const effectivePly = gotwPreviewPly > 0 ? gotwPreviewPly : gotwEndPly
    return getFenAtPly(safeGotwEntry.moves, effectivePly)
  }, [gotwEndPly, gotwPreviewPly, safeGotwEntry])

  const isLikelyComputerGame = (game: GameWithMembers | null): boolean => {
    if (!game) return false
    const typeLabel = (game.type || '').toLowerCase()
    if (typeLabel.includes('local') || typeLabel.includes('computer') || game.created_by === 'stockfish') return true
    return game.members.length <= 1
  }

  const isPlaceholderLabel = (value: string): boolean => {
    const normalized = value.trim().toLowerCase()
    return normalized === 'opponent'
      || normalized === 'unknown player'
      || normalized === 'player'
  }

  const hasMeaningfulLabel = (value: string | null | undefined): value is string => {
    if (typeof value !== 'string') return false
    const normalized = value.trim()
    if (!normalized) return false
    return !isPlaceholderLabel(normalized)
  }

  const normalizedAccountDisplayName = accountDisplayName.trim().toLowerCase()

  const activeHeroMembers = heroMembersFromGame.length ? heroMembersFromGame : (heroGame?.members ?? [])

  const opponentMember = React.useMemo(() => {
    if (!activeHeroMembers.length) return null
    if (currentUserId) {
      return activeHeroMembers.find((member) => member.user_id !== currentUserId) ?? null
    }
    const nonSelfByName = activeHeroMembers.find((member) => {
      const username = member.username?.trim().toLowerCase()
      return Boolean(username && username !== normalizedAccountDisplayName)
    })
    if (nonSelfByName) return nonSelfByName

    const bestNamed = activeHeroMembers.find((member) => hasMeaningfulLabel(member.username))
    if (bestNamed) return bestNamed

    return activeHeroMembers[0] ?? null
  }, [activeHeroMembers, currentUserId, normalizedAccountDisplayName])

  const getSafeOpponentLabel = (game: GameWithMembers | null): string => {
    if (heroOpponentOverride !== null) {
      const overridden = heroOpponentOverride.trim()
      if (hasMeaningfulLabel(overridden)) {
        return overridden
      }
      return isLikelyComputerGame(game) ? 'Computer' : 'Player'
    }

    const memberUsername = opponentMember?.username?.trim()
    if (hasMeaningfulLabel(memberUsername)) {
      return memberUsername
    }

    if (!game) return 'Player'
    const value = getOpponentLabel(game)?.trim()
    if (hasMeaningfulLabel(value)) {
      return value
    }

    return isLikelyComputerGame(game) ? 'Computer' : 'Player'
  }

  const getAvatarInitials = (name: string): string => {
    const cleaned = name.trim()
    if (!cleaned) return ''
    const parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    return cleaned.slice(0, 2).toUpperCase()
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
  const shouldShowContinueTile = effectiveHasActiveMatch && canContinueGame

  React.useEffect(() => {
    console.info(debugPrefix, 'Mobile chess hub state', {
      heroState,
      effectiveHasActiveMatch,
      heroGameId: heroGame?.id ?? null,
      currentUserId,
      accountDisplayName,
      isE2eMode,
    })
  }, [accountDisplayName, currentUserId, debugPrefix, effectiveHasActiveMatch, heroGame?.id, heroState, isE2eMode])

  React.useEffect(() => {
    if (!heroGame?.id || !shouldShowContinueTile) {
      setHeroMembersFromGame([])
      return
    }

    console.info(debugPrefix, 'Fetching members for continue tile', {
      gameId: heroGame.id,
      currentUserId,
      heroMembersFromListCount: heroGame.members.length,
    })

    let isCancelled = false
    void fetchGameMembers(heroGame.id)
      .then((rows) => {
        if (!isCancelled) {
          setHeroMembersFromGame(Array.isArray(rows) ? rows : [])
          console.info(debugPrefix, 'Fetched game members for continue tile', {
            gameId: heroGame.id,
            count: Array.isArray(rows) ? rows.length : 0,
            usernames: Array.isArray(rows) ? rows.map((row) => row.username ?? null) : [],
          })
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          console.warn(debugPrefix, 'Failed fetching members for continue tile; preserving list snapshot', {
            gameId: heroGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      })

    return () => {
      isCancelled = true
    }
  }, [currentUserId, heroGame?.id, shouldShowContinueTile])

  const heroOpponentLabel = getSafeOpponentLabel(heroGame)
  const heroOpponentInitials = getAvatarInitials(heroOpponentLabel)

  React.useEffect(() => {
    if (!shouldShowContinueTile) return
    console.info(debugPrefix, 'Continue tile opponent resolution', {
      gameId: heroGame?.id ?? null,
      currentUserId,
      accountDisplayName,
      listMembers: heroGame?.members?.map((member) => ({ user_id: member.user_id, username: member.username ?? null })) ?? [],
      fetchedMembers: heroMembersFromGame.map((member) => ({ user_id: member.user_id, username: member.username ?? null })),
      resolvedOpponent: heroOpponentLabel,
      usedFetchedMembers: heroMembersFromGame.length > 0,
    })
  }, [accountDisplayName, currentUserId, heroGame?.id, heroGame?.members, heroMembersFromGame, heroOpponentLabel, shouldShowContinueTile])

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

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-[var(--chess-hub-space-2)] px-[var(--chess-hub-space-4)] pb-[var(--chess-hub-space-1)] pt-[var(--chess-hub-space-1)] sm:px-5 lg:gap-7 lg:px-6 lg:pt-6" style={mobileDesignTokens}>
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
          shouldShowContinueTile ? (
            <section
              data-testid="chess-mobile-continue-tile"
              className="rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-2)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]"
              aria-labelledby="chess-hero-title"
            >
              <h2 id="chess-hero-title" className="flex items-center gap-2 text-[length:var(--chess-hub-type-body)] font-semibold leading-tight text-[var(--chess-hub-color-text-primary)]">
                <span className="line-clamp-1 break-words">Continue your game with {heroOpponentLabel}</span>
                <span
                  data-testid="chess-mobile-continue-avatar"
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--chess-hub-color-surface-soft)] text-[11px] font-bold uppercase text-[var(--chess-hub-color-text-primary)] ring-1 ring-white/20"
                >
                  {opponentMember?.avatar_url ? (
                    <img
                      src={opponentMember.avatar_url}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : heroAvatarOverride && heroAvatarOverride.trim() ? (
                    <img
                      src={heroAvatarOverride.trim()}
                      alt=""
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : heroOpponentInitials ? <span>{heroOpponentInitials}</span> : <UserCircle2 size={16} />}
                </span>
              </h2>

              <p className={`mt-1 text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)] ${prefersReducedMotion ? '' : 'motion-safe:animate-pulse'}`}>
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
                className={`${mobilePrimaryActionClass} mt-2 w-full`}
              >
                Continue game
              </button>
            </section>
          ) : null
        )}

        <section aria-label="Game modes" className="pt-0">

          <ul className="space-y-1.5 lg:hidden">
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
                    className={`flex min-h-12 w-full items-center gap-[var(--chess-hub-space-2)] rounded-[var(--chess-hub-radius-card)] px-[var(--chess-hub-space-2)] py-[var(--chess-hub-space-1)] text-left shadow-[var(--chess-hub-shadow)] ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chess-hub-color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--chess-hub-color-bg)] ${
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
            <article className="mt-1 rounded-[var(--chess-hub-radius-card)] bg-[var(--chess-hub-color-surface)] px-[var(--chess-hub-space-3)] py-[var(--chess-hub-space-1)] shadow-[var(--chess-hub-shadow)] ring-1 ring-[var(--chess-hub-color-border)]" aria-labelledby="chess-gotw-title">
              <div className="min-w-0">
                <div className="min-w-0">
                  <p className="text-[length:var(--chess-hub-type-label)] font-semibold uppercase tracking-wide text-[var(--chess-hub-color-accent)]">Game of the Week</p>
                  <h3 id="chess-gotw-title" className="line-clamp-1 break-words font-display text-[length:var(--chess-hub-type-body)] font-semibold leading-tight text-[var(--chess-hub-color-text-primary)]">{safeGotwEntry.playersLabel}</h3>
                  <p className="line-clamp-1 break-words text-[length:var(--chess-hub-type-label)] leading-tight text-[var(--chess-hub-color-text-secondary)]">{safeGotwEntry.event} · {safeGotwEntry.year}</p>
                </div>
              </div>
              <p className="mt-1 line-clamp-1 break-words text-[length:var(--chess-hub-type-label)] text-[var(--chess-hub-color-text-secondary)]">{safeGotwEntry.subtitle}</p>

              <div
                data-testid="gotw-mobile-preview-board"
                ref={gotwBoardContainerRef}
                className="mt-1 mx-auto aspect-square w-full max-w-[clamp(126px,26vh,260px)] overflow-hidden rounded-lg bg-[var(--chess-hub-color-surface-soft)] ring-1 ring-white/10"
                aria-label="Game of the Week board preview"
              >
                <Chessboard
                  id="chess-mobile-gotw-preview-board"
                  position={gotwPosition}
                  areArrowsAllowed={false}
                  arePiecesDraggable={false}
                  animationDuration={prefersReducedMotion ? 0 : 180}
                  boardWidth={gotwBoardWidth}
                  customBoardStyle={{ borderRadius: '0.5rem', overflow: 'hidden' }}
                />
              </div>

              <button
                type="button"
                onClick={() => onOpenGotw(safeGotwEntry.slug)}
                className={`${mobilePrimaryActionClass} mt-2 w-full`}
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