import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WhiteboardCanvas from './WhiteboardCanvas'

const providerStatusCallbacks = vi.hoisted(() => [] as Array<(status: 'connected' | 'disconnected') => void>)

const { fetchWhiteboardWsToken } = vi.hoisted(() => ({
  fetchWhiteboardWsToken: vi.fn(),
}))

vi.mock('../../api', () => ({
  API_BASE_URL: 'http://localhost:3001',
}))

vi.mock('../../api/whiteboard', () => ({
  fetchWhiteboardSnapshot: vi.fn(),
  fetchWhiteboardWsToken,
}))

vi.mock('../../realtime/whiteboardYjsProvider', () => ({
  createWhiteboardYjsProvider: vi.fn((options: { onStatus?: (status: 'connected' | 'disconnected') => void }) => {
    if (options.onStatus) {
      providerStatusCallbacks.push(options.onStatus)
    }

    return {
      doc: {
        getMap: vi.fn(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
        on: vi.fn(),
        off: vi.fn(),
      },
      provider: {
        on: vi.fn(),
        off: vi.fn(),
        disconnect: vi.fn(),
        shouldConnect: true,
        destroy: vi.fn(),
      },
      destroy: vi.fn(),
    }
  }),
}))

vi.mock('../LuminaCaptureSession', () => ({
  default: () => null,
}))

describe('WhiteboardCanvas realtime status', () => {
  beforeEach(() => {
    providerStatusCallbacks.length = 0
    fetchWhiteboardWsToken.mockResolvedValue({ token: 'ws-ticket' })
  })

  it('reaches failed after retry exhaustion and recovers through manual reconnect', async () => {
    const statusChanges: string[] = []
    const unsentChangeStates: boolean[] = []

    const { rerender } = render(
      <WhiteboardCanvas
        boardId="board-1"
        token="token-1"
        reconnectKey={0}
        mode="pad"
        onRealtimeStatusChange={(status) => statusChanges.push(status)}
        onPossibleUnsentChangesChange={(value) => unsentChangeStates.push(value)}
      />,
    )

    await waitFor(() => {
      expect(providerStatusCallbacks).toHaveLength(1)
      expect(statusChanges).toContain('connecting')
    })

    for (let index = 0; index < 7; index += 1) {
      await act(async () => {
        providerStatusCallbacks[0]?.('disconnected')
      })
    }

    expect(statusChanges.at(-1)).toBe('failed')

    rerender(
      <WhiteboardCanvas
        boardId="board-1"
        token="token-1"
        reconnectKey={1}
        mode="pad"
        onRealtimeStatusChange={(status) => statusChanges.push(status)}
        onPossibleUnsentChangesChange={(value) => unsentChangeStates.push(value)}
      />,
    )

    await waitFor(() => {
      expect(providerStatusCallbacks).toHaveLength(2)
      expect(statusChanges).toContain('reconnecting')
    })

    await act(async () => {
      providerStatusCallbacks[1]?.('connected')
    })

    expect(statusChanges.at(-1)).toBe('connected')
    expect(unsentChangeStates).not.toContain(true)
  })
})