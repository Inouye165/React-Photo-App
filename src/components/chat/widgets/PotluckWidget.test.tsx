import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PotluckWidget from './PotluckWidget'

const baseMetadata = {
  potluck: {
    items: [
      { id: 'item-1', label: 'Chips', claimedByUserId: 'user-2' },
    ],
    allergies: [],
  },
}

describe('PotluckWidget', () => {
  it('shows the claimer avatar inside the claimed button when available', () => {
    render(
      <PotluckWidget
        metadata={baseMetadata}
        currentUserId="user-1"
        memberDirectory={{ 'user-2': 'Alex' }}
        memberProfiles={{ 'user-2': { avatarUrl: 'https://example.com/avatar.png' } }}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const button = screen.getByRole('button', { name: /claimed by alex/i })
    const avatar = within(button).getByRole('img', { name: /claimed by alex/i })

    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png')
    expect(within(button).queryByText('Claimed')).toBeNull()
  })

  it('keeps the claimed label when no avatar is available', () => {
    render(
      <PotluckWidget
        metadata={baseMetadata}
        currentUserId="user-1"
        memberDirectory={{ 'user-2': 'Alex' }}
        memberProfiles={{ 'user-2': { avatarUrl: null } }}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const button = screen.getByRole('button', { name: /claimed by alex/i })

    expect(within(button).getByText('Claimed')).toBeInTheDocument()
    expect(within(button).queryByRole('img')).toBeNull()
  })
})
