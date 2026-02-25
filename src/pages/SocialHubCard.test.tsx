import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SocialHubCard from './SocialHubCard'

describe('SocialHubCard', () => {
  it('sets aria-selected and tabIndex following the active tab', () => {
    render(<SocialHubCard />)

    const messagesTab = screen.getByRole('tab', { name: /new messages/i })
    const requestsTab = screen.getByRole('tab', { name: /game requests/i })

    expect(messagesTab).toHaveAttribute('aria-selected', 'true')
    expect(messagesTab).toHaveAttribute('tabindex', '0')
    expect(requestsTab).toHaveAttribute('aria-selected', 'false')
    expect(requestsTab).toHaveAttribute('tabindex', '-1')
  })

  it('supports Arrow/Home/End navigation and updates tabpanel content', async () => {
    const user = userEvent.setup()
    render(<SocialHubCard />)

    const messagesTab = screen.getByRole('tab', { name: /new messages/i })
    const requestsTab = screen.getByRole('tab', { name: /game requests/i })

    messagesTab.focus()
    await user.keyboard('{ArrowRight}')

    expect(requestsTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('social-requests-panel')).toBeInTheDocument()

    await waitFor(() => {
      expect(document.activeElement?.id).toBe('social-requests-panel')
    })

    requestsTab.focus()
    await user.keyboard('{Home}')

    expect(messagesTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('social-messages-panel')).toBeInTheDocument()

    messagesTab.focus()
    await user.keyboard('{End}')

    expect(requestsTab).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('social-requests-panel')).toBeInTheDocument()
  })
})
