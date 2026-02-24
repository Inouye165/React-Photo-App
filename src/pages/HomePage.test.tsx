import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomePage from './HomePage'

const requestMock = vi.fn()

vi.mock('../api', () => ({
  getPhotoStatus: vi.fn(async () => ({ success: true, total: 0 })),
  getPhotos: vi.fn(async () => ({ success: true, photos: [] })),
}))

vi.mock('../api/httpClient', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestMock.mockResolvedValue({ success: true })
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
    expect(screen.getByText('Messaging and games are front and center.')).toBeInTheDocument()
  })

  it('navigates to Photos when Open Experimental Photos is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/gallery" element={<h1>Photos Page</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    const openPhotosButtons = screen.getAllByRole('button', { name: 'Open Experimental Photos' })
    await user.click(openPhotosButtons[0])

    expect(screen.getByRole('heading', { name: 'Photos Page' })).toBeInTheDocument()
  })

  it('navigates to chess hub when Open Chess Hub is clicked', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chess" element={<h1>Chess Hub</h1>} />
        </Routes>
      </MemoryRouter>,
    )

    const openChessButtons = screen.getAllByRole('button', { name: 'Open Chess Hub' })
    await user.click(openChessButtons[0])

    expect(screen.getByRole('heading', { name: 'Chess Hub' })).toBeInTheDocument()
  })

  it('submits a game suggestion from home page', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText('Suggest a game'), 'Add cooperative trivia mode')
    await user.click(screen.getByRole('button', { name: 'Submit suggestion' }))

    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/feedback',
      method: 'POST',
      body: expect.objectContaining({
        category: 'game-suggestion',
        message: 'Add cooperative trivia mode',
      }),
    }))
    expect(screen.getByText('Suggestion submitted. Thank you!')).toBeInTheDocument()
  })
})
