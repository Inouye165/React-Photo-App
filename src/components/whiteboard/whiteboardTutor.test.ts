import { describe, expect, it } from 'vitest'
import { formatTutorRichText } from './whiteboardTutor'

describe('formatTutorRichText', () => {
  it('converts bold markdown and strips heading syntax before rendering', () => {
    const formatted = formatTutorRichText('## Problem\n**Step 4:** **Solve for x**')

    expect(formatted).not.toContain('**')
    expect(formatted).not.toContain('##')
    expect(formatted).toContain('<strong>Step 4:</strong>')
    expect(formatted).toContain('<strong>Solve for x</strong>')
  })

  it('removes orphaned markdown asterisks from the rendered output', () => {
    const formatted = formatTutorRichText('**\nSolve for x: 5x - 7 = 18\n**')

    expect(formatted).not.toContain('**')
    expect(formatted).not.toContain('*')
    expect(formatted).toContain('Solve for x: 5x - 7 = 18')
  })
})
