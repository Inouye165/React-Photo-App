import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { optimizeImageForMarkup } from './imageOptimization'

describe('optimizeImageForMarkup', () => {
  const originalCreateElement = document.createElement.bind(document)

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.createElement = originalCreateElement
    vi.unstubAllGlobals()
  })

  const setupCanvasMocks = () => {
    const canvases: Array<{ width: number; height: number }> = []

    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'canvas') {
        const ctx = {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: 'low',
          drawImage: vi.fn(),
        }
        const canvas = {
          width: 0,
          height: 0,
          getContext: vi.fn(() => ctx),
          toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
            callback(new Blob(['webp'], { type: 'image/webp' }))
          }),
        }
        canvases.push(canvas)
        return canvas as unknown as HTMLCanvasElement
      }
      return originalCreateElement(tagName)
    })

    return canvases
  }

  it('preserves aspect ratio and outputs WebP blobs', async () => {
    const canvases = setupCanvasMocks()
    const bitmap = {
      width: 4000,
      height: 3000,
      close: vi.fn(),
    }

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' })
    const result = await optimizeImageForMarkup(file)

    expect(result.variants).toHaveLength(3)
    expect(result.variants.map((variant) => variant.width)).toEqual([1920, 1280, 640])
    expect(result.variants.map((variant) => variant.height)).toEqual([1440, 960, 480])

    const ratio = result.original.width / result.original.height
    for (const variant of result.variants) {
      expect(variant.width / variant.height).toBeCloseTo(ratio, 5)
      expect(variant.blob.type).toBe('image/webp')
    }

    expect(canvases).toHaveLength(3)
  })

  it('revokes object URLs when using Image fallback', async () => {
    setupCanvasMocks()

    vi.stubGlobal('createImageBitmap', undefined)

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url')

    const mockImage = {
      naturalWidth: 800,
      naturalHeight: 600,
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      set src(_value: string) {
        this.onload?.()
      },
    }

    vi.stubGlobal('Image', vi.fn(() => mockImage))

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
    await optimizeImageForMarkup(file)

    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('rejects unsupported file types', async () => {
    setupCanvasMocks()

    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    await expect(optimizeImageForMarkup(file)).rejects.toThrow('Unsupported file type')
  })
})
