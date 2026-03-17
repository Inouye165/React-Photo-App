import { describe, expect, it } from 'vitest'
import type { TutorAnalysisResult } from '../../types/whiteboard'
import {
  getPreferredTutorOverlayStepId,
  projectTutorRegionToBoardFrame,
  resolveTutorCalloutPosition,
  resolveTutorOverlayFocus,
} from './tutorOverlayGeometry'

const analysisResult: TutorAnalysisResult = {
  problemText: 'Solve 2x + 3 = 11',
  finalAnswers: ['x = 4'],
  overallSummary: 'You are on the right track.',
  regions: [
    { id: 'region-1', x: 0.1, y: 0.2, width: 0.25, height: 0.12 },
    { id: 'region-2', x: 0.42, y: 0.38, width: 0.16, height: 0.08 },
  ],
  steps: [
    {
      id: 'step-1',
      index: 0,
      studentText: '2x + 3 = 11',
      normalizedMath: '2x + 3 = 11',
      status: 'correct',
      shortLabel: 'Start with the equation',
      kidFriendlyExplanation: 'You copied the equation correctly.',
      regionId: 'region-1',
    },
    {
      id: 'step-2',
      index: 1,
      studentText: '2x = 11',
      normalizedMath: '2x = 11',
      status: 'incorrect',
      shortLabel: 'Subtract 3 from both sides',
      kidFriendlyExplanation: 'This is where the work goes off track.',
      correction: 'Subtract 3 from 11 before dividing.',
      regionId: 'region-2',
    },
  ],
  validatorWarnings: [],
  canAnimate: true,
}

describe('tutorOverlayGeometry', () => {
  it('projects a normalized region into the current board frame', () => {
    expect(projectTutorRegionToBoardFrame(
      { left: 40, top: 132, width: 700, height: 315 },
      analysisResult.regions[0],
    )).toEqual({
      left: 70,
      top: 63,
      width: 175,
      height: 37.8,
    })
  })

  it('places the callout inside the board frame instead of using viewport clamping', () => {
    const regionFrame = projectTutorRegionToBoardFrame(
      { left: 40, top: 80, width: 700, height: 420 },
      analysisResult.regions[1],
    )

    expect(resolveTutorCalloutPosition(
      { left: 40, top: 80, width: 700, height: 420 },
      regionFrame,
    )).toEqual({
      left: 360,
      top: 151.6,
    })
  })

  it('prefers the likely issue step for the default Quick Assist focus', () => {
    expect(getPreferredTutorOverlayStepId(analysisResult)).toBe('step-2')

    const focus = resolveTutorOverlayFocus(analysisResult, null)
    expect(focus.activeStep?.id).toBe('step-2')
    expect(focus.activeRegion?.id).toBe('region-2')
    expect(focus.visibleRegionIds).toEqual(['region-2'])
    expect(focus.showRegionIndices).toBe(false)
  })

  it('keeps an explicitly selected walkthrough step focused when one is chosen', () => {
    const focus = resolveTutorOverlayFocus(analysisResult, 'step-1')
    expect(focus.activeStep?.id).toBe('step-1')
    expect(focus.activeRegion?.id).toBe('region-1')
    expect(focus.visibleRegionIds).toEqual(['region-1'])
  })
})