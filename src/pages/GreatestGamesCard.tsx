import React, { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { useReducedMotion } from 'framer-motion'

export type ReplayPly = { san: string; comment?: string; ply: number }

const replayPlies: ReplayPly[] = [
  { ply: 1, san: 'Nf3' },
  { ply: 2, san: 'Nf6' },
  { ply: 3, san: 'c4' },
  { ply: 4, san: 'g6' },
  { ply: 5, san: 'Nc3' },
  { ply: 6, san: 'Bg7' },
  { ply: 7, san: 'd4' },
  { ply: 8, san: 'O-O' },
  { ply: 9, san: 'Bf4' },
  { ply: 10, san: 'd5' },
  { ply: 11, san: 'Qb3' },
  { ply: 12, san: 'dxc4' },
  { ply: 13, san: 'Qxc4' },
  { ply: 14, san: 'c6' },
  { ply: 15, san: 'e4' },
  { ply: 16, san: 'Nbd7' },
  { ply: 17, san: 'Rd1' },
  { ply: 18, san: 'Nb6' },
  { ply: 19, san: 'Qc5' },
  { ply: 20, san: 'Bg4' },
  {
    ply: 21,
    san: 'Bg5',
    comment: 'A slight inaccuracy. Byrne moves the same piece twice while his king is still in the center. Fischer immediately looks to punish this lack of development.',
  },
  {
    ply: 22,
    san: 'Na4',
    comment: 'Brilliant thunderbolt. Fischer offers a knight. If 23 Nxa4 then ...Nxe4 attacks queen + bishop and Black regains with advantage.',
  },
  { ply: 23, san: 'Qa3' },
  { ply: 24, san: 'Nxc3' },
  { ply: 25, san: 'bxc3' },
  {
    ply: 26,
    san: 'Nxe4',
    comment: 'Fischer ignores the hanging knight and focuses on the center.',
  },
  { ply: 27, san: 'Bxe7' },
  { ply: 28, san: 'Qb6' },
  { ply: 29, san: 'Bc4' },
  {
    ply: 30,
    san: 'Nxc3',
    comment: 'Another sacrifice. Fischer is systematically dismantling the white center.',
  },
  { ply: 31, san: 'Bc5' },
  { ply: 32, san: 'Rfe8+' },
  {
    ply: 33,
    san: 'Kf1',
    comment: 'Blunder. Byrne should have played Be2 to block. King move loses castling and traps rook.',
  },
  {
    ply: 34,
    san: 'Be6',
    comment: 'The queen-sacrifice masterstroke. Fischer offers his Queen; if taken, Black wins by force.',
  },
  {
    ply: 35,
    san: 'Bxb6',
    comment: 'Byrne accepts the challenge, likely not seeing the windmill.',
  },
  { ply: 36, san: 'Bxc4+' },
  { ply: 37, san: 'Kg1' },
  { ply: 38, san: 'Ne2+' },
  { ply: 39, san: 'Kf1' },
  { ply: 40, san: 'Nxd4+' },
  { ply: 41, san: 'Kg1' },
  { ply: 42, san: 'Ne2+' },
  { ply: 43, san: 'Kf1' },
  { ply: 44, san: 'Nc3+' },
  { ply: 45, san: 'Kg1' },
  {
    ply: 46,
    san: 'axb6',
    comment: 'Windmill ends. Fischer has won material and is about to convert decisively.',
  },
  { ply: 47, san: 'Qb4' },
  { ply: 48, san: 'Ra4' },
  { ply: 49, san: 'Qxb6' },
  {
    ply: 50,
    san: 'Nxd1',
    comment: 'Material note: Black has two rooks, two bishops, and a knight for the queen — massive practical advantage.',
  },
  { ply: 51, san: 'h3' },
  { ply: 52, san: 'Rxa2' },
  { ply: 53, san: 'Kh2' },
  { ply: 54, san: 'Nxf2' },
  { ply: 55, san: 'Re1' },
  { ply: 56, san: 'Rxe1' },
  { ply: 57, san: 'Qd8+' },
  { ply: 58, san: 'Bf8' },
  { ply: 59, san: 'Nxe1' },
  { ply: 60, san: 'Bd5' },
  { ply: 61, san: 'Nf3' },
  { ply: 62, san: 'Ne4' },
  { ply: 63, san: 'Qb8' },
  { ply: 64, san: 'b5' },
  { ply: 65, san: 'h4' },
  { ply: 66, san: 'h5' },
  { ply: 67, san: 'Ne5' },
  { ply: 68, san: 'Kg7' },
  { ply: 69, san: 'Kg1' },
  { ply: 70, san: 'Bc5+' },
  { ply: 71, san: 'Kf1' },
  { ply: 72, san: 'Ng3+' },
  { ply: 73, san: 'Ke1' },
  { ply: 74, san: 'Bb4+' },
  { ply: 75, san: 'Kd1' },
  { ply: 76, san: 'Bb3+' },
  { ply: 77, san: 'Kc1' },
  { ply: 78, san: 'Ne2+' },
  { ply: 79, san: 'Kb1' },
  { ply: 80, san: 'Nc3+' },
  { ply: 81, san: 'Kc1' },
  { ply: 82, san: 'Rc2#' },
]

const INTRO = 'The Game of the Century is widely studied because it shows a young Bobby Fischer (playing Black) intuitively grasping complex positional sacrifices that even the world’s top players at the time struggled to calculate.'

function toFen(plyCount: number): string {
  const game = new Chess()
  for (let index = 0; index < plyCount; index += 1) {
    const moveResult = game.move(replayPlies[index].san)
    if (!moveResult) break
  }
  return game.fen()
}

export default function GreatestGamesCard(): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion()
  const [currentPly, setCurrentPly] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!prefersReducedMotion) {
      setIsPlaying(true)
      return
    }

    setIsPlaying(false)
  }, [prefersReducedMotion])

  useEffect(() => {
    if (!isPlaying || currentPly >= replayPlies.length) return undefined

    const timer = window.setTimeout(() => {
      setCurrentPly((prev) => Math.min(prev + 1, replayPlies.length))
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [currentPly, isPlaying])

  const position = useMemo(() => toFen(currentPly), [currentPly])
  const currentMove = replayPlies[Math.max(0, currentPly - 1)]
  const commentPly = currentMove?.comment ? currentMove : null

  const handlePlayPause = () => {
    if (currentPly >= replayPlies.length) {
      setCurrentPly(0)
      setIsPlaying(true)
      return
    }

    setIsPlaying((prev) => !prev)
  }

  const handleRestart = () => {
    setCurrentPly(0)
    setIsPlaying(!prefersReducedMotion)
  }

  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-chess-surface p-4 shadow-chess-card ring-1 ring-white/10" aria-labelledby="greatest-games-heading">
      <h2 id="greatest-games-heading" className="font-display text-2xl text-chess-text">Greatest Games of All Time</h2>
      <p className="mt-1 text-sm font-semibold text-chess-accentSoft">The Game of the Century — Byrne vs Fischer (1956)</p>

      <div className="mt-3 rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
        <p className="text-sm font-medium leading-relaxed text-chess-text/95">{INTRO}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-chess-text/90">
          <span className="rounded-md bg-white/5 px-2 py-1">Event: Rosenwald Memorial</span>
          <span className="rounded-md bg-white/5 px-2 py-1">Year: 1956</span>
          <span className="rounded-md bg-white/5 px-2 py-1">Players: Byrne vs Fischer</span>
          <span className="rounded-md bg-white/5 px-2 py-1">Result: 0–1</span>
        </div>
        <span className="mt-3 inline-flex rounded-full bg-chess-accent/20 px-3 py-1 text-xs font-bold text-chess-accentSoft">Why it matters</span>
      </div>

      <div className="mt-4 rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10">
        <Chessboard
          id="greatest-games-board"
          position={position}
          areArrowsAllowed={false}
          animationDuration={prefersReducedMotion ? 0 : 250}
          boardWidth={320}
          customBoardStyle={{ borderRadius: '0.75rem', overflow: 'hidden' }}
        />
      </div>

      <div className="mt-3 rounded-xl bg-chess-surfaceSoft/80 p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlayPause}
            aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-chess-accent px-3 py-2 text-xs font-semibold text-black transition hover:bg-chess-accentSoft active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={handleRestart}
            aria-label="Restart replay"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-chess-text transition hover:bg-white/10 active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft focus-visible:ring-offset-2 focus-visible:ring-offset-chess-bg"
          >
            Restart
          </button>
          <p className="ml-auto text-xs font-semibold text-chess-muted">Ply {currentPly}/{replayPlies.length}</p>
        </div>
        <label htmlFor="greatest-games-scrubber" className="mt-3 block text-xs font-semibold text-chess-muted">Replay progress</label>
        <input
          id="greatest-games-scrubber"
          type="range"
          min={0}
          max={replayPlies.length}
          value={currentPly}
          onChange={(event) => {
            setCurrentPly(Number(event.target.value))
            setIsPlaying(false)
          }}
          aria-label="Replay move scrubber"
          className="mt-1 w-full accent-chess-accent"
        />
      </div>

      <div className="mt-3 min-h-[64px] rounded-xl bg-chess-surfaceSoft p-3 ring-1 ring-white/10" role="status" aria-live="polite">
        {commentPly ? (
          <p className="text-sm font-semibold leading-relaxed text-chess-text">Move {commentPly.ply}: {commentPly.comment}</p>
        ) : (
          <p className="text-sm font-medium text-chess-muted">Replay comments appear at key tactical moments.</p>
        )}
      </div>
    </section>
  )
}
