import type {
  TutorAnalysisResult,
  TutorDetectedRegion,
  TutorGuidedSolutionMetadata,
  TutorGuidedSolutionSource,
  TutorGuidedSolutionStep,
  TutorStepAnalysis,
  TutorStepStatus,
  WhiteboardTutorDetectedMathError,
  WhiteboardTutorCacheSource,
  WhiteboardTutorAnalysisPipeline,
  WhiteboardTutorAnalysisSource,
  WhiteboardTutorMathFacts,
  WhiteboardTutorModelMetadata,
  WhiteboardTutorErrorItem,
  WhiteboardTutorMessage,
  WhiteboardTutorResponse,
  WhiteboardTutorSections,
  WhiteboardTutorStep,
} from '../../types/whiteboard'

const EMPTY_SECTIONS: WhiteboardTutorSections = {
  problem: '',
  stepsAnalysis: '',
  errorsFound: '',
  encouragement: '',
}

const EMPTY_RESPONSE: Omit<WhiteboardTutorResponse, 'messages' | 'reply'> = {
  modelMetadata: undefined,
  mathFacts: null,
  analysisSource: undefined,
  analysisPipeline: null,
  analysisResult: null,
  sections: EMPTY_SECTIONS,
  problem: '',
  correctSolution: '',
  scoreCorrect: 0,
  scoreTotal: 0,
  steps: [],
  errorsFound: [],
  closingEncouragement: '',
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function normalizeStepStatus(value: unknown): TutorStepStatus {
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
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function normalizeRegion(value: unknown, index: number): TutorDetectedRegion | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TutorDetectedRegion> & Record<string, unknown>

  const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `region-${index + 1}`
  const x = typeof candidate.x === 'number' ? clamp01(candidate.x) : NaN
  const y = typeof candidate.y === 'number' ? clamp01(candidate.y) : NaN
  const width = typeof candidate.width === 'number' ? clamp01(candidate.width) : NaN
  const height = typeof candidate.height === 'number' ? clamp01(candidate.height) : NaN

  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null
  }

  return { id, x, y, width, height }
}

function normalizeAnalysisStep(value: unknown, index: number): TutorStepAnalysis | null {
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

  const kidFriendlyExplanation =
    typeof candidate.kidFriendlyExplanation === 'string'
      ? candidate.kidFriendlyExplanation.trim()
      : typeof candidate.explanation === 'string'
        ? candidate.explanation.trim()
        : ''

  const shortLabel =
    typeof candidate.shortLabel === 'string' && candidate.shortLabel.trim()
      ? candidate.shortLabel.trim()
      : typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim()
        : studentText || (typeof candidate.normalizedMath === 'string' ? candidate.normalizedMath.trim() : '')

  if (!studentText && !kidFriendlyExplanation && !shortLabel) {
    return null
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `step-${index + 1}`,
    index: typeof candidate.index === 'number' && Number.isFinite(candidate.index) ? Math.max(0, Math.round(candidate.index)) : index,
    studentText,
    normalizedMath: typeof candidate.normalizedMath === 'string' && candidate.normalizedMath.trim() ? candidate.normalizedMath.trim() : undefined,
    status: normalizeStepStatus(candidate.status),
    shortLabel,
    kidFriendlyExplanation,
    correction: typeof candidate.correction === 'string' && candidate.correction.trim() ? candidate.correction.trim() : undefined,
    hint: typeof candidate.hint === 'string' && candidate.hint.trim() ? candidate.hint.trim() : undefined,
    regionId: typeof candidate.regionId === 'string' && candidate.regionId.trim() ? candidate.regionId.trim() : undefined,
  }
}

function normalizeGuidedStepOrigin(value: unknown): TutorGuidedSolutionStep['origin'] {
  switch (value) {
    case 'observed':
    case 'synthesized':
    case 'branch':
    case 'final-answer':
      return value
    default:
      return 'observed'
  }
}

function normalizeGuidedSolutionStep(value: unknown, index: number): TutorGuidedSolutionStep | null {
  const baseStep = normalizeAnalysisStep(value, index)
  if (!baseStep || !value || typeof value !== 'object') return null

  const candidate = value as Partial<TutorGuidedSolutionStep> & Record<string, unknown>

  return {
    ...baseStep,
    origin: normalizeGuidedStepOrigin(candidate.origin),
    observedStepId: typeof candidate.observedStepId === 'string' && candidate.observedStepId.trim() ? candidate.observedStepId.trim() : undefined,
    branchKey: typeof candidate.branchKey === 'string' && candidate.branchKey.trim() ? candidate.branchKey.trim() : undefined,
    branchLabel: typeof candidate.branchLabel === 'string' && candidate.branchLabel.trim() ? candidate.branchLabel.trim() : undefined,
  }
}

function normalizeGuidedSolutionSource(value: unknown): TutorGuidedSolutionSource | undefined {
  switch (value) {
    case 'deterministic':
    case 'fallback-llm':
    case 'cached-analysis':
    case 'mixed-reconstruction':
    case 'observed-only':
      return value
    default:
      return undefined
  }
}

function normalizeGuidedSolutionMetadata(value: unknown): TutorGuidedSolutionMetadata | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<TutorGuidedSolutionMetadata> & Record<string, unknown>
  const source = normalizeGuidedSolutionSource(candidate.source)
  if (!source) return null

  return {
    source,
    isComplete: candidate.isComplete === true,
    reachesFinalAnswers: candidate.reachesFinalAnswers === true,
    synthesizedStepCount: typeof candidate.synthesizedStepCount === 'number' && Number.isFinite(candidate.synthesizedStepCount)
      ? Math.max(0, Math.round(candidate.synthesizedStepCount))
      : 0,
    hasSynthesizedContinuation: candidate.hasSynthesizedContinuation === true,
    completenessReason: typeof candidate.completenessReason === 'string' && candidate.completenessReason.trim()
      ? candidate.completenessReason.trim()
      : undefined,
  }
}

function normalizeAnalysisResult(value: unknown): TutorAnalysisResult | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TutorAnalysisResult> & Record<string, unknown>

  const regions = Array.isArray(candidate.regions)
    ? candidate.regions.map(normalizeRegion).filter((region): region is TutorDetectedRegion => Boolean(region))
    : []
  const regionIds = new Set(regions.map((region) => region.id))

  const observedSteps = Array.isArray(candidate.observedSteps)
    ? candidate.observedSteps
        .map(normalizeAnalysisStep)
        .filter((step): step is TutorStepAnalysis => Boolean(step))
        .map((step) => (
          step.regionId && !regionIds.has(step.regionId)
            ? { ...step, regionId: undefined }
            : step
        ))
    : Array.isArray(candidate.steps)
      ? candidate.steps
        .map(normalizeAnalysisStep)
        .filter((step): step is TutorStepAnalysis => Boolean(step))
        .map((step) => (
          step.regionId && !regionIds.has(step.regionId)
            ? { ...step, regionId: undefined }
            : step
        ))
      : []

  const guidedSolutionSteps = Array.isArray(candidate.guidedSolutionSteps)
    ? candidate.guidedSolutionSteps
        .map(normalizeGuidedSolutionStep)
        .filter((step): step is TutorGuidedSolutionStep => Boolean(step))
        .map((step) => (
          step.regionId && !regionIds.has(step.regionId)
            ? { ...step, regionId: undefined }
            : step
        ))
    : observedSteps.map((step) => ({
        ...step,
        origin: 'observed' as const,
        observedStepId: step.id,
      }))

  const problemText =
    typeof candidate.problemText === 'string'
      ? candidate.problemText.trim()
      : typeof candidate.problem === 'string'
        ? candidate.problem.trim()
        : ''

  const finalAnswers = toTextArray(candidate.finalAnswers)
  const overallSummary =
    typeof candidate.overallSummary === 'string'
      ? candidate.overallSummary.trim()
      : typeof candidate.closingEncouragement === 'string'
        ? candidate.closingEncouragement.trim()
        : ''

  return {
    problemText,
    finalAnswers,
    overallSummary,
    regions,
    steps: observedSteps,
    observedSteps,
    guidedSolutionSteps,
    guidedSolutionMetadata: normalizeGuidedSolutionMetadata(candidate.guidedSolutionMetadata) ?? {
      source: 'observed-only',
      isComplete: finalAnswers.length === 0 || finalAnswers.every((answer) => guidedSolutionSteps.some((step) => {
        const line = `${step.studentText || ''} ${step.normalizedMath || ''}`.replace(/\s+/g, '').toLowerCase()
        return line.includes(answer.replace(/\s+/g, '').toLowerCase())
      })),
      reachesFinalAnswers: finalAnswers.length === 0 || finalAnswers.every((answer) => guidedSolutionSteps.some((step) => {
        const line = `${step.studentText || ''} ${step.normalizedMath || ''}`.replace(/\s+/g, '').toLowerCase()
        return line.includes(answer.replace(/\s+/g, '').toLowerCase())
      })),
      synthesizedStepCount: guidedSolutionSteps.filter((step) => step.origin !== 'observed').length,
      hasSynthesizedContinuation: guidedSolutionSteps.some((step) => step.origin !== 'observed'),
    },
    validatorWarnings: toTextArray(candidate.validatorWarnings),
    canAnimate: typeof candidate.canAnimate === 'boolean' ? candidate.canAnimate : guidedSolutionSteps.length > 1,
  }
}

function getStepLine(step: Pick<TutorStepAnalysis, 'studentText' | 'normalizedMath'> | null | undefined): string {
  return step?.normalizedMath?.trim() || step?.studentText?.trim() || ''
}

function normalizeComparableMath(value: string): string {
  return value.replace(/[−–—]/g, '-').replace(/\s+/g, '').toLowerCase()
}

function answerIsReached(steps: Array<Pick<TutorStepAnalysis, 'studentText' | 'normalizedMath'>>, answer: string): boolean {
  const normalizedAnswer = normalizeComparableMath(answer)
  return steps.some((step) => normalizeComparableMath(getStepLine(step)).includes(normalizedAnswer))
}

function parseAnswerEquation(answer: string): { raw: string; variable: string; value: string } | null {
  const match = answer.trim().match(/^([a-zA-Z])\s*=\s*(.+)$/)
  if (!match) return null

  return {
    raw: answer.trim(),
    variable: match[1],
    value: match[2].trim(),
  }
}

function splitEquation(line: string): { left: string; right: string } | null {
  const equalsIndex = line.indexOf('=')
  if (equalsIndex < 0) return null

  const left = line.slice(0, equalsIndex).trim()
  const right = line.slice(equalsIndex + 1).trim()
  if (!left || !right) return null

  return { left, right }
}

function formatEvaluatedNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Math.abs(value) < 1e-9) return '0'
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return String(Number(value.toFixed(6)))
}

function insertImplicitMultiplication(expression: string): string {
  return expression
    .replace(/(\d)\s*([a-zA-Z(])/g, '$1*$2')
    .replace(/([a-zA-Z)])\s*(\d)/g, '$1*$2')
    .replace(/(\))\s*([a-zA-Z(])/g, '$1*$2')
}

function evaluateNumericExpression(expression: string): number | null {
  const normalized = insertImplicitMultiplication(expression)
    .replace(/[−–—]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/\^/g, '**')
    .trim()

  if (!normalized || /[^0-9+\-*/().\s*]/.test(normalized)) {
    return null
  }

  try {
    const result = Function(`"use strict"; return (${normalized});`)()
    return typeof result === 'number' && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}

function evaluateExpressionWithVariable(expression: string, variable: string, value: string): number | null {
  const substituted = expression.replace(new RegExp(`\\b${variable}\\b`, 'g'), `(${value})`)
  return evaluateNumericExpression(substituted)
}

function nearlyEqual(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return false
  return Math.abs(left - right) < 1e-9
}

function createGuidedStep(
  step: Omit<TutorGuidedSolutionStep, 'index'>,
  index: number,
): TutorGuidedSolutionStep {
  return {
    ...step,
    index,
  }
}

function appendGuidedStep(
  steps: TutorGuidedSolutionStep[],
  step: Omit<TutorGuidedSolutionStep, 'index'>,
): TutorGuidedSolutionStep[] {
  const line = normalizeComparableMath(getStepLine(step))
  const duplicate = line
    ? steps.some((existingStep) => normalizeComparableMath(getStepLine(existingStep)) === line)
    : steps.some((existingStep) => existingStep.id === step.id)

  if (duplicate) {
    return steps
  }

  return [...steps, createGuidedStep(step, steps.length)]
}

function buildObservedGuidedSteps(observedSteps: TutorStepAnalysis[]): TutorGuidedSolutionStep[] {
  return observedSteps.map((step, index) => ({
    ...step,
    index,
    origin: 'observed',
    observedStepId: step.id,
  }))
}

function buildFinalAnswerStep(answer: { raw: string; variable: string }, index: number, branchLabel?: string, branchKey?: string): TutorGuidedSolutionStep {
  return createGuidedStep({
    id: `guided-final-${index + 1}`,
    studentText: answer.raw,
    normalizedMath: answer.raw,
    status: 'correct',
    shortLabel: 'Final answer',
    kidFriendlyExplanation: 'This completes the solve for this path.',
    origin: 'final-answer',
    branchLabel,
    branchKey,
  }, index)
}

function buildIsolationStep(
  leftSide: string,
  rightSide: string,
  answer: { raw: string; variable: string; value: string },
  branchLabel?: string,
  branchKey?: string,
): Omit<TutorGuidedSolutionStep, 'index'> | null {
  const compactLeft = leftSide.replace(/\s+/g, '')
  const variable = answer.variable
  const numericConstant = '(-?\\d+(?:\\.\\d+)?)'
  const directPatterns: Array<{ regex: RegExp; build: (match: RegExpMatchArray) => string }> = [
    {
      regex: new RegExp(`^${variable}([+-])${numericConstant}$`),
      build: (match) => `${variable} = ${rightSide} ${match[1] === '+' ? '-' : '+'} ${match[2]}`,
    },
    {
      regex: new RegExp(`^${numericConstant}([+-])${variable}$`),
      build: (match) => `${variable} = ${rightSide} ${match[2] === '+' ? '-' : '+'} ${match[1]}`,
    },
    {
      regex: new RegExp(`^${numericConstant}\\*?${variable}$`),
      build: (match) => `${variable} = ${rightSide} / ${match[1]}`,
    },
    {
      regex: new RegExp(`^${variable}\\*${numericConstant}$`),
      build: (match) => `${variable} = ${rightSide} / ${match[1]}`,
    },
    {
      regex: new RegExp(`^${variable}/${numericConstant}$`),
      build: (match) => `${variable} = ${rightSide} * ${match[1]}`,
    },
  ]

  for (const pattern of directPatterns) {
    const match = compactLeft.match(pattern.regex)
    if (!match) continue

    const isolationLine = pattern.build(match)
    const normalizedIsolationLine = normalizeComparableMath(isolationLine)
    if (normalizedIsolationLine === normalizeComparableMath(answer.raw)) {
      return null
    }

    return {
      id: `guided-isolate-${branchKey ?? variable}-${normalizeComparableMath(answer.raw)}`,
      studentText: isolationLine,
      normalizedMath: isolationLine,
      status: 'correct',
      shortLabel: 'Isolate the variable',
      kidFriendlyExplanation: 'Undo the last operation to get the variable by itself.',
      origin: 'synthesized',
      branchLabel,
      branchKey,
    }
  }

  return null
}

function buildBranchEquationStep(
  leftSide: string,
  rightSide: string,
  answer: { raw: string; variable: string; value: string },
  branchIndex: number,
): Omit<TutorGuidedSolutionStep, 'index'> {
  const branchLabel = `Branch ${branchIndex + 1}`

  return {
    id: `guided-branch-${branchIndex + 1}-${normalizeComparableMath(answer.raw)}`,
    studentText: `${leftSide} = ${rightSide}`,
    normalizedMath: `${leftSide} = ${rightSide}`,
    status: 'correct',
    shortLabel: branchLabel,
    kidFriendlyExplanation: 'Follow this branch to solve one of the valid answers.',
    origin: 'branch',
    branchLabel,
    branchKey: `branch-${branchIndex + 1}`,
  }
}

function deriveGuidedSolutionSource(
  analysisSource: WhiteboardTutorAnalysisSource | undefined,
  cacheSource: WhiteboardTutorCacheSource | undefined,
  synthesizedStepCount: number,
  providedGuidedSteps: boolean,
): TutorGuidedSolutionSource {
  if (synthesizedStepCount > 0) {
    return 'mixed-reconstruction'
  }

  if (providedGuidedSteps && (cacheSource === 'local-cache' || cacheSource === 'server-cache')) {
    return 'cached-analysis'
  }

  if (analysisSource === 'fallback-llm') {
    return 'fallback-llm'
  }

  if (analysisSource === 'deterministic') {
    return 'deterministic'
  }

  return 'observed-only'
}

function buildGuidedSolutionResult(
  analysisResult: TutorAnalysisResult | null,
  options: {
    analysisSource?: WhiteboardTutorAnalysisSource
    cacheSource?: WhiteboardTutorCacheSource
    correctSolution?: string
  },
): TutorAnalysisResult | null {
  if (!analysisResult) return null

  const observedSteps = analysisResult.observedSteps && analysisResult.observedSteps.length > 0 ? analysisResult.observedSteps : analysisResult.steps
  const providedGuidedSteps = (analysisResult.guidedSolutionSteps ?? []).filter(Boolean)
  let guidedSteps = providedGuidedSteps.length > 0 ? providedGuidedSteps.map((step, index) => ({ ...step, index })) : buildObservedGuidedSteps(observedSteps)
  const fallbackAnswers = toTextArray(options.correctSolution)
  const finalAnswers = analysisResult.finalAnswers.length > 0 ? analysisResult.finalAnswers : fallbackAnswers
  const parsedAnswers = finalAnswers.map(parseAnswerEquation).filter((answer): answer is NonNullable<ReturnType<typeof parseAnswerEquation>> => Boolean(answer))
  const lastObservedStep = observedSteps[observedSteps.length - 1] ?? null
  const anchorEquation = splitEquation(getStepLine(lastObservedStep))
  const anchorVariable = parsedAnswers[0]?.variable ?? null
  const anchorRightValue = anchorEquation ? evaluateNumericExpression(anchorEquation.right) : null

  if (finalAnswers.length > 0) {
    const answersToBuild = parsedAnswers
      .map((answer, index) => {
        const projectedRight = anchorEquation
          ? evaluateExpressionWithVariable(anchorEquation.left, answer.variable, answer.value)
          : null

        return {
          answer,
          index,
          projectedRight,
          matchesAnchor: nearlyEqual(projectedRight, anchorRightValue),
        }
      })
      .filter(({ answer }) => !answerIsReached(guidedSteps, answer.raw))
      .sort((left, right) => Number(right.matchesAnchor) - Number(left.matchesAnchor) || left.index - right.index)

    answersToBuild.forEach(({ answer, index, projectedRight, matchesAnchor }) => {
      const multiBranch = parsedAnswers.length > 1
      const branchIndex = multiBranch ? index : 0
      const branchKey = multiBranch ? `branch-${branchIndex + 1}` : undefined
      const branchLabel = multiBranch ? `Branch ${branchIndex + 1}` : undefined
      let branchRightText = anchorEquation?.right ?? ''

      if (anchorEquation && projectedRight !== null && (!matchesAnchor || !branchRightText)) {
        branchRightText = formatEvaluatedNumber(projectedRight)
        guidedSteps = appendGuidedStep(guidedSteps, buildBranchEquationStep(anchorEquation.left, branchRightText, answer, branchIndex))
      }

      if (anchorEquation && anchorVariable === answer.variable) {
        const isolationStep = buildIsolationStep(anchorEquation.left, branchRightText || anchorEquation.right, answer, branchLabel, branchKey)
        if (isolationStep) {
          guidedSteps = appendGuidedStep(guidedSteps, isolationStep)
        }
      }

      guidedSteps = appendGuidedStep(guidedSteps, {
        ...buildFinalAnswerStep(answer, guidedSteps.length, branchLabel, branchKey),
      })
    })
  }

  const reachesFinalAnswers = finalAnswers.length === 0 || finalAnswers.every((answer) => answerIsReached(guidedSteps, answer))
  const synthesizedStepCount = guidedSteps.filter((step) => step.origin !== 'observed').length
  const providedMetadata = analysisResult.guidedSolutionMetadata ?? {
    source: 'observed-only' as const,
    isComplete: false,
    reachesFinalAnswers: false,
    synthesizedStepCount: 0,
    hasSynthesizedContinuation: false,
  }
  const source = deriveGuidedSolutionSource(options.analysisSource, options.cacheSource, synthesizedStepCount, providedGuidedSteps.length > 0)
  const metadata: TutorGuidedSolutionMetadata = {
    source: synthesizedStepCount > 0 ? source : providedMetadata.source,
    isComplete: finalAnswers.length === 0 ? guidedSteps.length > 0 : reachesFinalAnswers,
    reachesFinalAnswers,
    synthesizedStepCount,
    hasSynthesizedContinuation: synthesizedStepCount > 0,
    completenessReason: reachesFinalAnswers
      ? undefined
      : 'Guided solution does not reach every final answer yet.',
  }

  const validatorWarnings = metadata.isComplete
    ? analysisResult.validatorWarnings
    : Array.from(new Set([
        ...analysisResult.validatorWarnings,
        metadata.completenessReason,
      ].filter((warning): warning is string => Boolean(warning))))

  return {
    ...analysisResult,
    finalAnswers,
    steps: observedSteps,
    observedSteps,
    guidedSolutionSteps: guidedSteps.map((step, index) => ({ ...step, index })),
    guidedSolutionMetadata: metadata,
    validatorWarnings,
    canAnimate: guidedSteps.length > 1,
  }
}

function normalizeModelTier(value: unknown): WhiteboardTutorModelMetadata['tier'] {
  return value === 'stronger' ? 'stronger' : 'standard'
}

function normalizeModelMetadata(value: unknown): WhiteboardTutorModelMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined

  const candidate = value as Partial<WhiteboardTutorModelMetadata> & Record<string, unknown>

  const transcriptionModel = typeof candidate.transcriptionModel === 'string' && candidate.transcriptionModel.trim()
    ? candidate.transcriptionModel.trim()
    : null
  const evaluationModel = typeof candidate.evaluationModel === 'string' && candidate.evaluationModel.trim()
    ? candidate.evaluationModel.trim()
    : null

  return {
    tier: normalizeModelTier(candidate.tier),
    strongerModelAvailable: candidate.strongerModelAvailable === true,
    transcriptionModel,
    evaluationModel,
  }
}

function normalizeDetectedMathError(value: unknown): WhiteboardTutorDetectedMathError | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<WhiteboardTutorDetectedMathError> & Record<string, unknown>
  const stepIndex = typeof candidate.stepIndex === 'number' && Number.isFinite(candidate.stepIndex)
    ? Math.max(0, Math.round(candidate.stepIndex))
    : undefined
  const errorType = typeof candidate.errorType === 'string' && candidate.errorType.trim()
    ? candidate.errorType.trim() as WhiteboardTutorDetectedMathError['errorType']
    : undefined
  const explanation = typeof candidate.explanation === 'string' && candidate.explanation.trim()
    ? candidate.explanation.trim()
    : undefined

  if (stepIndex === undefined && !errorType && !explanation) return null

  return {
    stepIndex,
    errorType,
    explanation,
  }
}

function normalizeMathFacts(value: unknown): WhiteboardTutorMathFacts | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<WhiteboardTutorMathFacts> & Record<string, unknown>
  const domain = candidate.domain === 'arithmetic' || candidate.domain === 'algebra' ? candidate.domain : 'unknown'
  const confidence = candidate.confidence === 'high' || candidate.confidence === 'medium' ? candidate.confidence : 'low'
  const canonicalProblem = typeof candidate.canonicalProblem === 'string' && candidate.canonicalProblem.trim()
    ? candidate.canonicalProblem.trim()
    : null
  const verifiedAnswer = Array.isArray(candidate.verifiedAnswer)
    ? candidate.verifiedAnswer.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean)
    : null
  const verifiedSteps = Array.isArray(candidate.verifiedSteps)
    ? candidate.verifiedSteps.reduce<WhiteboardTutorMathFacts['verifiedSteps']>((result, entry) => {
        if (!entry || typeof entry !== 'object') return result

        const step = entry as Partial<WhiteboardTutorMathFacts['verifiedSteps'][number]> & Record<string, unknown>
        const stepIndex = typeof step.stepIndex === 'number' && Number.isFinite(step.stepIndex)
          ? Math.max(0, Math.round(step.stepIndex))
          : null
        if (stepIndex === null) return result

        result.push({
          stepIndex,
          expression: typeof step.expression === 'string' && step.expression.trim() ? step.expression.trim() : undefined,
          isValid: step.isValid === true,
          explanation: typeof step.explanation === 'string' && step.explanation.trim() ? step.explanation.trim() : undefined,
          errorType: typeof step.errorType === 'string' && step.errorType.trim()
            ? step.errorType.trim() as WhiteboardTutorMathFacts['verifiedSteps'][number]['errorType']
            : undefined,
        })

        return result
      }, [])
    : []

  return {
    supported: candidate.supported === true,
    domain,
    canonicalProblem,
    verifiedAnswer: verifiedAnswer && verifiedAnswer.length > 0 ? verifiedAnswer : null,
    verifiedSteps,
    detectedError: normalizeDetectedMathError(candidate.detectedError),
    confidence,
    unsupportedReason: typeof candidate.unsupportedReason === 'string' && candidate.unsupportedReason.trim()
      ? candidate.unsupportedReason.trim()
      : undefined,
  }
}

function normalizeAnalysisSource(value: unknown): WhiteboardTutorAnalysisSource | undefined {
  return value === 'deterministic' || value === 'fallback-llm' ? value : undefined
}

function normalizeAnalysisPipeline(value: unknown): WhiteboardTutorAnalysisPipeline | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<WhiteboardTutorAnalysisPipeline> & Record<string, unknown>
  const analysisSource = normalizeAnalysisSource(candidate.analysisSource)
  if (!analysisSource) return null

  const fallbackCandidate = candidate.fallback && typeof candidate.fallback === 'object'
    ? candidate.fallback as Record<string, unknown>
    : null

  return {
    analysisSource,
    deterministic: normalizeMathFacts(candidate.deterministic),
    fallback: {
      ran: fallbackCandidate?.ran === true,
      source: fallbackCandidate?.source === 'anthropic' ? 'anthropic' : null,
      type: fallbackCandidate?.type === 'llm-evaluation' ? 'llm-evaluation' : null,
      reason: typeof fallbackCandidate?.reason === 'string' && fallbackCandidate.reason.trim() ? fallbackCandidate.reason.trim() : undefined,
    },
  }
}

function buildLegacySteps(analysisResult: TutorAnalysisResult | null, fallbackSteps: WhiteboardTutorStep[]): WhiteboardTutorStep[] {
  if (!analysisResult || analysisResult.steps.length === 0) {
    return fallbackSteps
  }

  return analysisResult.steps.map((step, index) => ({
    number: index + 1,
    label: step.shortLabel,
    studentWork: step.studentText || step.normalizedMath || '',
    correct: step.status === 'correct',
    neutral: step.status === 'partial' || step.status === 'warning',
    explanation: [step.kidFriendlyExplanation, step.correction, step.hint].filter(Boolean).join('\n\n'),
  }))
}

function buildLegacyErrors(analysisResult: TutorAnalysisResult | null, fallbackErrors: WhiteboardTutorErrorItem[]): WhiteboardTutorErrorItem[] {
  if (!analysisResult || analysisResult.steps.length === 0) {
    return fallbackErrors
  }

  return analysisResult.steps
    .filter((step) => step.status !== 'correct' && (step.correction || step.hint))
    .map((step) => ({
      stepNumber: step.index + 1,
      issue: step.kidFriendlyExplanation,
      correction: step.correction || step.hint || '',
    }))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function toStepNumber(value: unknown, fallbackValue: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallbackValue
}

function normalizeStep(step: unknown, index: number): WhiteboardTutorStep | null {
  if (!step || typeof step !== 'object') return null

  const candidate = step as Partial<WhiteboardTutorStep> & Record<string, unknown>
  const studentWork = typeof candidate.studentWork === 'string' ? candidate.studentWork.trim() : ''
  const explanation = typeof candidate.explanation === 'string' ? candidate.explanation.trim() : ''

  return {
    number: toStepNumber(candidate.number ?? candidate.stepNumber, index + 1),
    label: typeof candidate.label === 'string' && candidate.label.trim()
      ? candidate.label.trim()
      : studentWork || explanation,
    studentWork,
    correct: Boolean(candidate.correct),
    neutral: Boolean(candidate.neutral),
    explanation,
  }
}

function normalizeErrorItem(item: unknown, index: number): WhiteboardTutorErrorItem | null {
  if (!item || typeof item !== 'object') return null
  const candidate = item as Partial<WhiteboardTutorErrorItem> & Record<string, unknown>

  return {
    stepNumber: toStepNumber(candidate.stepNumber, index + 1),
    issue: typeof candidate.issue === 'string' ? candidate.issue.trim() : '',
    correction: typeof candidate.correction === 'string' ? candidate.correction.trim() : '',
  }
}

type StructuredTutorPayload = Partial<Omit<WhiteboardTutorResponse, 'messages' | 'sections'>> & {
  sections?: Partial<WhiteboardTutorSections>
}

export function buildTutorResponse(payload: StructuredTutorPayload, messages: WhiteboardTutorMessage[]): WhiteboardTutorResponse {
  const rawAnalysisResult = normalizeAnalysisResult((payload as Record<string, unknown>).analysisResult)
  const modelMetadata = normalizeModelMetadata((payload as Record<string, unknown>).modelMetadata)
  const mathFacts = normalizeMathFacts((payload as Record<string, unknown>).mathFacts)
  const analysisSource = normalizeAnalysisSource((payload as Record<string, unknown>).analysisSource)
  const analysisPipeline = normalizeAnalysisPipeline((payload as Record<string, unknown>).analysisPipeline)
  const parsedAnalysisResult = buildGuidedSolutionResult(rawAnalysisResult, {
    analysisSource,
    cacheSource: payload.cacheSource,
    correctSolution: typeof payload.correctSolution === 'string' ? payload.correctSolution : undefined,
  })
  const fallbackSteps = Array.isArray(payload.steps)
    ? payload.steps.map(normalizeStep).filter((step): step is WhiteboardTutorStep => Boolean(step))
    : []
  const steps = buildLegacySteps(parsedAnalysisResult, fallbackSteps)
  const fallbackErrors = Array.isArray(payload.errorsFound)
    ? payload.errorsFound.map(normalizeErrorItem).filter((item): item is WhiteboardTutorErrorItem => Boolean(item))
    : []
  const errorsFound = buildLegacyErrors(parsedAnalysisResult, fallbackErrors)

  const problem = parsedAnalysisResult?.problemText || (typeof payload.problem === 'string' ? payload.problem.trim() : '')
  const correctSolution = parsedAnalysisResult?.finalAnswers.length
    ? parsedAnalysisResult.finalAnswers.join(', ')
    : typeof payload.correctSolution === 'string'
      ? payload.correctSolution.trim()
      : ''
  const closingEncouragement = parsedAnalysisResult?.overallSummary || (typeof payload.closingEncouragement === 'string' ? payload.closingEncouragement.trim() : '')
  const scoreTotal = typeof payload.scoreTotal === 'number' && Number.isFinite(payload.scoreTotal) ? payload.scoreTotal : steps.length
  const scoreCorrect = typeof payload.scoreCorrect === 'number' && Number.isFinite(payload.scoreCorrect)
    ? payload.scoreCorrect
    : steps.filter((step) => step.correct).length

  const sections: WhiteboardTutorSections = {
    problem,
    stepsAnalysis: steps.map((step) => `${step.number}. ${step.label}: ${step.explanation}`).join('\n'),
    errorsFound: [
      ...errorsFound.map((item) => `Step ${item.stepNumber}: ${item.issue}\n${item.correction}`),
      ...(parsedAnalysisResult?.validatorWarnings ?? []),
    ].join('\n\n'),
    encouragement: closingEncouragement,
  }

  const response: Omit<WhiteboardTutorResponse, 'messages' | 'reply'> = {
    ...EMPTY_RESPONSE,
    modelMetadata,
    mathFacts,
    analysisSource,
    analysisPipeline,
    analysisResult: parsedAnalysisResult,
    problem,
    correctSolution,
    scoreCorrect,
    scoreTotal,
    steps,
    errorsFound,
    closingEncouragement,
    sections: { ...EMPTY_SECTIONS, ...sections, ...(payload.sections ?? {}) },
  }

  return {
    reply: typeof payload.reply === 'string' ? payload.reply.trim() : '',
    messages,
    ...response,
  }
}

export function buildChatSeed(analysis: WhiteboardTutorResponse | null): WhiteboardTutorMessage[] {
  if (!analysis?.reply.trim()) return []
  return [
    {
      role: 'assistant',
      content: analysis.reply,
    },
  ]
}

function stripVisibleMarkdownDelimiters(value: string): string {
  return value
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
}

export function parseTutorListItems(value: string): string[] {
  return stripVisibleMarkdownDelimiters(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\s]+/, '').replace(/^\d+[.):-]?\s*/, '').trim())
    .filter(Boolean)
}

export function formatTutorRichText(value: string): string {
  // Fix 1: tutor replies were showing raw markdown syntax, so supported markdown is converted before rendering.
  return stripVisibleMarkdownDelimiters(
    escapeHtml(value)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_(?!\s)(.+?)(?<!\s)_(?!_)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\r?\n/g, '<br />'),
  )
}