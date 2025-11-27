import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LocationMapPanel from './LocationMapPanel';
import { getPhotoLocation } from './LocationMapUtils';

// Mock @vis.gl/react-google-maps
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div data-testid="api-provider">{children}</div>,
  Map: ({ center, zoom, children, ...props }) => (
    <div 
      data-testid="google-map" 
      data-center={JSON.stringify(center)}
      data-zoom={zoom}
      {...props}
    >
      {children}
    </div>
  ),
  AdvancedMarker: ({ position, children }) => (
    <div data-testid="advanced-marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
}));

describe('getPhotoLocation', () => {
  describe('coordinate extraction', () => {
    it('extracts location from top-level lat/lon properties', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 0 });
    });

    it('extracts location from metadata.latitude/longitude', () => {
      const photo = { metadata: { latitude: 40.7128, longitude: -74.0060 } };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 40.7128, lng: -74.0060, heading: 0 });
    });

    it('extracts location from metadata.GPS.latitude/longitude', () => {
      const photo = {
        metadata: { GPS: { latitude: 51.5074, longitude: -0.1278 } }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 51.5074, lng: -0.1278, heading: 0 });
    });

    it('extracts location from gps_string format', () => {
      const photo = { gps_string: '35.6762,139.6503' };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 35.6762, lng: 139.6503, heading: 0 });
    });

    it('trims whitespace from gps_string parts', () => {
      const photo = { gps_string: ' 48.8566 , 2.3522 ' };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 48.8566, lng: 2.3522, heading: 0 });
    });

    it('prioritizes top-level coordinates over metadata', () => {
      const photo = {
        latitude: 10.0,
        longitude: 20.0,
        metadata: { latitude: 30.0, longitude: 40.0 }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 10.0, lng: 20.0, heading: 0 });
    });
  });

  describe('heading extraction', () => {
    it('extracts heading from metadata.GPS.imgDirection', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: 90 } }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 90 });
    });

    it('extracts heading from metadata.GPSImgDirection', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPSImgDirection: 180 }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 180 });
    });

    it('extracts heading from top-level GPSImgDirection', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        GPSImgDirection: 270
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 270 });
    });

    it('prioritizes metadata.GPS.imgDirection over others', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: 45 }, GPSImgDirection: 90 },
        GPSImgDirection: 135
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 45 });
    });

    it('defaults to 0 when heading is invalid', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: 'invalid' } }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 0 });
    });

    it('defaults to 0 when heading is NaN', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: NaN } }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 0 });
    });

    it('defaults to 0 when heading is Infinity', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: Infinity } }
      };
      const result = getPhotoLocation(photo);
      expect(result).toEqual({ lat: 37.7749, lng: -122.4194, heading: 0 });
    });
  });

  describe('coordinate validation', () => {
    it('rejects latitude outside valid range (> 90)', () => {
      const photo = { latitude: 91, longitude: 0 };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('rejects latitude outside valid range (< -90)', () => {
      const photo = { latitude: -91, longitude: 0 };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('rejects longitude outside valid range (> 180)', () => {
      const photo = { latitude: 0, longitude: 181 };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('rejects longitude outside valid range (< -180)', () => {
      const photo = { latitude: 0, longitude: -181 };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('accepts valid boundary values', () => {
      const photo1 = { latitude: 90, longitude: 180 };
      expect(getPhotoLocation(photo1)).toEqual({ lat: 90, lng: 180, heading: 0 });

      const photo2 = { latitude: -90, longitude: -180 };
      expect(getPhotoLocation(photo2)).toEqual({ lat: -90, lng: -180, heading: 0 });
    });

    it('rejects NaN coordinates', () => {
      const photo = { latitude: NaN, longitude: 0 };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('rejects Infinity coordinates', () => {
      const photo = { latitude: 0, longitude: Infinity };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });
  });

  describe('missing or invalid data', () => {
    it('returns null when photo is null', () => {
      const result = getPhotoLocation(null);
      expect(result).toBeNull();
    });

    it('returns null when photo is undefined', () => {
      const result = getPhotoLocation(undefined);
      expect(result).toBeNull();
    });

    it('returns null when no location data exists', () => {
      const photo = { filename: 'test.jpg' };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('returns null when gps_string is malformed', () => {
      const photo = { gps_string: 'invalid' };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });

    it('returns null when gps_string has non-numeric values', () => {
      const photo = { gps_string: 'abc,def' };
      const result = getPhotoLocation(photo);
      expect(result).toBeNull();
    });
  });
});

describe('LocationMapPanel component', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  describe('with Google Maps API key', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-api-key');
      vi.stubEnv('VITE_GOOGLE_MAPS_MAP_ID', 'test-map-id');
    });

    it('renders Google Map when photo has valid location', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.getByTestId('api-provider')).toBeInTheDocument();
      expect(screen.getByTestId('google-map')).toBeInTheDocument();
      expect(screen.getByTestId('advanced-marker')).toBeInTheDocument();
    });

    it('centers map on photo coordinates', () => {
      const photo = { latitude: 40.7128, longitude: -74.0060 };
      render(<LocationMapPanel photo={photo} />);

      const map = screen.getByTestId('google-map');
      const centerData = JSON.parse(map.getAttribute('data-center'));
      expect(centerData.lat).toBe(40.7128);
      expect(centerData.lng).toBe(-74.0060);
    });

    it('updates map center when photo changes', () => {
      const photo1 = { latitude: 37.7749, longitude: -122.4194 };
      const { rerender } = render(<LocationMapPanel photo={photo1} />);

      let map = screen.getByTestId('google-map');
      let centerData = JSON.parse(map.getAttribute('data-center'));
      expect(centerData.lat).toBe(37.7749);

      const photo2 = { latitude: 40.7128, longitude: -74.0060 };
      rerender(<LocationMapPanel photo={photo2} />);

      map = screen.getByTestId('google-map');
      centerData = JSON.parse(map.getAttribute('data-center'));
      expect(centerData.lat).toBe(40.7128);
      expect(centerData.lng).toBe(-74.0060);
    });

    it('sets zoom to 19 by default (street-level ~300ft)', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      render(<LocationMapPanel photo={photo} />);

      const map = screen.getByTestId('google-map');
      expect(map.getAttribute('data-zoom')).toBe('19');
    });

    it('shows "No GPS location" message when photo has no location', () => {
      const photo = { filename: 'test.jpg' };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.getByText('No GPS location data available.')).toBeInTheDocument();
      expect(screen.getByText(/Try viewing a different photo/)).toBeInTheDocument();
    });

    it('does not render map when photo has no location', () => {
      const photo = { filename: 'test.jpg' };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.queryByTestId('google-map')).not.toBeInTheDocument();
    });
  });

  describe('without Google Maps API key (OSM fallback)', () => {
    beforeEach(() => {
      vi.unstubAllEnvs();
      // Explicitly ensure no API key is set
      vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', undefined);
    });

    it('renders OSM iframe when photo has valid location', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      render(<LocationMapPanel photo={photo} />);

      const iframe = screen.getByTitle('Map (OpenStreetMap)');
      expect(iframe).toBeInTheDocument();
      expect(iframe.src).toContain('openstreetmap.org/export/embed.html');
      expect(iframe.src).toContain('37.7749');
      expect(iframe.src).toContain('-122.4194');
    });

    it('displays OSM footer with link', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.getByText(/Map provided by OpenStreetMap/)).toBeInTheDocument();
      const link = screen.getByText('OpenStreetMap');
      expect(link).toHaveAttribute('href');
      expect(link.getAttribute('href')).toContain('openstreetmap.org');
    });

    it('uses flex column layout with flex-1 for iframe', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      const { container } = render(<LocationMapPanel photo={photo} />);

      const outerDiv = container.firstChild;
      expect(outerDiv).toHaveClass('flex', 'flex-col');

      const iframeWrapper = outerDiv.firstChild;
      expect(iframeWrapper).toHaveClass('flex-1');
    });

    it('shows configuration warning when no API key and no location', () => {
      const photo = { filename: 'test.jpg' };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.getByText(/Map configuration missing/)).toBeInTheDocument();
      expect(screen.getByText(/VITE_GOOGLE_MAPS_API_KEY/)).toBeInTheDocument();
    });

    it('does not render OSM iframe when no location', () => {
      const photo = { filename: 'test.jpg' };
      render(<LocationMapPanel photo={photo} />);

      expect(screen.queryByTitle('Map (OpenStreetMap)')).not.toBeInTheDocument();
    });
  });

  describe('heading and directional arrow', () => {
    beforeEach(() => {
      import.meta.env.VITE_GOOGLE_MAPS_API_KEY = 'test-api-key';
    });

    it('passes heading to DirectionalArrow via marker', () => {
      const photo = {
        latitude: 37.7749,
        longitude: -122.4194,
        metadata: { GPS: { imgDirection: 90 } }
      };
      const { container } = render(<LocationMapPanel photo={photo} />);

      // The arrow is rendered with a rotation transform
      const arrow = container.querySelector('[style*="rotate(90deg)"]');
      expect(arrow).toBeInTheDocument();
    });

    it('defaults heading to 0 when not present', () => {
      const photo = { latitude: 37.7749, longitude: -122.4194 };
      const { container } = render(<LocationMapPanel photo={photo} />);

      const arrow = container.querySelector('[style*="rotate(0deg)"]');
      expect(arrow).toBeInTheDocument();
    });
  });
});
