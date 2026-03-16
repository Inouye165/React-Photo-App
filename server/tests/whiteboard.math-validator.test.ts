/* eslint-env jest */

import { describe, expect, test } from '@jest/globals'
import { validateFinalAnswers, validateStepPair } from '../tutor/mathValidator'

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

  test('catches incorrect subtraction in a simple linear equation step', () => {
    const result = validateStepPair('3x + 8 = 26', '3x = 16', '3x + 8 = 26')

    expect(result.status).toBe('incorrect')
    expect(result.warning).toMatch(/26 - 8 should be 18/i)
    expect(result.correction).toMatch(/3x = 18/i)
  })

  test('validates simple linear final answers deterministically', () => {
    const incorrect = validateFinalAnswers('3x + 8 = 26', ['x = 4'])
    const correct = validateFinalAnswers('3x + 8 = 26', ['x = 6'])

    expect(incorrect.status).toBe('incorrect')
    expect(incorrect.expectedAnswers).toEqual([6])
    expect(correct.status).toBe('correct')
    expect(correct.matchedAnswers).toEqual([6])
  })
})
