import { ChangeEvent } from 'react';
import ImageCanvasEditor from '../../ImageCanvasEditor';
import FlipCard from '../FlipCard';
import PhotoMetadataBack from '../PhotoMetadataBack';
import { editPageStyles } from './styles';
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
    <div 
      className="bg-slate-100 relative flex flex-col overflow-hidden border-r border-slate-200"
      style={editPageStyles.photoStackContainer}
    >
      {/* Caption Input - Above the Photo (styled as header) */}
      <div style={{ marginBottom: '16px', flexShrink: 0 }}>
        <input
          type="text"
          value={caption}
          onChange={handleCaptionChange}
          placeholder="Add a caption..."
          style={editPageStyles.captionInput}
          onFocus={(e) => {
            e.target.style.borderBottomColor = '#3b82f6';
          }}
          onBlur={(e) => {
            e.target.style.borderBottomColor = 'transparent';
          }}
        />
      </div>

      {/* Flip Card Container - Photo / Metadata */}
      <div style={editPageStyles.flipCardContainer}>
        <FlipCard
          isFlipped={isFlipped}
          onFlip={onFlip}
          frontContent={
            /* Front Face: Photo with Burn Caption functionality */
            <div style={editPageStyles.photoCanvasContainer}>
              {isLoading && (
                <div style={editPageStyles.loadingOverlay}>
                  Loading...
                </div>
              )}
              
              {fetchError && (
                <div style={editPageStyles.errorOverlay}>
                  <span>Unable to load image</span>
                  <button 
                    onClick={onRetry}
                    style={editPageStyles.retryButton}
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
