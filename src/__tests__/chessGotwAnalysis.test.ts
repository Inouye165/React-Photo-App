import { describe, it, expect } from 'vitest'
import { getGotwEntry } from '../data/chessGotw'

describe('GOTW analysis data', () => {
  const entry = getGotwEntry('byrne-vs-fischer-1956')

  it('entry exists and has analysis pack', () => {
    expect(entry).not.toBeNull()
    expect(entry!.analysis).toBeDefined()
    expect(entry!.analysis!.byPly).toBeDefined()
    expect(entry!.analysis!.chapters).toBeDefined()
  })

  it('byPly lookup returns expected symbol for ply 34 (queen sacrifice)', () => {
    const a = entry!.analysis!.byPly[34]
    expect(a).toBeDefined()
    expect(a.classification).toBe('brilliant')
    expect(a.symbol).toBe('!!')
    expect(a.short).toContain('Queen sacrifice')
  })

  it('byPly lookup returns expected symbol for ply 33 (blunder)', () => {
    const a = entry!.analysis!.byPly[33]
    expect(a).toBeDefined()
    expect(a.classification).toBe('blunder')
    expect(a.symbol).toBe('??')
  })

  it('byPly lookup returns expected symbol for ply 22 (brilliant)', () => {
    const a = entry!.analysis!.byPly[22]
    expect(a).toBeDefined()
    expect(a.classification).toBe('brilliant')
    expect(a.symbol).toBe('!!')
  })

  it('chapters plies are within valid move range', () => {
    const totalMoves = entry!.moves.length
    for (const ch of entry!.analysis!.chapters) {
      expect(ch.ply).toBeGreaterThanOrEqual(1)
      expect(ch.ply).toBeLessThanOrEqual(totalMoves)
    }
  })

  it('chapters have titles and at least 3 chapters', () => {
    const chapters = entry!.analysis!.chapters
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    for (const ch of chapters) {
      expect(ch.title.length).toBeGreaterThan(0)
    }
  })

  it('unannotated ply returns undefined from byPly', () => {
    // Ply 1 (Nf3) has no analysis
    expect(entry!.analysis!.byPly[1]).toBeUndefined()
  })
})
