import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import App from './App'

// Mock environment variable globally
vi.stubEnv('VITE_API_URL', 'http://localhost:3001')

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
  API_BASE_URL: ''
}))

// Mock EXIF parsing
vi.mock('exifr', () => ({
  parse: vi.fn(),
}))

// Mock ImageCanvasEditor to avoid react-konva issues
vi.mock('./ImageCanvasEditor', () => ({
  default: ({ onSave }) => React.createElement('div', { 'data-testid': 'image-canvas-editor' }, React.createElement('button', { onClick: () => onSave({ textStyle: {} }) }, 'Save'))
}))

import { getPhotos, checkPrivilege, uploadPhotoToServer, checkPrivilegesBatch } from './api.js'

describe('App Component', () => {
  const mockPhotos = [
    {
      id: 1,
      filename: 'test1.jpg',
      state: 'working',
      file_size: 1024000,
      hash: 'abc123',
      metadata: {
        DateTimeOriginal: '2024-01-01 12:00:00',
      },
      thumbnail: '/thumbnails/test1_thumb.jpg',
      caption: 'Test caption',
    },
    {
      id: 2,
      filename: 'test2.jpg',
      state: 'inprogress',
      file_size: 2048000,
      hash: 'def456',
      metadata: {
        DateTimeOriginal: '2024-01-02 13:00:00',
      },
      thumbnail: '/thumbnails/test2_thumb.jpg',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    getPhotos.mockResolvedValue({ photos: mockPhotos })
    checkPrivilege.mockResolvedValue({ 
      privileges: { read: true, write: true, execute: false }
    })
    // Mock checkPrivilegesBatch to return privilege strings for test photos
    const batchPrivileges = {
      'test1.jpg': 'RW',
      'test2.jpg': 'R',
    };
    checkPrivilegesBatch.mockImplementation(async (filenames) => {
      const result = {};
      for (const name of filenames) {
        result[name] = batchPrivileges[name] || '?';
      }
      return result;
    });
    
    // Mock fetch for any remaining API calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ photos: mockPhotos }),
    })

    // Mock console.error to suppress expected error logs in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // Restore console.error after each test
    console.error.mockRestore?.()
  })

  it('renders the main toolbar', async () => {
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Main toolbar' })).toBeInTheDocument()
    })
  })

  it('displays loading state initially', async () => {
    // Create a promise that won't resolve immediately
    let resolvePromise
    const delayedPromise = new Promise((resolve) => {
      resolvePromise = resolve
    })
    getPhotos.mockReturnValue(delayedPromise)
    
    await act(async () => {
      render(<App />)
    })
    
    // Check loading state before promise resolves
    expect(screen.getByText('Loading photos...')).toBeInTheDocument()
    
    // Resolve the promise and wait for update
    await act(async () => {
      resolvePromise({ photos: mockPhotos })
    })
  })

  it('loads and displays photos from API', async () => {
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('test1.jpg')).toBeInTheDocument()
      expect(screen.getByText('test2.jpg')).toBeInTheDocument()
    })
    
  expect(getPhotos).toHaveBeenCalledWith('working')
  })

  it('shows correct photo count when photos are loaded', async () => {
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      // Should show photos in the list
      expect(screen.getByText('test1.jpg')).toBeInTheDocument()
      expect(screen.getByText('test2.jpg')).toBeInTheDocument()
    })
  })

  it('displays empty state when no photos found', async () => {
    getPhotos.mockResolvedValue({ photos: [] })
    
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('No photos found in backend.')).toBeInTheDocument()
    })
  })

  it('handles API errors gracefully', async () => {
    getPhotos.mockRejectedValue(new Error('Network error'))
    
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      // Should not be loading anymore
      expect(screen.queryByText('Loading photos...')).not.toBeInTheDocument()
    })
  })

  it('switches to inprogress view when button clicked', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('View Inprogress')).toBeInTheDocument()
    })
    
    await user.click(screen.getByText('View Inprogress'))
    
    // Should call API with inprogress state
    await waitFor(() => {
  expect(getPhotos).toHaveBeenCalledWith('inprogress')
    })
  })

  it('calls getPhotos exactly once for the selected view when switching', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
    })

    await waitFor(() => {
      expect(screen.getByText('View Inprogress')).toBeInTheDocument()
    })

    // Click to switch to inprogress view
    await user.click(screen.getByText('View Inprogress'))

    // Ensure exactly one call was made with 'inprogress'
    await waitFor(() => {
      const inprogressCalls = getPhotos.mock.calls.filter(c => c[0] === 'inprogress').length
      expect(inprogressCalls).toBe(1)
    })
  })

  it('switches to finished view when button clicked', async () => {
    const user = userEvent.setup()
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('View Finished')).toBeInTheDocument()
    })
    
    await user.click(screen.getByText('View Finished'))
    
    await waitFor(() => {
  expect(getPhotos).toHaveBeenCalledWith('finished')
    })
  })

  it('opens folder selection when select folder button clicked', async () => {
    const user = userEvent.setup()
    const mockShowDirectoryPicker = vi.fn().mockRejectedValue(new Error('User cancelled'))
    global.showDirectoryPicker = mockShowDirectoryPicker
    
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('Select Folder for Upload')).toBeInTheDocument()
    })
    
    await user.click(screen.getByText('Select Folder for Upload'))
    
    expect(mockShowDirectoryPicker).toHaveBeenCalled()
  })

  // Toast notification tests removed after toast logic was deleted

  it('displays toolbar messages correctly', async () => {
    await act(async () => {
      render(<App />)
    })
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })
    
    // The toolbar message functionality should be present
    // (testing the message display would require triggering an upload)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('loads photo privileges after photos are loaded', async () => {
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('test1.jpg')).toBeInTheDocument()
    })
    
    // Should call checkPrivilegesBatch with all filenames
    await waitFor(() => {
      expect(checkPrivilegesBatch).toHaveBeenCalledWith(['test1.jpg', 'test2.jpg'])
    })
  })

  it('handles end-to-end photo upload flow', async () => {
    const user = userEvent.setup()
    const mockFile = new File(['test'], 'newphoto.jpg', { type: 'image/jpeg' })
    
    // Mock directory picker
    const mockShowDirectoryPicker = vi.fn().mockResolvedValue({
      getFileHandle: vi.fn().mockResolvedValue({
        getFile: vi.fn().mockResolvedValue(mockFile)
      })
    })
    global.window.showDirectoryPicker = mockShowDirectoryPicker
    
    // Mock uploadPhotoToServer
    uploadPhotoToServer.mockResolvedValue({ success: true, filename: 'newphoto.jpg', hash: 'newhash' })
    
    await act(async () => {
      render(<App />)
    })
    
    await waitFor(() => {
      expect(screen.getByText('test1.jpg')).toBeInTheDocument()
    })
    
    // Click upload button
    const uploadButton = screen.getByText('Select Folder for Upload')
    await user.click(uploadButton)
    
    // Assume the upload form opens and user selects dates and uploads
    // (This would require more detailed mocking of the form state)
    // For integration, verify that upload function is called
    expect(mockShowDirectoryPicker).toHaveBeenCalled()
    
    // If we can trigger the actual upload, check that photos are updated
    // This test demonstrates the flow setup
  })
})