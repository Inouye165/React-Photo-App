import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCroppedBlob } from './avatarCropper'

type MockCanvas = {
  width: number
  height: number
  getContext: (type: string) => any
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void
}

describe('createCroppedBlob', () => {
  const originalCreateElement = document.createElement
  const originalImage = globalThis.Image

  beforeEach(() => {
    const mockImage = {
      width: 640,
      height: 480,
      onload: null as null | (() => void),
      onerror: null as null | ((error: unknown) => void),
      set src(_url: string) {
        if (this.onload) {
          setTimeout(() => this.onload && this.onload(), 0)
        }
      },
    }

    globalThis.Image = vi.fn(() => mockImage as unknown as HTMLImageElement)
  })

  afterEach(() => {
    document.createElement = originalCreateElement
    globalThis.Image = originalImage
    vi.clearAllMocks()
  })

  it('uses the requested WebP mime type for the cropped blob', async () => {
    const crop = { x: 10, y: 20, width: 100, height: 80 }
    let capturedType: string | undefined
    let capturedQuality: number | undefined
    let capturedWidth: number | undefined
    let capturedHeight: number | undefined

    const mockContext = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      drawImage: vi.fn(),
    }

    const mockCanvas: MockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockContext),
      toBlob: (callback, type, quality) => {
        capturedType = type
        capturedQuality = quality
        capturedWidth = mockCanvas.width
        capturedHeight = mockCanvas.height
        callback(new Blob(['cropped'], { type: type ?? 'image/webp' }))
      },
    }

    document.createElement = vi.fn((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement
      return originalCreateElement.call(document, tag)
    })

    const result = await createCroppedBlob('blob:mock-image', crop, { width: 120, height: 90 }, 0.88, 'image/webp')

    expect(result.type).toBe('image/webp')
    expect(capturedType).toBe('image/webp')
    expect(capturedQuality).toBeCloseTo(0.88, 2)
    expect(capturedWidth).toBe(120)
    expect(capturedHeight).toBe(90)
  })
})
