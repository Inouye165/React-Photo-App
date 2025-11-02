import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useAIPolling from './useAIPolling.jsx'
import useStore from '../store.js'
import * as api from '../api.js'

// Helper to allow pending promises inside hooks to resolve
const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useAIPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Prime the store with a photo that already has AI metadata
    useStore.setState({
      photos: [
        {
          id: 107,
          caption: 'Original caption',
          description: 'Original description',
          keywords: 'original keywords',
        }
      ],
      pollingPhotoId: 107,
      pollingPhotoIds: new Set(),
  toast: { message: '', severity: 'info' },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    // Reset the pieces of state we touched so other tests start clean
    useStore.setState({
      photos: [],
      pollingPhotoId: null,
      pollingPhotoIds: new Set(),
  toast: { message: '', severity: 'info' },
    })
  })

  it('continues polling until AI metadata actually changes', async () => {
    const getPhotoMock = vi.spyOn(api, 'getPhoto')
    const baselineResponse = {
      success: true,
      photo: {
        id: 107,
        caption: 'Original caption',
        description: 'Original description',
        keywords: 'original keywords',
      },
    }
    const updatedResponse = {
      success: true,
      photo: {
        id: 107,
        caption: 'Fresh caption',
        description: 'Updated description',
        keywords: 'updated keywords',
      },
    }

    // First call captures the baseline, second call is the immediate poll, third call returns new AI data
    getPhotoMock
      .mockResolvedValueOnce(baselineResponse)
      .mockResolvedValueOnce(baselineResponse)
      .mockResolvedValueOnce(updatedResponse)

    const updateSpy = vi.spyOn(useStore.getState(), 'updatePhoto')

    const { unmount } = renderHook(() => useAIPolling())

    // Allow the baseline fetch + first poll to resolve
    await flushPromises()
    await flushPromises()

    expect(getPhotoMock).toHaveBeenCalledTimes(2)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(useStore.getState().pollingPhotoId).toBe(107)

    // Advance the polling interval so the hook fetches again and sees the change
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await flushPromises()

    expect(getPhotoMock).toHaveBeenCalledTimes(3)
    expect(updateSpy).toHaveBeenCalledTimes(1)

    const storedPhoto = useStore.getState().photos.find(p => String(p.id) === '107')
    expect(storedPhoto).toBeTruthy()
    expect(storedPhoto.description).toBe('Updated description')
    expect(storedPhoto.caption).toBe('Fresh caption')
    expect(storedPhoto.keywords).toBe('updated keywords')
    expect(useStore.getState().pollingPhotoId).toBeNull()

    unmount()
    updateSpy.mockRestore()
    getPhotoMock.mockRestore()
  })
})