// @ts-nocheck
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PriceRangeVisual from './PriceRangeVisual';

describe('PriceRangeVisual', () => {
  describe('Basic Rendering', () => {
    it('renders the component with all elements', () => {
      render(<PriceRangeVisual min={10} max={100} value={55} />);

      expect(screen.getByTestId('price-range-visual')).toBeInTheDocument();
      expect(screen.getByTestId('price-range-track')).toBeInTheDocument();
      expect(screen.getByTestId('price-range-fill')).toBeInTheDocument();
      expect(screen.getByTestId('price-range-marker')).toBeInTheDocument();
      expect(screen.getByTestId('price-range-min')).toBeInTheDocument();
      expect(screen.getByTestId('price-range-max')).toBeInTheDocument();
    });

    it('displays formatted min and max prices', () => {
      render(<PriceRangeVisual min={10} max={100} value={55} currency="USD" />);

      expect(screen.getByTestId('price-range-min')).toHaveTextContent('$10');
      expect(screen.getByTestId('price-range-max')).toHaveTextContent('$100');
    });

    it('displays the current value label', () => {
      render(<PriceRangeVisual min={10} max={100} value={55} />);

      expect(screen.getByText(/Current Value/)).toBeInTheDocument();
      expect(screen.getByText(/\$55/)).toBeInTheDocument();
    });

    it('accepts custom label prop', () => {
      render(<PriceRangeVisual min={10} max={100} value={55} label="Average Sale" />);

      expect(screen.getByText(/Average Sale/)).toBeInTheDocument();
    });
  });

  describe('Marker Position Calculation', () => {
    it('calculates 50% position for value in middle of range', () => {
      render(<PriceRangeVisual min={10} max={100} value={55} />);

      const marker = screen.getByTestId('price-range-marker');
      // value=55, min=10, max=100
      // (55-10)/(100-10) = 45/90 = 0.5 = 50%
      expect(marker.style.left).toBe('50%');
    });

    it('calculates 0% position for value at minimum', () => {
      render(<PriceRangeVisual min={10} max={100} value={10} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('0%');
    });

    it('calculates 100% position for value at maximum', () => {
      render(<PriceRangeVisual min={10} max={100} value={100} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('100%');
    });

    it('calculates 25% position correctly', () => {
      render(<PriceRangeVisual min={0} max={100} value={25} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('25%');
    });

    it('calculates 75% position correctly', () => {
      render(<PriceRangeVisual min={0} max={100} value={75} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('75%');
    });
  });

  describe('Edge Case: min === max (Single Point)', () => {
    it('handles min === max without division by zero', () => {
      // This should not throw an error
      expect(() => {
        render(<PriceRangeVisual min={10} max={10} value={10} />);
      }).not.toThrow();
    });

    it('positions marker at 50% when min === max', () => {
      render(<PriceRangeVisual min={10} max={10} value={10} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('50%');
    });

    it('hides max label when min === max', () => {
      render(<PriceRangeVisual min={10} max={10} value={10} />);

      expect(screen.getByTestId('price-range-min')).toBeInTheDocument();
      expect(screen.queryByTestId('price-range-max')).not.toBeInTheDocument();
    });
  });

  describe('Outlier Clamping', () => {
    it('clamps marker at 0% when value is below minimum', () => {
      render(<PriceRangeVisual min={50} max={100} value={25} />);

      const marker = screen.getByTestId('price-range-marker');
      // (25-50)/(100-50) = -25/50 = -50% -> clamped to 0%
      expect(marker.style.left).toBe('0%');
    });

    it('clamps marker at 100% when value is above maximum', () => {
      render(<PriceRangeVisual min={50} max={100} value={150} />);

      const marker = screen.getByTestId('price-range-marker');
      // (150-50)/(100-50) = 100/50 = 200% -> clamped to 100%
      expect(marker.style.left).toBe('100%');
    });

    it('still displays actual value even when clamped', () => {
      render(<PriceRangeVisual min={50} max={100} value={150} />);

      // The label should show the actual value, not clamped
      expect(screen.getByText(/\$150/)).toBeInTheDocument();
    });
  });

  describe('Invalid Value Handling', () => {
    it('defaults to 50% for NaN values', () => {
      render(<PriceRangeVisual min={10} max={100} value={NaN} />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('50%');
    });

    it('handles string number values', () => {
      render(<PriceRangeVisual min="10" max="100" value="55" />);

      const marker = screen.getByTestId('price-range-marker');
      expect(marker.style.left).toBe('50%');
    });
  });

  describe('Currency Formatting', () => {
    it('formats prices with USD by default', () => {
      render(<PriceRangeVisual min={100} max={200} value={150} />);

      expect(screen.getByTestId('price-range-min')).toHaveTextContent('$100');
      expect(screen.getByTestId('price-range-max')).toHaveTextContent('$200');
    });

    it('respects custom currency prop', () => {
      render(<PriceRangeVisual min={100} max={200} value={150} currency="EUR" />);

      // EUR formatting
      expect(screen.getByTestId('price-range-min').textContent).toMatch(/€|EUR/);
    });
  });

  describe('Fill Bar Width', () => {
    it('sets fill bar width to match marker position', () => {
      render(<PriceRangeVisual min={0} max={100} value={75} />);

      const fill = screen.getByTestId('price-range-fill');
      expect(fill.style.width).toBe('75%');
    });

    it('sets fill bar width to 0% for minimum value', () => {
      render(<PriceRangeVisual min={10} max={100} value={10} />);

      const fill = screen.getByTestId('price-range-fill');
      expect(fill.style.width).toBe('0%');
    });

    it('sets fill bar width to 100% for maximum value', () => {
      render(<PriceRangeVisual min={10} max={100} value={100} />);

      const fill = screen.getByTestId('price-range-fill');
      expect(fill.style.width).toBe('100%');
    });
  });
});
