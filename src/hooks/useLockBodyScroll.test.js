import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLockBodyScroll } from './useLockBodyScroll.js'

describe('useLockBodyScroll', () => {
  it('locks body scroll and restores previous overflow on unmount', () => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'scroll'

    const { unmount } = renderHook(() => useLockBodyScroll(true))

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('scroll')

    // restore test environment
    document.body.style.overflow = prev
  })

  it('does nothing when locked=false', () => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'auto'

    const { unmount } = renderHook(() => useLockBodyScroll(false))

    expect(document.body.style.overflow).toBe('auto')

    unmount()

    expect(document.body.style.overflow).toBe('auto')

    // restore test environment
    document.body.style.overflow = prev
  })
})
