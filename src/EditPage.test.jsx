import React from 'react'
import { render, waitFor, screen } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'

// Mock the API helper module (use literals inside the factory; vi.mock is hoisted)
vi.mock('./api.js', () => ({
  fetchProtectedBlobUrl: vi.fn().mockResolvedValue('blob:fake-url'),
  revokeBlobUrl: vi.fn(),
  API_BASE_URL: 'http://api'
}))

// Mock the store to return a photo when selectors are applied
vi.mock('./store.js', () => ({
  default: (selector) => selector({ pollingPhotoIds: new Set(), pollingPhotoId: null, photos: [{ id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }] })
}))

// Mock the ImageCanvasEditor so we can inspect props via rendered attributes
vi.mock('./ImageCanvasEditor.jsx', () => ({
  default: (props) => React.createElement('div', { 'data-testid': 'image-canvas-editor', 'data-image-url': props.imageUrl })
}))

import EditPage from './EditPage.jsx'
import * as api from './api.js'

describe('EditPage - protected image blob fetch', () => {
  test('calls fetchProtectedBlobUrl and passes blob URL to ImageCanvasEditor (happy path)', async () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
  const { getByTestId } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    await waitFor(() => {
      expect(api.fetchProtectedBlobUrl).toHaveBeenCalledWith('http://api' + photo.url)
    })

    const editor = getByTestId('image-canvas-editor')
    expect(editor.getAttribute('data-image-url')).toBe('blob:fake-url')
  })

  test('revokes blob URL on unmount (cleanup)', async () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
  const { unmount } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    await waitFor(() => {
      expect(api.fetchProtectedBlobUrl).toHaveBeenCalled()
    })

    // unmount should trigger cleanup which revokes the blob URL
    unmount()
    expect(api.revokeBlobUrl).toHaveBeenCalledWith('blob:fake-url')
  })

  test('shows loading state initially', () => {
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)
    expect(screen.getByText('Loading image...')).toBeInTheDocument()
  })

  test('shows error message if blob fetch fails', async () => {
    // Arrange: mock the API to return null
    api.fetchProtectedBlobUrl.mockResolvedValueOnce(null)
    const photo = { id: 1, url: '/protected/image.jpg', filename: 'image.jpg' }
    const { queryByTestId } = render(<EditPage photo={photo} onClose={() => {}} onSave={() => {}} onFinished={() => {}} />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load image.')).toBeInTheDocument()
    })

    expect(queryByTestId('image-canvas-editor')).toBeNull()
  })
})
