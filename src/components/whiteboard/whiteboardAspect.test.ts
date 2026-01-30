import { describe, expect, it } from 'vitest'
import { BOARD_ASPECT, computeContainedRect } from './whiteboardAspect'

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
})
