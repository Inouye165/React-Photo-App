import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import CollectibleReviewModal from './CollectibleReviewModal';
import type { CollectibleAiAnalysis } from '../../types/photo';

describe('CollectibleReviewModal', () => {
  const mockCollectibleAnalysis: CollectibleAiAnalysis = {
    category: 'stamp',
    identification: {
      id: 'SCOTT-C3',
      category: 'stamp',
      confidence: 0.92,
      fields: { name: 'United States 1918 Curtiss Jenny' },
      source: 'ai',
    },
    review: {
      status: 'pending',
      confidence: 0.92,
    },
  };

  test('renders nothing when open is false', () => {
    const { container } = render(
      <CollectibleReviewModal
        open={false}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when review status is not pending', () => {
    const confirmedAnalysis = {
      ...mockCollectibleAnalysis,
      review: { status: 'confirmed' as const },
    };
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={confirmedAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders review view when open and pending', () => {
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    expect(screen.getByText('Review Identification')).toBeInTheDocument();
    expect(screen.getByText('SCOTT-C3')).toBeInTheDocument();
    expect(screen.getByText('stamp')).toBeInTheDocument();
    expect(screen.getByText('United States 1918 Curtiss Jenny')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  test('clicking Edit shows editor form', () => {
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Editor form should be visible
    expect(screen.getByLabelText(/^ID/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Category/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name \(Optional\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('approve button calls onApprove with correct override', () => {
    const onApprove = vi.fn();
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={onApprove}
        onEditSave={vi.fn()}
      />
    );

    const approveButton = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    expect(onApprove).toHaveBeenCalledWith({
      id: 'SCOTT-C3',
      category: 'stamp',
      confirmedBy: 'human',
      fields: { name: 'United States 1918 Curtiss Jenny' },
    });
  });

  test('editing and saving calls onEditSave with override', () => {
    const onEditSave = vi.fn();
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={onEditSave}
      />
    );

    // Switch to edit mode
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));

    // Modify the ID field
    const idInput = screen.getByLabelText(/^ID/) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'SCOTT-C3a' } });

    // Click Save
    const saveButton = screen.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    expect(onEditSave).toHaveBeenCalledWith({
      id: 'SCOTT-C3a',
      category: 'stamp',
      confirmedBy: 'human',
      fields: { name: 'United States 1918 Curtiss Jenny' },
    });
  });

  test('cancel button returns to review view', () => {
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    // Switch to edit mode
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByLabelText(/^ID/)).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    // Should be back to review view
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^ID/)).not.toBeInTheDocument();
  });

  test('shows processing state when isProcessing is true', () => {
    render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
        isProcessing={true}
      />
    );

    const approveButton = screen.getByRole('button', { name: /resuming/i });
    expect(approveButton).toBeDisabled();
    
    const editButton = screen.getByRole('button', { name: /edit/i });
    expect(editButton).toBeDisabled();
  });
});
