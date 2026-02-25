import React from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import type { GameWithMembers } from '../api/games'
import SocialHubCard from './SocialHubCard'
import GreatestGamesCard from './GreatestGamesCard'

type ModeItem = {
  key: string
  title: string
  description: string
  chips: string[]
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
}: ChessHubDesktopLayoutProps): React.JSX.Element {
  const recentItems = historyGames.slice(0, 3)

  return (
    <>
      <header className="sticky top-0 z-50 h-14 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-8" aria-label="Chess header navigation">
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
          <div className="w-10" aria-hidden="true" />
        </nav>
      </header>

      <div className="mx-auto grid h-[calc(100dvh-3.5rem)] w-full max-w-7xl grid-cols-1 gap-4 overflow-hidden px-8 pb-4 pt-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1.1fr)]">
        <section className="flex min-h-0 flex-col gap-4 overflow-hidden" aria-labelledby="desktop-action-zone-title">
          <div className="rounded-2xl bg-chess-surface px-5 py-4 shadow-chess-card ring-1 ring-white/10">
            <h2 id="desktop-action-zone-title" className="font-display text-3xl text-chess-text">Choose a mode</h2>
            <p className="mt-1 text-sm font-medium text-chess-muted">Start quickly, keep streaks alive, and continue where you left off.</p>
          </div>

          <div className="grid min-h-0 grid-cols-2 gap-4">
            <article className="rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10">
              <h3 className="font-display text-xl text-chess-text">Continue</h3>
              {singleActiveGame ? (
                <div className="mt-2 rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
                  <p className="text-sm font-semibold text-chess-text">vs {getOpponentLabel(singleActiveGame)}</p>
                  <p className="mt-1 text-xs font-medium text-chess-muted">Last move {formatRelative(singleActiveGame.updated_at)}</p>
                  <button
                    type="button"
                    onClick={() => onOpenGame(singleActiveGame.id)}
                    className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-chess-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-chess-accentSoft active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    Resume
                  </button>
                </div>
              ) : (
                <div className="mt-2 rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
                  <p className="text-sm font-semibold text-chess-text">No active match yet</p>
                  <p className="mt-1 text-xs font-medium text-chess-muted">Start a new game and your progress will show here.</p>
                </div>
              )}
            </article>

            <article className="flex min-h-0 flex-col rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10">
              <h3 className="font-display text-xl text-chess-text">Recent</h3>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
                {recentItems.length ? (
                  <ul className="space-y-2">
                    {recentItems.map((game) => (
                      <li key={game.id}>
                        <button
                          type="button"
                          onClick={() => onOpenGame(game.id)}
                          className="w-full rounded-lg bg-chess-surfaceSoft p-3 text-left ring-1 ring-white/10 transition hover:bg-chess-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                        >
                          <p className="text-sm font-semibold text-chess-text">vs {getOpponentLabel(game)}</p>
                          <p className="mt-1 text-xs font-medium text-chess-muted">{isInviteStatus(game.status) ? 'Invitation' : 'In progress'} · {formatRelative(game.updated_at)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm font-medium text-chess-muted">Your latest matches and lessons will appear here.</p>
                )}
              </div>
            </article>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-3 gap-4" aria-label="Start a game">
            {modeItems.map((mode) => {
              const Icon = mode.icon
              const primaryStyle = mode.key === 'tutorials'
                ? 'bg-chess-accentSoft text-black hover:bg-chess-accent'
                : 'bg-chess-accent text-black hover:bg-chess-accentSoft'

              return (
                <article key={mode.key} className="group flex min-h-0 flex-col rounded-2xl bg-chess-surface p-5 shadow-chess-card ring-1 ring-white/10 transition duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:ring-chess-accentSoft/40 focus-within:ring-2 focus-within:ring-chess-accentSoft">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-chess-surfaceSoft p-2 ring-1 ring-white/10">
                      <Icon size={20} className="text-chess-accentSoft" aria-hidden />
                    </div>
                    <h3 className="font-display text-2xl text-chess-text">{mode.title}</h3>
                  </div>
                  <p className="mt-3 text-sm font-medium leading-relaxed text-chess-text/90">{mode.description}</p>
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
                    className={`mt-auto inline-flex min-h-11 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg ${primaryStyle}`}
                  >
                    {mode.title}
                  </button>
                </article>
              )
            })}
          </div>

          {(isLoading || loadError || activeGames.length) ? (
            <div className="rounded-2xl bg-chess-surface p-3 ring-1 ring-white/10" aria-live="polite">
              {isLoading ? (
                <p className="text-sm font-medium text-chess-muted">Loading your active matches…</p>
              ) : loadError ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-red-100">{loadError}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-chess-text transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium text-chess-muted">{activeGames.length} active match{activeGames.length === 1 ? '' : 'es'} in progress.</p>
              )}
            </div>
          ) : null}
        </section>

        <aside className="grid min-h-0 grid-rows-[minmax(0,0.95fr)_minmax(0,1.25fr)] gap-4 overflow-hidden" aria-label="Engagement zone">
          <SocialHubCard />
          <GreatestGamesCard />
        </aside>
      </div>
    </>
  )
}