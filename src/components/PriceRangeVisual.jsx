import React from 'react';
import PropTypes from 'prop-types';

/**
 * PriceRangeVisual - Visual representation of price range with current value marker
 * 
 * Shows a horizontal bar representing the range from min to max,
 * with a marker indicating where the current value sits.
 * 
 * Safety: Handles edge cases like min === max (single point) and
 * clamps marker position between 0% and 100% for outliers.
 */
export default function PriceRangeVisual({ 
  min, 
  max, 
  value, 
  currency = 'USD',
  label = 'Current Value'
}) {
  // Format price with currency
  const formatPrice = (price) => {
    if (price === null || price === undefined) return '—';
    const numPrice = typeof price === 'number' ? price : parseFloat(price);
    if (Number.isNaN(numPrice)) return '—';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(numPrice);
  };

  // Calculate marker position (0-100%)
  // Handle edge case: min === max (show at 50% as single point)
  // Clamp between 0% and 100% for outliers
  const calculatePosition = () => {
    const numMin = typeof min === 'number' ? min : parseFloat(min);
    const numMax = typeof max === 'number' ? max : parseFloat(max);
    const numValue = typeof value === 'number' ? value : parseFloat(value);

    // If any values are invalid, return center
    if (Number.isNaN(numMin) || Number.isNaN(numMax) || Number.isNaN(numValue)) {
      return 50;
    }

    // Handle edge case: min equals max (single point)
    if (numMax === numMin) {
      return 50;
    }

    // Calculate percentage
    const percentage = ((numValue - numMin) / (numMax - numMin)) * 100;

    // Clamp between 0 and 100 for outliers
    return Math.max(0, Math.min(100, percentage));
  };

  const markerPosition = calculatePosition();
  const isSinglePoint = min === max;

  return (
    <div 
      className="price-range-visual"
      style={{
        padding: '16px',
        backgroundColor: '#f1f5f9',
        borderRadius: '12px',
        marginBottom: '16px'
      }}
      data-testid="price-range-visual"
    >
      {/* Label row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          Price Range
        </span>
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#1e40af'
        }}>
          {label}: {formatPrice(value)}
        </span>
      </div>

      {/* Range bar container */}
      <div style={{
        position: 'relative',
        height: '24px',
        marginBottom: '8px'
      }}>
        {/* Background track */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '8px',
            backgroundColor: '#e2e8f0',
            borderRadius: '4px',
            transform: 'translateY(-50%)'
          }}
          data-testid="price-range-track"
        />

        {/* Gradient fill (min to value) */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            width: `${markerPosition}%`,
            height: '8px',
            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
            borderRadius: '4px',
            transform: 'translateY(-50%)',
            transition: 'width 0.3s ease'
          }}
          data-testid="price-range-fill"
        />

        {/* Marker indicator */}
        <div 
          style={{
            position: 'absolute',
            top: '50%',
            left: `${markerPosition}%`,
            transform: 'translate(-50%, -50%)',
            width: isSinglePoint ? '16px' : '20px',
            height: isSinglePoint ? '16px' : '20px',
            backgroundColor: '#16a34a',
            borderRadius: '50%',
            border: '3px solid white',
            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)',
            transition: 'left 0.3s ease'
          }}
          data-testid="price-range-marker"
        />
      </div>

      {/* Min/Max labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span 
          style={{
            fontSize: '12px',
            color: '#64748b',
            fontWeight: 500
          }}
          data-testid="price-range-min"
        >
          {formatPrice(min)}
        </span>
        {!isSinglePoint && (
          <span 
            style={{
              fontSize: '12px',
              color: '#64748b',
              fontWeight: 500
            }}
            data-testid="price-range-max"
          >
            {formatPrice(max)}
          </span>
        )}
      </div>
    </div>
  );
}

PriceRangeVisual.propTypes = {
  min: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  max: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  currency: PropTypes.string,
  label: PropTypes.string
};
