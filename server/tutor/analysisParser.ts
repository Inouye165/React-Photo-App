import {
  applyMathValidator,
  type TutorAnalysisResult,
  type TutorDetectedRegion,
  type TutorStepAnalysis,
  type TutorStepStatus,
} from './mathValidator'
import type { DeterministicMathFacts, TutorAnalysisPipeline, TutorAnalysisSource } from '../math'

export type LegacyTutorPayload = {
  mathFacts?: DeterministicMathFacts | null
  analysisSource?: TutorAnalysisSource
  analysisPipeline?: TutorAnalysisPipeline | null
  analysisResult: TutorAnalysisResult
  problem: string
  correctSolution: string
  scoreCorrect: number
  scoreTotal: number
  steps: Array<{
    stepNumber: number
    label: string
    studentWork: string
    correct: boolean
    neutral: boolean
    explanation: string
  }>
  errorsFound: Array<{
    stepNumber: number
    issue: string
    correction: string
  }>
  closingEncouragement: string
  reply: string
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function stripJsonFences(value: string): string {
  const trimmed = value.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  return trimmed
}

function extractObjectSlice(value: string): string {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return value.slice(start, end + 1)
  }
  return value
}

function sanitizeJson(value: string): string {
  return value
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
}

function parseLooseJson(rawText: string): unknown {
  const candidates = [
    rawText,
    stripJsonFences(rawText),
    extractObjectSlice(stripJsonFences(rawText)),
    sanitizeJson(extractObjectSlice(stripJsonFences(rawText))),
  ]

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      continue
    }
  }

  throw new Error('Structured tutor analysis returned invalid JSON')
}

function normalizeStatus(value: unknown): TutorStepStatus {
  if (typeof value !== 'string') return 'warning'
  switch (value.trim().toLowerCase()) {
    case 'correct':
      return 'correct'
    case 'incorrect':
      return 'incorrect'
    case 'partial':
      return 'partial'
    default:
      return 'warning'
  }
}

function toTextArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeRegion(value: unknown, index: number): TutorDetectedRegion | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TutorDetectedRegion> & Record<string, unknown>
  const x = typeof candidate.x === 'number' ? clamp01(candidate.x) : NaN
  const y = typeof candidate.y === 'number' ? clamp01(candidate.y) : NaN
  const width = typeof candidate.width === 'number' ? clamp01(candidate.width) : NaN
  const height = typeof candidate.height === 'number' ? clamp01(candidate.height) : NaN
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null
  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `region-${index + 1}`,
    x,
    y,
    width,
    height,
  }
}

function normalizeStep(value: unknown, index: number, regionIds: Set<string>): TutorStepAnalysis | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TutorStepAnalysis> & Record<string, unknown>
  const studentText =
    typeof candidate.studentText === 'string'
      ? candidate.studentText.trim()
      : typeof candidate.studentWork === 'string'
        ? candidate.studentWork.trim()
        : typeof candidate.content === 'string'
          ? candidate.content.trim()
          : ''

  const explanation =
    typeof candidate.kidFriendlyExplanation === 'string'
      ? candidate.kidFriendlyExplanation.trim()
      : typeof candidate.explanation === 'string'
        ? candidate.explanation.trim()
        : ''

  if (!studentText && !explanation) return null

  const regionId = typeof candidate.regionId === 'string' && regionIds.has(candidate.regionId.trim())
    ? candidate.regionId.trim()
    : undefined

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `step-${index + 1}`,
    index: typeof candidate.index === 'number' && Number.isFinite(candidate.index) ? Math.max(0, Math.round(candidate.index)) : index,
    studentText,
    normalizedMath: typeof candidate.normalizedMath === 'string' && candidate.normalizedMath.trim() ? candidate.normalizedMath.trim() : undefined,
    status: normalizeStatus(candidate.status),
    shortLabel:
      typeof candidate.shortLabel === 'string' && candidate.shortLabel.trim()
        ? candidate.shortLabel.trim()
        : typeof candidate.label === 'string' && candidate.label.trim()
          ? candidate.label.trim()
          : `Step ${index + 1}`,
    kidFriendlyExplanation: explanation,
    correction: typeof candidate.correction === 'string' && candidate.correction.trim() ? candidate.correction.trim() : undefined,
    hint: typeof candidate.hint === 'string' && candidate.hint.trim() ? candidate.hint.trim() : undefined,
    regionId,
  }
}

function normalizeStructuredAnalysis(value: unknown): TutorAnalysisResult {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const regions = Array.isArray(candidate.regions)
    ? candidate.regions.map(normalizeRegion).filter((region): region is TutorDetectedRegion => Boolean(region))
    : []
  const regionIds = new Set(regions.map((region) => region.id))
  const steps = Array.isArray(candidate.steps)
    ? candidate.steps.map((step, index) => normalizeStep(step, index, regionIds)).filter((step): step is TutorStepAnalysis => Boolean(step))
    : []

  return {
    problemText:
      typeof candidate.problemText === 'string'
        ? candidate.problemText.trim()
        : typeof candidate.problem === 'string'
          ? candidate.problem.trim()
          : '',
    finalAnswers: toTextArray(candidate.finalAnswers ?? candidate.correctSolution),
    overallSummary:
      typeof candidate.overallSummary === 'string'
        ? candidate.overallSummary.trim()
        : typeof candidate.closingEncouragement === 'string'
          ? candidate.closingEncouragement.trim()
          : '',
    regions,
    steps,
    validatorWarnings: toTextArray(candidate.validatorWarnings),
    canAnimate: typeof candidate.canAnimate === 'boolean' ? candidate.canAnimate : steps.length > 1,
  }
}

function buildReply(analysisResult: TutorAnalysisResult): string {
  return [
    `Problem: ${analysisResult.problemText}`,
    '',
    `Final Answers: ${analysisResult.finalAnswers.join(', ') || 'Not confirmed yet'}`,
    '',
    'Steps:',
    ...(analysisResult.steps.length > 0
      ? analysisResult.steps.map((step) => `${step.index + 1}. ${step.shortLabel}: ${step.kidFriendlyExplanation}`)
      : ['No step breakdown was available.']),
    ...(analysisResult.validatorWarnings.length > 0
      ? ['', 'Validator Warnings:', ...analysisResult.validatorWarnings]
      : []),
    '',
    `Summary: ${analysisResult.overallSummary}`,
  ].join('\n')
}

function mergeDeterministicMathFacts(
  analysisResult: TutorAnalysisResult,
  mathFacts?: DeterministicMathFacts | null,
): TutorAnalysisResult {
  if (!mathFacts) {
    return analysisResult
  }

  const validatorWarnings = [...analysisResult.validatorWarnings]
  if (!mathFacts.supported) {
    if (mathFacts.unsupportedReason && !validatorWarnings.includes(mathFacts.unsupportedReason)) {
      validatorWarnings.push(mathFacts.unsupportedReason)
    }

    return {
      ...analysisResult,
      validatorWarnings,
    }
  }

  const verifiedStepsByIndex = new Map(mathFacts.verifiedSteps.map((step) => [step.stepIndex, step]))
  const nextSteps = analysisResult.steps.map((step): TutorStepAnalysis => {
    const verifiedStep = verifiedStepsByIndex.get(step.index)
    if (!verifiedStep) return step

    if (verifiedStep.isValid) {
      return {
        ...step,
        status: 'correct',
        hint: step.hint || verifiedStep.explanation,
      }
    }

    return {
      ...step,
      status: 'incorrect',
      kidFriendlyExplanation: verifiedStep.explanation || step.kidFriendlyExplanation,
      correction: step.correction || verifiedStep.explanation,
    }
  })

  if (mathFacts.detectedError?.explanation && !validatorWarnings.includes(mathFacts.detectedError.explanation)) {
    validatorWarnings.push(mathFacts.detectedError.explanation)
  }

  return {
    ...analysisResult,
    problemText: analysisResult.problemText || mathFacts.canonicalProblem || '',
    finalAnswers: mathFacts.verifiedAnswer ?? analysisResult.finalAnswers,
    overallSummary: mathFacts.detectedError?.stepIndex != null
      ? `Start by fixing step ${mathFacts.detectedError.stepIndex + 1}. After that, re-check the later work in order.`
      : analysisResult.overallSummary,
    steps: nextSteps,
    validatorWarnings,
  }
}

export function parseStructuredTutorAnalysis(
  rawText: string,
  options?: { mathFacts?: DeterministicMathFacts | null },
): TutorAnalysisResult {
  return mergeDeterministicMathFacts(
    applyMathValidator(normalizeStructuredAnalysis(parseLooseJson(rawText))),
    options?.mathFacts,
  )
}

export function buildLegacyTutorPayload(
  analysisResult: TutorAnalysisResult,
  options?: {
    mathFacts?: DeterministicMathFacts | null
    analysisSource?: TutorAnalysisSource
    analysisPipeline?: TutorAnalysisPipeline | null
  },
): LegacyTutorPayload {
  const steps = analysisResult.steps.map((step) => ({
    stepNumber: step.index + 1,
    label: step.shortLabel,
    studentWork: step.studentText || step.normalizedMath || '',
    correct: step.status === 'correct',
    neutral: step.status === 'partial' || step.status === 'warning',
    explanation: [step.kidFriendlyExplanation, step.correction, step.hint].filter(Boolean).join('\n\n'),
  }))

  const errorsFound = analysisResult.steps
    .filter((step) => step.status !== 'correct' && (step.correction || step.hint))
    .map((step) => ({
      stepNumber: step.index + 1,
      issue: step.kidFriendlyExplanation,
      correction: step.correction || step.hint || '',
    }))

  return {
    mathFacts: options?.mathFacts ?? null,
    analysisSource: options?.analysisSource,
    analysisPipeline: options?.analysisPipeline ?? null,
    analysisResult,
    problem: analysisResult.problemText,
    correctSolution: analysisResult.finalAnswers.join(', '),
    scoreCorrect: analysisResult.steps.filter((step) => step.status === 'correct').length,
    scoreTotal: analysisResult.steps.length,
    steps,
    errorsFound,
    closingEncouragement: analysisResult.overallSummary,
    reply: buildReply(analysisResult),
  }
}