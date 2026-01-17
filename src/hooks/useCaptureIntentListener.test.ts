import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const navigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

vi.mock('../utils/isProbablyMobile', () => ({
  isProbablyMobile: vi.fn(() => true),
}))

vi.mock('../api', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    getOpenCaptureIntent: vi.fn(),
    consumeCaptureIntent: vi.fn(),
  }
})

describe('useCaptureIntentListener', () => {
  let useCaptureIntentListener: typeof import('./useCaptureIntentListener').useCaptureIntentListener
  let getOpenCaptureIntent: typeof import('../api').getOpenCaptureIntent
  let consumeCaptureIntent: typeof import('../api').consumeCaptureIntent

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    ;({ useCaptureIntentListener } = await import('./useCaptureIntentListener'))
    ;({ getOpenCaptureIntent, consumeCaptureIntent } = await import('../api'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('navigates and consumes when an open intent is returned', async () => {
    vi.mocked(getOpenCaptureIntent).mockResolvedValue({
      id: 'intent-1',
      photoId: 10,
      collectibleId: 55,
      state: 'open',
    })

    const { unmount } = renderHook(() => useCaptureIntentListener({ enabled: true }))

    await waitFor(() => {
      expect(getOpenCaptureIntent).toHaveBeenCalled()
    })

    expect(navigate).toHaveBeenCalledWith('/photos/10/edit?capture=1&collectibleId=55')
    expect(consumeCaptureIntent).toHaveBeenCalledWith('intent-1')

    unmount()
  })

  it('handles SSE capture intent events', async () => {
    vi.mocked(getOpenCaptureIntent).mockResolvedValue(null)

    const { unmount } = renderHook(() => useCaptureIntentListener({ enabled: true }))

    await waitFor(() => {
      expect(getOpenCaptureIntent).toHaveBeenCalled()
    })

    act(() => {
      window.dispatchEvent(
        new CustomEvent('capture-intent', {
          detail: { id: 'intent-2', photoId: 22, collectibleId: 99, state: 'open' },
        })
      )
    })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/photos/22/edit?capture=1&collectibleId=99')
    })

    expect(consumeCaptureIntent).toHaveBeenCalledWith('intent-2')

    unmount()
  })
})
