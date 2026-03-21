import { createHash } from 'crypto'

type WhiteboardTutorCacheKeyMessage = {
  role?: 'user' | 'assistant'
  content?: string
}

type WhiteboardTutorCacheKeyBody = {
  imageDataUrl?: string
  imageMimeType?: string
  imageName?: string
  inputMode?: 'photo' | 'text'
  textContent?: string
  audienceAge?: number
  messages?: WhiteboardTutorCacheKeyMessage[]
  mode?: 'analysis' | 'tutor' | 'chat'
  modelTier?: 'standard' | 'stronger'
}

function normalizeTutorCacheMessages(messages: WhiteboardTutorCacheKeyMessage[] | undefined): WhiteboardTutorCacheKeyMessage[] {
  return (messages ?? []).map((message) => ({
    role: message.role,
    content: typeof message.content === 'string' ? message.content.trim() : '',
  }))
}

function resolveTutorModelTier(value: WhiteboardTutorCacheKeyBody['modelTier']): 'standard' | 'stronger' {
  return value === 'stronger' ? 'stronger' : 'standard'
}

export function buildWhiteboardTutorCacheKey(
  boardId: string,
  body: WhiteboardTutorCacheKeyBody,
  version = 'v1',
): string {
  const effectiveInputMode = body.inputMode === 'text' ? 'text' : 'photo'
  const normalizedPayload = JSON.stringify({
    version,
    boardId,
    mode: body.mode ?? 'analysis',
    modelTier: resolveTutorModelTier(body.modelTier),
    inputMode: effectiveInputMode,
    audienceAge: typeof body.audienceAge === 'number' ? body.audienceAge : null,
    textContent: body.textContent?.trim() || null,
    imageDataUrl: effectiveInputMode === 'photo' ? body.imageDataUrl?.trim() || null : null,
    imageMimeType: effectiveInputMode === 'photo' ? body.imageMimeType?.trim() || null : null,
    imageName: effectiveInputMode === 'photo' ? body.imageName?.trim() || null : null,
    messages: normalizeTutorCacheMessages(body.messages),
  })

  return createHash('sha256').update(normalizedPayload).digest('hex')
}