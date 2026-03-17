/* eslint-env jest */

import { buildMathFacts } from '../math'

describe('whiteboard deterministic math core', () => {
  test('solves arithmetic problems deterministically', () => {
    const facts = buildMathFacts('12 + 8 / 2', [])

    expect(facts).toMatchObject({
      supported: true,
      domain: 'arithmetic',
      verifiedAnswer: ['16'],
      confidence: 'high',
    })
  })

  test('solves single-variable linear equations deterministically', () => {
    const facts = buildMathFacts('3x + 8 = 26', [])

    expect(facts).toMatchObject({
      supported: true,
      domain: 'algebra',
      verifiedAnswer: ['x = 6'],
      confidence: 'high',
    })
  })

  test('detects arithmetic slips in a linear step sequence', () => {
    const facts = buildMathFacts('3x + 8 = 26', [
      { content: '3x + 8 = 26' },
      { content: '3x = 16' },
      { content: 'x = 4' },
    ])

    expect(facts.supported).toBe(true)
    expect(facts.detectedError).toMatchObject({
      stepIndex: 1,
      errorType: 'arithmetic-slip',
    })
    expect(facts.verifiedSteps.find((step) => step.stepIndex === 1)).toMatchObject({
      isValid: false,
    })
  })

  test('verifies final answers deterministically', () => {
    const facts = buildMathFacts('2x + 3 = 11', [
      { content: 'x = 5' },
    ])

    expect(facts.verifiedAnswer).toEqual(['x = 4'])
    expect(facts.verifiedSteps[0]).toMatchObject({
      stepIndex: 0,
      isValid: false,
      errorType: 'final-answer-mismatch',
    })
  })

  test('fails conservatively for unsupported domains', () => {
    const facts = buildMathFacts('Solve the system x + y = 10 and x - y = 4', [])

    expect(facts).toMatchObject({
      supported: false,
      domain: 'unknown',
      confidence: 'low',
    })
    expect(facts.unsupportedReason).toMatch(/limited to arithmetic and single-variable linear equations/i)
  })
})
