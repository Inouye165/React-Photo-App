import React from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import type { TutorAnalysisResult, TutorStepAnalysis } from '../../types/whiteboard'
import type { WhiteboardBoardFrame } from './types'
import type { TutorLessonMessage } from './tabs/AITutorTab'
import {
  projectTutorRegionToBoardFrame,
  resolveTutorCalloutPosition,
  resolveTutorOverlayFocus,
} from './tutorOverlayGeometry'

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
  const { activeStep, activeRegion, visibleRegionIds, showRegionIndices } = resolveTutorOverlayFocus(analysisResult, activeStepId)
  const activeRegionFrame = boardFrame && activeRegion ? projectTutorRegionToBoardFrame(boardFrame, activeRegion) : null
  const calloutPosition = boardFrame && activeRegionFrame ? resolveTutorCalloutPosition(boardFrame, activeRegionFrame) : null
  const activeStepTitle = activeStep?.shortLabel?.trim() || ''
  const activeStepBody = activeStep?.kidFriendlyExplanation?.trim() || ''
  const activeStepCorrection = activeStep?.correction?.trim() || ''
  const hasActiveGuidance = Boolean(activeStepTitle || activeStepBody || activeStepCorrection)

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
          {boardFrame ? (
            <div
              className="absolute"
              style={{
                left: boardFrame.left,
                top: boardFrame.top,
                width: boardFrame.width,
                height: boardFrame.height,
              }}
            >
              {lessonMessage ? (
                <motion.aside
                  initial={reducedMotion ? { opacity: 1 } : { opacity: 0, x: -8, y: 8 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto absolute left-4 top-4 z-10 max-w-[360px] rounded-[18px] border border-white/10 bg-[rgba(12,12,14,0.92)] px-4 py-3 text-[#F0EDE8] shadow-[0_26px_44px_rgba(0,0,0,0.3)] backdrop-blur"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Lesson Tracker</div>
                  <div className="mt-1 text-[16px] font-semibold text-[#F0EDE8]">{lessonMessage.title}</div>
                  <p className="mt-2 whitespace-pre-line text-[14px] leading-[1.6] text-[#F0EDE8]">{lessonMessage.body}</p>
                </motion.aside>
              ) : null}

              {analysisResult.regions.filter((region) => visibleRegionIds.includes(region.id)).map((region, index) => {
                const isActive = activeStep?.regionId === region.id
                const frame = projectTutorRegionToBoardFrame(boardFrame, region)
                const visibleRegionIndex = visibleRegionIds.indexOf(region.id)
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
                      left: frame.left,
                      top: frame.top,
                      width: frame.width,
                      height: frame.height,
                      borderColor: isActive ? getStatusTone(stepForRegion ?? analysisResult.steps[index] ?? activeStep ?? analysisResult.steps[0]) : 'rgba(255,255,255,0.2)',
                      boxShadow: isActive ? `0 0 0 3px ${getStatusTone(stepForRegion ?? activeStep ?? analysisResult.steps[0]).replace('0.9', '0.18')}, 0 24px 40px rgba(0,0,0,0.18)` : '0 10px 24px rgba(0,0,0,0.14)',
                      background: isActive ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    {showRegionIndices ? (
                      <span
                        className="absolute -left-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(17,17,17,0.92)] text-[12px] font-bold text-white shadow-lg"
                        style={{ color: getStatusTone(stepForRegion ?? activeStep ?? analysisResult.steps[0]) }}
                      >
                        {visibleRegionIndex + 1}
                      </span>
                    ) : null}
                    {isActive && stepForRegion?.status !== 'correct' ? (
                      <span className="absolute -right-2 -bottom-2 h-6 w-6 rounded-full border-2 border-dashed border-amber-300/80 bg-amber-400/10" aria-hidden="true" />
                    ) : null}
                  </button>
                )
              })}

              {activeStep && hasActiveGuidance ? (
                <motion.div
                  initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98, y: 8 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  transition={reducedMotion ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-auto absolute max-w-[340px] rounded-[18px] border border-white/10 bg-[rgba(12,12,14,0.9)] px-4 py-3 text-[#F0EDE8] shadow-[0_26px_44px_rgba(0,0,0,0.3)] backdrop-blur"
                  style={activeRegionFrame && calloutPosition
                    ? {
                        left: calloutPosition.left,
                        top: calloutPosition.top,
                      }
                    : {
                        left: '50%',
                        bottom: 32,
                        transform: 'translateX(-50%)',
                      }}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c6b4a4]">Tutor Focus</div>
                  {activeStepTitle ? <div className="mt-1 text-[16px] font-semibold text-[#F0EDE8]">{activeStepTitle}</div> : null}
                  {activeStepBody ? <p className="mt-2 text-[14px] leading-[1.6] text-[#F0EDE8]">{activeStepBody}</p> : null}
                  {activeStepCorrection ? <p className="mt-2 text-[13px] leading-[1.6] text-amber-200">What to do instead: {activeStepCorrection}</p> : null}
                </motion.div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default TutorOverlay