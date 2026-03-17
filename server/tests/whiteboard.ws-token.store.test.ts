describe('whiteboard ws token store', () => {
  test('allows the same ws token to be validated more than once before expiry', () => {
    jest.isolateModules(() => {
      const { createWhiteboardWsToken, consumeWhiteboardWsToken } = require('../realtime/whiteboardWsTokens')
      const boardId = '11111111-1111-4111-8111-111111111111'
      const ticket = createWhiteboardWsToken({ boardId, userId: 'user-1' })

      expect(consumeWhiteboardWsToken({ token: ticket.token, boardId })).toEqual({ ok: true, userId: 'user-1' })
      expect(consumeWhiteboardWsToken({ token: ticket.token, boardId })).toEqual({ ok: true, userId: 'user-1' })
    })
  })
})
