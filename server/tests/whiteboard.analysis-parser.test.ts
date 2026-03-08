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
})
