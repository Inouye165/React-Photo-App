/**
 * PhotoGallery - Mobile-first virtualized responsive card grid
 * 
 * Features:
 * - Mobile (< 640px): 3-column tight grid with gap-1
 * - Desktop: Responsive multi-column layout  
 * - Virtualization: Only renders visible items (handles 1000+ photos)
 * - Performance: Uses react-virtuoso for smooth scrolling
 */
import React, { useCallback, useMemo } from 'react';
import Masonry from 'react-masonry-css';
import { API_BASE_URL } from './api';
import PhotoCard, { type PhotoCardProps } from './components/PhotoCard';
import useStore from './store';

type PhotoCardPhoto = PhotoCardProps['photo'];

interface GridConfig {
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

const getMasonryGap = (density: DensityMode): GridConfig => {
  return { gap: density === 'compact' ? 8 : 16 };
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
}: PhotoGalleryProps): React.JSX.Element {
  const pendingUploads = useStore((state) => state.pendingUploads);
  const { gap } = getMasonryGap(density);
  const paddingClass = density === 'compact' ? 'p-1 sm:p-3' : 'p-2 sm:p-6';

  const mergedPhotos = useMemo(() => {
    const serverPhotosRaw = Array.isArray(photos) ? photos : [];
    // Ensure collectible-scoped pending entries never show up in main gallery.
    const serverPhotos = serverPhotosRaw.filter((p) => {
      const maybeCollectibleId = (p as unknown as { collectibleId?: unknown })?.collectibleId;
      return !maybeCollectibleId || String(maybeCollectibleId).trim() === '';
    });

    const pendingRaw = Array.isArray(pendingUploads) ? (pendingUploads as unknown as PhotoCardPhoto[]) : [];
    const pending = pendingRaw.filter((p) => {
      const maybeCollectibleId = (p as unknown as { collectibleId?: unknown })?.collectibleId;
      return !maybeCollectibleId || String(maybeCollectibleId).trim() === '';
    });

    if (pending.length === 0) return serverPhotos;

    const existingIds = new Set(serverPhotos.map((p) => String(p?.id)));
    const toPrepend = pending.filter((p) => !existingIds.has(String(p?.id)));
    return [...toPrepend, ...serverPhotos];
  }, [photos, pendingUploads]);

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

  const masonryBreakpoints = useMemo(() => {
    // 3 cols desktop, 2 cols tablet, 1 col mobile
    return {
      default: 3,
      1024: 3,
      768: 2,
      640: 1,
    };
  }, []);

  // Empty state
  if (!mergedPhotos || mergedPhotos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-700">
        <p>No photos to display.</p>
      </div>
    );
  }

  const masonryStyle = useMemo(() => {
    return {
      ['--masonry-gutter' as unknown as string]: `${gap}px`,
    } as React.CSSProperties;
  }, [gap]);

  // Masonry layout uses natural document flow so the page-level infinite-scroll sentinel
  // (rendered after this component) stays at the bottom of the document.
  return (
    <div className={paddingClass} style={masonryStyle}>
      <Masonry
        breakpointCols={masonryBreakpoints}
        className="masonry-grid"
        columnClassName="masonry-grid_column"
        data-testid="photo-gallery-grid"
      >
        {mergedPhotos.map((photo) => (
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
      </Masonry>
    </div>
  );
}
