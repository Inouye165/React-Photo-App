import React, { useState } from 'react'
import type { GotwChapter } from '../../../data/chessGotw.types'

type GotwCoachPromptProps = {
  chapter: GotwChapter
  onContinue: () => void
}

export default function GotwCoachPrompt({
  chapter,
  onContinue,
}: GotwCoachPromptProps): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)

  const hasChoices = chapter.choices && chapter.choices.length > 0

  const handleChoiceClick = (san: string) => {
    setSelectedChoice(san)
    setRevealed(true)
  }

  return (
    <div
      data-testid="gotw-coach-prompt"
      className="rounded-xl border border-chess-accent/30 bg-chess-surfaceSoft p-3 ring-1 ring-white/10"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-chess-accent">
        Key Moment
      </p>
      <h4 className="mt-0.5 font-display text-sm text-chess-text">
        {chapter.title}
      </h4>

      {chapter.prompt ? (
        <p className="mt-1.5 text-xs leading-relaxed text-chess-text/80">
          {chapter.prompt}
        </p>
      ) : null}

      {/* Multiple-choice section */}
      {hasChoices && !revealed ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chapter.choices!.map((c) => (
            <button
              key={c.san}
              type="button"
              onClick={() => handleChoiceClick(c.san)}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-chess-text transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft"
            >
              {c.san}
            </button>
          ))}
        </div>
      ) : null}

      {/* Choice feedback */}
      {hasChoices && revealed && selectedChoice ? (
        <p className="mt-2 text-xs font-semibold">
          {chapter.choices!.find((c) => c.san === selectedChoice)?.correct ? (
            <span className="text-green-400">Correct! {selectedChoice}</span>
          ) : (
            <span className="text-orange-400">
              Not quite — {selectedChoice}. The best move was{' '}
              {chapter.choices!.find((c) => c.correct)?.san ?? '...'}.
            </span>
          )}
        </p>
      ) : null}

      {/* Reveal button (non-choice mode or after choice) */}
      {!hasChoices && !revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-2 rounded-lg bg-chess-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-chess-accentSoft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft"
        >
          Reveal
        </button>
      ) : null}

      {/* Reveal text */}
      {revealed && chapter.revealText ? (
        <p className="mt-2 text-xs leading-relaxed text-chess-text/85">
          {chapter.revealText}
        </p>
      ) : null}

      {/* Continue button */}
      {revealed ? (
        <button
          type="button"
          onClick={onContinue}
          className="mt-2 rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-chess-text transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chess-accentSoft"
        >
          Continue
        </button>
      ) : null}
    </div>
  )
}
