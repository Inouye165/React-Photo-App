import React from 'react';

/**
 * FlipCard Component
 * A 3D flip card with front and back faces using CSS transforms.
 * Front side flip button is in the toolbar (ImageCanvasEditor).
 * Back side has its own flip button to return to photo.
 * 
 * Props:
 * - isFlipped: boolean - Controls whether the card shows front (false) or back (true)
 * - onFlip: function - Callback when flip button is clicked
 * - frontContent: ReactNode - Content for the front face (photo)
 * - backContent: ReactNode - Content for the back face (metadata/keywords)
 * - className: string - Additional classes for the container
 */
export default function FlipCard({ 
  isFlipped = false, 
  onFlip, 
  frontContent, 
  backContent, 
  className = '' 
}) {
  return (
    <div 
      className={`flip-card-container ${className}`}
      style={{
        perspective: '1000px',
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <div 
        className="flip-card-inner"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front Face - Photo */}
        <div 
          className="flip-card-front"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: '16px',
            overflow: 'hidden',
            pointerEvents: isFlipped ? 'none' : 'auto',
          }}
        >
          {frontContent}
        </div>

        {/* Back Face - Metadata & Keywords */}
        <div 
          className="flip-card-back"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            borderRadius: '16px',
            overflow: 'hidden',
            pointerEvents: isFlipped ? 'auto' : 'none',
          }}
        >
          {backContent}
          
          {/* Flip Back Button - Only on back face */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFlip && onFlip();
            }}
            aria-label="Show photo"
            title="Back to Photo"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(51, 65, 85, 0.5)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              zIndex: 10,
            }}
          >
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#ffffff" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
