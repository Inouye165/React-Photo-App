// @ts-nocheck
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

// Mock environment variable globally
vi.stubEnv('VITE_API_URL', 'http://localhost:3001')

// Mock API functions
vi.mock('./api', () => ({
  getPhotos: vi.fn(),
  uploadPhotoToServer: vi.fn(),
  checkPrivilege: vi.fn(),
  checkPrivilegesBatch: vi.fn(),
  updatePhotoState: vi.fn(),
  recheckInprogressPhotos: vi.fn(),
  updatePhotoCaption: vi.fn(),
  getAuthHeaders: vi.fn(() => ({})),
  request: vi.fn().mockResolvedValue({ success: true }),
  fetchModelAllowlist: vi.fn().mockResolvedValue({ models: ['gpt-4o-mini'], source: 'test', updatedAt: null }),
  getDependencyStatus: vi.fn().mockResolvedValue({ dependencies: { aiQueue: true } }),
  API_BASE_URL: ''
}))

vi.mock('./layouts/AuthWrapper', () => ({
  default: ({ children }) => React.createElement(React.Fragment, null, children),
}))

vi.mock('./hooks/useUnreadMessages', () => ({
  useUnreadMessages: vi.fn(() => ({
    unreadCount: 0,
    unreadByRoom: {},
    hasUnread: false,
    loading: false,
    refresh: vi.fn(),
  })),
}))


// Mock EXIF parsing
vi.mock('exifr', () => ({
  parse: vi.fn(),
}))

// Mock ALL heavy components to reduce memory footprint
vi.mock('./ImageCanvasEditor', () => ({
  default: () => React.createElement('div', { 'data-testid': 'image-canvas-editor' }, 'Canvas Editor')
}))

vi.mock('./EditPage', () => ({
  default: () => React.createElement('div', { 'data-testid': 'edit-page' }, 'Edit Page')
}))

vi.mock('./PhotoUploadForm', () => ({
  default: () => React.createElement('div', { 'data-testid': 'photo-upload-form' }, 'Upload Form')
}))

vi.mock('./PhotoGallery', () => ({
  default: ({ photos }) => React.createElement('div', { 'data-testid': 'photo-gallery' },
    `Gallery: ${photos?.length || 0} photos`
  )
}))

vi.mock('./components/PhotoTable', () => ({
  default: () => React.createElement('div', { 'data-testid': 'photo-table' }, 'Photo Table')
}))

vi.mock('./components/MetadataModal', () => ({
  default: () => React.createElement('div', { 'data-testid': 'metadata-modal' }, 'Metadata Modal')
}))

import App from './App.tsx'
import { getPhotos, checkPrivilegesBatch } from './api'
import useStore from './store'

// Test for session expiration event handling
describe('App Component - Session Expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPhotos.mockResolvedValue({ photos: [] })
    checkPrivilegesBatch.mockResolvedValue({})
    window.history.pushState({}, '', '/gallery')
  })

  afterEach(() => {
    cleanup()
  })

  it('displays session expired banner when global auth event fires', async () => {
    render(<App />)
    
    // Get initial banner state
    const initialBanner = useStore.getState().banner

    // Dispatch the session expired event
    window.dispatchEvent(new CustomEvent('auth:session-expired', {
      detail: { status: 401 }
    }))

    // Check that the banner was set in the store
    await waitFor(() => {
      const banner = useStore.getState().banner
      expect(banner).toBeDefined()
      expect(banner.message).toMatch(/Session expired/i)
      expect(banner.message).not.toBe(initialBanner?.message || '')
      expect(banner.severity).toBe('error')
    }, { timeout: 2000 })
  })

  it('cleans up event listener on unmount to prevent memory leaks', async () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(<App />)

    await waitFor(() => {
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'auth:session-expired',
        expect.any(Function)
      )
    })

    // Get the listener function that was registered
    const listenerCall = addEventListenerSpy.mock.calls.find(
      call => call[0] === 'auth:session-expired'
    )
    const listener = listenerCall?.[1]

    unmount()

    // Verify the same listener was removed
    await waitFor(() => {
      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'auth:session-expired',
        listener
      )
    })

    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })

  it('handles multiple session expired events without errors', async () => {
    render(<App />)

    // Dispatch multiple events
    window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { status: 401 } }))
    window.dispatchEvent(new CustomEvent('auth:session-expired', { detail: { status: 403 } }))

    // Verify the banner is set (last event wins)
    await waitFor(() => {
      const banner = useStore.getState().banner
      expect(banner).toBeDefined()
      expect(banner.message).toMatch(/Session expired/i)
      expect(banner.severity).toBe('error')
    }, { timeout: 2000 })
  })
})

describe('App Component - Smoke Tests', () => {
  const mockPhotos = [
    {
      id: 1,
      filename: 'test1.jpg',
      state: 'working',
      file_size: 1024000,
      hash: 'abc123',
      metadata: { DateTimeOriginal: '2024-01-01 12:00:00' },
      thumbnail: '/thumbnails/test1_thumb.jpg',
      caption: 'Test caption',
    }
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getPhotos.mockResolvedValue({ photos: mockPhotos })
    checkPrivilegesBatch.mockResolvedValue({ 'test1.jpg': 'RW' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.pushState({}, '', '/gallery')
  })

  afterEach(() => {
    console.error.mockRestore?.()
    cleanup()
    vi.clearAllTimers()
  })

  it('renders without crashing', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('photo-gallery')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('loads and displays photos from API', async () => {
    render(<App />)
    await waitFor(() => {
      expect(getPhotos).toHaveBeenCalled()
    }, { timeout: 3000 })
  })

  it('displays photo gallery with correct count', async () => {
    render(<App />)
    await waitFor(() => {
      const gallery = screen.getByTestId('photo-gallery')
      expect(gallery).toHaveTextContent('1 photos')
    }, { timeout: 3000 })
  })
})