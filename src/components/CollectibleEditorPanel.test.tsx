// @ts-nocheck
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Mock AuthContext with controllable state
const mockAuthState = {
  user: { id: 'test-user-id', email: 'test@example.com' },
  preferences: {
    gradingScales: {
      'Comic Book': [
        { label: 'Mint', rank: 10, definition: 'Perfect CGC 9.8+' },
        { label: 'Near Mint', rank: 9, definition: 'CGC 9.2-9.6' },
        { label: 'Very Fine', rank: 7, definition: 'CGC 7.0-8.5' }
      ],
      'Kitchenware': [
        { label: 'Perfect', rank: 5, definition: 'No chips, cracks, or fading' },
        { label: 'MyScale', rank: 4, definition: 'Custom user-defined scale' },
        { label: 'DWD', rank: 1, definition: 'Dishwasher damage' }
      ]
    }
  }
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState
}));

// Import component after mocking
import CollectibleEditorPanel from './CollectibleEditorPanel.tsx';

describe('CollectibleEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderPanel = (props = {}) => {
    return render(<CollectibleEditorPanel photoId="123" {...props} />);
  };

  describe('Basic Rendering', () => {
    it('renders the panel with all form fields', () => {
      renderPanel();

      expect(screen.getByTestId('collectible-editor-panel')).toBeInTheDocument();
      expect(screen.getByTestId('input-name')).toBeInTheDocument();
      expect(screen.getByTestId('select-category')).toBeInTheDocument();
      expect(screen.getByTestId('select-condition')).toBeInTheDocument();
      expect(screen.getByTestId('input-value-min')).toBeInTheDocument();
      expect(screen.getByTestId('input-value-max')).toBeInTheDocument();
    });

    it('shows AI badge when aiAnalysis prop is provided', () => {
      renderPanel({
        aiAnalysis: { name: 'Test Item', nameConfidence: 0.95 }
      });

      expect(screen.getByTestId('ai-badge')).toBeInTheDocument();
      expect(screen.getByTestId('ai-badge')).toHaveTextContent('AI Assisted');
    });

    it('does not show AI badge when aiAnalysis is null', () => {
      renderPanel({ aiAnalysis: null });

      expect(screen.queryByTestId('ai-badge')).not.toBeInTheDocument();
    });
  });

  describe('Confidence Display', () => {
    it('leaves input empty when AI confidence is low (<0.8)', () => {
      renderPanel({
        aiAnalysis: {
          name: 'Vintage Pyrex Bowl',
          nameConfidence: 0.5
        }
      });

      const nameInput = screen.getByTestId('input-name');
      // Low confidence - value should be empty
      expect(nameInput.value).toBe('');
      // But placeholder should show AI suggestion
      expect(nameInput.placeholder).toContain('AI Suggestion');
      expect(nameInput.placeholder).toContain('Vintage Pyrex Bowl');
    });

    it('pre-fills input when AI confidence is high (>=0.9)', async () => {
      renderPanel({
        aiAnalysis: {
          name: 'Amazing Spider-Man #129',
          nameConfidence: 0.95
        }
      });

      await waitFor(() => {
        const nameInput = screen.getByTestId('input-name');
        expect(nameInput.value).toBe('Amazing Spider-Man #129');
      });
    });

    it('pre-fills input but adds review class when confidence is medium (0.8-0.9)', async () => {
      renderPanel({
        aiAnalysis: {
          name: 'Butterprint Bowl',
          nameConfidence: 0.85
        }
      });

      await waitFor(() => {
        const nameInput = screen.getByTestId('input-name');
        expect(nameInput.value).toBe('Butterprint Bowl');
        expect(nameInput.classList.contains('confidence-review')).toBe(true);
      });
    });

    it('shows AI suggestion in placeholder for low confidence value fields', () => {
      renderPanel({
        aiAnalysis: {
          valueMin: 50,
          valueMax: 75,
          valueConfidence: 0.5
        }
      });

      const minInput = screen.getByTestId('input-value-min');
      const maxInput = screen.getByTestId('input-value-max');
      
      expect(minInput.value).toBe('');
      expect(maxInput.value).toBe('');
      expect(minInput.placeholder).toContain('AI Suggestion: 50');
      expect(maxInput.placeholder).toContain('AI Suggestion: 75');
    });
  });

  describe('Grading Scale', () => {
    it('shows user custom grading scale when category is selected', async () => {
      renderPanel();

      // Select Kitchenware category
      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Kitchenware' } });

      // Check condition dropdown contains user's custom scale
      const conditionSelect = screen.getByTestId('select-condition');
      
      // Open options by clicking
      await waitFor(() => {
        expect(conditionSelect).toBeInTheDocument();
      });

      // Check for MyScale option (custom user scale from mock)
      const options = conditionSelect.querySelectorAll('option');
      const optionLabels = Array.from(options).map(o => o.textContent);
      
      expect(optionLabels.some(label => label.includes('MyScale'))).toBe(true);
      expect(optionLabels.some(label => label.includes('Perfect'))).toBe(true);
      expect(optionLabels.some(label => label.includes('DWD'))).toBe(true);
    });

    it('uses default scale when category has no custom grading scale', async () => {
      renderPanel();

      // Select a category without custom scale
      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Toys' } });

      const conditionSelect = screen.getByTestId('select-condition');
      const options = conditionSelect.querySelectorAll('option');
      const optionLabels = Array.from(options).map(o => o.textContent);
      
      // Should fall back to default scale (Mint, Excellent, Good, Fair, Poor)
      expect(optionLabels.some(label => label.includes('Mint'))).toBe(true);
      expect(optionLabels.some(label => label.includes('Excellent'))).toBe(true);
      expect(optionLabels.some(label => label.includes('Good'))).toBe(true);
    });

    it('shows condition definition when condition is selected', async () => {
      renderPanel();

      // Select Kitchenware category first
      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Kitchenware' } });

      // Select a condition
      const conditionSelect = screen.getByTestId('select-condition');
      fireEvent.change(conditionSelect, { target: { value: 'MyScale' } });

      await waitFor(() => {
        const definition = screen.getByTestId('condition-definition');
        expect(definition).toHaveTextContent('Custom user-defined scale');
      });
    });
  });

  describe('Dynamic Fields', () => {
    it('shows Issue # input when Comic Book category is selected', async () => {
      renderPanel();

      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Comic Book' } });

      await waitFor(() => {
        expect(screen.getByTestId('input-issueNumber')).toBeInTheDocument();
        expect(screen.getByTestId('input-publisher')).toBeInTheDocument();
        expect(screen.getByTestId('input-year')).toBeInTheDocument();
      });
    });

    it('shows Pattern input when Kitchenware category is selected', async () => {
      renderPanel();

      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Kitchenware' } });

      await waitFor(() => {
        expect(screen.getByTestId('input-pattern')).toBeInTheDocument();
        expect(screen.getByTestId('input-pieceType')).toBeInTheDocument();
      });
    });

    it('does NOT show Issue # when Kitchenware is selected', async () => {
      renderPanel();

      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Kitchenware' } });

      await waitFor(() => {
        expect(screen.queryByTestId('input-issueNumber')).not.toBeInTheDocument();
      });
    });

    it('does NOT show Pattern when Comic Book is selected', async () => {
      renderPanel();

      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Comic Book' } });

      await waitFor(() => {
        expect(screen.queryByTestId('input-pattern')).not.toBeInTheDocument();
      });
    });

    it('clears specifics when category changes', async () => {
      const onChangeMock = vi.fn();
      renderPanel({ onChange: onChangeMock });

      // Select Comic Book and fill in Issue #
      const categorySelect = screen.getByTestId('select-category');
      fireEvent.change(categorySelect, { target: { value: 'Comic Book' } });

      await waitFor(() => {
        expect(screen.getByTestId('input-issueNumber')).toBeInTheDocument();
      });

      const issueInput = screen.getByTestId('input-issueNumber');
      fireEvent.change(issueInput, { target: { value: '#129' } });

      // Switch to Kitchenware
      fireEvent.change(categorySelect, { target: { value: 'Kitchenware' } });

      await waitFor(() => {
        // Issue # should be gone
        expect(screen.queryByTestId('input-issueNumber')).not.toBeInTheDocument();
        // Pattern should appear, empty
        const patternInput = screen.getByTestId('input-pattern');
        expect(patternInput.value).toBe('');
      });
    });
  });

  describe('Form State Management', () => {
    it('initializes form from initialData prop', () => {
      renderPanel({
        initialData: {
          name: 'Pre-existing Item',
          category: 'Comic Book',
          condition_label: 'Mint',
          value_min: 100,
          value_max: 200
        }
      });

      expect(screen.getByTestId('input-name').value).toBe('Pre-existing Item');
      expect(screen.getByTestId('select-category').value).toBe('Comic Book');
      expect(screen.getByTestId('select-condition').value).toBe('Mint');
      expect(screen.getByTestId('input-value-min').value).toBe('100');
      expect(screen.getByTestId('input-value-max').value).toBe('200');
    });

    it('calls onChange callback when form fields change', async () => {
      const onChangeMock = vi.fn();
      renderPanel({ onChange: onChangeMock });

      const nameInput = screen.getByTestId('input-name');
      fireEvent.change(nameInput, { target: { value: 'New Item' } });

      await waitFor(() => {
        expect(onChangeMock).toHaveBeenCalled();
        const lastCall = onChangeMock.mock.calls[onChangeMock.mock.calls.length - 1][0];
        expect(lastCall.name).toBe('New Item');
        expect(lastCall.photoId).toBe('123');
      });
    });

    it('calls onSave callback when save button is clicked', async () => {
      const onSaveMock = vi.fn();
      renderPanel({ onSave: onSaveMock });

      // Fill in some data
      fireEvent.change(screen.getByTestId('input-name'), { target: { value: 'Test Item' } });
      fireEvent.change(screen.getByTestId('select-category'), { target: { value: 'Comic Book' } });
      fireEvent.change(screen.getByTestId('input-value-min'), { target: { value: '50' } });
      fireEvent.change(screen.getByTestId('input-value-max'), { target: { value: '100' } });

      // Click save button
      const saveButton = screen.getByTestId('save-collectible-btn');
      fireEvent.click(saveButton);

      expect(onSaveMock).toHaveBeenCalledWith(expect.objectContaining({
        photoId: '123',
        name: 'Test Item',
        category: 'Comic Book',
        valueMin: 50,
        valueMax: 100
      }));
    });

    it('does not show save button when onSave is not provided', () => {
      renderPanel({ onSave: undefined });

      expect(screen.queryByTestId('save-collectible-btn')).not.toBeInTheDocument();
    });
  });

  describe('Value Fields', () => {
    it('accepts numeric input for value fields', () => {
      renderPanel();

      const minInput = screen.getByTestId('input-value-min');
      const maxInput = screen.getByTestId('input-value-max');

      fireEvent.change(minInput, { target: { value: '25.50' } });
      fireEvent.change(maxInput, { target: { value: '75.99' } });

      expect(minInput.value).toBe('25.50');
      expect(maxInput.value).toBe('75.99');
    });
  });

  describe('Category Selection', () => {
    it('shows all available categories', () => {
      renderPanel();

      const categorySelect = screen.getByTestId('select-category');
      const options = categorySelect.querySelectorAll('option');
      const optionValues = Array.from(options).map(o => o.value);

      expect(optionValues).toContain('Comic Book');
      expect(optionValues).toContain('Kitchenware');
      expect(optionValues).toContain('Trading Cards');
      expect(optionValues).toContain('Coins');
      expect(optionValues).toContain('Toys');
      expect(optionValues).toContain('Other');
    });
  });
});
