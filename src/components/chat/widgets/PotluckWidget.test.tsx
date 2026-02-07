import { render, within } from '@testing-library/react'
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
    const { container } = render(
      <PotluckWidget
        metadata={baseMetadata}
        currentUserId="user-1"
        memberDirectory={{ 'user-2': 'Alex' }}
        memberProfiles={{ 'user-2': { avatarUrl: 'https://example.com/avatar.png' } }}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    const buttons = scope.getAllByRole('button', { name: /claimed by alex/i })
    const avatarButton = buttons.find((candidate) => within(candidate).queryByRole('img'))

    expect(avatarButton).toBeDefined()
    const avatar = within(avatarButton as HTMLElement).getByRole('img', { name: /claimed by alex/i })

    expect(avatar).toHaveAttribute('src', 'https://example.com/avatar.png')
    expect(within(avatarButton as HTMLElement).queryByText('Claimed')).toBeNull()
  })

  it('keeps the claimed label when no avatar is available', () => {
    const { container } = render(
      <PotluckWidget
        metadata={baseMetadata}
        currentUserId="user-1"
        memberDirectory={{ 'user-2': 'Alex' }}
        memberProfiles={{ 'user-2': { avatarUrl: null } }}
        onUpdate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    const scope = within(container)
    const buttons = scope.getAllByRole('button', { name: /claimed by alex/i })
    const claimedButton = buttons.find((candidate) => within(candidate).queryByText('Claimed'))

    expect(claimedButton).toBeDefined()

    expect(within(claimedButton as HTMLElement).getByText('Claimed')).toBeInTheDocument()
    expect(within(claimedButton as HTMLElement).queryByRole('img')).toBeNull()
  })
})
