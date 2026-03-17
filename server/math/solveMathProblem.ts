import {
  evaluateArithmeticExpression,
  formatNumber,
  normalizeMathText,
  parseSimpleLinearEquation,
  solveEquation,
} from '../tutor/mathValidator'
import type { SolvedMathProblem } from './types'

function stripLeadingPromptText(value: string): string {
  const trimmed = value.trim()
  const startIndex = trimmed.search(/[\d(xX]/)
  return startIndex >= 0 ? trimmed.slice(startIndex) : trimmed
}

function normalizeArithmeticCandidate(problemText: string): string | null {
  const stripped = stripLeadingPromptText(problemText)
  const cleaned = stripped.replace(/[?]/g, '').trim().replace(/=$/, '').trim()
  const normalized = normalizeMathText(cleaned)
  if (!normalized) return null
  if (/[^\d+\-*/^().]/.test(normalized)) return null
  return normalized
}

function normalizeLinearCandidate(problemText: string): string | null {
  const stripped = stripLeadingPromptText(problemText)
  const normalized = normalizeMathText(stripped)
  return normalized || null
}

export function solveMathProblem(problemText: string): SolvedMathProblem {
  const arithmeticCandidate = normalizeArithmeticCandidate(problemText)
  if (arithmeticCandidate) {
    const value = evaluateArithmeticExpression(arithmeticCandidate)
    if (value !== null) {
      return {
        supported: true,
        domain: 'arithmetic',
        canonicalProblem: arithmeticCandidate,
        verifiedAnswer: [formatNumber(value)],
        confidence: 'high',
      }
    }
  }

  const linearCandidate = normalizeLinearCandidate(problemText)
  if (linearCandidate && parseSimpleLinearEquation(linearCandidate)) {
    const solutions = solveEquation(linearCandidate)
    if (solutions.length === 1) {
      return {
        supported: true,
        domain: 'algebra',
        canonicalProblem: linearCandidate,
        verifiedAnswer: [`x = ${formatNumber(solutions[0])}`],
        confidence: 'high',
      }
    }
  }

  return {
    supported: false,
    domain: 'unknown',
    canonicalProblem: linearCandidate || arithmeticCandidate,
    verifiedAnswer: null,
    confidence: 'low',
    unsupportedReason: 'Deterministic math support in this pass is limited to arithmetic and single-variable linear equations.',
  }
}
