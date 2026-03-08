import React from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import type { TutorAnalysisResult, TutorStepAnalysis } from '../../types/whiteboard'
import type { WhiteboardBoardFrame } from './types'
import type { TutorLessonMessage } from './tabs/AITutorTab'

type TutorOverlayProps = {
  analysisResult: TutorAnalysisResult | null
  activeStepId: string | null
  lessonMessage?: TutorLessonMessage | null
  boardFrame: WhiteboardBoardFrame | null
  visible: boolean
  reducedMotion: boolean
  onToggleVisible: () => void
  onSelectStep: (stepId: string) => void
}

function getStatusTone(step: TutorStepAnalysis): string {
  switch (step.status) {
    case 'correct':
      return 'rgba(74, 222, 128, 0.85)'
    case 'incorrect':
      return 'rgba(248, 113, 113, 0.9)'
    case 'partial':
      return 'rgba(251, 191, 36, 0.9)'
    default:
      return 'rgba(125, 211, 252, 0.9)'
  }
}

function getActiveStep(analysisResult: TutorAnalysisResult | null, activeStepId: string | null): TutorStepAnalysis | null {
  if (!analysisResult || !activeStepId) return analysisResult?.steps[0] ?? null
  return analysisResult.steps.find((step) => step.id === activeStepId) ?? analysisResult.steps[0] ?? null
}

const TutorOverlay: React.FC<TutorOverlayProps> = ({
  analysisResult,
  activeStepId,
  lessonMessage = null,
  boardFrame,
  visible,
  reducedMotion,
  onToggleVisible,
  onSelectStep,
}) => {
  const activeStep = getActiveStep(analysisResult, activeStepId)
  const activeRegion = activeStep?.regionId ? analysisResult?.regions.find((region) => region.id === activeStep.regionId) ?? null : null

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute right-4 top-4">
        <button
          type="button"
          onClick={onToggleVisible}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(17,17,17,0.8)] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] shadow-[0_16px_30px_rgba(0,0,0,0.28)] backdrop-blur"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {visible ? 'Hide tutor overlay' : 'Show tutor overlay'}
        </button>
      </div>

      {visible && analysisResult ? (
        <div className="absolute inset-0">
          {lessonMessage ? (
            <motion.aside
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8, y: 8 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto absolute left-4 top-20 z-10 max-w-[360px] rounded-[18px] border border-white/10 bg-[rgba(12,12,14,0.92)] px-4 py-3 text-[#F0EDE8] shadow-[0_26px_44px_rgba(0,0,0,0.3)] backdrop-blur"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Lesson Tracker</div>
              <div className="mt-1 text-[16px] font-semibold text-[#F0EDE8]">{lessonMessage.title}</div>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.6] text-[#F0EDE8]">{lessonMessage.body}</p>
            </motion.aside>
          ) : null}

          {boardFrame && analysisResult.regions.map((region, index) => {
            const isActive = activeStep?.regionId === region.id
            const left = boardFrame.left + region.x * boardFrame.width
            const top = boardFrame.top + region.y * boardFrame.height
            const width = region.width * boardFrame.width
            const height = region.height * boardFrame.height
            const stepForRegion = analysisResult.steps.find((step) => step.regionId === region.id)

            return (
              <button
                key={region.id}
                type="button"
                onClick={() => stepForRegion && onSelectStep(stepForRegion.id)}
                className="pointer-events-auto absolute rounded-[18px] border text-left transition"
                data-testid={`tutor-region-${region.id}`}
                data-active={isActive ? 'true' : 'false'}
                style={{
                  left,
                  top,
                  width,
                  height,
                  borderColor: isActive ? getStatusTone(stepForRegion ?? analysisResult.steps[index] ?? activeStep ?? analysisResult.steps[0]) : 'rgba(255,255,255,0.14)',
                  boxShadow: isActive ? `0 0 0 3px ${getStatusTone(stepForRegion ?? activeStep ?? analysisResult.steps[0]).replace('0.9', '0.18')}, 0 24px 40px rgba(0,0,0,0.18)` : 'none',
                  background: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <span
                  className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(17,17,17,0.92)] text-[12px] font-bold text-white shadow-lg"
                  style={{ color: getStatusTone(stepForRegion ?? activeStep ?? analysisResult.steps[0]) }}
                >
                  {(stepForRegion?.index ?? index) + 1}
                </span>
                {isActive && stepForRegion?.status !== 'correct' ? (
                  <span className="absolute -right-2 -bottom-2 h-6 w-6 rounded-full border-2 border-dashed border-amber-300/80 bg-amber-400/10" aria-hidden="true" />
                ) : null}
              </button>
            )
          })}

          {activeStep ? (
            <motion.div
              initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 8 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-auto absolute max-w-[340px] rounded-[18px] border border-white/10 bg-[rgba(12,12,14,0.9)] px-4 py-3 text-[#F0EDE8] shadow-[0_26px_44px_rgba(0,0,0,0.3)] backdrop-blur"
              style={activeRegion && boardFrame
                ? {
                    left: Math.min(boardFrame.left + activeRegion.x * boardFrame.width + activeRegion.width * boardFrame.width + 16, window.innerWidth ? window.innerWidth - 380 : boardFrame.left + boardFrame.width - 24),
                    top: Math.max(boardFrame.top + activeRegion.y * boardFrame.height - 8, 88),
                  }
                : {
                    left: '50%',
                    bottom: 32,
                    transform: 'translateX(-50%)',
                  }}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Tutor Focus</div>
              <div className="mt-1 text-[16px] font-semibold text-[#F0EDE8]">{activeStep.shortLabel}</div>
              <p className="mt-2 text-[14px] leading-[1.6] text-[#F0EDE8]">{activeStep.kidFriendlyExplanation}</p>
              {activeStep.correction ? <p className="mt-2 text-[13px] leading-[1.6] text-amber-200">What to do instead: {activeStep.correction}</p> : null}
              {!activeRegion ? <p className="mt-2 text-[12px] text-[#c6b4a4]">No precise region was detected, so the tutor is using center-screen caption mode.</p> : null}
            </motion.div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default TutorOverlay