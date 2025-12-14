import { ChangeEvent } from 'react';
import ImageCanvasEditor from '../../ImageCanvasEditor';
import FlipCard from '../FlipCard';
import PhotoMetadataBack from '../PhotoMetadataBack';
import styles from './PhotoStackPanel.module.css';
import type { Photo, TextStyle } from '../../types/photo';

interface PhotoStackPanelProps {
  caption: string;
  onCaptionChange: (value: string) => void;
  isFlipped: boolean;
  onFlip: () => void;
  imageBlobUrl: string | null;
  isLoading: boolean;
  fetchError: boolean;
  onRetry: () => void;
  textStyle: TextStyle | null;
  onCanvasSave: (dataURL: string, newTextStyle: TextStyle) => Promise<void>;
  keywords: string;
  onKeywordsChange: (value: string) => void;
  photo: Photo;
}

/**
 * PhotoStackPanel - Left column of EditPage
 * Contains caption input, flip card with photo/metadata
 * Phase 5: Styles migrated to CSS Modules
 */
export default function PhotoStackPanel({
  caption,
  onCaptionChange,
  isFlipped,
  onFlip,
  imageBlobUrl,
  isLoading,
  fetchError,
  onRetry,
  textStyle,
  onCanvasSave,
  keywords,
  onKeywordsChange,
  photo,
}: PhotoStackPanelProps) {
  const handleCaptionChange = (e: ChangeEvent<HTMLInputElement>) => {
    onCaptionChange(e.target.value);
  };

  return (
    <div className={styles.photoStackContainer}>
      {/* Caption Input - Above the Photo (styled as header) */}
      <div className={styles.captionInputWrapper}>
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          placeholder="Add a caption..."
          className={styles.captionInput}
        />
      </div>

      {/* Flip Card Container - Photo / Metadata */}
      <div className={styles.flipCardContainer}>
        <FlipCard
          isFlipped={isFlipped}
          onFlip={onFlip}
          frontContent={
            /* Front Face: Photo with Burn Caption functionality */
            <div className={styles.photoCanvasContainer}>
              {isLoading && (
                <div className={styles.loadingOverlay}>
                  Loading...
                </div>
              )}
              
              {fetchError && (
                <div className={styles.errorOverlay}>
                  <span>Unable to load image</span>
                  <button 
                    onClick={onRetry}
                    className={styles.retryButton}
                  >
                    Retry
                  </button>
                </div>
              )}

              {imageBlobUrl && (
                <ImageCanvasEditor 
                  imageUrl={imageBlobUrl}
                  caption={caption}
                  textStyle={textStyle}
                  onSave={onCanvasSave}
                  isFlipped={isFlipped}
                  onFlip={onFlip}
                />
              )}
            </div>
          }
          backContent={
            /* Back Face: Keywords + Technical Metadata */
            <PhotoMetadataBack
              keywords={keywords}
              onKeywordsChange={onKeywordsChange}
              photo={photo}
            />
          }
        />
      </div>
    </div>
  );
}
