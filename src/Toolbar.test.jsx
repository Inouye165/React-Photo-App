import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Toolbar from './Toolbar'

describe('Toolbar Component', () => {
  const mockProps = {
    onViewStaged: vi.fn(),
    onViewInprogress: vi.fn(),
    onViewFinished: vi.fn(),
    onSelectFolder: vi.fn(),
    showInprogress: false,
    showFinished: false,
    onRecheck: vi.fn(),
    rechecking: false,
    onShowMetadata: vi.fn(),
    toolbarMessage: '',
    onClearToolbarMessage: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all navigation buttons', () => {
    render(<Toolbar {...mockProps} />)
    
    expect(screen.getByText('Select Folder for Upload')).toBeInTheDocument()
    expect(screen.getByText('View Staged')).toBeInTheDocument()
    expect(screen.getByText('View Inprogress')).toBeInTheDocument()
    expect(screen.getByText('View Finished')).toBeInTheDocument()
    expect(screen.getByText('Show Metadata')).toBeInTheDocument()
    expect(screen.getByText('Recheck AI')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument() // Updated to match authenticated mock
  })

  it('calls onSelectFolder when select folder button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('Select Folder for Upload'))
    expect(mockProps.onSelectFolder).toHaveBeenCalledOnce()
  })

  it('calls onViewStaged when view staged button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Staged'))
    expect(mockProps.onViewStaged).toHaveBeenCalledOnce()
  })

  it('calls onViewInprogress when view inprogress button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Inprogress'))
    expect(mockProps.onViewInprogress).toHaveBeenCalledOnce()
  })

  it('calls onViewFinished when view finished button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('View Finished'))
    expect(mockProps.onViewFinished).toHaveBeenCalledOnce()
  })

  it('shows rechecking state when rechecking is true', () => {
    render(<Toolbar {...mockProps} rechecking={true} />)
    
    const recheckButton = screen.getByText('Rechecking...')
    expect(recheckButton).toBeInTheDocument()
    expect(recheckButton).toBeDisabled()
  })

  it('calls onRecheck when recheck button is clicked and not rechecking', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('Recheck AI'))
    expect(mockProps.onRecheck).toHaveBeenCalledOnce()
  })

  it('displays toolbar message when provided', () => {
    const message = 'Successfully uploaded 5 photos'
    render(<Toolbar {...mockProps} toolbarMessage={message} />)
    
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not display message area when no message', () => {
    render(<Toolbar {...mockProps} toolbarMessage="" />)
    
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('calls onClearToolbarMessage when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const message = 'Test message'
    render(<Toolbar {...mockProps} toolbarMessage={message} />)
    
    const dismissButton = screen.getByTitle('Dismiss')
    await user.click(dismissButton)
    expect(mockProps.onClearToolbarMessage).toHaveBeenCalledOnce()
  })

  it('has proper accessibility attributes', () => {
    render(<Toolbar {...mockProps} />)
    
    const nav = screen.getByRole('navigation', { name: 'Main toolbar' })
    expect(nav).toBeInTheDocument()
  })

  it('calls onShowMetadata when show metadata button is clicked', async () => {
    const user = userEvent.setup()
    render(<Toolbar {...mockProps} />)
    
    await user.click(screen.getByText('Show Metadata'))
    expect(mockProps.onShowMetadata).toHaveBeenCalledOnce()
  })
})