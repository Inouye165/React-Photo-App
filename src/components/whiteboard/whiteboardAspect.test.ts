import { describe, expect, it } from 'vitest'
import { BOARD_ASPECT, computeContainedRect, computeWhiteboardFrameRect, resolveWhiteboardAspect } from './whiteboardAspect'

describe('computeContainedRect', () => {
  it('uses height to fit when wrapper is wider than aspect', () => {
    const rect = computeContainedRect(800, 300, BOARD_ASPECT)
    expect(rect.height).toBe(300)
    expect(rect.width).toBeCloseTo(300 * BOARD_ASPECT)
    expect(rect.left).toBeCloseTo((800 - rect.width) / 2)
    expect(rect.top).toBe(0)
  })

  it('uses width to fit when wrapper is taller than aspect', () => {
    const rect = computeContainedRect(300, 800, BOARD_ASPECT)
    expect(rect.width).toBe(300)
    expect(rect.height).toBeCloseTo(300 / BOARD_ASPECT)
    expect(rect.left).toBe(0)
    expect(rect.top).toBeCloseTo((800 - rect.height) / 2)
  })

  it('matches wrapper when aspect matches', () => {
    const width = 640
    const height = 480
    const rect = computeContainedRect(width, height, width / height)
    expect(rect.left).toBe(0)
    expect(rect.top).toBe(0)
    expect(rect.width).toBe(width)
    expect(rect.height).toBe(height)
  })

  it('uses the background aspect when one is provided', () => {
    const rect = computeWhiteboardFrameRect(1000, 600, 16 / 9)
    expect(rect.width).toBe(1000)
    expect(rect.height).toBeCloseTo(562.5)
    expect(rect.top).toBeCloseTo((600 - rect.height) / 2)
  })

  it('falls back to the default board aspect for invalid background ratios', () => {
    expect(resolveWhiteboardAspect(0)).toBe(BOARD_ASPECT)
    expect(resolveWhiteboardAspect(Number.NaN)).toBe(BOARD_ASPECT)
    expect(resolveWhiteboardAspect(undefined)).toBe(BOARD_ASPECT)
  })
})
