import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock useAuth hook with controllable state
const mockUpdatePreferences = vi.fn();
const mockLoadDefaultScales = vi.fn();
let mockAuthState = {
  user: { id: 'test-user-id', email: 'test@example.com' },
  preferences: {
    gradingScales: {
      Pyrex: [
        { label: 'Mint', rank: 5, definition: 'Perfect condition' },
        { label: 'DWD', rank: 1, definition: 'Dishwasher Damage' }
      ]
    }
  },
  updatePreferences: mockUpdatePreferences,
  loadDefaultScales: mockLoadDefaultScales,
  cookieReady: true
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => mockAuthState
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

import SettingsPage from './SettingsPage.jsx';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdatePreferences.mockResolvedValue({ success: true, data: {} });
    mockLoadDefaultScales.mockResolvedValue({ success: true, data: {} });
    // Reset to authenticated state
    mockAuthState = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      preferences: {
        gradingScales: {
          Pyrex: [
            { label: 'Mint', rank: 5, definition: 'Perfect condition' },
            { label: 'DWD', rank: 1, definition: 'Dishwasher Damage' }
          ]
        }
      },
      updatePreferences: mockUpdatePreferences,
      loadDefaultScales: mockLoadDefaultScales,
      cookieReady: true
    };
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
  };

  describe('Render Tests', () => {
    it('should render the settings page with header', () => {
      renderComponent();
      
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Manage your collectibles grading scales')).toBeInTheDocument();
    });

    it('should render category list', () => {
      renderComponent();
      
      const categoryList = screen.getByTestId('category-list');
      expect(categoryList).toBeInTheDocument();
      
      // Should show default categories plus user categories
      expect(screen.getByText('Pyrex')).toBeInTheDocument();
      expect(screen.getByText('Comics')).toBeInTheDocument();
    });

    it('should render grade table when category is selected', async () => {
      renderComponent();
      
      // Click on Pyrex category
      fireEvent.click(screen.getByText('Pyrex'));
      
      // Should show grades table
      await waitFor(() => {
        expect(screen.getByTestId('grades-table')).toBeInTheDocument();
      });
      
      // Should show the grades
      expect(screen.getByText('Mint')).toBeInTheDocument();
      expect(screen.getByText('DWD')).toBeInTheDocument();
      expect(screen.getByText('Dishwasher Damage')).toBeInTheDocument();
    });

    it('should show empty state when no category selected', () => {
      renderComponent();
      
      expect(screen.getByText('Select a category to view or edit its grading scale.')).toBeInTheDocument();
    });
  });

  describe('Interaction Tests', () => {
    it('should show add grade form when clicking Add Grade button', async () => {
      renderComponent();
      
      // Select a category first
      fireEvent.click(screen.getByText('Pyrex'));
      
      // Click Add Grade button
      const addButton = screen.getByTestId('add-grade-btn');
      fireEvent.click(addButton);
      
      // Should show the form
      await waitFor(() => {
        expect(screen.getByTestId('add-grade-form')).toBeInTheDocument();
      });
      
      // Should have input fields
      expect(screen.getByTestId('grade-label-input')).toBeInTheDocument();
      expect(screen.getByTestId('grade-rank-select')).toBeInTheDocument();
      expect(screen.getByTestId('grade-definition-input')).toBeInTheDocument();
    });

    it('should call updatePreferences when saving a new grade', async () => {
      renderComponent();
      
      // Select a category
      fireEvent.click(screen.getByText('Pyrex'));
      
      // Open add form
      fireEvent.click(screen.getByTestId('add-grade-btn'));
      
      // Fill in the form
      fireEvent.change(screen.getByTestId('grade-label-input'), {
        target: { value: 'Excellent' }
      });
      fireEvent.change(screen.getByTestId('grade-rank-select'), {
        target: { value: '4' }
      });
      fireEvent.change(screen.getByTestId('grade-definition-input'), {
        target: { value: 'Very good condition with minimal wear' }
      });
      
      // Click save
      fireEvent.click(screen.getByTestId('save-grade-btn'));
      
      // Should call updatePreferences
      await waitFor(() => {
        expect(mockUpdatePreferences).toHaveBeenCalledWith({
          gradingScales: {
            Pyrex: expect.arrayContaining([
              expect.objectContaining({
                label: 'Excellent',
                rank: 4,
                definition: 'Very good condition with minimal wear'
              })
            ])
          }
        });
      });
    });

    it('should show validation error when label is empty', async () => {
      renderComponent();
      
      // Select a category
      fireEvent.click(screen.getByText('Pyrex'));
      
      // Open add form
      fireEvent.click(screen.getByTestId('add-grade-btn'));
      
      // Try to save without filling in label
      fireEvent.change(screen.getByTestId('grade-definition-input'), {
        target: { value: 'Some definition' }
      });
      fireEvent.click(screen.getByTestId('save-grade-btn'));
      
      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('Label and definition are required')).toBeInTheDocument();
      });
      
      // Should NOT call updatePreferences
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
    });
  });

  describe('Load Defaults Tests', () => {
    it('should render Load Defaults button', () => {
      renderComponent();
      
      const loadDefaultsBtn = screen.getByTestId('load-defaults-btn');
      expect(loadDefaultsBtn).toBeInTheDocument();
    });

    it('should call loadDefaultScales when clicking Load Defaults', async () => {
      renderComponent();
      
      // Click Load Defaults
      fireEvent.click(screen.getByTestId('load-defaults-btn'));
      
      // Should call loadDefaultScales
      await waitFor(() => {
        expect(mockLoadDefaultScales).toHaveBeenCalled();
      });
    });

    it('should show success message after loading defaults', async () => {
      mockLoadDefaultScales.mockResolvedValue({ success: true, data: { gradingScales: {} } });
      
      renderComponent();
      
      // Click Load Defaults
      fireEvent.click(screen.getByTestId('load-defaults-btn'));
      
      // Should show success message
      await waitFor(() => {
        expect(screen.getByText('Default grading scales loaded')).toBeInTheDocument();
      });
    });

    it('should show error message when loading defaults fails', async () => {
      mockLoadDefaultScales.mockResolvedValue({ success: false, error: 'API Error' });
      
      renderComponent();
      
      // Click Load Defaults
      fireEvent.click(screen.getByTestId('load-defaults-btn'));
      
      // Should show error message
      await waitFor(() => {
        expect(screen.getByText('API Error')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation Tests', () => {
    it('should navigate back to gallery when clicking Back button', () => {
      renderComponent();
      
      fireEvent.click(screen.getByText('← Back to Gallery'));
      
      expect(mockNavigate).toHaveBeenCalledWith('/gallery');
    });
  });
});

// Test for unauthenticated user
describe('SettingsPage - Unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('should show login prompt when not authenticated', () => {
    // Set unauthenticated state
    mockAuthState = {
      user: null,
      preferences: { gradingScales: {} },
      updatePreferences: mockUpdatePreferences,
      loadDefaultScales: mockLoadDefaultScales,
      cookieReady: false
    };

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Please log in to access settings')).toBeInTheDocument();
  });
});
