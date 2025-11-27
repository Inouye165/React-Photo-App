import React from 'react'
import { render, waitFor, screen } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach } from 'vitest'

// Mock the API helper module (use literals inside the factory; vi.mock is hoisted)
vi.mock('./api.js', () => ({
  fetchProtectedBlobUrl: vi.fn().mockResolvedValue('blob:fake-url'),
  revokeBlobUrl: vi.fn(),
  fetchModelAllowlist: vi.fn().mockResolvedValue({ models: ['gpt-4o-mini'], source: 'test', updatedAt: null }),
  API_BASE_URL: 'http://api'
}))

// Mock useAuth context
vi.mock('./contexts/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({ session: { user: { id: 'test-user' } } })
}))

// Mock the store to return a photo when selectors are applied
vi.mock('./store.js', () => ({
  default: (selector) => {
    const state = { 
      pollingPhotoIds: new Set(), 
      pollingPhotoId: null, 
      photos: [{ id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }] 
    }
    const result = selector(state)
    return result
  }
}))

// Mock the ImageCanvasEditor so we can inspect props via rendered attributes
vi.mock('./ImageCanvasEditor.jsx', () => ({
  default: (props) => React.createElement('div', { 'data-testid': 'image-canvas-editor', 'data-image-url': props.imageUrl })
}))

// Mock LocationMapPanel to avoid Google Maps API loading in tests
vi.mock('./components/LocationMapPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'location-map-panel' }, 'Mock Map')
}))

// Mock FlipCard component
vi.mock('./components/FlipCard', () => ({
  default: ({ frontContent, backContent, isFlipped, onFlip }) => 
    React.createElement('div', { 
      'data-testid': 'flip-card', 
      'data-is-flipped': String(isFlipped),
      onClick: onFlip 
    }, isFlipped ? backContent : frontContent)
}))

// Mock PhotoMetadataBack component
vi.mock('./components/PhotoMetadataBack', () => ({
  default: ({ keywords, onKeywordsChange: _onKeywordsChange, photo: _photo }) => 
    React.createElement('div', { 
      'data-testid': 'photo-metadata-back',
      'data-keywords': keywords,
    }, 'Mock Metadata Back')
}))

import EditPage from './EditPage.jsx'
import * as api from './api.js'

describe.skip('EditPage - protected image blob fetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test.skip('calls fetchProtectedBlobUrl and passes blob URL to ImageCanvasEditor (happy path)', async () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    const { getByTestId } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    // Wait for the API call
    await waitFor(() => {
      expect(api.fetchProtectedBlobUrl).toHaveBeenCalledWith('http://api' + photo.url)
    })

    // Wait for the editor to appear with the blob URL
    await waitFor(() => {
      const editor = getByTestId('image-canvas-editor')
      expect(editor.getAttribute('data-image-url')).toBe('blob:fake-url')
    })
  })

  test.skip('revokes blob URL on unmount (cleanup)', async () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    const { unmount } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    // Wait for the blob URL to be fetched
    await waitFor(() => {
      expect(api.fetchProtectedBlobUrl).toHaveBeenCalled()
    })

    // Wait a bit for the state to be set
    await waitFor(() => {
      expect(screen.queryByTestId('image-canvas-editor')).toBeInTheDocument()
    })

    // unmount should trigger cleanup which revokes the blob URL
    unmount()
    
    await waitFor(() => {
      expect(api.revokeBlobUrl).toHaveBeenCalledWith('blob:fake-url')
    })
  })

  test('shows loading state initially', () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('shows error message if blob fetch fails', async () => {
    // Arrange: mock the API to return null
    const originalImpl = api.fetchProtectedBlobUrl.getMockImplementation?.()
    api.fetchProtectedBlobUrl.mockImplementation(() => Promise.resolve(null))
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    const { queryByTestId } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Unable to load image')).toBeInTheDocument()
    })

    expect(queryByTestId('image-canvas-editor')).toBeNull()

    // Restore default mock so other tests keep using the success path
    if (originalImpl) {
      api.fetchProtectedBlobUrl.mockImplementation(originalImpl)
    } else {
      api.fetchProtectedBlobUrl.mockImplementation(() => Promise.resolve('blob:fake-url'))
    }
  })
})
