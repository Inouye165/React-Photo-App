import { describe, expect, it, vi } from 'vitest'
import { openSingletonWindow } from './openSingletonWindow'

describe('openSingletonWindow', () => {
  it('opens a named window and focuses it', () => {
    const focus = vi.fn()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ focus } as unknown as Window)

    openSingletonWindow('/chat/room-1/pad', 'whiteboard-pad-room-1')

    expect(openSpy).toHaveBeenCalledWith('/chat/room-1/pad', 'whiteboard-pad-room-1')
    expect(focus).toHaveBeenCalled()

    openSpy.mockRestore()
  })

  it('handles blocked popups gracefully', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const result = openSingletonWindow('/chat/room-2/pad', 'whiteboard-pad-room-2')

    expect(openSpy).toHaveBeenCalledWith('/chat/room-2/pad', 'whiteboard-pad-room-2')
    expect(result).toBeNull()

    openSpy.mockRestore()
  })
})
