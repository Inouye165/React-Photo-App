/* eslint-env jest */

import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'

const mockGenerateContent = jest.fn()
const mockAnthropicCreate = jest.fn()

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockImplementation(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}))

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: mockAnthropicCreate,
    },
  })),
}))

const createWhiteboardRouter = require('../routes/whiteboard')

type RoomMember = { room_id: string; user_id: string }

type MockDbState = {
  roomMembers: RoomMember[]
}

function createMockDb(state: MockDbState) {
  const db = jest.fn((tableName: string) => {
    if (tableName === 'room_members') {
      const query: any = {
        _where: {},
        where: jest.fn(function where(conditions: Record<string, string>) {
          Object.assign(query._where, conditions)
          return query
        }),
        first: jest.fn().mockImplementation(() => {
          const row = state.roomMembers.find(
            (member) => member.room_id === query._where.room_id && member.user_id === query._where.user_id,
          )
          return Promise.resolve(row ?? null)
        }),
      }
      return query
    }

    throw new Error(`Unexpected table: ${tableName}`)
  })

  return db
}

function createTestApp({ db, authMode }: { db: ReturnType<typeof createMockDb>; authMode: 'ok' | 'unauthorized' }) {
  const app = express()
  app.use(express.json({ limit: '20mb' }))

  const authMiddleware = (req: Request & { user?: { id?: string } }, res: Response, next: NextFunction) => {
    if (authMode === 'unauthorized') {
      return res.status(401).json({ success: false, error: 'Unauthorized' })
    }
    req.user = { id: 'user-1', isTutor: true, role: 'user' }
    return next()
  }

  app.use('/api/whiteboards', authMiddleware, createWhiteboardRouter({ db }))
  return app
}

describe('whiteboard tutor route', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'
  const originalGeminiKey = process.env.GEMINI_API_KEY
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY
  const originalWhiteboardTranscriptionModel = process.env.WHITEBOARD_TRANSCRIPTION_MODEL

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    process.env.WHITEBOARD_TRANSCRIPTION_MODEL = 'gemini-2.0-flash'
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          problem: 'Solve 2x = 10',
          steps: [
            { stepNumber: 1, content: '2x = 10' },
            { stepNumber: 2, content: 'x = 5' },
          ],
        }),
      },
    })
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            problemText: 'Solve 2x = 10',
            finalAnswers: ['x = 5'],
            overallSummary: 'Nice work. You kept the equation balanced and got the right answer.',
            regions: [
              { id: 'region-1', x: 0.1, y: 0.2, width: 0.35, height: 0.12 },
              { id: 'region-2', x: 0.1, y: 0.36, width: 0.3, height: 0.12 },
            ],
            steps: [
              {
                id: 'step-1',
                index: 0,
                studentText: '2x = 10',
                normalizedMath: '2x = 10',
                status: 'correct',
                shortLabel: 'Start with the equation',
                kidFriendlyExplanation: 'Great start. You showed the equation clearly.',
                regionId: 'region-1',
              },
              {
                id: 'step-2',
                index: 1,
                studentText: 'x = 5',
                normalizedMath: 'x = 5',
                status: 'correct',
                shortLabel: 'Divide both sides by 2',
                kidFriendlyExplanation: 'Great job. Dividing both sides by 2 gives you x = 5.',
                regionId: 'region-2',
              },
            ],
            validatorWarnings: [],
            canAnimate: true,
          }),
        },
      ],
    })
  })

  afterEach(() => {
    if (originalGeminiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalGeminiKey
    }

    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey
    }

    if (originalWhiteboardTranscriptionModel === undefined) {
      delete process.env.WHITEBOARD_TRANSCRIPTION_MODEL
    } else {
      process.env.WHITEBOARD_TRANSCRIPTION_MODEL = originalWhiteboardTranscriptionModel
    }

    mockGenerateContent.mockReset()
    mockAnthropicCreate.mockReset()
  })

  test('returns tutor response for authenticated members', async () => {
    const db = createMockDb({ roomMembers: [{ room_id: boardId, user_id: 'user-1' }] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/tutor`)
      .send({
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageMimeType: 'image/png',
        imageName: 'math.png',
        mode: 'analysis',
      })

    expect(res.status).toBe(200)
    expect(res.body.boardId).toBe(boardId)
    expect(res.body.reply).toContain('Problem: Solve 2x = 10')
    expect(res.body.correctSolution).toContain('x = 5')
    expect(res.body.analysisResult).toMatchObject({
      problemText: 'Solve 2x = 10',
      finalAnswers: ['x = 5'],
      canAnimate: true,
    })
    expect(res.body.steps[0]).toMatchObject({ correct: true })
    expect(res.body.messages).toEqual([
      {
        role: 'assistant',
        content: expect.stringContaining('Problem: Solve 2x = 10'),
      },
    ])
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent.mock.invocationCallOrder[0]).toBeLessThan(mockAnthropicCreate.mock.invocationCallOrder[0])
  })

  test('includes the requested response age in the tutor prompt', async () => {
    const db = createMockDb({ roomMembers: [{ room_id: boardId, user_id: 'user-1' }] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/tutor`)
      .send({
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageMimeType: 'image/png',
        imageName: 'math.png',
        mode: 'analysis',
        audienceAge: 8,
      })

    expect(res.status).toBe(200)

    const anthropicPayload = mockAnthropicCreate.mock.calls[0]?.[0]
    const promptText = anthropicPayload?.messages?.[0]?.content

    expect(typeof promptText).toBe('string')
    expect(promptText).toContain("The student's age is: 8")
    expect(promptText).toContain('First solve this problem yourself')
    expect(promptText).toContain('Visible step transcriptions:')
  })

  test('recovers when transcription JSON is wrapped in fences and includes trailing commas', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => [
          'Here you go:',
          '',
          '```json',
          '{',
          '  "problem": "Solve 2x = 10",',
          '  "steps": [',
          '    { "stepNumber": 1, "content": "2x = 10" },',
          '    { "stepNumber": 2, "content": "x = 5" },',
          '  ],',
          '}',
          '```',
        ].join('\n'),
      },
    })

    const db = createMockDb({ roomMembers: [{ room_id: boardId, user_id: 'user-1' }] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/tutor`)
      .send({
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageMimeType: 'image/png',
        imageName: 'math.png',
        mode: 'analysis',
      })

    expect(res.status).toBe(200)
    expect(res.body.analysisResult.problemText).toBe('Solve 2x = 10')
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
  })

  test('retries transcription with a fallback Gemini model after invalid JSON', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: {
          text: () => 'not valid json',
        },
      })
      .mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            problem: 'Solve 2x = 10',
            steps: [
              { stepNumber: 1, content: '2x = 10' },
              { stepNumber: 2, content: 'x = 5' },
            ],
          }),
        },
      })

    const db = createMockDb({ roomMembers: [{ room_id: boardId, user_id: 'user-1' }] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/tutor`)
      .send({
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageMimeType: 'image/png',
        imageName: 'math.png',
        mode: 'analysis',
      })

    expect(res.status).toBe(200)
    expect(res.body.analysisResult.problemText).toBe('Solve 2x = 10')
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
  })

  test('denies tutor requests to non-members', async () => {
    const db = createMockDb({ roomMembers: [] })
    const app = createTestApp({ db, authMode: 'ok' })

    const res = await request(app)
      .post(`/api/whiteboards/${boardId}/tutor`)
      .send({
        imageDataUrl: 'data:image/png;base64,AAAA',
        imageMimeType: 'image/png',
      })

    expect(res.status).toBe(404)
    expect(mockGenerateContent).not.toHaveBeenCalled()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })
})