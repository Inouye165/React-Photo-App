import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStockfish } from './useStockfish'

type WorkerMessageEvent = { data: unknown }

class MockStockfishWorker {
  public onmessage: ((event: WorkerMessageEvent) => void) | null = null
  public onerror: (() => void) | null = null
  public onmessageerror: (() => void) | null = null
  public postedCommands: string[] = []

  postMessage(message: string) {
    this.postedCommands.push(message)
  }

  terminate() {}

  emit(message: string) {
    this.onmessage?.({ data: message })
  }
}

describe('useStockfish', () => {
  let workerInstances: MockStockfishWorker[] = []
  let capturedTimeoutCallback: (() => void) | null = null

  beforeEach(() => {
    workerInstances = []
    capturedTimeoutCallback = null

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler: TimerHandler) => {
      if (typeof handler === 'function') {
        capturedTimeoutCallback = handler as () => void
      }
      return 1 as unknown as ReturnType<typeof setTimeout>
    })
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined)

    vi.stubGlobal(
      'Worker',
      vi.fn(() => {
        const worker = new MockStockfishWorker()
        workerInstances.push(worker)
        return worker
      }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejects pending engine move when bestmove never arrives', async () => {
    const { result } = renderHook(() => useStockfish())

    const worker = workerInstances[0]
    expect(worker).toBeDefined()

    act(() => {
      worker.emit('uciok')
      worker.emit('readyok')
    })

    expect(result.current.isReady).toBe(true)

    let moveError: unknown = null

    await act(async () => {
      const pending = result.current.getEngineMove('8/8/8/8/8/8/8/8 w - - 0 1').catch((error) => {
        moveError = error
      })
      expect(capturedTimeoutCallback).toBeTypeOf('function')
      capturedTimeoutCallback?.()
      await pending
    })

    expect(moveError).toBeInstanceOf(Error)
    expect((moveError as Error).message).toBe('Engine move timeout')
    expect(worker.postedCommands).toContain('stop')
  })
})
