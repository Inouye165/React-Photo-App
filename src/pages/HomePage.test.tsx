import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomePage from './HomePage'

vi.mock('../api', () => ({
  getPhotoStatus: vi.fn(async () => ({ success: true, total: 0 })),
  getPhotos: vi.fn(async () => ({ success: true, photos: [] })),
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Home heading on root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByText('Messaging and games front and center, with photos available whenever you need them.')).toBeInTheDocument()
  })

  it('navigates to Photos when Open Photos is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/gallery" element={<h1>Photos Page</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    const openPhotosButtons = screen.getAllByRole('button', { name: 'Open Photos' })
    await user.click(openPhotosButtons[0])

    expect(screen.getByRole('heading', { name: 'Photos Page' })).toBeInTheDocument()
  })

  it('navigates to games index when Open Games is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<h1>Games Hub</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    const openGamesButtons = screen.getAllByRole('button', { name: 'Open Games' })
    await user.click(openGamesButtons[0])

    expect(screen.getByRole('heading', { name: 'Games Hub' })).toBeInTheDocument()
  })
})
