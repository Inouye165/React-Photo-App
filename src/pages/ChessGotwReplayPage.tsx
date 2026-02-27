import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeft, List, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import { getFenAtPly, getDestSquareAtPly, getGotwEntry, type ReplayPly } from '../data/chessGotw'
import { AnalysisTab, GotwChaptersRail, GotwCurrentInsightPanel, GotwBoardInsightPopup } from '../components/chess/gotw'

function formatRating(rating?: string | null): string {
  const normalized = (rating || '').trim()
  return normalized.length ? normalized : '—'
}

type TabKey = 'moves' | 'analysis' | 'story' | 'players'

const TAB_ORDER: TabKey[] = ['moves', 'analysis', 'story', 'players']

function getNextTab(current: TabKey, direction: 'prev' | 'next'): TabKey {
  const currentIndex = TAB_ORDER.indexOf(current)
  if (currentIndex < 0) return 'moves'
  if (direction === 'next') return TAB_ORDER[(currentIndex + 1) % TAB_ORDER.length]
  return TAB_ORDER[(currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length]
}

function clampBoardSize(value: number): number {
  return Math.max(280, Math.min(720, value))
}

type DetailsPanelProps = {
  entry: NonNullable<ReturnType<typeof getGotwEntry>>
  notationRows: Array<{ moveNumber: number; white: ReplayPly | null; black: ReplayPly | null }>
  currentPly: number
  activeTab: TabKey
  panelIdPrefix: string
  onChangeTab: (tab: TabKey) => void
  onSelectPly: (ply: number) => void
  movesListRef: React.RefObject<HTMLOListElement | null>
}

function GotwDetailsPanel({
  entry,
  notationRows,
  currentPly,
  activeTab,
  panelIdPrefix,
  onChangeTab,
  onSelectPly,
  movesListRef,
}: DetailsPanelProps): React.JSX.Element {
  const baseTabClass = 'min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg'

  const renderMoves = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] rounded-md border border-white/10 bg-chess-surfaceSoft px-2 py-2 text-xs font-bold uppercase tracking-wide text-chess-text/80">
        <span>#</span>
        <span className="border-l border-white/10 pl-3">White</span>
        <span className="border-l border-white/10 pl-3">Black</span>
      </div>
      <ol ref={movesListRef} data-testid="gotw-moves-list" className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
        {notationRows.map((row) => {
          const whiteCurrent = row.white?.ply === currentPly
          const blackCurrent = row.black?.ply === currentPly
          return (
            <li key={row.moveNumber} className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] border-b border-white/10 text-sm">
              <span className="flex min-h-11 items-center px-2 text-chess-text/75">{row.moveNumber}.</span>
              {row.white ? (
                <button
                  type="button"
                  data-gotw-ply={row.white.ply}
                  onClick={() => onSelectPly(row.white!.ply)}
                  aria-current={whiteCurrent ? 'step' : undefined}
                  className={`border-l border-white/10 px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg ${
                    whiteCurrent ? 'bg-chess-accent/20 font-semibold text-chess-accentSoft' : 'min-h-11 text-chess-text/85 hover:bg-white/5'
                  }`}
                >
                  {row.white.san}
                </button>
              ) : <span className="min-h-11 border-l border-white/10 px-3 py-2" aria-hidden="true" />}

              {row.black ? (
                <button
                  type="button"
                  data-gotw-ply={row.black.ply}
                  onClick={() => onSelectPly(row.black!.ply)}
                  aria-current={blackCurrent ? 'step' : undefined}
                  className={`border-l border-white/10 px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg ${
                    blackCurrent ? 'bg-chess-accent/20 font-semibold text-chess-accentSoft' : 'min-h-11 text-chess-text/85 hover:bg-white/5'
                  }`}
                >
                  {row.black.san}
                </button>
              ) : <span className="min-h-11 border-l border-white/10 px-3 py-2" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </div>
  )

  const renderStory = () => (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm leading-relaxed text-chess-text/85">
      <p>{entry.description}</p>
      {entry.narrative.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  )

  const renderPlayers = () => (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
      <article className="rounded-lg bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-chess-accentSoft/90">White</p>
        <h3 className="mt-1 font-display text-base text-chess-text">{entry.white.name}</h3>
        <p className="text-xs text-chess-text/75">Rating: {formatRating(entry.white.rating)}</p>
        <p className="mt-2 text-sm leading-relaxed text-chess-text/85">{entry.white.bio || 'Biography unavailable.'}</p>
      </article>
      <article className="rounded-lg bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
        <p className="text-xs font-semibold uppercase tracking-wide text-chess-accentSoft/90">Black</p>
        <h3 className="mt-1 font-display text-base text-chess-text">{entry.black.name}</h3>
        <p className="text-xs text-chess-text/75">Rating: {formatRating(entry.black.rating)}</p>
        <p className="mt-2 text-sm leading-relaxed text-chess-text/85">{entry.black.bio || 'Biography unavailable.'}</p>
      </article>
    </div>
  )

  const renderAnalysis = () => {
    const analysisByPly = entry.analysis?.byPly ?? {}
    return (
      <AnalysisTab
        moves={entry.moves}
        analysisByPly={analysisByPly}
        currentPly={currentPly}
        onSelectPly={onSelectPly}
      />
    )
  }

  const tabPanelId = `${panelIdPrefix}-panel-${activeTab}`

  return (
    <>
      <div
        role="tablist"
        aria-label="Game details tabs"
        className="grid grid-cols-4 gap-1.5"
      >
        {TAB_ORDER.map((tab) => {
          const selected = activeTab === tab
          const label = tab === 'moves' ? 'Moves' : tab === 'analysis' ? 'Analysis' : tab === 'story' ? 'Story' : 'Players'
          return (
            <button
              key={tab}
              id={`${panelIdPrefix}-tab-${tab}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${panelIdPrefix}-panel-${tab}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChangeTab(tab)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') {
                  event.preventDefault()
                  onChangeTab(getNextTab(activeTab, 'next'))
                } else if (event.key === 'ArrowLeft') {
                  event.preventDefault()
                  onChangeTab(getNextTab(activeTab, 'prev'))
                } else if (event.key === 'Home') {
                  event.preventDefault()
                  onChangeTab('moves')
                } else if (event.key === 'End') {
                  event.preventDefault()
                  onChangeTab(TAB_ORDER[TAB_ORDER.length - 1])
                }
              }}
              className={`${baseTabClass} ${selected ? 'bg-chess-accent text-black' : 'bg-chess-surfaceSoft text-chess-text hover:bg-white/10'}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <section
        id={tabPanelId}
        role="tabpanel"
        aria-labelledby={`${panelIdPrefix}-tab-${activeTab}`}
        className="mt-3 flex min-h-0 flex-1 flex-col"
      >
        {activeTab === 'moves' ? renderMoves() : null}
        {activeTab === 'analysis' ? renderAnalysis() : null}
        {activeTab === 'story' ? renderStory() : null}
        {activeTab === 'players' ? renderPlayers() : null}
      </section>
    </>
  )
}

export default function ChessGotwReplayPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { slug = '' } = useParams()
  const prefersReducedMotion = useReducedMotion()
  const entry = getGotwEntry(slug)

  const [currentPly, setCurrentPly] = useState(0)
  const [isPlaying, setIsPlaying] = useState(!prefersReducedMotion)
  const [boardSize, setBoardSize] = useState(560)
  const [desktopTab, setDesktopTab] = useState<TabKey>('moves')
  const [mobilePanelTab, setMobilePanelTab] = useState<TabKey>('moves')
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)
  const [isGuidedMode, setIsGuidedMode] = useState(false)
  const [lastPausedChapterPly, setLastPausedChapterPly] = useState<number | null>(null)

  const boardFrameRef = useRef<HTMLDivElement | null>(null)
  const desktopMovesListRef = useRef<HTMLOListElement | null>(null)
  const mobileMovesListRef = useRef<HTMLOListElement | null>(null)

  useEffect(() => {
    if (!entry) {
      navigate('/games/chess', { replace: true })
    }
  }, [entry, navigate])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isMobilePanelOpen) {
          setIsMobilePanelOpen(false)
          return
        }
        navigate('/games/chess')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMobilePanelOpen, navigate])

  useEffect(() => {
    setIsPlaying(!prefersReducedMotion)
  }, [prefersReducedMotion])

  // Popup visibility — dismissed per-ply, auto-reappears on next interesting ply
  const [popupDismissedPly, setPopupDismissedPly] = useState<number | null>(null)
  const showPopup = popupDismissedPly !== currentPly

  const handlePopupDismiss = useCallback(() => {
    setPopupDismissedPly(currentPly)
  }, [currentPly])

  const handlePopupPause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    const boardFrame = boardFrameRef.current
    if (!boardFrame) return undefined

    let frame = 0

    const updateSize = () => {
      frame = 0
      const available = Math.min(boardFrame.clientWidth - 16, boardFrame.clientHeight - 16)
      if (available <= 0) return

      const next = clampBoardSize(Math.floor(available))
      setBoardSize((prev) => (prev === next ? prev : next))
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize)
      return () => window.removeEventListener('resize', updateSize)
    }

    const observer = new ResizeObserver(() => {
      if (frame) return
      frame = window.requestAnimationFrame(updateSize)
    })

    observer.observe(boardFrame)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  const notationRows = useMemo(() => {
    if (!entry) return []

    const rows: Array<{ moveNumber: number; white: ReplayPly | null; black: ReplayPly | null }> = []
    for (let index = 0; index < entry.moves.length; index += 2) {
      rows.push({
        moveNumber: Math.floor(index / 2) + 1,
        white: entry.moves[index] ?? null,
        black: entry.moves[index + 1] ?? null,
      })
    }

    return rows
  }, [entry])

  const position = useMemo(() => {
    if (!entry) return 'start'
    return getFenAtPly(entry.moves, currentPly)
  }, [currentPly, entry])

  const currentMove = useMemo(() => {
    if (!entry || currentPly <= 0) return null
    return entry.moves[currentPly - 1] ?? null
  }, [currentPly, entry])

  const chapters = entry?.analysis?.chapters ?? []
  const chapterPlySet = useMemo(() => new Set(chapters.map((c) => c.ply)), [chapters])

  // Autoplay timer — 2s for standard moves, 4s for annotated plies
  useEffect(() => {
    if (!isPlaying || !entry || currentPly >= entry.moves.length) return undefined

    const BASE_STEP_MS = 2000
    const ANNOTATED_STEP_MS = 4000
    const isAnnotatedPly = Boolean(entry.analysis?.byPly[currentPly]) || chapterPlySet.has(currentPly)
    const delay = isAnnotatedPly ? ANNOTATED_STEP_MS : BASE_STEP_MS

    const timer = window.setTimeout(() => {
      setCurrentPly((prev) => Math.min(prev + 1, entry.moves.length))
    }, delay)

    return () => window.clearTimeout(timer)
  }, [currentPly, entry, isPlaying, chapterPlySet])

  const currentAnalysis = entry?.analysis?.byPly[currentPly]
  const activeChapter = chapters.find((c) => c.ply === currentPly) ?? null

  // Destination square for popup anchoring and highlight pulse
  const destSquare = useMemo(() => {
    if (!entry || currentPly <= 0) return null
    return getDestSquareAtPly(entry.moves, currentPly)
  }, [entry, currentPly])

  // Subtle outline pulse on the destination square for annotated moves
  const squareHighlightStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const isAnnotated = Boolean(currentAnalysis) || Boolean(activeChapter)
    if (!isAnnotated || !destSquare || prefersReducedMotion) return {}
    return {
      [destSquare]: {
        boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.45)',
        borderRadius: '2px',
        animation: 'gotw-square-pulse 700ms ease-out',
      },
    }
  }, [currentAnalysis, activeChapter, destSquare, prefersReducedMotion])

  // Raw comment text for the current move (empty string if none)
  const moveCommentText = (currentMove?.comment || '').trim()

  // Single-line summary for the compact "Now:" indicator on narrow layouts
  const insightOneLiner = currentAnalysis
    ? `${currentAnalysis.symbol} ${currentAnalysis.short}`
    : moveCommentText || null

  // Pause autoplay at chapter plies in guided mode (avoid re-pausing on scrub-back)
  useEffect(() => {
    if (!isGuidedMode || !isPlaying) return
    if (chapterPlySet.has(currentPly) && lastPausedChapterPly !== currentPly) {
      setIsPlaying(false)
      setLastPausedChapterPly(currentPly)
    }
  }, [currentPly, isGuidedMode, isPlaying, chapterPlySet, lastPausedChapterPly])

  const handleCoachContinue = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const handleJumpToPly = useCallback((ply: number) => {
    setCurrentPly(ply)
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (currentPly <= 0) return

    const desktopButton = desktopMovesListRef.current?.querySelector<HTMLButtonElement>(`button[data-gotw-ply="${currentPly}"]`)
    if (desktopButton) desktopButton.scrollIntoView({ block: 'nearest' })

    if (isMobilePanelOpen && mobilePanelTab === 'moves') {
      const mobileButton = mobileMovesListRef.current?.querySelector<HTMLButtonElement>(`button[data-gotw-ply="${currentPly}"]`)
      if (mobileButton) mobileButton.scrollIntoView({ block: 'nearest' })
    }
  }, [currentPly, isMobilePanelOpen, mobilePanelTab])

  if (!entry) return <></>

  const isAtStart = currentPly <= 0
  const isAtEnd = currentPly >= entry.moves.length

  return (
    <main data-testid="gotw-full-root" className="flex h-[100dvh] flex-col overflow-hidden bg-chess-bg text-chess-text">
      <header className="h-14 shrink-0 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between gap-3 px-4 sm:px-6 xl:px-10">
          <button
            type="button"
            onClick={() => navigate('/games/chess')}
            aria-label="Back to Chess Hub"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>

          <h1 className="min-w-0 truncate font-display text-base sm:text-lg lg:text-xl">{entry.subtitle}</h1>

          <button
            type="button"
            onClick={() => setIsMobilePanelOpen(true)}
            aria-label="Open details panel"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg lg:hidden"
          >
            <List size={16} aria-hidden="true" />
            Moves
          </button>

          <div className="hidden text-right lg:block">
            <p className="text-xs uppercase tracking-wide text-chess-text/70">{entry.event} · {entry.year}</p>
            <p className="text-sm font-semibold text-chess-accentSoft">{entry.result}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-cols-1 gap-3 px-4 pb-3 pt-3 sm:px-6 xl:px-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Board column: stable 3-row grid — header / board / controls. No variable-height content. */}
        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 overflow-hidden rounded-2xl bg-chess-surface p-2 ring-1 ring-white/10">
          <div className="rounded-xl bg-chess-surfaceSoft px-3 py-2 ring-1 ring-white/10">
            <p className="text-xs font-semibold uppercase tracking-wide text-chess-accentSoft">Game of the Week</p>
            <h2 className="mt-1 font-display text-lg text-chess-text">{entry.playersLabel}</h2>
            <p className="mt-1 text-sm text-chess-text/80" data-testid="gotw-player-white">White: {entry.white.name} ({formatRating(entry.white.rating)})</p>
            <p className="mt-0.5 text-sm text-chess-text/80" data-testid="gotw-player-black">Black: {entry.black.name} ({formatRating(entry.black.rating)})</p>
            {/* Compact "Now:" insight for mobile/narrow — clamped to 1 line, never changes tile height */}
            {insightOneLiner ? (
              <p className="mt-1 line-clamp-1 text-xs text-chess-text/60 xl:hidden" data-testid="gotw-now-line">
                <span className="font-semibold text-chess-accentSoft">Now:</span>{' '}{insightOneLiner}
              </p>
            ) : null}
          </div>

          <div
            ref={boardFrameRef}
            data-testid="gotw-board-frame"
            className="flex min-h-0 items-center justify-center rounded-xl bg-chess-surfaceSoft p-2 ring-1 ring-white/10"
            onPointerDown={(e) => {
              // Click outside popup → dismiss it
              if (!(e.target as HTMLElement).closest('[data-testid="gotw-board-insight-popup"]')) {
                handlePopupDismiss()
              }
            }}
          >
            {/* Board wrapper: relative + overflow-visible so popup can sit above/below without reflow */}
            <div data-testid="gotw-full-board" className="relative overflow-visible rounded-lg ring-1 ring-white/10" style={{ width: `${boardSize}px`, height: `${boardSize}px` }}>
              <Chessboard
                id="gotw-full-board"
                position={position}
                animationDuration={prefersReducedMotion ? 0 : 220}
                boardWidth={boardSize}
                areArrowsAllowed={false}
                customBoardStyle={{ borderRadius: '0.5rem', overflow: 'hidden' }}
                customSquareStyles={squareHighlightStyles}
              />
              {showPopup ? (
                <GotwBoardInsightPopup
                  currentPly={currentPly}
                  san={currentMove?.san}
                  analysis={currentAnalysis}
                  chapter={activeChapter ?? undefined}
                  isPlaying={isPlaying}
                  destSquare={destSquare}
                  boardSizePx={boardSize}
                  onRequestPause={handlePopupPause}
                  onDismiss={handlePopupDismiss}
                />
              ) : null}
            </div>
          </div>

          <div className="rounded-xl bg-chess-surfaceSoft p-2.5 ring-1 ring-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentPly((prev) => Math.max(0, prev - 1))
                  setIsPlaying(false)
                }}
                aria-label="Previous move"
                disabled={isAtStart}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                <SkipBack size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isAtEnd) {
                    setCurrentPly(0)
                    setIsPlaying(true)
                    return
                  }
                  setIsPlaying((prev) => !prev)
                }}
                aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-chess-accent text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                {isPlaying ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPly((prev) => Math.min(entry.moves.length, prev + 1))
                  setIsPlaying(false)
                }}
                aria-label="Next move"
                disabled={isAtEnd}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                <SkipForward size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPly(0)
                  setIsPlaying(!prefersReducedMotion)
                }}
                aria-label="Restart replay"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                Restart
              </button>
              <span data-testid="gotw-full-ply" className="ml-auto text-xs font-semibold text-chess-text/80">Ply {currentPly}/{entry.moves.length}</span>
            </div>

            {chapters.length > 0 ? (
              <div className="mt-2 flex items-center gap-2">
                <GotwChaptersRail
                  chapters={chapters}
                  currentPly={currentPly}
                  onJumpTo={handleJumpToPly}
                />
                <label className="ml-auto flex shrink-0 cursor-pointer items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-chess-text/50">Guided</span>
                  <input
                    type="checkbox"
                    checked={isGuidedMode}
                    onChange={(ev) => {
                      setIsGuidedMode(ev.target.checked)
                      if (!ev.target.checked) setLastPausedChapterPly(null)
                    }}
                    className="h-4 w-4 rounded accent-chess-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft"
                  />
                </label>
              </div>
            ) : null}

            <label htmlFor="gotw-replay-slider" className="mt-3 block text-xs font-semibold text-chess-text/80">Replay progress</label>
            <input
              id="gotw-replay-slider"
              type="range"
              min={0}
              max={entry.moves.length}
              value={currentPly}
              onChange={(event) => {
                setCurrentPly(Number(event.target.value))
                setIsPlaying(false)
              }}
              className="mt-1 w-full accent-chess-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
            />
          </div>
        </section>

        <aside data-testid="gotw-moves-rail" className="hidden min-h-0 flex-col gap-3 rounded-2xl bg-chess-surface p-3 ring-1 ring-white/10 lg:flex" aria-label="Game details" >
          {/* Insight panel — stable height, internal scroll, replaces old commentary article */}
          <GotwCurrentInsightPanel
            currentPly={currentPly}
            currentMoveSan={currentMove?.san ?? null}
            analysis={currentAnalysis}
            activeChapter={activeChapter}
            isGuidedMode={isGuidedMode}
            moveComment={moveCommentText}
            prefersReducedMotion={prefersReducedMotion}
            onCoachContinue={handleCoachContinue}
          />
          <div data-testid="gotw-side-panel" className="flex min-h-0 flex-1 flex-col">
            <GotwDetailsPanel
              entry={entry}
              notationRows={notationRows}
              currentPly={currentPly}
              activeTab={desktopTab}
              panelIdPrefix="gotw-desktop"
              onChangeTab={setDesktopTab}
              onSelectPly={(ply) => {
                setCurrentPly(ply)
                setIsPlaying(false)
              }}
              movesListRef={desktopMovesListRef}
            />
          </div>
        </aside>
      </div>

      {isMobilePanelOpen ? (
        <div className="fixed inset-0 z-[70] flex lg:hidden" aria-hidden={false}>
          <button
            type="button"
            aria-label="Close details panel"
            onClick={() => setIsMobilePanelOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="gotw-mobile-panel-title"
            data-testid="gotw-mobile-sheet"
            className="relative mt-auto flex h-[78dvh] w-full flex-col rounded-t-2xl border border-white/10 bg-chess-surface p-3 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="gotw-mobile-panel-title" className="font-display text-lg text-chess-text">Game details</h2>
              <button
                type="button"
                onClick={() => setIsMobilePanelOpen(false)}
                aria-label="Close details panel"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1">
              <GotwDetailsPanel
                entry={entry}
                notationRows={notationRows}
                currentPly={currentPly}
                activeTab={mobilePanelTab}
                panelIdPrefix="gotw-mobile"
                onChangeTab={setMobilePanelTab}
                onSelectPly={(ply) => {
                  setCurrentPly(ply)
                  setIsPlaying(false)
                }}
                movesListRef={mobileMovesListRef}
              />
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
