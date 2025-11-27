/**
 * PhotoGallery Component Tests
 * 
 * Refactored for the new card-based layout using PhotoCard components.
 * Tests verify rendering, interactions, and proper prop mapping.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhotoGallery from './PhotoGallery'

describe('PhotoGallery Component', () => {
  const mockPhotos = [
    {
      id: 1,
      filename: 'test1.jpg',
      state: 'working',
      file_size: 1024000,
      hash: 'abc123',
      metadata: {
        DateTimeOriginal: '2024:01:01 12:00:00',
      },
      thumbnail: '/thumbnails/test1_thumb.jpg',
      caption: 'Test caption for first photo',
    },
    {
      id: 2,
      filename: 'test2.jpg',
      state: 'inprogress',
      file_size: 2048000,
      hash: 'def456',
      metadata: {
        DateTimeOriginal: '2024:01:02 13:00:00',
      },
      thumbnail: '/thumbnails/test2_thumb.jpg',
    },
  ]

  const mockProps = {
    photos: mockPhotos,
    handleMoveToInprogress: vi.fn(),
    handleMoveToWorking: vi.fn(),
    handleDeletePhoto: vi.fn(),
    handleEditPhoto: vi.fn(),
    onSelectPhoto: vi.fn(),
    privilegesMap: { 1: 'read,write', 2: 'read' },
    pollingPhotoId: null,
    getSignedUrl: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Grid Layout', () => {
    it('renders a responsive grid container', () => {
      render(<PhotoGallery {...mockProps} />)

      const grid = screen.getByTestId('photo-gallery-grid')
      expect(grid).toBeInTheDocument()
      expect(grid).toHaveClass('grid')
    })

    it('renders the correct number of photo cards', () => {
      render(<PhotoGallery {...mockProps} />)

      const cards = screen.getAllByTestId('photo-card')
      expect(cards).toHaveLength(2)
    })

    it('shows empty state when no photos', () => {
      render(<PhotoGallery {...mockProps} photos={[]} />)

      expect(screen.getByText('No photos to display.')).toBeInTheDocument()
    })
  })

  describe('Photo Card Content', () => {
    it('displays photo titles (caption or filename)', () => {
      render(<PhotoGallery {...mockProps} />)

      // First photo has caption
      expect(screen.getByText('Test caption for first photo')).toBeInTheDocument()
      // Second photo falls back to filename
      expect(screen.getByText('test2.jpg')).toBeInTheDocument()
    })

    it('displays thumbnails when available', () => {
      render(<PhotoGallery {...mockProps} />)

      const thumbnails = screen.getAllByRole('img')
      expect(thumbnails.length).toBeGreaterThanOrEqual(2)
      // Check that thumbnail src contains the expected path
      expect(thumbnails[0].getAttribute('src')).toContain('/thumbnails/test1_thumb.jpg')
    })

    it('displays formatted file sizes', () => {
      render(<PhotoGallery {...mockProps} />)

      // PhotoCard formats 1024000 as "1000 KB" and 2048000 as "2 MB"
      expect(screen.getByText('1000 KB')).toBeInTheDocument()
      expect(screen.getByText('2 MB')).toBeInTheDocument()
    })

    it('displays access levels mapped from privileges', () => {
      render(<PhotoGallery {...mockProps} />)

      // "read,write" maps to "Full Access", "read" maps to "Read Only"
      expect(screen.getByText('Full Access')).toBeInTheDocument()
      expect(screen.getByText('Read Only')).toBeInTheDocument()
    })

    it('displays status badges based on state', () => {
      render(<PhotoGallery {...mockProps} />)

      // "working" -> "Queued", "inprogress" -> "In Progress"
      expect(screen.getByText('Queued')).toBeInTheDocument()
      expect(screen.getByText('In Progress')).toBeInTheDocument()
    })
  })

  describe('Action Buttons', () => {
    it('renders Promote button for working state photos', () => {
      render(<PhotoGallery {...mockProps} />)

      expect(screen.getByText('Promote')).toBeInTheDocument()
    })

    it('renders Edit button for inprogress state photos', () => {
      render(<PhotoGallery {...mockProps} />)

      expect(screen.getByText('Edit')).toBeInTheDocument()
    })

    it('renders Return button for inprogress state photos', () => {
      render(<PhotoGallery {...mockProps} />)

      expect(screen.getByText('Return')).toBeInTheDocument()
    })

    it('calls handleMoveToInprogress when Promote button clicked', async () => {
      const user = userEvent.setup()
      render(<PhotoGallery {...mockProps} />)

      const promoteButton = screen.getByText('Promote')
      await user.click(promoteButton)

      expect(mockProps.handleMoveToInprogress).toHaveBeenCalledWith(1)
    })

    it('calls handleEditPhoto when Edit button clicked', async () => {
      const user = userEvent.setup()
      render(<PhotoGallery {...mockProps} />)

      const editButton = screen.getByText('Edit')
      await user.click(editButton)

      expect(mockProps.handleEditPhoto).toHaveBeenCalledWith(mockPhotos[1])
    })

    it('calls handleMoveToWorking when Return button clicked', async () => {
      const user = userEvent.setup()
      render(<PhotoGallery {...mockProps} />)

      const returnButton = screen.getByText('Return')
      await user.click(returnButton)

      expect(mockProps.handleMoveToWorking).toHaveBeenCalledWith(2)
    })

    it('calls handleDeletePhoto when delete confirmed', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      // Use privilegesMap that gives write access to photo 2 (the inprogress one)
      render(<PhotoGallery {...mockProps} privilegesMap={{ 1: 'read,write', 2: 'read,write' }} />)

      const deleteButton = screen.getByTestId('photo-card-delete-btn')
      await user.click(deleteButton)

      expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this photo? This action cannot be undone.')
      expect(mockProps.handleDeletePhoto).toHaveBeenCalledWith(2)

      confirmSpy.mockRestore()
    })

    it('does not call handleDeletePhoto when delete cancelled', async () => {
      const user = userEvent.setup()
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<PhotoGallery {...mockProps} />)

      const deleteButton = screen.getByTestId('photo-card-delete-btn')
      await user.click(deleteButton)

      expect(mockProps.handleDeletePhoto).not.toHaveBeenCalled()

      confirmSpy.mockRestore()
    })
  })

  describe('Card Selection', () => {
    it('calls onSelectPhoto when card is clicked', async () => {
      const user = userEvent.setup()
      render(<PhotoGallery {...mockProps} />)

      const cards = screen.getAllByTestId('photo-card')
      await user.click(cards[0])

      expect(mockProps.onSelectPhoto).toHaveBeenCalledWith(mockPhotos[0])
    })
  })

  describe('Polling State', () => {
    it('shows polling indicator for the photo being processed', () => {
      render(<PhotoGallery {...mockProps} pollingPhotoId={1} />)

      // The PhotoCard shows "Processing" text for accessibility
      expect(screen.getByText('Processing')).toBeInTheDocument()
    })
  })

  describe('Photos Without Thumbnails', () => {
    it('handles photos without thumbnails gracefully', () => {
      const photosWithoutThumbs = [
        {
          ...mockPhotos[0],
          thumbnail: null,
        },
      ]

      render(<PhotoGallery {...mockProps} photos={photosWithoutThumbs} />)

      expect(screen.getByText('No preview')).toBeInTheDocument()
    })
  })

  describe('Dynamic Updates', () => {
    it('updates when photos prop changes', () => {
      const { rerender } = render(<PhotoGallery {...mockProps} />)

      expect(screen.getByText('Test caption for first photo')).toBeInTheDocument()

      const newPhotos = [
        {
          id: 3,
          filename: 'newphoto.jpg',
          state: 'working',
          file_size: 512000,
          hash: 'newhash',
          metadata: {},
          caption: 'Brand new photo',
        },
      ]

      rerender(<PhotoGallery {...mockProps} photos={newPhotos} privilegesMap={{ 3: 'read,write' }} />)

      expect(screen.queryByText('Test caption for first photo')).not.toBeInTheDocument()
      expect(screen.getByText('Brand new photo')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('renders cards with proper article role', () => {
      render(<PhotoGallery {...mockProps} />)

      const cards = screen.getAllByRole('article')
      expect(cards).toHaveLength(2)
    })

    it('provides aria-labels for action buttons', () => {
      render(<PhotoGallery {...mockProps} />)

      expect(screen.getByLabelText('Edit photo')).toBeInTheDocument()
      expect(screen.getByLabelText('Promote photo to processing')).toBeInTheDocument()
      expect(screen.getByLabelText('Delete photo')).toBeInTheDocument()
    })
  })

  describe('Signed URL Support', () => {
    it('uses getSignedUrl when provided', () => {
      const mockGetSignedUrl = vi.fn().mockReturnValue('https://signed-url.com/photo.jpg')
      
      render(<PhotoGallery {...mockProps} getSignedUrl={mockGetSignedUrl} />)

      expect(mockGetSignedUrl).toHaveBeenCalled()
    })
  })
})