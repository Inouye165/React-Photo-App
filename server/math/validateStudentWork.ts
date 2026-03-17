import {
  evaluateArithmeticExpression,
  formatNumber,
  validateFinalAnswers,
  validateStepPair,
} from '../tutor/mathValidator'
import type { DeterministicMathFacts, MathFactErrorType, SolvedMathProblem, VerifiedMathStep } from './types'

function inferErrorType(message: string | undefined, fallback: MathFactErrorType): MathFactErrorType {
  const normalized = (message || '').toLowerCase()
  if (normalized.includes('arithmetic') || normalized.includes('divide') || normalized.includes('subtract') || normalized.includes('add')) {
    return 'arithmetic-slip'
  }
  if (normalized.includes('final answer') || normalized.includes('substitute')) {
    return 'final-answer-mismatch'
  }
  return fallback
}

function validateArithmeticSteps(stepTexts: string[], solvedProblem: SolvedMathProblem): VerifiedMathStep[] {
  const verifiedValue = solvedProblem.verifiedAnswer?.[0] ?? null
  if (!verifiedValue) return []

  const result: VerifiedMathStep[] = []
  let previousValue: number | null = null

  stepTexts.forEach((stepText, index) => {
    const trimmed = stepText.trim()
    if (!trimmed) return

    if (trimmed.includes('=')) {
      const parts = trimmed.split('=').map((part) => part.trim()).filter(Boolean)
      const values = parts.map((part) => evaluateArithmeticExpression(part))
      if (values.length >= 2 && values.every((value): value is number => value !== null)) {
        const firstValue = values[0]
        const allEqual = values.every((value) => Math.abs(value - firstValue) <= 1e-6)
        result.push({
          stepIndex: index,
          expression: trimmed,
          isValid: allEqual,
          explanation: allEqual
            ? 'This arithmetic line stays consistent.'
            : `This arithmetic line is inconsistent. All parts should equal ${formatNumber(firstValue)}.`,
          errorType: allEqual ? undefined : 'arithmetic-slip',
        })
        previousValue = firstValue
        return
      }
    }

    const value = evaluateArithmeticExpression(trimmed)
    if (value === null) return

    if (previousValue !== null) {
      const isValid = Math.abs(previousValue - value) <= 1e-6
      result.push({
        stepIndex: index,
        expression: trimmed,
        isValid,
        explanation: isValid
          ? 'This keeps the same arithmetic value as the previous line.'
          : `This changes the arithmetic value. The previous line evaluates to ${formatNumber(previousValue)}.`,
        errorType: isValid ? undefined : 'arithmetic-slip',
      })
    } else {
      const isValid = formatNumber(value) === verifiedValue
      result.push({
        stepIndex: index,
        expression: trimmed,
        isValid,
        explanation: isValid
          ? 'This matches the verified arithmetic answer.'
          : `This does not match the verified arithmetic answer ${verifiedValue}.`,
        errorType: isValid ? undefined : 'final-answer-mismatch',
      })
    }

    previousValue = value
  })

  return result
}

function validateAlgebraSteps(problemText: string, stepTexts: string[]): VerifiedMathStep[] {
  const verifiedSteps: VerifiedMathStep[] = []

  for (let index = 0; index < stepTexts.length; index += 1) {
    const stepText = stepTexts[index]?.trim()
    if (!stepText) continue

    if (index === 0) {
      const finalAnswerCheck = validateFinalAnswers(problemText, [stepText])
      if (finalAnswerCheck.expectedAnswers.length > 0 && /^x\s*=/.test(stepText)) {
        verifiedSteps.push({
          stepIndex: index,
          expression: stepText,
          isValid: finalAnswerCheck.status === 'correct',
          explanation: finalAnswerCheck.status === 'correct'
            ? 'This matches the verified algebra answer.'
            : finalAnswerCheck.warnings[0] || 'This does not match the verified algebra answer.',
          errorType: finalAnswerCheck.status === 'correct' ? undefined : 'final-answer-mismatch',
        })
      }
      continue
    }

    const finding = validateStepPair(stepTexts[index - 1], stepText, problemText)
    if (!finding.deterministic && !finding.warning && !finding.correction && !finding.hint) {
      continue
    }

    const explanation = finding.warning || finding.correction || finding.hint || 'This step could not be verified deterministically.'
    verifiedSteps.push({
      stepIndex: index,
      expression: stepText,
      isValid: finding.status === 'correct',
      explanation,
      errorType: finding.status === 'correct' ? undefined : inferErrorType(explanation, 'equation-transform'),
    })
  }

  const lastStep = stepTexts[stepTexts.length - 1]?.trim()
  if (lastStep) {
    const finalAnswerCheck = validateFinalAnswers(problemText, [lastStep])
    if (finalAnswerCheck.expectedAnswers.length > 0 && !verifiedSteps.some((step) => step.stepIndex === stepTexts.length - 1)) {
      verifiedSteps.push({
        stepIndex: stepTexts.length - 1,
        expression: lastStep,
        isValid: finalAnswerCheck.status === 'correct',
        explanation: finalAnswerCheck.status === 'correct'
          ? 'This final answer matches the verified algebra solution.'
          : finalAnswerCheck.warnings[0] || 'This final answer does not match the verified algebra solution.',
        errorType: finalAnswerCheck.status === 'correct' ? undefined : 'final-answer-mismatch',
      })
    }
  }

  return verifiedSteps
}

export function validateStudentWork(
  problemText: string,
  stepTexts: string[],
  solvedProblem: SolvedMathProblem,
): Pick<DeterministicMathFacts, 'verifiedSteps' | 'detectedError'> {
  if (!solvedProblem.supported) {
    return {
      verifiedSteps: [],
      detectedError: null,
    }
  }

  const verifiedSteps = solvedProblem.domain === 'arithmetic'
    ? validateArithmeticSteps(stepTexts, solvedProblem)
    : validateAlgebraSteps(problemText, stepTexts)

  const firstInvalid = verifiedSteps.find((step) => !step.isValid) || null

  return {
    verifiedSteps,
    detectedError: firstInvalid
      ? {
          stepIndex: firstInvalid.stepIndex,
          errorType: firstInvalid.errorType,
          explanation: firstInvalid.explanation,
        }
      : null,
  }
}
