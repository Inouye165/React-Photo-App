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
import { VirtuosoGrid } from 'react-virtuoso';
import { API_BASE_URL } from './api.js';
import PhotoCard from './components/PhotoCard.jsx';

// Hook to get responsive column count and gap
const useResponsiveGrid = () => {
  const [gridConfig, setGridConfig] = useState({ columns: 3, gap: 4 });
  
  useEffect(() => {
    const updateGrid = () => {
      const width = window.innerWidth;
      if (width < 640) {
        // Mobile: 3-column tight grid
        setGridConfig({ columns: 3, gap: 4 }); // gap-1 = 4px
      } else if (width < 768) {
        setGridConfig({ columns: 2, gap: 16 });
      } else if (width < 1024) {
        setGridConfig({ columns: 3, gap: 24 });
      } else if (width < 1280) {
        setGridConfig({ columns: 3, gap: 24 });
      } else {
        setGridConfig({ columns: 4, gap: 24 });
      }
    };
    
    updateGrid();
    window.addEventListener('resize', updateGrid);
    return () => window.removeEventListener('resize', updateGrid);
  }, []);
  
  return gridConfig;
};

// Grid components for react-virtuoso - with display names for React DevTools
const GridList = React.forwardRef(function GridList({ style, children: _children, ...props }, ref) {
  return (
    <div
      ref={ref}
      {...props}
      style={{
        display: 'grid',
        ...style,
      }}
      className="grid-gallery p-2 sm:p-6"
    />
  );
});

const GridItem = function GridItem({ children, ...props }) {
  return (
    <div {...props} className="photo-grid-item">
      {children}
    </div>
  );
};

// Grid components object for react-virtuoso
const gridComponents = {
  List: GridList,
  Item: GridItem,
};

export default function PhotoGallery({ 
  photos, 
  privilegesMap, 
  pollingPhotoId,
  handleMoveToInprogress,
  handleEditPhoto,
  handleMoveToWorking,
  handleDeletePhoto,
  onSelectPhoto,
  getSignedUrl,
}) {
  const { columns, gap } = useResponsiveGrid();
  
  // Memoize the item renderer
  const itemContent = useCallback((index) => {
    const photo = photos[index];
    if (!photo) return null;
    
    return (
      <PhotoCard
        key={photo.id || photo.name}
        photo={photo}
        accessLevel={privilegesMap?.[photo.id] || ''}
        isPolling={pollingPhotoId === photo.id}
        apiBaseUrl={API_BASE_URL}
        getSignedUrl={getSignedUrl}
        onSelect={onSelectPhoto}
        onEdit={handleEditPhoto}
        onApprove={photo.state === 'working' ? handleMoveToInprogress : handleMoveToWorking}
        onDelete={handleDeletePhoto}
      />
    );
  }, [photos, privilegesMap, pollingPhotoId, getSignedUrl, onSelectPhoto, handleEditPhoto, handleMoveToInprogress, handleMoveToWorking, handleDeletePhoto]);

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
        className="photo-gallery grid p-2 sm:p-6"
        style={gridStyle}
        data-testid="photo-gallery-grid"
      >
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id || photo.name}
            photo={photo}
            accessLevel={privilegesMap?.[photo.id] || ''}
            isPolling={pollingPhotoId === photo.id}
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
  const VirtualizedList = React.forwardRef(function VirtualizedList({ style, children: _children, ...props }, ref) {
    return (
      <div
        ref={ref}
        {...props}
        style={{
          display: 'grid',
          ...gridStyle,
          ...style,
        }}
        className="grid-gallery p-2 sm:p-6"
      />
    );
  });

  // For large lists, use virtualization
  return (
    <VirtuosoGrid
      data-testid="photo-gallery-grid"
      style={{ height: 'calc(100vh - 120px)' }}
      totalCount={photos.length}
      overscan={200}
      components={{
        ...gridComponents,
        List: VirtualizedList,
      }}
      itemContent={itemContent}
    />
  );
}
