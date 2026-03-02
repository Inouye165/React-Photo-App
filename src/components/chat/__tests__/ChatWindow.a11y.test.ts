import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const file = path.resolve(__dirname, '..', 'ChatWindow.tsx')
const src = fs.readFileSync(file, 'utf8')

describe('ChatWindow accessibility hints', () => {
  it('includes aria-labels for key icon buttons and textarea', () => {
    expect(src).toContain('aria-label="Attach photo"')
    expect(src).toContain('aria-label="Room info"')
    expect(src).toContain('aria-label="Close photo picker"')
    expect(src).toContain('aria-label="Remove attached photo"')
    expect(src).toContain('aria-label="Message input"')
  })
})
