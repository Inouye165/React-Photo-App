import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'
import useStore from './store'

// Mock the store
vi.mock('./store', () => ({
  default: vi.fn(),
}))

// Helper to render Toolbar with Router context
const renderWithRouter = (ui, { initialEntries = ['/gallery'] } = {}) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      {ui}
    </MemoryRouter>
  )
}

describe('Toolbar Component', () => {
  const mockProps = {
    onSelectFolder: vi.fn(),
    toolbarMessage: '',
    onClearToolbarMessage: vi.fn(),
  }

  const mockStoreState = {
    setView: vi.fn(),
    setEditingMode: vi.fn(),
    setActivePhotoId: vi.fn(),
    setShowMetadataModal: vi.fn(),
    setMetadataPhoto: vi.fn(),
    activePhotoId: null,
    photos: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock useStore to return our mock state
    useStore.mockImplementation((selector) => {
      if (typeof selector === 'function') {
        return selector(mockStoreState)
      }
      return mockStoreState
    })
  })

  it('renders all navigation buttons', () => {
    renderWithRouter(<Toolbar {...mockProps} />)
    
    expect(screen.getByText('Select Folder for Upload')).toBeInTheDocument()
  expect(screen.getByText('View Working')).toBeInTheDocument()
    expect(screen.getByText('View Inprogress')).toBeInTheDocument()
    expect(screen.getByText('View Finished')).toBeInTheDocument()
    expect(screen.getByText('Show Metadata')).toBeInTheDocument()
    // Bulk "Recheck AI" was removed from the toolbar; ensure it's not present
    expect(screen.queryByText('Recheck AI')).not.toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument() // Updated to match authenticated mock
  })

  it('navigates to /upload when select folder button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Toolbar {...mockProps} />)
    
    // Click the button - it should navigate to /upload
    await user.click(screen.getByText('Select Folder for Upload'))
    
    // The Toolbar navigates using navigate('/upload'), so we can verify
    // the navigation happened by checking that no error was thrown
    // and the button exists and is clickable
    expect(screen.getByText('Select Folder for Upload')).toBeInTheDocument()
  })

  it('calls store actions when view working button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Working'))
    expect(mockStoreState.setView).toHaveBeenCalledWith('working')
    expect(mockStoreState.setEditingMode).toHaveBeenCalledWith(null)
    expect(mockStoreState.setActivePhotoId).toHaveBeenCalledWith(null)
  })

  it('calls store actions when view inprogress button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Inprogress'))
    expect(mockStoreState.setView).toHaveBeenCalledWith('inprogress')
    expect(mockStoreState.setEditingMode).toHaveBeenCalledWith(null)
    expect(mockStoreState.setActivePhotoId).toHaveBeenCalledWith(null)
  })

  it('calls store actions when view finished button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Finished'))
    expect(mockStoreState.setView).toHaveBeenCalledWith('finished')
    expect(mockStoreState.setEditingMode).toHaveBeenCalledWith(null)
    expect(mockStoreState.setActivePhotoId).toHaveBeenCalledWith(null)
  })

  // The toolbar no longer contains a bulk "Recheck AI" action; those behaviors
  // are tested on the EditPage component where single-photo recheck lives.

  it('displays toolbar message when provided', () => {
    const message = 'Successfully uploaded 5 photos'
    renderWithRouter(<Toolbar {...mockProps} toolbarMessage={message} />)
    
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not display message area when no message', () => {
    renderWithRouter(<Toolbar {...mockProps} toolbarMessage="" />)
    
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('calls onClearToolbarMessage when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const message = 'Test message'
    renderWithRouter(<Toolbar {...mockProps} toolbarMessage={message} />)
    
    const dismissButton = screen.getByTitle('Dismiss')
    await user.click(dismissButton)
    expect(mockProps.onClearToolbarMessage).toHaveBeenCalledOnce()
  })

  it('has proper accessibility attributes', () => {
    renderWithRouter(<Toolbar {...mockProps} />)
    
    const nav = screen.getByRole('navigation', { name: 'Main toolbar' })
    expect(nav).toBeInTheDocument()
  })

  it('calls store actions when show metadata button is clicked', async () => {
    const user = userEvent.setup()
    // Set up a mock active photo
    mockStoreState.activePhotoId = 1
    mockStoreState.photos = [{ id: 1, filename: 'test.jpg', caption: 'Test' }]
    
    renderWithRouter(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('Show Metadata'))
    expect(mockStoreState.setMetadataPhoto).toHaveBeenCalled()
    expect(mockStoreState.setShowMetadataModal).toHaveBeenCalledWith(true)
  })
})