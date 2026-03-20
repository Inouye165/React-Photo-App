import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/httpClient'
import WhiteboardCanvas from './WhiteboardCanvas'

const providerStatusCallbacks = vi.hoisted(() => [] as Array<(status: 'connected' | 'disconnected') => void>)
const providerInstances = vi.hoisted(() => [] as Array<{ destroy: ReturnType<typeof vi.fn> }>)

const { fetchWhiteboardWsToken, createWhiteboardYjsProvider } = vi.hoisted(() => ({
  fetchWhiteboardWsToken: vi.fn(),
  createWhiteboardYjsProvider: vi.fn((options: { onStatus?: (status: 'connected' | 'disconnected') => void }) => {
    if (options.onStatus) {
      providerStatusCallbacks.push(options.onStatus)
    }

    const instance = {
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

    providerInstances.push(instance)
    return instance
  }),
}))

vi.mock('../../api', () => ({
  API_BASE_URL: 'http://localhost:3001',
}))

vi.mock('../../api/whiteboard', () => ({
  fetchWhiteboardSnapshot: vi.fn(),
  fetchWhiteboardWsToken,
}))

vi.mock('../../realtime/whiteboardYjsProvider', () => ({
  createWhiteboardYjsProvider,
}))

vi.mock('../LuminaCaptureSession', () => ({
  default: () => null,
}))

describe('WhiteboardCanvas realtime status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    providerStatusCallbacks.length = 0
    providerInstances.length = 0
    fetchWhiteboardWsToken.mockResolvedValue({ token: 'ws-ticket' })
  })

  it('refreshes the ws ticket after reconnect exhaustion and recovers without manual retry', async () => {
    const statusChanges: string[] = []
    const unsentChangeStates: boolean[] = []

    fetchWhiteboardWsToken
      .mockResolvedValueOnce({ token: 'ws-ticket-1' })
      .mockResolvedValueOnce({ token: 'ws-ticket-2' })

    render(
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

    await waitFor(() => {
      expect(fetchWhiteboardWsToken).toHaveBeenCalledTimes(2)
      expect(providerStatusCallbacks).toHaveLength(2)
    })

    expect(createWhiteboardYjsProvider).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ wsToken: 'ws-ticket-2' }),
    )
    expect(providerInstances[0]?.destroy).toHaveBeenCalledTimes(1)
    expect(statusChanges).not.toContain('failed')

    expect(statusChanges).toContain('reconnecting')

    await act(async () => {
      providerStatusCallbacks[1]?.('connected')
    })

    expect(statusChanges.at(-1)).toBe('connected')
    expect(unsentChangeStates).not.toContain(true)
  })

  it('goes offline and reports access denied when ws-ticket refresh is rejected with 403', async () => {
    const statusChanges: string[] = []
    const onAccessDenied = vi.fn()

    fetchWhiteboardWsToken
      .mockResolvedValueOnce({ token: 'ws-ticket-1' })
      .mockRejectedValueOnce(new ApiError('Forbidden', { status: 403 }))

    render(
      <WhiteboardCanvas
        boardId="board-1"
        token="token-1"
        reconnectKey={0}
        mode="pad"
        onRealtimeStatusChange={(status) => statusChanges.push(status)}
        onAccessDenied={onAccessDenied}
      />,
    )

    await waitFor(() => {
      expect(providerStatusCallbacks).toHaveLength(1)
    })

    for (let index = 0; index < 7; index += 1) {
      await act(async () => {
        providerStatusCallbacks[0]?.('disconnected')
      })
    }

    await waitFor(() => {
      expect(fetchWhiteboardWsToken).toHaveBeenCalledTimes(2)
      expect(onAccessDenied).toHaveBeenCalledTimes(1)
    })

    expect(statusChanges.at(-1)).toBe('offline')
    expect(providerStatusCallbacks).toHaveLength(1)
    expect(createWhiteboardYjsProvider).toHaveBeenCalledTimes(1)
    expect(providerInstances[0]?.destroy).toHaveBeenCalledTimes(1)
  })
})