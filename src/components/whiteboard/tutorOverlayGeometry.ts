import type { TutorAnalysisResult, TutorDetectedRegion, TutorGuidedSolutionStep, TutorStepAnalysis } from '../../types/whiteboard'
import type { WhiteboardBoardFrame } from './types'

export type TutorOverlayRegionFrame = {
  left: number
  top: number
  width: number
  height: number
}

export type TutorOverlayCalloutPosition = {
  left: number
  top: number
}

export type TutorOverlayFocusState = {
  activeStep: TutorGuidedSolutionStep | null
  activeRegion: TutorDetectedRegion | null
  visibleRegionIds: string[]
  showRegionIndices: boolean
}

const QUICK_ASSIST_REGION_LIMIT = 2
const CALLOUT_GAP = 16
const CALLOUT_MAX_WIDTH = 340
const CALLOUT_MIN_HEIGHT = 160

function isIssueStep(step: TutorStepAnalysis): boolean {
  return step.status !== 'correct'
}

function getIssuePriority(step: TutorStepAnalysis): number {
  switch (step.status) {
    case 'incorrect':
      return 0
    case 'partial':
      return 1
    case 'warning':
      return 2
    default:
      return 3
  }
}

function findRegionById(analysisResult: TutorAnalysisResult, regionId: string | undefined): TutorDetectedRegion | null {
  if (!regionId) return null
  return analysisResult.regions.find((region) => region.id === regionId) ?? null
}

function getObservedSteps(analysisResult: TutorAnalysisResult): TutorStepAnalysis[] {
  return analysisResult.observedSteps && analysisResult.observedSteps.length > 0 ? analysisResult.observedSteps : analysisResult.steps
}

function getGuidedSteps(analysisResult: TutorAnalysisResult): TutorGuidedSolutionStep[] {
  return analysisResult.guidedSolutionSteps && analysisResult.guidedSolutionSteps.length > 0 ? analysisResult.guidedSolutionSteps : getObservedSteps(analysisResult).map((step, index) => ({
    ...step,
    index,
    origin: 'observed',
    observedStepId: step.id,
  }))
}

function getPreferredIssueStep(analysisResult: TutorAnalysisResult): TutorStepAnalysis | null {
  const issueSteps = getObservedSteps(analysisResult)
    .filter((step) => isIssueStep(step) && findRegionById(analysisResult, step.regionId))
    .sort((left, right) => {
      const priorityDelta = getIssuePriority(left) - getIssuePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.index - right.index
    })

  return issueSteps[0] ?? null
}

export function getPreferredTutorOverlayStepId(analysisResult: TutorAnalysisResult | null): string | null {
  if (!analysisResult) return null

  const observedSteps = getObservedSteps(analysisResult)
  if (!observedSteps.length) return null

  const preferredIssueStep = getPreferredIssueStep(analysisResult)
  if (preferredIssueStep) return preferredIssueStep.id

  const firstRegionStep = observedSteps.find((step) => findRegionById(analysisResult, step.regionId))
  return firstRegionStep?.id ?? observedSteps[0]?.id ?? null
}

export function resolveTutorOverlayFocus(
  analysisResult: TutorAnalysisResult | null,
  activeStepId: string | null,
): TutorOverlayFocusState {
  if (!analysisResult) {
    return {
      activeStep: null,
      activeRegion: null,
      visibleRegionIds: [],
      showRegionIndices: false,
    }
  }

  const observedSteps = getObservedSteps(analysisResult)
  const guidedSteps = getGuidedSteps(analysisResult)
  if (!guidedSteps.length) {
    return {
      activeStep: null,
      activeRegion: null,
      visibleRegionIds: [],
      showRegionIndices: false,
    }
  }

  const preferredStepId = getPreferredTutorOverlayStepId(analysisResult)
  const activeStep = guidedSteps.find((step) => step.id === (activeStepId ?? preferredStepId))
    ?? guidedSteps.find((step) => step.id === preferredStepId)
    ?? guidedSteps[0]
    ?? null

  const issueStepsWithRegions = observedSteps
    .filter((step) => isIssueStep(step) && findRegionById(analysisResult, step.regionId))
    .sort((left, right) => {
      const priorityDelta = getIssuePriority(left) - getIssuePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.index - right.index
    })

  const issueRegionIds = Array.from(new Set(issueStepsWithRegions.map((step) => step.regionId).filter((value): value is string => Boolean(value))))
  const activeRegion = findRegionById(analysisResult, activeStep?.regionId)

  if (activeStepId && activeRegion) {
    return {
      activeStep,
      activeRegion,
      visibleRegionIds: [activeRegion.id],
      showRegionIndices: false,
    }
  }

  if (activeStepId && !activeRegion) {
    return {
      activeStep,
      activeRegion: null,
      visibleRegionIds: [],
      showRegionIndices: false,
    }
  }

  if (issueRegionIds.length > 0) {
    return {
      activeStep,
      activeRegion: activeRegion ?? findRegionById(analysisResult, issueRegionIds[0]),
      visibleRegionIds: issueRegionIds.slice(0, QUICK_ASSIST_REGION_LIMIT),
      showRegionIndices: issueRegionIds.length > 1,
    }
  }

  return {
    activeStep,
    activeRegion,
    visibleRegionIds: activeRegion ? [activeRegion.id] : [],
    showRegionIndices: false,
  }
}

export function projectTutorRegionToBoardFrame(
  boardFrame: WhiteboardBoardFrame,
  region: TutorDetectedRegion,
): TutorOverlayRegionFrame {
  return {
    left: region.x * boardFrame.width,
    top: region.y * boardFrame.height,
    width: region.width * boardFrame.width,
    height: region.height * boardFrame.height,
  }
}

export function resolveTutorCalloutPosition(
  boardFrame: WhiteboardBoardFrame,
  regionFrame: TutorOverlayRegionFrame,
): TutorOverlayCalloutPosition {
  const preferredRight = regionFrame.left + regionFrame.width + CALLOUT_GAP
  const preferredLeft = regionFrame.left - CALLOUT_MAX_WIDTH - CALLOUT_GAP
  const maxLeft = Math.max(0, boardFrame.width - CALLOUT_MAX_WIDTH)
  const left = preferredRight <= maxLeft
    ? preferredRight
    : preferredLeft >= 0
      ? preferredLeft
      : maxLeft

  const maxTop = Math.max(0, boardFrame.height - CALLOUT_MIN_HEIGHT)
  const top = Math.max(0, Math.min(regionFrame.top - 8, maxTop))

  return { left, top }
}