import { solveMathProblem } from './solveMathProblem'
import type { DeterministicMathFacts } from './types'
import { validateStudentWork } from './validateStudentWork'

export function buildMathFacts(problemText: string, steps: Array<{ content?: string | null }>): DeterministicMathFacts {
  const solvedProblem = solveMathProblem(problemText)
  if (!solvedProblem.supported) {
    return {
      supported: false,
      domain: solvedProblem.domain,
      canonicalProblem: solvedProblem.canonicalProblem,
      verifiedAnswer: null,
      verifiedSteps: [],
      detectedError: null,
      confidence: solvedProblem.confidence,
      unsupportedReason: solvedProblem.unsupportedReason,
    }
  }

  const stepTexts = steps
    .map((step) => (typeof step.content === 'string' ? step.content.trim() : ''))
    .filter(Boolean)

  const validation = validateStudentWork(problemText, stepTexts, solvedProblem)

  return {
    supported: true,
    domain: solvedProblem.domain,
    canonicalProblem: solvedProblem.canonicalProblem,
    verifiedAnswer: solvedProblem.verifiedAnswer,
    verifiedSteps: validation.verifiedSteps,
    detectedError: validation.detectedError,
    confidence: validation.verifiedSteps.length > 0 ? 'high' : solvedProblem.confidence,
  }
}
