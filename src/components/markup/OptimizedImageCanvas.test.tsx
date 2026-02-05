import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OptimizedImageCanvas from './OptimizedImageCanvas'

describe('OptimizedImageCanvas', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sets internal canvas dimensions and revokes object URL on unmount', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:canvas-url')

    const ctx = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      clearRect: vi.fn(),
      drawImage: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)

    const mockImage = {
      onload: null as null | (() => void),
      set src(_value: string) {
        this.onload?.()
      },
    }

    vi.stubGlobal('Image', vi.fn(() => mockImage))

    const { container, unmount } = render(
      <OptimizedImageCanvas
        image={{ blob: new Blob(['x'], { type: 'image/webp' }), width: 640, height: 480 }}
      />,
    )

    const canvas = container.querySelector('canvas') as HTMLCanvasElement

    await waitFor(() => {
      expect(canvas.width).toBe(640)
      expect(canvas.height).toBe(480)
    })

    expect(ctx.drawImage).toHaveBeenCalled()

    unmount()
    expect(revokeSpy).toHaveBeenCalledWith('blob:canvas-url')
  })
})
