import React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { TutorAnalysisResult, TutorStepAnalysis, WhiteboardTutorAnalysisSource } from '../../types/whiteboard'
import type { WhiteboardBoardFrame } from './types'
import type { TutorLessonMessage } from './tabs/AITutorTab'
import {
  projectTutorRegionToBoardFrame,
  resolveTutorOverlayFocus,
} from './tutorOverlayGeometry'

type TutorOverlayProps = {
  analysisResult: TutorAnalysisResult | null
  activeStepId: string | null
  analysisSource?: WhiteboardTutorAnalysisSource | null
  lessonMessage?: TutorLessonMessage | null
  boardFrame: WhiteboardBoardFrame | null
  visible: boolean
  reducedMotion: boolean
  onToggleVisible: () => void
  onSelectStep: (stepId: string) => void
  allowedRegionIds?: string[]
  showVisibilityToggle?: boolean
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
  analysisSource = null,
  lessonMessage = null,
  boardFrame,
  visible,
  reducedMotion,
  onToggleVisible,
  onSelectStep,
  allowedRegionIds,
  showVisibilityToggle = true,
}) => {
  void analysisSource
  void lessonMessage
  void reducedMotion
  const { activeStep, visibleRegionIds, showRegionIndices } = resolveTutorOverlayFocus(analysisResult, activeStepId)
  const guidedSteps = analysisResult?.guidedSolutionSteps?.length ? analysisResult.guidedSolutionSteps : (analysisResult?.steps ?? [])
  const activeStepNumber = typeof activeStep?.index === 'number' ? activeStep.index + 1 : null
  const filteredRegionIds = allowedRegionIds?.length
    ? visibleRegionIds.filter((regionId) => allowedRegionIds.includes(regionId))
    : visibleRegionIds

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {showVisibilityToggle ? (
        <div className="pointer-events-auto absolute right-4 top-4">
          <button
            type="button"
            onClick={onToggleVisible}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(17,17,17,0.76)] px-4 py-2 text-[13px] font-semibold text-[#F0EDE8] shadow-[0_14px_28px_rgba(0,0,0,0.22)] backdrop-blur"
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {visible ? 'Hide board markers' : 'Show board markers'}
            {visible && activeStepNumber ? (
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-white/85">
                Step {activeStepNumber}
              </span>
            ) : null}
          </button>
        </div>
      ) : null}

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
              {analysisResult.regions.filter((region) => filteredRegionIds.includes(region.id)).map((region, index) => {
                const isActive = activeStep?.regionId === region.id
                const frame = projectTutorRegionToBoardFrame(boardFrame, region)
                const visibleRegionIndex = filteredRegionIds.indexOf(region.id)
                const stepForRegion = guidedSteps.find((step) => step.regionId === region.id)
                  ?? analysisResult.steps.find((step) => step.regionId === region.id)

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
                      boxShadow: isActive ? `0 0 0 3px ${getStatusTone(stepForRegion ?? activeStep ?? analysisResult.steps[0]).replace('0.9', '0.18')}, 0 16px 28px rgba(0,0,0,0.16)` : '0 8px 20px rgba(0,0,0,0.12)',
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
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default TutorOverlay