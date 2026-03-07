import type {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cleanSectionBody(value: string): string {
  return value.replace(/^[-:\s]+/, '').trim()
}

function sectionValue(reply: string, header: string, nextHeaders: string[]): string {
  const pattern = new RegExp(
    `${header}\\s*:?\\s*([\\s\\S]*?)(?=${nextHeaders.join('|')}|$)`,
    'i',
  )
  const match = reply.match(pattern)
  return cleanSectionBody(match?.[1] ?? '')
}

function parseStepLine(line: string, fallbackNumber: number): WhiteboardTutorStep | null {
  const cleaned = line.replace(/^[-*•\s]+/, '').trim()
  if (!cleaned) return null

  const match = cleaned.match(/^(\d+)[.):-]?\s*(.*)$/)
  const number = match ? Number(match[1]) : fallbackNumber
  const rawBody = (match?.[2] ?? cleaned).trim()
  if (!rawBody) return null

  const normalized = rawBody.replace(/\s+/g, ' ').trim()
  const isIncorrect = /(incorrect|wrong|error|mistake|not correct|issue)/i.test(normalized)
  const isCorrect = !isIncorrect && /(correct|right|valid|good|looks good)/i.test(normalized)
  const parts = normalized.split(/\s+(?:because|but|however|instead|needs to)\s+/i)

  return {
    number,
    description: parts[0]?.trim() || normalized,
    isCorrect,
    errorExplanation: isIncorrect && parts.length > 1 ? parts.slice(1).join(' ').trim() : null,
  }
}

export function parseTutorReply(reply: string): Pick<WhiteboardTutorResponse, 'sections' | 'steps'> {
  const sections: WhiteboardTutorSections = {
    problem: sectionValue(reply, 'Problem', ['Steps Analysis', 'Errors Found', 'Encouragement']),
    stepsAnalysis: sectionValue(reply, 'Steps Analysis', ['Errors Found', 'Encouragement']),
    errorsFound: sectionValue(reply, 'Errors Found', ['Encouragement']),
    encouragement: sectionValue(reply, 'Encouragement', []),
  }

  const steps = (sections.stepsAnalysis || '')
    .split(/\r?\n/)
    .map((line, index) => parseStepLine(line, index + 1))
    .filter((step): step is WhiteboardTutorStep => Boolean(step))

  return {
    sections: { ...EMPTY_SECTIONS, ...sections },
    steps,
  }
}

export function buildTutorResponse(reply: string, messages: WhiteboardTutorMessage[]): WhiteboardTutorResponse {
  const parsed = parseTutorReply(reply)
  return {
    reply,
    messages,
    sections: parsed.sections,
    steps: parsed.steps,
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