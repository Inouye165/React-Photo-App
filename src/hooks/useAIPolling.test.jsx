import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useAIPolling from './useAIPolling.jsx'
import * as api from '../api'

describe('useAIPolling (no-op)', () => {
  it('does not perform network polling (single source of truth)', async () => {
    const getPhotoMock = vi.spyOn(api, 'getPhoto')
    const { unmount } = renderHook(() => useAIPolling())

    // Even if timers advance, this hook should not create a competing poller.
    await act(async () => {
      await Promise.resolve()
    })

    expect(getPhotoMock).not.toHaveBeenCalled()
    unmount()
    getPhotoMock.mockRestore()
  })
})