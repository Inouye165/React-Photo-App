import type {
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
  sections: EMPTY_SECTIONS,
  problem: '',
  correctSolution: '',
  scoreCorrect: 0,
  scoreTotal: 0,
  steps: [],
  errorsFound: [],
  closingEncouragement: '',
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
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : `Step ${index + 1}`,
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

type StructuredTutorPayload = Partial<Omit<WhiteboardTutorResponse, 'messages' | 'reply' | 'sections'>> & {
  sections?: Partial<WhiteboardTutorSections>
}

function buildReplySummary(response: Omit<WhiteboardTutorResponse, 'messages' | 'reply'>): string {
  const stepLines = response.steps.map((step) => `${step.number}. ${step.label}: ${step.explanation}`)
  const errorLines = response.errorsFound.map((item) => `Step ${item.stepNumber}: ${item.issue} ${item.correction}`.trim())

  return [
    `Problem: ${response.problem}`,
    '',
    'Steps Analysis:',
    ...(stepLines.length > 0 ? stepLines : ['No step details available.']),
    '',
    'Errors Found:',
    ...(errorLines.length > 0 ? errorLines : ['None.']),
    '',
    `Encouragement: ${response.closingEncouragement}`,
  ].join('\n')
}

export function buildTutorResponse(payload: StructuredTutorPayload, messages: WhiteboardTutorMessage[]): WhiteboardTutorResponse {
  const steps = Array.isArray(payload.steps)
    ? payload.steps.map(normalizeStep).filter((step): step is WhiteboardTutorStep => Boolean(step))
    : []
  const errorsFound = Array.isArray(payload.errorsFound)
    ? payload.errorsFound.map(normalizeErrorItem).filter((item): item is WhiteboardTutorErrorItem => Boolean(item))
    : []

  const problem = typeof payload.problem === 'string' ? payload.problem.trim() : ''
  const correctSolution = typeof payload.correctSolution === 'string' ? payload.correctSolution.trim() : ''
  const closingEncouragement = typeof payload.closingEncouragement === 'string' ? payload.closingEncouragement.trim() : ''
  const scoreTotal = typeof payload.scoreTotal === 'number' && Number.isFinite(payload.scoreTotal) ? payload.scoreTotal : steps.length
  const scoreCorrect = typeof payload.scoreCorrect === 'number' && Number.isFinite(payload.scoreCorrect)
    ? payload.scoreCorrect
    : steps.filter((step) => step.neutral || step.correct).length

  const sections: WhiteboardTutorSections = {
    problem,
    stepsAnalysis: steps.map((step) => `${step.number}. ${step.label}: ${step.explanation}`).join('\n'),
    errorsFound: errorsFound.map((item) => `Step ${item.stepNumber}: ${item.issue}\n${item.correction}`).join('\n\n'),
    encouragement: closingEncouragement,
  }

  const response: Omit<WhiteboardTutorResponse, 'messages' | 'reply'> = {
    ...EMPTY_RESPONSE,
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
    reply: buildReplySummary(response),
    messages,
    ...response,
  }
}

export function buildChatSeed(analysis: WhiteboardTutorResponse | null): WhiteboardTutorMessage[] {
  if (!analysis) return []
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