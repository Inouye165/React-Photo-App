import React from 'react';

/**
 * FlipCard Component
 * A 3D flip card with front and back faces using CSS transforms.
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
          
          {/* Flip Button - Front (positioned bottom-right to avoid toolbar overlap) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFlip && onFlip();
            }}
            aria-label="Show photo details"
            title="View Keywords & Metadata"
            style={{
              position: 'absolute',
              bottom: '12px',
              right: '12px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
            }}
          >
            {/* Info icon */}
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="#475569" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </button>
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
          
          {/* Flip Button - Back */}
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
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              zIndex: 100,
              pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
            }}
          >
            {/* Image/photo icon */}
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
