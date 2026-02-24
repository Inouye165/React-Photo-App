import React from 'react'
import { Chessboard } from 'react-chessboard'
import type { TutorBoardRenderState } from './types'

const classes = {
  shell: 'rounded-2xl border border-slate-700 bg-slate-900/70 p-3 sm:p-4',
  boardWrap: 'mx-auto w-full max-w-[620px]',
  note: 'mt-3 text-xs text-slate-400',
} as const

export default function TutorBoard({
  boardState,
  boardWidth,
  customPieces,
}: {
  boardState: TutorBoardRenderState
  boardWidth: number
  customPieces: Record<string, (props: { squareWidth: number; isDragging: boolean }) => React.JSX.Element>
}): React.JSX.Element {
  return (
    <section data-testid="tutor-board" className={classes.shell}>
      <div className={classes.boardWrap}>
        <div className="relative">
          <Chessboard
            id="lesson-main-studio"
            position={boardState.position}
            boardWidth={boardWidth}
            customPieces={customPieces}
            showBoardNotation
            arePiecesDraggable={false}
            customArrows={boardState.customArrows}
            customSquareStyles={boardState.customSquareStyles}
            animationDuration={500}
          />
          {boardState.notationOverlay.show ? (
            <>
              <svg className="pointer-events-none absolute left-0 top-0 h-full w-full" viewBox="0 0 250 250" aria-hidden="true">
                <line x1={boardState.notationOverlay.targetX} y1={250} x2={boardState.notationOverlay.targetX} y2={boardState.notationOverlay.targetY} stroke="rgba(99,102,241,0.85)" strokeWidth="2" />
                <line x1={0} y1={boardState.notationOverlay.targetY} x2={boardState.notationOverlay.targetX} y2={boardState.notationOverlay.targetY} stroke="rgba(99,102,241,0.85)" strokeWidth="2" />
                <circle cx={boardState.notationOverlay.targetX} cy={boardState.notationOverlay.targetY} r="5" fill="rgba(99,102,241,0.9)" />
              </svg>
              {boardState.notationOverlay.moveLabel ? (
                <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-white/30 bg-slate-900/70 px-3 py-1 text-sm font-semibold text-white">
                  {boardState.notationOverlay.moveLabel}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
      <p className={classes.note}>Board preview is read-only in tutor mode.</p>
    </section>
  )
}
