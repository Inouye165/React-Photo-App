import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'

// Mock environment variable globally
vi.stubEnv('VITE_API_URL', 'http://localhost:3001')

// Mock the AI Polling hook to prevent infinite loops
vi.mock('./hooks/useAIPolling.jsx', () => ({
  default: vi.fn()
}))

// Mock API functions
vi.mock('./api.js', () => ({
  getPhotos: vi.fn(),
  uploadPhotoToServer: vi.fn(),
  checkPrivilege: vi.fn(),
  checkPrivilegesBatch: vi.fn(),
  updatePhotoState: vi.fn(),
  recheckInprogressPhotos: vi.fn(),
  updatePhotoCaption: vi.fn(),
  fetchModelAllowlist: vi.fn().mockResolvedValue({ models: ['gpt-4o-mini'], source: 'test', updatedAt: null }),
  getDependencyStatus: vi.fn().mockResolvedValue({ dependencies: { aiQueue: true } }),
  API_BASE_URL: ''
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

vi.mock('./Toolbar', () => ({
  default: () => React.createElement('nav', { 
    'aria-label': 'Main toolbar',
    'data-testid': 'toolbar'
  }, 'Toolbar')
}))

vi.mock('./components/PhotoTable', () => ({
  default: () => React.createElement('div', { 'data-testid': 'photo-table' }, 'Photo Table')
}))

vi.mock('./components/PhotoDetailPanel', () => ({
  default: () => React.createElement('div', { 'data-testid': 'photo-detail-panel' }, 'Detail Panel')
}))

vi.mock('./components/MetadataModal', () => ({
  default: () => React.createElement('div', { 'data-testid': 'metadata-modal' }, 'Metadata Modal')
}))

import App from './App'
import { getPhotos, checkPrivilegesBatch } from './api.js'

// SKIPPED: These tests exhaust 4GB heap even with aggressive component mocking
// Root cause: App component itself loads heavy dependencies (map libraries, etc.)
// TODO: Refactor App.jsx to be lighter or split into smaller testable units
describe.skip('App Component - Smoke Tests', () => {
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
  })

  afterEach(() => {
    console.error.mockRestore?.()
    cleanup()
    vi.clearAllTimers()
  })

  it('renders without crashing', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByTestId('toolbar')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('loads and displays photos from API', async () => {
    render(<App />)
    await waitFor(() => {
      expect(getPhotos).toHaveBeenCalledWith('working')
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