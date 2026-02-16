import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// Mock the activity API before importing the hook
vi.mock('../api/activity', () => ({
  logActivity: vi.fn(() => Promise.resolve()),
}))

import { useActivityTracker } from './useActivityTracker'
import { logActivity } from '../api/activity'

const mockedLogActivity = vi.mocked(logActivity)

function wrapper({ children, initialEntries = ['/'] }: { children: React.ReactNode; initialEntries?: string[] }) {
  return React.createElement(MemoryRouter, { initialEntries }, children)
}

function createWrapper(initialEntries: string[] = ['/']) {
  return ({ children }: { children: React.ReactNode }) => wrapper({ children, initialEntries })
}

describe('useActivityTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedLogActivity.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing when not authenticated', () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: false, onInactivityLogout }), {
      wrapper: createWrapper(),
    })

    expect(mockedLogActivity).not.toHaveBeenCalled()
    expect(onInactivityLogout).not.toHaveBeenCalled()
  })

  it('logs page_view when navigating to /gallery', () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(['/gallery']),
    })

    expect(mockedLogActivity).toHaveBeenCalledWith('page_view', { page: 'gallery' })
  })

  it('logs page_view when navigating to /chat', () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(['/chat']),
    })

    expect(mockedLogActivity).toHaveBeenCalledWith('page_view', { page: 'messages' })
  })

  it('logs page_view when navigating to /games', () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(['/games']),
    })

    expect(mockedLogActivity).toHaveBeenCalledWith('page_view', { page: 'games' })
  })

  it('does not log page_view for untracked routes', () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(['/settings']),
    })

    expect(mockedLogActivity).not.toHaveBeenCalled()
  })

  it('triggers auto-logout after 1 hour of inactivity', async () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(),
    })

    // Advance past the 1-hour timeout
    await act(async () => {
      vi.advanceTimersByTime(60 * 60 * 1000 + 100)
    })

    expect(mockedLogActivity).toHaveBeenCalledWith('auto_logout_inactive', {
      reason: 'No activity for 1 hour',
    })
    expect(onInactivityLogout).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on user activity events', async () => {
    const onInactivityLogout = vi.fn()
    renderHook(() => useActivityTracker({ isAuthenticated: true, onInactivityLogout }), {
      wrapper: createWrapper(),
    })

    // Advance 50 minutes
    await act(async () => {
      vi.advanceTimersByTime(50 * 60 * 1000)
    })

    // Simulate mouse activity — reset timer
    act(() => {
      window.dispatchEvent(new Event('mousedown'))
    })

    // Advance another 50 minutes (total 100 from start, 50 from last activity)
    await act(async () => {
      vi.advanceTimersByTime(50 * 60 * 1000)
    })

    // Should NOT have logged out yet (only 50 min since last activity)
    expect(onInactivityLogout).not.toHaveBeenCalled()

    // Advance another 11 minutes to pass the 1-hour mark since last activity
    await act(async () => {
      vi.advanceTimersByTime(11 * 60 * 1000)
    })

    expect(onInactivityLogout).toHaveBeenCalledTimes(1)
  })

  it('clears timers when user becomes unauthenticated', async () => {
    const onInactivityLogout = vi.fn()
    const { rerender } = renderHook(
      ({ isAuthenticated }) => useActivityTracker({ isAuthenticated, onInactivityLogout }),
      {
        wrapper: createWrapper(),
        initialProps: { isAuthenticated: true },
      },
    )

    // Become unauthenticated
    rerender({ isAuthenticated: false })

    // Advance well past 1 hour — should NOT trigger since not authenticated
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 60 * 1000)
    })

    expect(onInactivityLogout).not.toHaveBeenCalled()
  })
})
