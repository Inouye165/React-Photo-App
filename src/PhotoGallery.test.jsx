import React from 'react'
import { describe, it, expect, vi } from 'vitest'
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

  const mockProps = {
    photos: mockPhotos,
    handleMoveToInprogress: vi.fn(),
    handleMoveToWorking: vi.fn(),
    handleDeletePhoto: vi.fn(),
    handleEditPhoto: vi.fn(),
    privilegesMap: { 1: 'read,write', 2: 'read' },
  }

  it('renders photos correctly', () => {
    render(<PhotoGallery {...mockProps} />)

    expect(screen.getByText('test1.jpg')).toBeInTheDocument()
    expect(screen.getByText('test2.jpg')).toBeInTheDocument()
    expect(screen.getByText('Test caption')).toBeInTheDocument()
    expect(screen.getByText('staged')).toBeInTheDocument()
    expect(screen.getByText('inprogress')).toBeInTheDocument()
  })

  it('displays thumbnails when available', () => {
    render(<PhotoGallery {...mockProps} />)

    const thumbnails = screen.getAllByAltText(/test/)
    expect(thumbnails).toHaveLength(2)
    expect(thumbnails[0]).toHaveAttribute('src', '/thumbnails/test1_thumb.jpg')
  })

  it('shows file sizes formatted', () => {
    render(<PhotoGallery {...mockProps} />)

    // Check that formatted file sizes are displayed in the UI
    expect(screen.getByText('1000 KB')).toBeInTheDocument()
    expect(screen.getByText('2 MB')).toBeInTheDocument()
  })

  it('displays privileges from map', () => {
    render(<PhotoGallery {...mockProps} />)

    expect(screen.getByText('read,write')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()
  })

  it('shows hash preview', () => {
    render(<PhotoGallery {...mockProps} />)

    expect(screen.getByText('✔ bc123')).toBeInTheDocument()
    expect(screen.getByText('✔ ef456')).toBeInTheDocument()
  })

  it('renders action buttons based on state', () => {
    render(<PhotoGallery {...mockProps} />)

    expect(screen.getByText('Move to Inprogress')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Move to Staged')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('calls handleMoveToInprogress when button clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoGallery {...mockProps} />)

    const moveButton = screen.getByText('Move to Inprogress')
    await user.click(moveButton)

    expect(mockProps.handleMoveToInprogress).toHaveBeenCalledWith(1)
  })

  it('calls handleEditPhoto when edit button clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoGallery {...mockProps} />)

    const editButton = screen.getByText('Edit')
    await user.click(editButton)

    expect(mockProps.handleEditPhoto).toHaveBeenCalledWith(mockPhotos[1])
  })

  it('calls handleMoveToWorking when move to staged button clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoGallery {...mockProps} />)

    const moveToStagedButton = screen.getByText('Move to Staged')
    await user.click(moveToStagedButton)

    expect(mockProps.handleMoveToWorking).toHaveBeenCalledWith(2)
  })

  it('calls handleDeletePhoto when delete button clicked', async () => {
    const user = userEvent.setup()
    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    
    render(<PhotoGallery {...mockProps} />)

    const deleteButton = screen.getByText('Delete')
    await user.click(deleteButton)

    expect(confirmSpy).toHaveBeenCalledWith('Are you sure you want to delete this photo? This action cannot be undone.')
    expect(mockProps.handleDeletePhoto).toHaveBeenCalledWith(2)

    confirmSpy.mockRestore()
  })

  it('displays metadata fields when available', () => {
    const photosWithMetadata = [
      {
        ...mockPhotos[0],
        description: 'Test description',
        keywords: 'test, photo',
      },
    ]

    render(<PhotoGallery {...mockProps} photos={photosWithMetadata} />)

    expect(screen.getByText('Caption:')).toBeInTheDocument()
    expect(screen.getByText('Description:')).toBeInTheDocument()
    expect(screen.getByText('Keywords:')).toBeInTheDocument()
  })

  it('handles photos without thumbnails', () => {
    const photosWithoutThumbs = [
      {
        ...mockPhotos[0],
        thumbnail: null,
      },
    ]

    render(<PhotoGallery {...mockProps} photos={photosWithoutThumbs} />)

    expect(screen.getByText('No Thumb')).toBeInTheDocument()
  })

  it('updates when photos prop changes', () => {
    const { rerender } = render(<PhotoGallery {...mockProps} />)

    expect(screen.getByText('test1.jpg')).toBeInTheDocument()

    const newPhotos = [
      {
        id: 3,
        filename: 'newphoto.jpg',
        state: 'working',
        file_size: 512000,
        hash: 'newhash',
        metadata: {},
      },
    ]

    rerender(<PhotoGallery {...mockProps} photos={newPhotos} />)

    expect(screen.queryByText('test1.jpg')).not.toBeInTheDocument()
    expect(screen.getByText('newphoto.jpg')).toBeInTheDocument()
  })
})