/* eslint-env jest */

import { describe, expect, test } from '@jest/globals'
import { validateFinalAnswers } from '../tutor/mathValidator'

describe('whiteboard math validator', () => {
  test('catches the missing plus-minus square root case', () => {
    const result = validateFinalAnswers('x^2 = 25', ['x = 5'])

    expect(result.status).toBe('partial')
    expect(result.expectedAnswers).toEqual([-5, 5])
    expect(result.warnings.join(' ')).toMatch(/both the positive and the negative answer/i)
  })

  test('validates final answers by substitution for correct and incorrect answers', () => {
    const correct = validateFinalAnswers('2x + 3 = 11', ['x = 4'])
    const incorrect = validateFinalAnswers('2x + 3 = 11', ['x = 5'])

    expect(correct.status).toBe('correct')
    expect(correct.matchedAnswers).toEqual([4])

    expect(incorrect.status).toBe('incorrect')
    expect(incorrect.warnings.join(' ')).toMatch(/does not match the original equation/i)
  })
})
