import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HomePage from './HomePage'

const requestMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../api', () => ({
  getPhotoStatus: vi.fn(async () => ({ success: true, total: 0 })),
  getPhotos: vi.fn(async () => ({ success: true, photos: [] })),
}))

vi.mock('../api/httpClient', () => ({
  request: (...args: unknown[]) => requestMock(...args),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../components/UserMenu', () => ({
  default: ({ onOpenAdmin }: { onOpenAdmin?: () => void }) => (
    <div>
      <button type="button">User menu</button>
      {onOpenAdmin ? (
        <button type="button" onClick={onOpenAdmin}>
          Admin control
        </button>
      ) : null}
    </div>
  ),
}))

function renderHome(initialEntry = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/chat" element={<h1>Messages Page</h1>} />
        <Route path="/chess" element={<h1>Chess Hub</h1>} />
        <Route path="/gallery" element={<h1>Photos Page</h1>} />
        <Route path="/admin" element={<h1>Admin Page</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

function setMobileViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 390,
  })
  window.dispatchEvent(new Event('resize'))
}

function setDesktopViewport() {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1280,
  })
  window.dispatchEvent(new Event('resize'))
}

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestMock.mockResolvedValue({ success: true })
    localStorage.clear()
    setDesktopViewport()
    useAuthMock.mockReturnValue({
      user: { app_metadata: { role: 'user' } },
    })
  })

  it('renders primary continue action and navigates to default chess route', async () => {
    const user = userEvent.setup()

    renderHome()

    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument()
    const continueButton = screen.getByRole('button', { name: 'Continue to Chess Hub' })
    expect(continueButton).toBeInTheDocument()

    await user.click(continueButton)

    expect(screen.getByRole('heading', { name: 'Chess Hub' })).toBeInTheDocument()
  })

  it('uses stored continue route preference when available', async () => {
    const user = userEvent.setup()
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => {
      if (key === 'home:continue-route') return '/chat'
      return null
    })

    renderHome()

    const continueButton = screen.getByRole('button', { name: 'Continue to Messages' })
    await user.click(continueButton)

    expect(screen.getByRole('heading', { name: 'Messages Page' })).toBeInTheDocument()
  })

  it('renders secondary CTAs once per destination', () => {
    renderHome()

    expect(screen.getByRole('button', { name: 'Open Messages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Chess' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Experimental Photos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suggest a Game' })).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: 'Open Messages' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Open Chess' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Open Experimental Photos' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Suggest a Game' })).toHaveLength(1)
  })

  it('renders games card with chess available and coming soon games disabled', () => {
    renderHome()

    expect(screen.getByRole('button', { name: 'Open Chess' })).toBeEnabled()
    expect(screen.getAllByText('Available')).toHaveLength(1)
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThanOrEqual(2)

    const comingSoonButtons = screen.getAllByRole('button', { name: /coming soon/i })
    expect(comingSoonButtons).toHaveLength(2)
    for (const button of comingSoonButtons) {
      expect(button).toBeDisabled()
    }
  })

  it('keeps labs content in one section with one experimental photos CTA', () => {
    renderHome()

    expect(screen.getByRole('heading', { name: 'Labs' })).toBeInTheDocument()
    expect(screen.getByText('Labs: early features you can try.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open Experimental Photos' })).toHaveLength(1)
    expect(screen.queryByText('Other (experimental)')).not.toBeInTheDocument()
  })

  it('navigates to Photos when Open Experimental Photos is clicked', async () => {
    const user = userEvent.setup()

    renderHome()

    await user.click(screen.getByRole('button', { name: 'Open Experimental Photos' }))

    expect(screen.getByRole('heading', { name: 'Photos Page' })).toBeInTheDocument()
  })

  it('shows admin control only for admin users', async () => {
    const user = userEvent.setup()

    useAuthMock.mockReturnValue({
      user: { app_metadata: { role: 'user' } },
    })
    renderHome()
    expect(screen.queryByRole('button', { name: 'Admin control' })).not.toBeInTheDocument()

    useAuthMock.mockReturnValue({
      user: { app_metadata: { role: 'admin' } },
    })
    renderHome()

    const adminButton = screen.getByRole('button', { name: 'Admin control' })
    expect(adminButton).toBeInTheDocument()
    await user.click(adminButton)

    expect(screen.getByRole('heading', { name: 'Admin Page' })).toBeInTheDocument()
  })

  it('submits a game suggestion from feedback card', async () => {
    const user = userEvent.setup()

    renderHome()

    await user.type(screen.getByLabelText('Suggest a game'), 'Add cooperative trivia mode')
    await user.click(screen.getByRole('button', { name: 'Suggest a Game' }))

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

  it('navigates to chess hub when Open Chess is clicked', async () => {
    const user = userEvent.setup()

    renderHome()

    await user.click(screen.getByRole('button', { name: 'Open Chess' }))

    expect(screen.getByRole('heading', { name: 'Chess Hub' })).toBeInTheDocument()
  })

  it('renders compact mobile launcher and opens games panel with back navigation', async () => {
    const user = userEvent.setup()
    setMobileViewport()

    renderHome()

    expect(screen.getByRole('heading', { name: 'Launcher' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Games' }))

    expect(screen.getByLabelText('Games panel')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(screen.queryByLabelText('Games panel')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Launcher' })).toBeInTheDocument()
  })

  it('opens mobile labs panel and navigates to experimental photos', async () => {
    const user = userEvent.setup()
    setMobileViewport()

    renderHome()

    await user.click(screen.getByRole('button', { name: 'Labs' }))
    expect(screen.getByLabelText('Labs panel')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Experimental Photos' }))
    expect(screen.getByRole('heading', { name: 'Photos Page' })).toBeInTheDocument()
  })
})
