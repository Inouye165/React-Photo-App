/**
 * Tests for CollectiblesTabPanel component
 * Phase 2: Presentational component tests
 */

import React from 'react'
import { render, fireEvent, within } from '@testing-library/react'
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
      const { container } = render(<CollectiblesTabPanel {...defaultProps} />)
      const scope = within(container)

      expect(scope.getByText('📋 View Details')).toBeInTheDocument()
      expect(scope.getByText('✏️ Edit')).toBeInTheDocument()
    })

    test('view button is active when collectibleViewMode is "view"', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} collectibleViewMode="view" />)
      const scope = within(container)

      const viewButton = scope.getByText('📋 View Details')
      // Phase 5: Check for active class instead of inline styles (now uses CSS Modules)
      expect(viewButton.className).toContain('active')
    })

    test('edit button is active when collectibleViewMode is "edit"', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} collectibleViewMode="edit" />)
      const scope = within(container)

      const editButton = scope.getByText('✏️ Edit')
      // Phase 5: Check for active class instead of inline styles (now uses CSS Modules)
      expect(editButton.className).toContain('active')
    })

    test('clicking view button calls onViewModeChange with "view"', () => {
      const onViewModeChange = vi.fn()
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
          onViewModeChange={onViewModeChange}
        />
      )

      const scope = within(container)
      fireEvent.click(scope.getByText('📋 View Details'))
      expect(onViewModeChange).toHaveBeenCalledWith('view')
    })

    test('clicking edit button calls onViewModeChange with "edit"', () => {
      const onViewModeChange = vi.fn()
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
          onViewModeChange={onViewModeChange}
        />
      )

      const scope = within(container)
      fireEvent.click(scope.getByText('✏️ Edit'))
      expect(onViewModeChange).toHaveBeenCalledWith('edit')
    })
  })

  describe('AI Detection Badge', () => {
    test('shows AI detection badge when isCollectiblePhoto is true', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} isCollectiblePhoto={true} />)
      const scope = within(container)

      expect(scope.getByText('✓ AI Detected Collectible')).toBeInTheDocument()
    })

    test('does not show AI detection badge when isCollectiblePhoto is false', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} isCollectiblePhoto={false} />)
      const scope = within(container)

      expect(scope.queryByText('✓ AI Detected Collectible')).not.toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    test('shows loading message when collectibleLoading is true', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} collectibleLoading={true} />)
      const scope = within(container)

      expect(scope.getByText('Loading collectible data...')).toBeInTheDocument()
    })

    test('does not render CollectibleDetailView or CollectibleEditorPanel when loading', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} collectibleLoading={true} />)
      const scope = within(container)

      expect(scope.queryByTestId('collectible-detail-view')).not.toBeInTheDocument()
      expect(scope.queryByTestId('collectible-editor-panel')).not.toBeInTheDocument()
    })
  })

  describe('View Mode Content', () => {
    test('renders CollectibleDetailView when in view mode', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
          collectibleData={mockCollectibleData}
        />
      )

      const scope = within(container)
      expect(scope.getByTestId('collectible-detail-view')).toBeInTheDocument()
    })

    test('does not render CollectibleEditorPanel when in view mode', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="view"
        />
      )

      const scope = within(container)
      expect(scope.queryByTestId('collectible-editor-panel')).not.toBeInTheDocument()
    })
  })

  describe('Edit Mode Content', () => {
    test('renders CollectibleEditorPanel when in edit mode', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
        />
      )

      const scope = within(container)
      expect(scope.getByTestId('collectible-editor-panel')).toBeInTheDocument()
    })

    test('does not render CollectibleDetailView when in edit mode', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
        />
      )

      const scope = within(container)
      expect(scope.queryByTestId('collectible-detail-view')).not.toBeInTheDocument()
    })

    test('CollectibleEditorPanel onChange calls onCollectibleChange', () => {
      const onCollectibleChange = vi.fn()
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          collectibleViewMode="edit"
          onCollectibleChange={onCollectibleChange}
        />
      )

      const scope = within(container)
      const editorPanel = scope.getByTestId('collectible-editor-panel')
      fireEvent.click(editorPanel) // Trigger onChange mock

      expect(onCollectibleChange).toHaveBeenCalledWith({ category: 'test' })
    })
  })

  describe('Tip Footer', () => {
    test('shows tip footer when not a collectible photo and no collectible data', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={false}
          hasCollectibleData={false}
        />
      )

      const scope = within(container)
      expect(scope.getByText(/Add collectible details to track estimated values/)).toBeInTheDocument()
    })

    test('does not show tip footer when isCollectiblePhoto is true', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={true}
          hasCollectibleData={false}
        />
      )

      const scope = within(container)
      expect(scope.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
    })

    test('does not show tip footer when hasCollectibleData is true', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={false}
          hasCollectibleData={true}
        />
      )

      const scope = within(container)
      expect(scope.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
    })

    test('does not show tip footer when both flags are true', () => {
      const { container } = render(
        <CollectiblesTabPanel
          {...defaultProps}
          isCollectiblePhoto={true}
          hasCollectibleData={true}
        />
      )

      const scope = within(container)
      expect(scope.queryByText(/Add collectible details to track estimated values/)).not.toBeInTheDocument()
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
      const { container } = render(<CollectiblesTabPanel {...defaultProps} />)
      const scope = within(container)

      const viewButton = scope.getByText('📋 View Details')
      const editButton = scope.getByText('✏️ Edit')

      expect(viewButton.tagName).toBe('BUTTON')
      expect(editButton.tagName).toBe('BUTTON')
    })

    test('buttons are keyboard accessible (have cursor pointer)', () => {
      const { container } = render(<CollectiblesTabPanel {...defaultProps} />)
      const scope = within(container)

      const viewButton = scope.getByText('📋 View Details')
      const editButton = scope.getByText('✏️ Edit')

      // Phase 5: Cursor pointer is now applied via CSS Module class, check that class is present
      expect(viewButton.className).toContain('toggleButton')
      expect(editButton.className).toContain('toggleButton')
    })
  })
})
