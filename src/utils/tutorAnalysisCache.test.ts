import { beforeEach, describe, expect, it } from 'vitest'
import type { WhiteboardTutorResponse } from '../types/whiteboard'
import { buildTutorAnalysisDeviceCacheKey, clearTutorAnalysisDeviceCache, readTutorAnalysisDeviceCache, writeTutorAnalysisDeviceCache } from './tutorAnalysisCache'

const sampleResponse: WhiteboardTutorResponse = {
  reply: 'Problem: Solve 2x = 10',
  messages: [{ role: 'assistant', content: 'Solve 2x = 10' }],
  analysisResult: {
    problemText: 'Solve 2x = 10',
    finalAnswers: ['x = 5'],
    overallSummary: 'Nice work.',
    regions: [],
    steps: [],
    validatorWarnings: [],
    canAnimate: false,
  },
  sections: {
    problem: 'Solve 2x = 10',
    stepsAnalysis: '',
    errorsFound: '',
    encouragement: 'Nice work.',
  },
  problem: 'Solve 2x = 10',
  correctSolution: 'x = 5',
  scoreCorrect: 1,
  scoreTotal: 1,
  steps: [],
  errorsFound: [],
  closingEncouragement: 'Nice work.',
}

describe('tutorAnalysisCache', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return storage.size
        },
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        removeItem: (key: string) => {
          storage.delete(key)
        },
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
      },
    })
  })

  it('clears only the cached analysis entries for the specified board', () => {
    const boardOneKey = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'photo',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    })
    const boardTwoKey = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-2',
      inputMode: 'photo',
      imageDataUrl: 'data:image/png;base64,BBBB',
      imageMimeType: 'image/png',
      imageName: 'math-b.png',
    })

    writeTutorAnalysisDeviceCache(boardOneKey, sampleResponse)
    writeTutorAnalysisDeviceCache(boardTwoKey, sampleResponse)

    expect(boardOneKey).toBeTruthy()
    expect(boardTwoKey).toBeTruthy()
    expect(window.localStorage.getItem(boardOneKey!)).toBeTruthy()
    expect(window.localStorage.getItem(boardTwoKey!)).toBeTruthy()

    clearTutorAnalysisDeviceCache({ boardId: 'board-1' })

    expect(window.localStorage.getItem(boardOneKey!)).toBeNull()
    expect(window.localStorage.getItem(boardTwoKey!)).toBeTruthy()
  })

  it('discards stale cache entries that do not include structured analysis', () => {
    const cacheKey = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-legacy',
      inputMode: 'photo',
      imageDataUrl: 'data:image/png;base64,LEGACY',
      imageMimeType: 'image/png',
      imageName: 'legacy.png',
    })

    window.localStorage.setItem(cacheKey!, JSON.stringify({
      savedAt: new Date().toISOString(),
      response: {
        reply: 'Legacy payload',
        messages: [{ role: 'assistant', content: 'Legacy payload' }],
      },
    }))

    expect(readTutorAnalysisDeviceCache(cacheKey)).toBeNull()
    expect(window.localStorage.getItem(cacheKey!)).toBeNull()
  })

  it('builds different cache keys for different model tiers', () => {
    const standardKey = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'photo',
      mode: 'analysis',
      modelTier: 'standard',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    })

    const strongerKey = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'photo',
      mode: 'analysis',
      modelTier: 'stronger',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    })

    expect(standardKey).toBeTruthy()
    expect(strongerKey).toBeTruthy()
    expect(standardKey).not.toBe(strongerKey)
  })

  it('builds different cache keys for different text and image request inputs', () => {
    const textKeyA = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'text',
      mode: 'analysis',
      modelTier: 'standard',
      textContent: 'Solve 2x = 10',
    })
    const textKeyB = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'text',
      mode: 'analysis',
      modelTier: 'standard',
      textContent: 'Solve 3x = 12',
    })
    const imageKeyA = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'photo',
      mode: 'analysis',
      modelTier: 'standard',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    })
    const imageKeyB = buildTutorAnalysisDeviceCacheKey({
      boardId: 'board-1',
      inputMode: 'photo',
      mode: 'analysis',
      modelTier: 'standard',
      imageDataUrl: 'data:image/png;base64,BBBB',
      imageMimeType: 'image/png',
      imageName: 'math-b.png',
    })

    expect(textKeyA).toBeTruthy()
    expect(textKeyB).toBeTruthy()
    expect(imageKeyA).toBeTruthy()
    expect(imageKeyB).toBeTruthy()
    expect(textKeyA).not.toBe(textKeyB)
    expect(imageKeyA).not.toBe(imageKeyB)
  })
})
