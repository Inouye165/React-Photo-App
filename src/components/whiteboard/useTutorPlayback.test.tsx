import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTutorPlayback } from './useTutorPlayback'

const steps = [
  { id: 'step-1' },
  { id: 'step-2' },
  { id: 'step-3' },
]

describe('useTutorPlayback', () => {
  it('moves through steps in order during playback', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: false, intervalMs: 1200 }))

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(result.current.activeStepId).toBe('step-2')

    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(result.current.activeStepId).toBe('step-3')
    expect(result.current.isPlaying).toBe(false)

    vi.useRealTimers()
  })

  it('still advances playback when reduced motion is enabled', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: true, intervalMs: 2000 }))

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(1200)
    })

    expect(result.current.activeStepId).toBe('step-2')

    vi.useRealTimers()
  })
})
