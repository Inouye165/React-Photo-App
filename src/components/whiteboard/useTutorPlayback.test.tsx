import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTutorPlayback } from './useTutorPlayback'

const steps = [
  { id: 'step-1' },
  { id: 'step-2' },
  { id: 'step-3' },
]

describe('useTutorPlayback', () => {
  it('starts in quick assist mode until walkthrough is entered', () => {
    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: false, initialStepId: 'step-2' }))

    expect(result.current.isWalkthroughActive).toBe(false)
    expect(result.current.activeStepId).toBeNull()

    act(() => {
      result.current.enterWalkthrough()
    })

    expect(result.current.isWalkthroughActive).toBe(true)
    expect(result.current.activeStepId).toBe('step-2')
  })

  it('starts on the provided initial step when one is available', () => {
    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: false, initialStepId: 'step-2' }))

    act(() => {
      result.current.enterWalkthrough()
    })

    expect(result.current.activeStepId).toBe('step-2')
  })

  it('exits walkthrough cleanly and returns to quick assist mode', () => {
    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: false, initialStepId: 'step-2' }))

    act(() => {
      result.current.enterWalkthrough('step-3')
    })
    expect(result.current.activeStepId).toBe('step-3')

    act(() => {
      result.current.exitWalkthrough()
    })

    expect(result.current.isWalkthroughActive).toBe(false)
    expect(result.current.activeStepId).toBeNull()
  })

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

  it('pauses autoplay when the user navigates steps manually', () => {
    vi.useFakeTimers()

    const { result } = renderHook(() => useTutorPlayback({ steps, reducedMotion: false, intervalMs: 1200 }))

    act(() => {
      result.current.play()
    })

    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.next()
    })

    expect(result.current.activeStepId).toBe('step-2')
    expect(result.current.isPlaying).toBe(false)

    vi.useRealTimers()
  })
})
