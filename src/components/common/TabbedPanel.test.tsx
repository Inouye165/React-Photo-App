import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TabbedPanel from './TabbedPanel'

describe('TabbedPanel', () => {
  it('switches tabs and notifies on click', () => {
    const handleTabChange = vi.fn()

    render(
      <TabbedPanel
        initialTab="alpha"
        onTabChange={handleTabChange}
        tabs={[
          { id: 'alpha', label: 'Alpha', content: <div>Alpha content</div> },
          { id: 'beta', label: 'Beta', content: <div>Beta content</div> },
        ]}
      />,
    )

    expect(screen.getByText('Alpha content')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Beta' }))

    expect(handleTabChange).toHaveBeenCalledWith('beta')
    expect(screen.getByText('Beta content')).toBeInTheDocument()
  })
})