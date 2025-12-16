import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PhotoCard from './PhotoCard.tsx';
import type { PhotoCardProps } from './PhotoCard.tsx';

// Mock the api module to prevent actual fetch calls in AuthenticatedImage
vi.mock('../api.js', () => ({
  fetchProtectedBlobUrl: vi.fn(() => Promise.resolve('blob:mock-url')),
  revokeBlobUrl: vi.fn(),
  API_BASE_URL: 'http://localhost:3001',
}));

describe('PhotoCard Component', () => {
  const mockPhoto: PhotoCardProps['photo'] = {
    id: 1,
    filename: 'test-photo.jpg',
    state: 'inprogress',
    file_size: 2048000,
    caption: 'A beautiful sunset',
    description: 'Captured during golden hour',
    keywords: 'sunset, nature, sky',
    thumbnail: '/thumbnails/test-photo_thumb.jpg',
    metadata: {
      DateTimeOriginal: '2024:06:15 18:30:00',
    },
  };

  // Provide getSignedUrl to avoid AuthenticatedImage usage in most tests
  const mockGetSignedUrl = vi.fn((photo: PhotoCardProps['photo']) => `http://localhost:3001${photo.thumbnail}?signed=true`);

  const defaultProps = {
    photo: mockPhoto,
    accessLevel: 'read,write',
    isPolling: false,
    apiBaseUrl: 'http://localhost:3001',
    getSignedUrl: mockGetSignedUrl,
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onApprove: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the card with correct structure', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-title')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-status')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-date')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-size')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-access')).toBeInTheDocument();
    });

    it('displays caption as title when available', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-title')).toHaveTextContent('A beautiful sunset');
    });

    it('falls back to filename when caption is empty', () => {
      const photoWithoutCaption = { ...mockPhoto, caption: '' };
      render(<PhotoCard {...defaultProps} photo={photoWithoutCaption} />);

      expect(screen.getByTestId('photo-card-title')).toHaveTextContent('test-photo.jpg');
    });

    it('displays "Untitled" when no caption or filename', () => {
      const photoNoTitle = { ...mockPhoto, caption: '', filename: '' };
      render(<PhotoCard {...defaultProps} photo={photoNoTitle} />);

      expect(screen.getByTestId('photo-card-title')).toHaveTextContent('Untitled');
    });

    it('truncates long captions', () => {
      const longCaption = 'This is a very long caption that should be truncated because it exceeds the maximum length';
      const photoLongCaption = { ...mockPhoto, caption: longCaption };
      render(<PhotoCard {...defaultProps} photo={photoLongCaption} />);

      const title = screen.getByTestId('photo-card-title');
      expect(title.textContent).toHaveLength(41); // 40 chars + ellipsis
      expect(title.textContent).toContain('…');
    });

    it('displays formatted date', () => {
      render(<PhotoCard {...defaultProps} />);

      // EXIF date "2024:06:15 18:30:00" should become "Jun 15, 2024"
      expect(screen.getByTestId('photo-card-date')).toHaveTextContent('Jun 15, 2024');
    });

    it('displays formatted file size', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-size')).toHaveTextContent('2 MB');
    });

    it('displays access level as "Full Access" for RWX permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="RWX" />);
      expect(screen.getByTestId('photo-card-access')).toHaveTextContent('Full Access');
    });

    it('displays access level as "Full Access" for W permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="W" />);
      expect(screen.getByTestId('photo-card-access')).toHaveTextContent('Full Access');
    });

    it('displays access level as "Full Access" for legacy write permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="write" />);
      expect(screen.getByTestId('photo-card-access')).toHaveTextContent('Full Access');
    });

    it('displays access level as "Read Only" for R permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="R" />);
      expect(screen.getByTestId('photo-card-access')).toHaveTextContent('Read Only');
    });

    it('displays access level as "Read Only" for legacy read permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="read" />);
      expect(screen.getByTestId('photo-card-access')).toHaveTextContent('Read Only');
    });
  });

  describe('Status Badge', () => {
    it('shows "In progress" badge for inprogress state (not polling)', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-status')).toHaveTextContent('In progress');
      expect(screen.queryByTestId('photo-card-status-spinner')).not.toBeInTheDocument();
    });

    it('shows "Draft" badge for working state', () => {
      const workingPhoto: PhotoCardProps['photo'] = { ...mockPhoto, state: 'working' };
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      expect(screen.getByTestId('photo-card-status')).toHaveTextContent('Draft');
    });

    it('shows "Analyzed" badge for finished state', () => {
      const finishedPhoto: PhotoCardProps['photo'] = { ...mockPhoto, state: 'finished' };
      render(<PhotoCard {...defaultProps} photo={finishedPhoto} />);

      expect(screen.getByTestId('photo-card-status')).toHaveTextContent('Analyzed');
    });
  });

  describe('Thumbnail', () => {
    it('renders thumbnail image when available', () => {
      render(<PhotoCard {...defaultProps} />);

      const img = screen.getByAltText('A beautiful sunset');
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('src')).toContain('/thumbnails/test-photo_thumb.jpg');
    });

    it('shows loading skeleton while image loads', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-skeleton')).toBeInTheDocument();
    });

    it('shows fallback when no thumbnail is available', () => {
      const photoNoThumb = { ...mockPhoto, thumbnail: null };
      render(<PhotoCard {...defaultProps} photo={photoNoThumb} />);

      expect(screen.getByText('No preview')).toBeInTheDocument();
    });

    it('shows error fallback when image fails to load', async () => {
      render(<PhotoCard {...defaultProps} />);

      const img = screen.getByAltText('A beautiful sunset');
      fireEvent.error(img);

      await waitFor(() => {
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
      });
    });

    it('uses getSignedUrl when provided', () => {
      const mockGetSignedUrl = vi.fn().mockReturnValue('https://signed-url.com/photo.jpg');
      render(<PhotoCard {...defaultProps} getSignedUrl={mockGetSignedUrl} />);

      expect(mockGetSignedUrl).toHaveBeenCalledWith(mockPhoto);
      const img = screen.getByAltText('A beautiful sunset');
      expect(img.getAttribute('src')).toBe('https://signed-url.com/photo.jpg');
    });
  });

  describe('Polling State', () => {
    it('shows spinner overlay and "Analyzing..." badge when isPolling is true', () => {
      render(<PhotoCard {...defaultProps} isPolling={true} />);

      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByTestId('photo-card-status')).toHaveTextContent('Analyzing...');
      expect(screen.getByTestId('photo-card-status-spinner')).toBeInTheDocument();
    });
  });

  describe('Action Buttons - InProgress State', () => {
    it('renders Edit button for inprogress photos', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-edit-btn')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    it('renders Return button for inprogress photos', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-return-btn')).toBeInTheDocument();
      expect(screen.getByText('Return')).toBeInTheDocument();
    });

    it('renders Delete button for inprogress photos', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-delete-btn')).toBeInTheDocument();
    });

    it('calls onEdit with photo when Edit button is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card-edit-btn'));

      expect(defaultProps.onEdit).toHaveBeenCalledWith(mockPhoto);
    });

    it('calls onApprove with photo id when Return button is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card-return-btn'));

      expect(defaultProps.onApprove).toHaveBeenCalledWith(mockPhoto.id);
    });

    it('shows confirmation dialog before delete', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card-delete-btn'));

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to delete this photo? This action cannot be undone.'
      );
      expect(defaultProps.onDelete).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('calls onDelete with photo id when confirmed', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card-delete-btn'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith(mockPhoto.id);
      confirmSpy.mockRestore();
    });

    it('enables Delete button for RWX permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="RWX" />);
      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).not.toBeDisabled();
    });

    it('enables Delete button for W permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="W" />);
      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).not.toBeDisabled();
    });

    it('enables Delete button for legacy write permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="write" />);
      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).not.toBeDisabled();
    });

    it('disables Delete button for R permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="R" />);
      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).toBeDisabled();
    });

    it('disables Delete button for legacy read permissions', () => {
      render(<PhotoCard {...defaultProps} accessLevel="read" />);
      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).toBeDisabled();
    });
  });

  describe('Action Buttons - Working State', () => {
    const workingPhoto: PhotoCardProps['photo'] = { ...mockPhoto, state: 'working' };

    it('renders Analyze button for working photos', () => {
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      expect(screen.getByTestId('photo-card-approve-btn')).toBeInTheDocument();
      expect(screen.getByText('Analyze')).toBeInTheDocument();
    });

    it('does not render Edit/Return buttons for working photos', () => {
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      expect(screen.queryByTestId('photo-card-edit-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('photo-card-return-btn')).not.toBeInTheDocument();
    });

    it('renders Delete button for working photos', () => {
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      expect(screen.getByTestId('photo-card-delete-btn')).toBeInTheDocument();
    });

    it('calls onApprove with photo id when Analyze button is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      await user.click(screen.getByTestId('photo-card-approve-btn'));

      expect(defaultProps.onApprove).toHaveBeenCalledWith(workingPhoto.id);
    });

    it('calls onDelete with photo id when Delete confirmed in working state', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<PhotoCard {...defaultProps} photo={workingPhoto} />);

      await user.click(screen.getByTestId('photo-card-delete-btn'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith(workingPhoto.id);
      confirmSpy.mockRestore();
    });
  });

  describe('Action Buttons - Finished State', () => {
    const finishedPhoto: PhotoCardProps['photo'] = { ...mockPhoto, state: 'finished' };

    it('renders Delete button for finished photos', () => {
      render(<PhotoCard {...defaultProps} photo={finishedPhoto} />);

      expect(screen.getByTestId('photo-card-delete-btn')).toBeInTheDocument();
    });

    it('does not render Edit/Return/Analyze buttons for finished photos', () => {
      render(<PhotoCard {...defaultProps} photo={finishedPhoto} />);

      expect(screen.queryByTestId('photo-card-edit-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('photo-card-return-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('photo-card-approve-btn')).not.toBeInTheDocument();
    });

    it('calls onDelete with photo id when Delete confirmed in finished state', async () => {
      const user = userEvent.setup();
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      render(<PhotoCard {...defaultProps} photo={finishedPhoto} />);

      await user.click(screen.getByTestId('photo-card-delete-btn'));

      expect(defaultProps.onDelete).toHaveBeenCalledWith(finishedPhoto.id);
      confirmSpy.mockRestore();
    });

    it('disables Delete button for finished photos when user has read-only access', () => {
      render(<PhotoCard {...defaultProps} photo={finishedPhoto} accessLevel="read" />);

      const deleteBtn = screen.getByTestId('photo-card-delete-btn');
      expect(deleteBtn).toBeDisabled();
    });
  });

  describe('Card Selection', () => {
    it('calls onSelect with photo when card is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card'));

      expect(defaultProps.onSelect).toHaveBeenCalledWith(mockPhoto);
    });

    it('does not trigger onSelect when action button is clicked', async () => {
      const user = userEvent.setup();
      render(<PhotoCard {...defaultProps} />);

      await user.click(screen.getByTestId('photo-card-edit-btn'));

      // onSelect should not be called when Edit is clicked
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper role and aria-label', () => {
      render(<PhotoCard {...defaultProps} />);

      const card = screen.getByTestId('photo-card');
      expect(card).toHaveAttribute('role', 'article');
      expect(card).toHaveAttribute('aria-label', 'Photo: A beautiful sunset');
    });

    it('has aria-labels on action buttons', () => {
      render(<PhotoCard {...defaultProps} />);

      expect(screen.getByTestId('photo-card-edit-btn')).toHaveAttribute('aria-label', 'Edit photo');
      expect(screen.getByTestId('photo-card-return-btn')).toHaveAttribute('aria-label', 'Return photo to queue');
      expect(screen.getByTestId('photo-card-delete-btn')).toHaveAttribute('aria-label', 'Delete photo');
    });

    it('provides title tooltip with full filename/caption', () => {
      render(<PhotoCard {...defaultProps} />);

      const title = screen.getByTestId('photo-card-title');
      expect(title).toHaveAttribute('title', 'A beautiful sunset');
    });
  });

  describe('Multiple Cards Rendering', () => {
    it('renders correct number of cards when used in a list', () => {
      const photos = [
        { ...mockPhoto, id: 1 },
        { ...mockPhoto, id: 2, caption: 'Second photo' },
        { ...mockPhoto, id: 3, caption: 'Third photo' },
      ];

      render(
        <div>
          {photos.map((photo) => (
            <PhotoCard key={photo.id} {...defaultProps} photo={photo} />
          ))}
        </div>
      );

      const cards = screen.getAllByTestId('photo-card');
      expect(cards).toHaveLength(3);
    });
  });

  describe('Image Loading Logic', () => {
    it('prioritizes thumbnail over full URL', () => {
      const photoWithBoth = {
        ...mockPhoto,
        url: 'http://example.com/full.jpg',
        thumbnail: 'http://example.com/thumb.jpg'
      };
      
      // Use a smarter mock that returns absolute URLs as-is
      const smartGetSignedUrl = vi.fn((photo) => {
        const url = photo.thumbnail || photo.url;
        // If URL is already absolute, return as-is (simulates signed URL behavior)
        if (url?.startsWith('http')) return url;
        return `http://localhost:3001${url}?signed=true`;
      });
      
      render(<PhotoCard {...defaultProps} photo={photoWithBoth} getSignedUrl={smartGetSignedUrl} />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'http://example.com/thumb.jpg');
    });

    it('falls back to full URL when thumbnail is missing', () => {
      const photoNoThumb = {
        ...mockPhoto,
        url: 'http://example.com/full.jpg',
        thumbnail: null
      };
      
      // Use a smarter mock that returns absolute URLs as-is
      const smartGetSignedUrl = vi.fn((photo) => {
        const url = photo.thumbnail || photo.url;
        // If URL is already absolute, return as-is
        if (url?.startsWith('http')) return url;
        return url ? `http://localhost:3001${url}?signed=true` : null;
      });
      
      render(<PhotoCard {...defaultProps} photo={photoNoThumb} getSignedUrl={smartGetSignedUrl} />);
      
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'http://example.com/full.jpg');
    });

    it('handles image load error gracefully', () => {
      render(<PhotoCard {...defaultProps} />);
      
      const img = screen.getByRole('img');
      fireEvent.error(img);
      
      expect(screen.getByText('Failed to load')).toBeInTheDocument();
    });
  });
});
