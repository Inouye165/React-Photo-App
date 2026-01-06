/**
 * PhotoGallery - Mobile-first virtualized responsive card grid
 * 
 * Features:
 * - Mobile (< 640px): 3-column tight grid with gap-1
 * - Desktop: Responsive multi-column layout  
 * - Virtualization: Only renders visible items (handles 1000+ photos)
 * - Performance: Uses react-virtuoso for smooth scrolling
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { VirtuosoGrid, ListProps } from 'react-virtuoso';
import { API_BASE_URL } from './api';
import PhotoCard, { type PhotoCardProps } from './components/PhotoCard';

type PhotoCardPhoto = PhotoCardProps['photo'];

interface GridConfig {
  columns: number;
  gap: number;
}

type DensityMode = 'comfortable' | 'compact';

interface PhotoGalleryProps {
  photos: PhotoCardPhoto[];
  privilegesMap?: Map<number | string, string> | Record<number | string, string> | null;
  pollingPhotoId?: number | string | null;
  pollingPhotoIds?: Set<number | string>;
  handleMoveToInprogress: (id: PhotoCardPhoto['id']) => void;
  handleEditPhoto: (photo: PhotoCardPhoto) => void;
  handleMoveToWorking: (id: PhotoCardPhoto['id']) => void;
  handleDeletePhoto: (id: PhotoCardPhoto['id']) => void;
  onSelectPhoto?: (photo: PhotoCardPhoto) => void;
  getSignedUrl?: (photo: PhotoCardPhoto, variant?: 'full' | 'thumb') => string | null;
  density?: DensityMode;
}

interface GridItemProps {
  children?: React.ReactNode;
  [key: string]: unknown;
}

// Hook to get responsive column count and gap
const useResponsiveGrid = (density: DensityMode): GridConfig => {
  const [gridConfig, setGridConfig] = useState<GridConfig>({ columns: 3, gap: 4 });
  
  useEffect(() => {
    const updateGrid = (): void => {
      const width = window.innerWidth;
      const base = ((): GridConfig => {
        if (width < 640) {
          // Mobile: 3-column tight grid
          return { columns: 3, gap: 4 }; // gap-1 = 4px
        }
        if (width < 768) return { columns: 2, gap: 16 };
        if (width < 1024) return { columns: 3, gap: 24 };
        if (width < 1280) return { columns: 3, gap: 24 };
        return { columns: 4, gap: 24 };
      })();

      const isCompact = density === 'compact';
      const adjustedGap = isCompact ? Math.max(2, Math.round(base.gap * 0.6)) : base.gap;
      setGridConfig({ columns: base.columns, gap: adjustedGap });
    };
    
    updateGrid();
    window.addEventListener('resize', updateGrid);
    return () => window.removeEventListener('resize', updateGrid);
  }, [density]);
  
  return gridConfig;
};

const GridItem = function GridItem({ children, ...props }: GridItemProps): JSX.Element {
  return (
    <div {...props} className="photo-grid-item">
      {children}
    </div>
  );
};

export default function PhotoGallery({ 
  photos, 
  privilegesMap, 
  pollingPhotoId,
  pollingPhotoIds,
  handleMoveToInprogress,
  handleEditPhoto,
  handleMoveToWorking,
  handleDeletePhoto,
  onSelectPhoto,
  getSignedUrl,
  density = 'comfortable',
}: PhotoGalleryProps): JSX.Element {
  const { columns, gap } = useResponsiveGrid(density);
  const paddingClass = density === 'compact' ? 'p-1 sm:p-3' : 'p-2 sm:p-6';

  const getAccessLevel = useCallback((photoId: number | string): string => {
    if (!privilegesMap) return '';
    if (privilegesMap instanceof Map) return privilegesMap.get(photoId) || '';
    return privilegesMap?.[photoId] || '';
  }, [privilegesMap]);

  const isPollingForId = useCallback((photoId: number | string): boolean => {
    if (pollingPhotoIds && pollingPhotoIds.size) {
      for (const value of pollingPhotoIds) {
        if (String(value) === String(photoId)) return true;
      }
    }
    return pollingPhotoId != null && String(pollingPhotoId) === String(photoId);
  }, [pollingPhotoIds, pollingPhotoId]);
  
  // Memoize the item renderer
  const itemContent = useCallback((index: number): JSX.Element | null => {
    const photo = photos[index];
    if (!photo) return null;
    
    return (
      <PhotoCard
        key={photo.id || photo.name}
        photo={photo}
        accessLevel={getAccessLevel(photo.id)}
        isPolling={isPollingForId(photo.id)}
        apiBaseUrl={API_BASE_URL}
        getSignedUrl={getSignedUrl}
        onSelect={onSelectPhoto}
        onEdit={handleEditPhoto}
        onApprove={photo.state === 'working' ? handleMoveToInprogress : handleMoveToWorking}
        onDelete={handleDeletePhoto}
      />
    );
  }, [photos, getAccessLevel, isPollingForId, getSignedUrl, onSelectPhoto, handleEditPhoto, handleMoveToInprogress, handleMoveToWorking, handleDeletePhoto]);

  // Dynamic grid style based on screen size
  const gridStyle = useMemo(() => ({
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${gap}px`,
  }), [columns, gap]);

  // Empty state
  if (!photos || photos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-700">
        <p>No photos to display.</p>
      </div>
    );
  }

  // For small lists (< 50 photos), use simple rendering to avoid virtualization overhead
  if (photos.length < 50) {
    return (
      <div 
        className={`photo-gallery grid ${paddingClass}`}
        style={gridStyle}
        data-testid="photo-gallery-grid"
      >
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id || photo.name}
            photo={photo}
            accessLevel={getAccessLevel(photo.id)}
            isPolling={isPollingForId(photo.id)}
            apiBaseUrl={API_BASE_URL}
            getSignedUrl={getSignedUrl}
            onSelect={onSelectPhoto}
            onEdit={handleEditPhoto}
            onApprove={photo.state === 'working' ? handleMoveToInprogress : handleMoveToWorking}
            onDelete={handleDeletePhoto}
          />
        ))}
      </div>
    );
  }

  // Custom List component with proper display name for large list virtualization
  const VirtualizedList = React.forwardRef<HTMLDivElement, ListProps>(
    function VirtualizedList({ style, children: _children, ...props }, ref) {
      return (
        <div
          ref={ref}
          {...props}
          style={{
            display: 'grid',
            ...gridStyle,
            ...style,
          }}
          className={`grid-gallery ${paddingClass}`}
        />
      );
    }
  );

  // For large lists, use virtualization
  return (
    <VirtuosoGrid
      data-testid="photo-gallery-grid"
      style={{ height: 'calc(100vh - 120px)' }}
      totalCount={photos.length}
      overscan={200}
      components={{ Item: GridItem, List: VirtualizedList }}
      itemContent={itemContent}
    />
  );
}
