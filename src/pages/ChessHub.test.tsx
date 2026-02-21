import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChessHub from './ChessHub'

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}))

describe('ChessHub', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three primary actions', () => {
    render(<ChessHub />)

    expect(screen.getByRole('button', { name: /Play vs Computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Play vs Opponent \(Invite\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tutorials/i })).toBeInTheDocument()
  })

  it('routes actions into existing chess flows', async () => {
    const user = userEvent.setup()
    render(<ChessHub />)

    await user.click(screen.getByRole('button', { name: /Play vs Computer/i }))
    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=analyze')

    await user.click(screen.getByRole('button', { name: /Play vs Opponent \(Invite\)/i }))
    expect(navigateMock).toHaveBeenCalledWith('/games')

    await user.click(screen.getByRole('button', { name: /Tutorials/i }))
    expect(navigateMock).toHaveBeenCalledWith('/games/local?tab=lesson&tutor=1&storyId=architect-of-squares')
  })
})