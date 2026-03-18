import { describe, expect, it } from 'vitest'
import { buildTutorResponse, formatTutorRichText } from './whiteboardTutor'

describe('formatTutorRichText', () => {
  it('converts bold markdown and strips heading syntax before rendering', () => {
    const formatted = formatTutorRichText('## Problem\n**Step 4:** **Solve for x**')

    expect(formatted).not.toContain('**')
    expect(formatted).not.toContain('##')
    expect(formatted).toContain('<strong>Step 4:</strong>')
    expect(formatted).toContain('<strong>Solve for x</strong>')
  })

  it('removes orphaned markdown asterisks from the rendered output', () => {
    const formatted = formatTutorRichText('**\nSolve for x: 5x - 7 = 18\n**')

    expect(formatted).not.toContain('**')
    expect(formatted).not.toContain('*')
    expect(formatted).toContain('Solve for x: 5x - 7 = 18')
  })
})

describe('buildTutorResponse guided solution reconstruction', () => {
  it('continues a partial observed solution until it reaches the final answer', () => {
    const response = buildTutorResponse({
      analysisSource: 'deterministic',
      correctSolution: 'x = 7',
      analysisResult: {
        problemText: 'Solve for x: 5x - 17 = 18',
        finalAnswers: ['x = 7'],
        overallSummary: 'Nice start.',
        regions: [],
        steps: [
          {
            id: 'step-1',
            index: 0,
            studentText: '5x - 17 = 18',
            status: 'partial',
            shortLabel: 'Add 17 to both sides',
            kidFriendlyExplanation: 'Undo the subtraction first.',
          },
          {
            id: 'step-2',
            index: 1,
            studentText: '5x = 35',
            status: 'correct',
            shortLabel: 'Now divide by 5',
            kidFriendlyExplanation: 'Isolate x.',
          },
        ],
        validatorWarnings: [],
        canAnimate: false,
      },
    }, [])

    expect(response.analysisResult?.steps).toHaveLength(2)
    expect(response.analysisResult?.guidedSolutionSteps?.map((step) => step.studentText)).toEqual([
      '5x - 17 = 18',
      '5x = 35',
      'x = 35 / 5',
      'x = 7',
    ])
    expect(response.analysisResult?.guidedSolutionMetadata).toMatchObject({
      source: 'mixed-reconstruction',
      isComplete: true,
      reachesFinalAnswers: true,
      synthesizedStepCount: 2,
      hasSynthesizedContinuation: true,
    })
  })

  it('reconstructs both branches when multiple final answers are known', () => {
    const response = buildTutorResponse({
      analysisSource: 'fallback-llm',
      correctSolution: 'x = 2 or x = -8',
      analysisResult: {
        problemText: 'Solve for x: (x + 3)^2 - 5 = 20',
        finalAnswers: ['x = 2', 'x = -8'],
        overallSummary: 'Finish both square-root branches.',
        regions: [],
        steps: [
          {
            id: 'step-1',
            index: 0,
            studentText: 'x + 3 = -5',
            normalizedMath: 'x + 3 = -5',
            status: 'partial',
            shortLabel: 'One square-root branch',
            kidFriendlyExplanation: 'Now solve this branch for x.',
          },
        ],
        validatorWarnings: [],
        canAnimate: false,
      },
    }, [])

    expect(response.analysisResult?.guidedSolutionSteps?.map((step) => step.studentText)).toEqual([
      'x + 3 = -5',
      'x = -5 - 3',
      'x = -8',
      'x + 3 = 5',
      'x = 5 - 3',
      'x = 2',
    ])
    expect(response.analysisResult?.guidedSolutionSteps?.filter((step) => step.branchLabel).map((step) => step.branchLabel)).toContain('Branch 2')
    expect(response.analysisResult?.guidedSolutionMetadata).toMatchObject({
      source: 'mixed-reconstruction',
      isComplete: true,
      reachesFinalAnswers: true,
      hasSynthesizedContinuation: true,
    })
  })

  it('marks the guided walkthrough incomplete when final answers cannot be reached', () => {
    const response = buildTutorResponse({
      analysisSource: 'fallback-llm',
      analysisResult: {
        problemText: 'Solve the system',
        finalAnswers: ['2', '-8'],
        overallSummary: '',
        regions: [],
        steps: [
          {
            id: 'step-1',
            index: 0,
            studentText: 'x + y = 4',
            status: 'warning',
            shortLabel: 'Set up the system',
            kidFriendlyExplanation: 'You still need the solved values.',
          },
        ],
        validatorWarnings: [],
        canAnimate: false,
      },
    }, [])

    expect(response.analysisResult?.guidedSolutionMetadata).toMatchObject({
      isComplete: false,
      reachesFinalAnswers: false,
    })
    expect(response.analysisResult?.validatorWarnings).toContain('Guided solution does not reach every final answer yet.')
  })
})
