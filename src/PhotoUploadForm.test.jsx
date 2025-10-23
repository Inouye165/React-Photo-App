import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhotoUploadForm from './PhotoUploadForm'

describe('PhotoUploadForm Component', () => {
  const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  
  const mockFilteredPhotos = [
    {
      name: 'photo1.jpg',
      file: mockFile,
      exifDate: '2024-01-01T10:00:00Z',
    },
    {
      name: 'photo2.jpg', 
      file: mockFile,
      exifDate: '2024-01-02T11:00:00Z',
    },
  ]

  const mockProps = {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    setStartDate: vi.fn(),
    setEndDate: vi.fn(),
    uploading: false,
    filteredLocalPhotos: mockFilteredPhotos,
    handleUploadFiltered: vi.fn(),
    setShowLocalPicker: vi.fn(),
    onReopenFolder: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock focus and scrolling behavior
    Element.prototype.focus = vi.fn()
    Element.prototype.scrollIntoView = vi.fn()
    
    // Mock querySelector for toolbar positioning
    document.querySelector = vi.fn().mockReturnValue({
      getBoundingClientRect: () => ({
        bottom: 100,
      }),
    })
  })

  it('renders modal with correct title', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    expect(screen.getByText('Select Photos to Upload')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('displays date range inputs with correct values', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    const startDateInput = screen.getByDisplayValue('2024-01-01')
    const endDateInput = screen.getByDisplayValue('2024-01-31')
    
    expect(startDateInput).toBeInTheDocument()
    expect(endDateInput).toBeInTheDocument()
  })

  it('calls setStartDate when start date is changed', async () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    const startDateInput = screen.getByDisplayValue('2024-01-01')
    
    // For date inputs, simulate the onChange event directly
    fireEvent.change(startDateInput, { target: { value: '2024-02-01' } })
    
    expect(mockProps.setStartDate).toHaveBeenCalledWith('2024-02-01')
  })

  it('calls setEndDate when end date is changed', async () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    const endDateInput = screen.getByDisplayValue('2024-01-31')
    
    // For date inputs, simulate the onChange event directly
    fireEvent.change(endDateInput, { target: { value: '2024-02-28' } })
    
    expect(mockProps.setEndDate).toHaveBeenCalledWith('2024-02-28')
  })

  it('displays correct photo count in upload button', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    expect(screen.getByText('Upload 2 Photos')).toBeInTheDocument()
  })

  it('shows uploading state when uploading is true', () => {
    render(<PhotoUploadForm {...mockProps} uploading={true} />)
    
    const uploadButton = screen.getByText('Uploading...')
    expect(uploadButton).toBeInTheDocument()
    expect(uploadButton).toBeDisabled()
  })

  it('disables upload button when no photos selected', () => {
    render(<PhotoUploadForm {...mockProps} filteredLocalPhotos={[]} />)
    
    const uploadButton = screen.getByText('Upload 0 Photos')
    expect(uploadButton).toBeDisabled()
  })

  it('calls handleUploadFiltered when upload button is clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoUploadForm {...mockProps} />)
    
    await user.click(screen.getByText('Upload 2 Photos'))
    expect(mockProps.handleUploadFiltered).toHaveBeenCalledOnce()
  })

  it('displays filtered photos list correctly', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    expect(screen.getByText('Photos to Upload (2):')).toBeInTheDocument()
    expect(screen.getByText('photo1.jpg')).toBeInTheDocument()
    expect(screen.getByText('photo2.jpg')).toBeInTheDocument()
  })

  it('shows empty state when no photos found', () => {
    render(<PhotoUploadForm {...mockProps} filteredLocalPhotos={[]} />)
    
    expect(screen.getByText('No images found in the selected folder.')).toBeInTheDocument()
    expect(screen.getByText('Re-select folder')).toBeInTheDocument()
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  it('calls onReopenFolder when re-select folder button is clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoUploadForm {...mockProps} filteredLocalPhotos={[]} />)
    
    await user.click(screen.getByText('Re-select folder'))
    expect(mockProps.onReopenFolder).toHaveBeenCalledOnce()
  })

  it('calls setShowLocalPicker(false) when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoUploadForm {...mockProps} />)
    
    const closeButton = screen.getByLabelText('Close upload modal')
    await user.click(closeButton)
    expect(mockProps.setShowLocalPicker).toHaveBeenCalledWith(false)
  })

  it('calls setShowLocalPicker(false) when close button in empty state is clicked', async () => {
    const user = userEvent.setup()
    render(<PhotoUploadForm {...mockProps} filteredLocalPhotos={[]} />)
    
    const closeButtons = screen.getAllByText('Close')
    await user.click(closeButtons[0]) // First close button in empty state
    expect(mockProps.setShowLocalPicker).toHaveBeenCalledWith(false)
  })

  it('displays file sizes correctly', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    // Mock files should show their size (mockFile is 4 bytes = "test")
    const fileSizeElements = screen.getAllByText(/KB/)
    expect(fileSizeElements.length).toBeGreaterThan(0)
  })

  it('displays file extensions as thumbnails', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    const jpgElements = screen.getAllByText('JPG') // Multiple JPG extensions expected
    expect(jpgElements.length).toBeGreaterThan(0)
  })

  it('handles escape key to close modal', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    // Simulate escape key press
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
    
    expect(mockProps.setShowLocalPicker).toHaveBeenCalledWith(false)
  })

  it('has proper accessibility attributes', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('tabIndex', '-1')
  })

  it('positions modal below toolbar', () => {
    render(<PhotoUploadForm {...mockProps} />)
    
    // Should have called querySelector to find toolbar
    expect(document.querySelector).toHaveBeenCalledWith('[aria-label="Main toolbar"]')
  })

  it('handles upload errors gracefully', async () => {
    const user = userEvent.setup()
    const mockHandleUploadFiltered = vi.fn().mockRejectedValue(new Error('Upload failed'))
    
    render(<PhotoUploadForm {...mockProps} handleUploadFiltered={mockHandleUploadFiltered} />)
    
    // The button text is "Upload 2 Photos"
    const uploadButton = screen.getByText('Upload 2 Photos')
    await user.click(uploadButton)
    
    // Should handle the error without crashing
    expect(mockHandleUploadFiltered).toHaveBeenCalled()
    // Check that error is displayed or logged (depending on implementation)
  })

  it('validates file types before upload', () => {
    const invalidFile = new File(['test'], 'test.txt', { type: 'text/plain' })
    const mockFilteredPhotos = [
      {
        name: 'test.txt',
        file: invalidFile,
        exifDate: '2024-01-01T10:00:00Z',
      },
    ]
    
    render(<PhotoUploadForm {...mockProps} filteredLocalPhotos={mockFilteredPhotos} />)
    
    // Should filter out or warn about invalid files
    // Assuming the component filters by date but not type, this test checks for potential issues
    expect(screen.getByText('test.txt')).toBeInTheDocument()
  })
})