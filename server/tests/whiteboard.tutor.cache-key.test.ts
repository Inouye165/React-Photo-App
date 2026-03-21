/* eslint-env jest */

const { buildWhiteboardTutorCacheKey } = require('../routes/whiteboardTutorCacheKey')

describe('whiteboard tutor cache key', () => {
  const boardId = '11111111-1111-4111-8111-111111111111'

  test('treats omitted inputMode as photo and differentiates distinct photo payloads', () => {
    const keyA = buildWhiteboardTutorCacheKey(boardId, {
      mode: 'analysis',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    })

    const keyB = buildWhiteboardTutorCacheKey(boardId, {
      mode: 'analysis',
      imageDataUrl: 'data:image/png;base64,BBBB',
      imageMimeType: 'image/png',
      imageName: 'math-b.png',
    })

    expect(keyA).not.toBe(keyB)
  })

  test('matches the explicit photo-mode key when inputMode is omitted', () => {
    const body = {
      mode: 'analysis',
      imageDataUrl: 'data:image/png;base64,AAAA',
      imageMimeType: 'image/png',
      imageName: 'math-a.png',
    }

    expect(buildWhiteboardTutorCacheKey(boardId, body)).toBe(
      buildWhiteboardTutorCacheKey(boardId, { ...body, inputMode: 'photo' }),
    )
  })
})