import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { useReducedMotion } from 'framer-motion'
import { ArrowLeft, List, ListX, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { getFenAtPly, getGotwEntry, type ReplayPly } from '../data/chessGotw'

function formatRating(rating?: string | null): string {
  const normalized = (rating || '').trim()
  return normalized.length ? normalized : '—'
}

export default function ChessGotwReplayPage(): React.JSX.Element {
  const navigate = useNavigate()
  const { slug = '' } = useParams()
  const prefersReducedMotion = useReducedMotion()
  const entry = getGotwEntry(slug)
  const [currentPly, setCurrentPly] = useState(0)
  const [isPlaying, setIsPlaying] = useState(!prefersReducedMotion)
  const [showMoves, setShowMoves] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : true))
  const [boardSize, setBoardSize] = useState(560)
  const boardFrameRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!entry) {
      navigate('/games/chess', { replace: true })
    }
  }, [entry, navigate])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        navigate('/games/chess')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  useEffect(() => {
    setIsPlaying(!prefersReducedMotion)
  }, [prefersReducedMotion])

  useEffect(() => {
    if (!isPlaying || !entry || currentPly >= entry.moves.length) return undefined

    const timer = window.setTimeout(() => {
      setCurrentPly((prev) => Math.min(prev + 1, entry.moves.length))
    }, 1400)

    return () => window.clearTimeout(timer)
  }, [currentPly, entry, isPlaying])

  useEffect(() => {
    const boardFrame = boardFrameRef.current
    if (!boardFrame) return undefined

    let frame = 0

    const updateSize = () => {
      frame = 0
      const next = Math.floor(Math.min(boardFrame.clientWidth - 16, boardFrame.clientHeight - 16))
      if (next > 0) {
        setBoardSize((prev) => (prev === next ? prev : next))
      }
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
  }, [showMoves])

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

  if (!entry) return <></>

  const isAtStart = currentPly <= 0
  const isAtEnd = currentPly >= entry.moves.length

  return (
    <main data-testid="gotw-full-root" className="flex h-[100dvh] flex-col overflow-hidden bg-chess-bg text-chess-text">
      <header className="h-14 shrink-0 border-b border-white/10 bg-chess-bg/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1680px] items-center justify-between px-6 xl:px-10">
          <button
            type="button"
            onClick={() => navigate('/games/chess')}
            aria-label="Back to Chess Hub"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </button>

          <h1 className="font-display text-xl">{entry.subtitle}</h1>

          <button
            type="button"
            onClick={() => setShowMoves((prev) => !prev)}
            aria-label={showMoves ? 'Hide move list' : 'Show move list'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            {showMoves ? <ListX size={16} aria-hidden="true" /> : <List size={16} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1680px] grid-cols-1 gap-4 px-6 pb-4 pt-4 xl:px-10" style={{ gridTemplateColumns: showMoves ? 'minmax(0,1fr) 240px' : 'minmax(0,1fr)' }}>
        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 rounded-2xl bg-chess-surface p-3 ring-1 ring-white/10">
          <div data-testid="gotw-player-black" style={{ width: `${boardSize}px` }} className="justify-self-center rounded-lg bg-chess-surfaceSoft px-3 py-2 text-sm font-semibold ring-1 ring-white/10">
            Black: {entry.black.name} ({formatRating(entry.black.rating)})
          </div>

          <div ref={boardFrameRef} className="flex min-h-0 items-center justify-center rounded-xl bg-chess-surfaceSoft p-2 ring-1 ring-white/10">
            <div data-testid="gotw-full-board" className="overflow-hidden rounded-lg ring-1 ring-white/10" style={{ width: `${boardSize}px`, height: `${boardSize}px` }}>
              <Chessboard
                id="gotw-full-board"
                position={position}
                animationDuration={prefersReducedMotion ? 0 : 220}
                boardWidth={boardSize}
                areArrowsAllowed={false}
                customBoardStyle={{ borderRadius: '0.5rem', overflow: 'hidden' }}
              />
            </div>
          </div>

          <div data-testid="gotw-player-white" style={{ width: `${boardSize}px` }} className="justify-self-center rounded-lg bg-chess-surfaceSoft px-3 py-2 text-sm font-semibold ring-1 ring-white/10">
            White: {entry.white.name} ({formatRating(entry.white.rating)})
          </div>

          <div className="justify-self-center rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10" style={{ width: `${boardSize}px` }}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentPly((prev) => Math.max(0, prev - 1))
                  setIsPlaying(false)
                }}
                aria-label="Previous move"
                disabled={isAtStart}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                <SkipBack size={16} aria-hidden="true" />
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-chess-accent text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPly((prev) => Math.min(entry.moves.length, prev + 1))
                  setIsPlaying(false)
                }}
                aria-label="Next move"
                disabled={isAtEnd}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                <SkipForward size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentPly(0)
                  setIsPlaying(!prefersReducedMotion)
                }}
                aria-label="Restart replay"
                className="ml-2 inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
              >
                Restart
              </button>
              <span data-testid="gotw-full-ply" className="ml-auto text-xs font-semibold text-chess-text/80">Ply {currentPly}/{entry.moves.length}</span>
            </div>

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

        {showMoves ? (
          <aside data-testid="gotw-moves-rail" className="flex min-h-0 flex-col rounded-2xl bg-chess-surface p-2 ring-1 ring-white/10">
            <div className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] rounded-md border border-white/10 bg-chess-surfaceSoft px-1 py-1 text-[11px] font-bold text-chess-text/85">
              <span>#</span>
              <span className="border-l border-white/10 pl-2 text-center">W</span>
              <span className="border-l border-white/10 pl-2 text-center">B</span>
            </div>

            <ol className="mt-1 min-h-0 flex-1 overflow-y-auto">
              {notationRows.map((row) => {
                const whiteCurrent = row.white?.ply === currentPly
                const blackCurrent = row.black?.ply === currentPly
                return (
                  <li key={row.moveNumber} className="grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] border-b border-white/10 text-xs">
                    <span className="flex items-center px-1.5 py-1.5 text-chess-text/80">{row.moveNumber}.</span>
                    {row.white ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPly(row.white!.ply)
                          setIsPlaying(false)
                        }}
                        aria-current={whiteCurrent ? 'step' : undefined}
                        className={`border-l border-white/10 px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg ${
                          whiteCurrent ? 'bg-chess-accent/15 text-chess-accentSoft' : 'text-chess-text/82 hover:bg-white/5'
                        }`}
                      >
                        {row.white.san}
                      </button>
                    ) : <span className="border-l border-white/10 px-2 py-1.5" aria-hidden="true" />}

                    {row.black ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPly(row.black!.ply)
                          setIsPlaying(false)
                        }}
                        aria-current={blackCurrent ? 'step' : undefined}
                        className={`border-l border-white/10 px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-1 focus-visible:ring-offset-chess-bg ${
                          blackCurrent ? 'bg-chess-accent/15 text-chess-accentSoft' : 'text-chess-text/82 hover:bg-white/5'
                        }`}
                      >
                        {row.black.san}
                      </button>
                    ) : <span className="border-l border-white/10 px-2 py-1.5" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </aside>
        ) : null}
      </div>
    </main>
  )
}
