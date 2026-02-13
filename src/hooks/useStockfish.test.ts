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
  let workerConstructorMock: ReturnType<typeof vi.fn>

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

    workerConstructorMock = vi.fn(() => {
      const worker = new MockStockfishWorker()
      workerInstances.push(worker)
      return worker
    })
    vi.stubGlobal('Worker', workerConstructorMock)
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

  it('uses configured stockfish worker path when safe', () => {
    vi.stubEnv('VITE_STOCKFISH_WORKER_PATH', '/stockfish/custom-worker.js')
    renderHook(() => useStockfish())

    expect(workerConstructorMock).toHaveBeenCalledWith('/stockfish/custom-worker.js')
  })

  it('falls back to default worker path when configured path is unsafe', () => {
    vi.stubEnv('VITE_STOCKFISH_WORKER_PATH', 'https://evil.example/worker.js')
    renderHook(() => useStockfish())

    expect(workerConstructorMock).toHaveBeenCalledWith('/stockfish/stockfish-17.1-lite-single-03e3232.js')
  })

  it('queues engine move until an ongoing analysis search stops', async () => {
    const { result } = renderHook(() => useStockfish())
    const worker = workerInstances[0]

    act(() => {
      worker.emit('uciok')
      worker.emit('readyok')
    })

    const fenA = '8/8/8/8/8/8/8/8 w - - 0 1'
    const fenB = '8/8/8/8/8/8/8/8 b - - 0 1'

    act(() => {
      result.current.analyzePosition(fenA)
    })

    let resolvedMove: string | null = null
    const pendingMove = result.current.getEngineMove(fenB).then((move) => {
      resolvedMove = move
    })

    expect(worker.postedCommands).toContain('stop')
    expect(worker.postedCommands).not.toContain(`position fen ${fenB}`)

    act(() => {
      worker.emit('bestmove e2e4')
    })

    expect(worker.postedCommands).toContain(`position fen ${fenB}`)

    act(() => {
      worker.emit('bestmove e7e5')
    })

    await pendingMove
    expect(resolvedMove).toBe('e7e5')
  })

  it('queues the latest analysis fen while search is in progress', () => {
    const { result } = renderHook(() => useStockfish())
    const worker = workerInstances[0]

    act(() => {
      worker.emit('uciok')
      worker.emit('readyok')
    })

    const fenA = '8/8/8/8/8/8/8/8 w - - 0 1'
    const fenB = '8/8/8/8/8/8/8/8 b - - 0 1'

    act(() => {
      result.current.analyzePosition(fenA)
      result.current.analyzePosition(fenB)
    })

    expect(worker.postedCommands).toContain('stop')
    expect(worker.postedCommands.filter((cmd) => cmd === `position fen ${fenB}`)).toHaveLength(0)

    act(() => {
      worker.emit('bestmove e2e4')
    })

    expect(worker.postedCommands).toContain(`position fen ${fenB}`)
  })
})
