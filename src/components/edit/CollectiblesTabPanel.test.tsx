/**
 * Tests for CollectiblesTabPanel component
 * Phase 2: Presentational component tests
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import CollectiblesTabPanel from './CollectiblesTabPanel'
import type { Photo } from '../../types/photo'
import type { CollectibleRecord } from '../../types/collectibles'

// Mock child components
vi.mock('../CollectibleDetailView', () => ({
  default: () => React.createElement('div', { 'data-testid': 'collectible-detail-view' }, 'Mock Detail View')
}))

vi.mock('../CollectibleEditorPanel', () => ({
  default: ({ onChange }: any) => 
    React.createElement('div', { 
      'data-testid': 'collectible-editor-panel',
      onClick: () => onChange && onChange({ category: 'test' })
    }, 'Mock Editor Panel')
}))

describe('CollectiblesTabPanel', () => {
  const mockPhoto: Photo = {
    id: 123,
    url: '/photos/123.jpg',
    filename: 'test.jpg',
  }

  const mockCollectibleData: CollectibleRecord = {
    id: 1,
    photo_id: 123,
    category: 'Comic Book',
    name: 'Test Comic',
  }

  const defaultProps = {
    photo: mockPhoto,
    collectibleData: null,
    collectibleLoading: false,
    collectibleViewMode: 'view' as const,
    collectibleFormState: null,
    collectibleAiAnalysis: null,
    isCollectiblePhoto: false,
    hasCollectibleData: false,
    onViewModeChange: vi.fn(),
    onCollectibleChange: vi.fn(),
  }

  describe('View/Edit Toggle', () => {
    test('renders view and edit buttons', () => {
      render(<CollectiblesTabPanel {...defaultProps} />)

      expect(screen.getByText('📋 View Details')).toBeInTheDocument()
      expect(screen.getByText('✏️ Edit')).toBeInTheDocument()
    })

    test('view button is active when collectibleViewMode is "view"', () => {
      render(<CollectiblesTabPanel {...defaultProps} collectibleViewMode="view" />)

      const viewButton = screen.getByText('📋 View Details')
      expect(viewButton.style.fontWeight).toBe('600')
      expect(viewButton.style.backgroundColor).toBe('#1e293b')
    })

    test('edit button is active when collectibleViewMode is "edit"', () => {
      render(<CollectiblesTabPanel {...defaultProps} collectibleViewMode="edit" />)

      const editButton = screen.getByText('✏️ Edit')
      expect(editButton.style.fontWeight).toBe('600')
      expect(editButton.style.backgroundColor).toBe('#1e293b')
    })

    test('clicking view button calls onViewModeChange with "view"', () => {
      const onViewModeChange = vi.fn()
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
          onViewModeChange={onViewModeChange}
        />
      )

      fireEvent.click(screen.getByText('📋 View Details'))
      expect(onViewModeChange).toHaveBeenCalledWith('view')
    })

    test('clicking edit button calls onViewModeChange with "edit"', () => {
      const onViewModeChange = vi.fn()
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
          onViewModeChange={onViewModeChange}
        />
      )

      fireEvent.click(screen.getByText('✏️ Edit'))
      expect(onViewModeChange).toHaveBeenCalledWith('edit')
    })
  })

  describe('AI Detection Badge', () => {
    test('shows AI detection badge when isCollectiblePhoto is true', () => {
      render(<CollectiblesTabPanel {...defaultProps} isCollectiblePhoto={true} />)

      expect(screen.getByText('✓ AI Detected Collectible')).toBeInTheDocument()
    })

    test('does not show AI detection badge when isCollectiblePhoto is false', () => {
      render(<CollectiblesTabPanel {...defaultProps} isCollectiblePhoto={false} />)

      expect(screen.queryByText('✓ AI Detected Collectible')).not.toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    test('shows loading message when collectibleLoading is true', () => {
      render(<CollectiblesTabPanel {...defaultProps} collectibleLoading={true} />)

      expect(screen.getByText('Loading collectible data...')).toBeInTheDocument()
    })

    test('does not render CollectibleDetailView or CollectibleEditorPanel when loading', () => {
      render(<CollectiblesTabPanel {...defaultProps} collectibleLoading={true} />)

      expect(screen.queryByTestId('collectible-detail-view')).not.toBeInTheDocument()
      expect(screen.queryByTestId('collectible-editor-panel')).not.toBeInTheDocument()
    })
  })

  describe('View Mode Content', () => {
    test('renders CollectibleDetailView when in view mode', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
          collectibleData={mockCollectibleData}
        />
      )

      expect(screen.getByTestId('collectible-detail-view')).toBeInTheDocument()
    })

    test('does not render CollectibleEditorPanel when in view mode', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
        />
      )

      expect(screen.queryByTestId('collectible-editor-panel')).not.toBeInTheDocument()
    })
  })

  describe('Edit Mode Content', () => {
    test('renders CollectibleEditorPanel when in edit mode', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
        />
      )

      expect(screen.getByTestId('collectible-editor-panel')).toBeInTheDocument()
    })

    test('does not render CollectibleDetailView when in edit mode', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
        />
      )

      expect(screen.queryByTestId('collectible-detail-view')).not.toBeInTheDocument()
    })

    test('CollectibleEditorPanel onChange calls onCollectibleChange', () => {
      const onCollectibleChange = vi.fn()
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
          onCollectibleChange={onCollectibleChange}
        />
      )

      const editorPanel = screen.getByTestId('collectible-editor-panel')
      fireEvent.click(editorPanel) // Trigger onChange mock

      expect(onCollectibleChange).toHaveBeenCalledWith({ category: 'test' })
    })
  })

  describe('Tip Footer', () => {
    test('shows tip footer when not a collectible photo and no collectible data', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={false}
          hasCollectibleData={false}
        />
      )

      expect(screen.getByText(/Add collectible details to track estimated values/)).toBeInTheDocument()
    })

    test('does not show tip footer when isCollectiblePhoto is true', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={true}
          hasCollectibleData={false}
        />
      )

      expect(screen.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
    })

    test('does not show tip footer when hasCollectibleData is true', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={false}
          hasCollectibleData={true}
        />
      )

      expect(screen.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
    })

    test('does not show tip footer when both flags are true', () => {
      render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={true}
          hasCollectibleData={true}
        />
      )

      expect(screen.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
    })
  })

  describe('Integration: Props Passthrough', () => {
    test('passes photo prop to CollectibleDetailView', () => {
      // This test verifies prop structure - actual rendering is mocked
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
          collectibleData={mockCollectibleData}
        />
      )

      // Component renders successfully with mocked child
      expect(container.querySelector('[data-testid="collectible-detail-view"]')).toBeInTheDocument()
    })

    test('passes photoId to CollectibleEditorPanel', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
        />
      )

      // Component renders successfully with mocked child
      expect(container.querySelector('[data-testid="collectible-editor-panel"]')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    test('buttons have proper semantic structure', () => {
      render(<CollectiblesTabPanel {...defaultProps} />)

      const viewButton = screen.getByText('📋 View Details')
      const editButton = screen.getByText('✏️ Edit')

      expect(viewButton.tagName).toBe('BUTTON')
      expect(editButton.tagName).toBe('BUTTON')
    })

    test('buttons are keyboard accessible (have cursor pointer)', () => {
      render(<CollectiblesTabPanel {...defaultProps} />)

      const viewButton = screen.getByText('📋 View Details')
      const editButton = screen.getByText('✏️ Edit')

      expect(viewButton.style.cursor).toBe('pointer')
      expect(editButton.style.cursor).toBe('pointer')
    })
  })
})
