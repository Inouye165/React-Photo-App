import type {
  TutorAnalysisResult,
  TutorDetectedRegion,
  TutorStepAnalysis,
  TutorStepStatus,
  WhiteboardTutorDetectedMathError,
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

function normalizeAnalysisResult(value: unknown): TutorAnalysisResult | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<TutorAnalysisResult> & Record<string, unknown>

  const regions = Array.isArray(candidate.regions)
    ? candidate.regions.map(normalizeRegion).filter((region): region is TutorDetectedRegion => Boolean(region))
    : []
  const regionIds = new Set(regions.map((region) => region.id))

  const steps = Array.isArray(candidate.steps)
    ? candidate.steps
        .map(normalizeAnalysisStep)
        .filter((step): step is TutorStepAnalysis => Boolean(step))
        .map((step) => (
          step.regionId && !regionIds.has(step.regionId)
            ? { ...step, regionId: undefined }
            : step
        ))
    : []

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
    steps,
    validatorWarnings: toTextArray(candidate.validatorWarnings),
    canAnimate: typeof candidate.canAnimate === 'boolean' ? candidate.canAnimate : steps.length > 1,
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
  const parsedAnalysisResult = normalizeAnalysisResult((payload as Record<string, unknown>).analysisResult)
  const modelMetadata = normalizeModelMetadata((payload as Record<string, unknown>).modelMetadata)
  const mathFacts = normalizeMathFacts((payload as Record<string, unknown>).mathFacts)
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