import React, { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Chessboard } from 'react-chessboard'
import { useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { DEFAULT_GOTW_SLUG, getFenAtPly, getGotwEntry } from '../data/chessGotw'

const clampTwoLines: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

export default function GreatestGamesCard(): React.JSX.Element {
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const entry = getGotwEntry(DEFAULT_GOTW_SLUG)
  const [previewPly, setPreviewPly] = useState(entry?.previewRange.startPly ?? 0)

  useEffect(() => {
    if (!entry) return
    setPreviewPly(entry.previewRange.startPly)
  }, [entry])

  useEffect(() => {
    if (!entry || prefersReducedMotion) return undefined

    const timer = window.setInterval(() => {
      setPreviewPly((prev) => {
        if (prev >= entry.previewRange.endPly) return entry.previewRange.startPly
        return prev + 1
      })
    }, 1400)

    return () => window.clearInterval(timer)
  }, [entry, prefersReducedMotion])

  const position = useMemo(() => {
    if (!entry) return 'start'
    return getFenAtPly(entry.moves, previewPly)
  }, [entry, previewPly])

  if (!entry) return <></>

  return (
    <section
      data-testid="gotw-card"
      className="grid h-full min-h-0 grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] gap-4 rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10"
      aria-labelledby="greatest-games-heading"
    >
      <div className="min-h-0">
        <span className="mb-2 inline-flex w-fit rounded-full bg-chess-accent/20 px-3 py-1 text-xs font-bold tracking-wide text-chess-accentSoft ring-1 ring-chess-accent/40">
          Game of the Week
        </span>
        <h2 id="greatest-games-heading" className="font-display text-[20px] leading-tight text-chess-text">{entry.title}</h2>
        <p className="mt-1 text-[15px] font-semibold text-chess-accentSoft" style={clampTwoLines}>{entry.subtitle}</p>

        <div className="mt-3 rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
          <p className="text-[14px] font-medium leading-relaxed text-chess-text/95" style={clampTwoLines}>{entry.description}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-chess-text/90">
            <span className="rounded-md bg-white/5 px-2 py-1">Event: {entry.event}</span>
            <span className="rounded-md bg-white/5 px-2 py-1">Year: {entry.year}</span>
            <span className="rounded-md bg-white/5 px-2 py-1">Players: {entry.playersLabel}</span>
            <span className="rounded-md bg-white/5 px-2 py-1">Result: {entry.result}</span>
          </div>
        </div>

        <button
          type="button"
          data-testid="gotw-watch-cta"
          onClick={() => navigate(`/games/chess/gotw/${entry.slug}`)}
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-chess-accent px-4 py-2 text-sm font-semibold text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
        >
          Watch full replay
          <ArrowUpRight size={16} aria-hidden="true" />
        </button>

        <p data-testid="gotw-preview-ply" className="mt-2 text-xs font-semibold text-chess-text/75">Preview ply {previewPly}</p>
      </div>

      <div data-testid="gotw-preview-board" className="flex min-h-0 items-center justify-center rounded-xl bg-chess-surfaceSoft p-2 ring-1 ring-white/10">
        <div className="overflow-hidden rounded-lg ring-1 ring-white/10">
          <Chessboard
            id="greatest-games-preview-board"
            position={position}
            areArrowsAllowed={false}
            animationDuration={prefersReducedMotion ? 0 : 180}
            boardWidth={260}
            customBoardStyle={{ borderRadius: '0.5rem', overflow: 'hidden' }}
          />
        </div>
      </div>
    </section>
  )
}
