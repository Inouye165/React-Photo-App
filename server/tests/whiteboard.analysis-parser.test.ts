/* eslint-env jest */

import { describe, expect, test } from '@jest/globals'
import { parseStructuredTutorAnalysis } from '../tutor/analysisParser'

describe('whiteboard structured tutor parser', () => {
  test('recovers from fenced JSON with trailing commas', () => {
    const parsed = parseStructuredTutorAnalysis(`Here you go:\n\n\
\`\`\`json
{
  "problemText": "Solve x^2 = 25",
  "finalAnswers": ["x = 5"],
  "overallSummary": "You are close.",
  "regions": [
    { "id": "region-1", "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.12 },
  ],
  "steps": [
    {
      "id": "step-1",
      "index": 0,
      "studentText": "x = 5",
      "normalizedMath": "x = 5",
      "status": "correct",
      "shortLabel": "Square root step",
      "kidFriendlyExplanation": "You found one answer.",
      "regionId": "region-1",
    },
  ],
  "validatorWarnings": [],
  "canAnimate": true,
}
\`\`\`
`) 

    expect(parsed.problemText).toBe('Solve x^2 = 25')
    expect(parsed.steps[0]?.regionId).toBe('region-1')
    expect(parsed.validatorWarnings.join(' ')).toMatch(/positive and the negative answer/i)
  })

  test('normalizes contradictory AI output for a simple linear-equation mistake', () => {
    const parsed = parseStructuredTutorAnalysis(JSON.stringify({
      problemText: '3x + 8 = 26',
      finalAnswers: ['x = 4'],
      overallSummary: 'Great job! You got the answer.',
      steps: [
        {
          id: 'step-1',
          index: 0,
          studentText: '3x + 8 = 26',
          normalizedMath: '3x + 8 = 26',
          status: 'correct',
          shortLabel: 'Start with the equation',
          kidFriendlyExplanation: 'Great start.',
        },
        {
          id: 'step-2',
          index: 1,
          studentText: '3x = 16',
          normalizedMath: '3x = 16',
          status: 'correct',
          shortLabel: 'Subtract 8 from both sides',
          kidFriendlyExplanation: 'Great job subtracting 8 from both sides.',
        },
        {
          id: 'step-3',
          index: 2,
          studentText: 'x = 4',
          normalizedMath: 'x = 4',
          status: 'correct',
          shortLabel: 'Divide both sides by 3',
          kidFriendlyExplanation: 'Nice work. You solved it.',
        },
      ],
      validatorWarnings: [],
      canAnimate: true,
    }))

    expect(parsed.steps[1]?.status).toBe('incorrect')
    expect(parsed.steps[1]?.kidFriendlyExplanation).toMatch(/first place where the math goes off track/i)
    expect(parsed.steps[2]?.status).toBe('warning')
    expect(parsed.steps[2]?.kidFriendlyExplanation).toMatch(/step 2.*fix that step first/i)
    expect(parsed.overallSummary).toMatch(/Start by fixing step 2/i)
  })
})
