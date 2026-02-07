import { render, fireEvent, within } from '@testing-library/react';
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
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    expect(dialogScope.getByText('Review Identification')).toBeInTheDocument();
    expect(dialogScope.getByText('SCOTT-C3')).toBeInTheDocument();
    expect(dialogScope.getByText('stamp')).toBeInTheDocument();
    expect(dialogScope.getByText('United States 1918 Curtiss Jenny')).toBeInTheDocument();
    expect(dialogScope.getByText('92%')).toBeInTheDocument();
    expect(dialogScope.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(dialogScope.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  test('clicking Edit shows editor form', () => {
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    const editButton = dialogScope.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    // Editor form should be visible
    expect(dialogScope.getByLabelText(/^ID/)).toBeInTheDocument();
    expect(dialogScope.getByLabelText(/^Category/)).toBeInTheDocument();
    expect(dialogScope.getByLabelText(/Name \(Optional\)/)).toBeInTheDocument();
    expect(dialogScope.getByRole('button', { name: /save/i })).toBeInTheDocument();
    expect(dialogScope.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  test('approve button calls onApprove with correct override', () => {
    const onApprove = vi.fn();
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={onApprove}
        onEditSave={vi.fn()}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    const approveButton = dialogScope.getByRole('button', { name: /approve/i });
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
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={onEditSave}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    // Switch to edit mode
    fireEvent.click(dialogScope.getByRole('button', { name: /edit/i }));

    // Modify the ID field
    const idInput = dialogScope.getByLabelText(/^ID/) as HTMLInputElement;
    fireEvent.change(idInput, { target: { value: 'SCOTT-C3a' } });

    // Click Save
    const saveButton = dialogScope.getByRole('button', { name: /save/i });
    fireEvent.click(saveButton);

    expect(onEditSave).toHaveBeenCalledWith({
      id: 'SCOTT-C3a',
      category: 'stamp',
      confirmedBy: 'human',
      fields: { name: 'United States 1918 Curtiss Jenny' },
    });
  });

  test('cancel button returns to review view', () => {
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    // Switch to edit mode
    fireEvent.click(dialogScope.getByRole('button', { name: /edit/i }));
    expect(dialogScope.getByLabelText(/^ID/)).toBeInTheDocument();

    // Click Cancel
    fireEvent.click(dialogScope.getByRole('button', { name: /cancel/i }));

    // Should be back to review view
    expect(dialogScope.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(dialogScope.queryByLabelText(/^ID/)).not.toBeInTheDocument();
  });

  test('shows processing state when isProcessing is true', () => {
    const { container } = render(
      <CollectibleReviewModal
        open={true}
        collectibleAiAnalysis={mockCollectibleAnalysis}
        onApprove={vi.fn()}
        onEditSave={vi.fn()}
        isProcessing={true}
      />
    );

    const dialog = within(container).getByRole('dialog', { name: /review identification/i });
    const dialogScope = within(dialog);

    const approveButton = dialogScope.getByRole('button', { name: /resuming/i });
    expect(approveButton).toBeDisabled();

    const editButton = dialogScope.getByRole('button', { name: /edit/i });
    expect(editButton).toBeDisabled();
  });
});
