import React, { useState, useEffect, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker} from '@vis.gl/react-google-maps';
import { getPhotoLocation } from './LocationMapUtils';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 0,
  lng: 0
};

// Directional Arrow Icon Component
const DirectionalArrow = ({ heading = 0 }) => (
  <div
    style={{
      transform: `rotate(${heading}deg)`,
      width: '32px',
      height: '32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.5))' }}>
      <path d="M12 2L19 21L12 17L5 21L12 2Z" fill="#4285F4" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  </div>
);

export default function LocationMapPanel({ photo }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
  
  // Memoize location calculation to avoid unnecessary recalculations
  const location = useMemo(() => getPhotoLocation(photo), [photo]);
  const hasLocation = location != null && !isNaN(location.lat) && !isNaN(location.lng);
  const center = useMemo(() => hasLocation ? location : defaultCenter, [location, hasLocation]);
  const heading = location?.heading || 0;

  // Controlled map state for proper recentering when photo changes
  const [mapCenter, setMapCenter] = useState(center);
  // Zoom level 19 ≈ ~300ft altitude (street-level detail)
  const [mapZoom, setMapZoom] = useState(19);

  // Update map center when photo location changes
  useEffect(() => {
    if (hasLocation) {
      setMapCenter(center);
      setMapZoom(19);
    }
  }, [center, hasLocation]);

  if (!apiKey) {
    // If we don't have an API key but do have a photo location, render a
    // simple OpenStreetMap iframe so users still see a preview map without
    // requiring a Google Maps key. This avoids a completely empty panel and
    // still protects any server-side key.
    if (hasLocation) {
      const lat = center.lat;
      const lng = center.lng;
      const delta = 0.005; // small bbox for the embed
      const minLon = lng - delta;
      const minLat = lat - delta;
      const maxLon = lng + delta;
      const maxLat = lat + delta;
      const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLon}%2C${minLat}%2C${maxLon}%2C${maxLat}&layer=mapnik&marker=${lat}%2C${lng}`;
      const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
      return (
        <div className="h-full w-full bg-white flex flex-col">
          <div className="flex-1">
            <iframe
              title="Map (OpenStreetMap)"
              src={osmEmbedUrl}
              style={{ border: 0, width: '100%', height: '100%' }}
              loading="lazy"
            />
          </div>
          <div className="p-2 text-xs text-gray-600 bg-gray-100">
            Map provided by OpenStreetMap as a fallback. For the full interactive map, open
            &nbsp;<a target="_blank" rel="noreferrer" href={osmLink} className="text-blue-600 underline">OpenStreetMap</a>.
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500 text-sm p-4 text-center">
        Map configuration missing. Please set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your Vite root `.env` (see <code>.env.example</code>) and restart the dev server.
      </div>
    );
  }

  if (!hasLocation) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 text-gray-500 p-4 text-center">
        <p className="text-sm font-medium">No GPS location data available.</p>
        <p className="text-xs mt-2">Try viewing a different photo or ensure EXIF GPS data is present.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <APIProvider apiKey={apiKey}>
        <Map
          center={mapCenter}
          zoom={mapZoom}
          onCenterChanged={(e) => setMapCenter(e.detail.center)}
          onZoomChanged={(e) => setMapZoom(e.detail.zoom)}
          mapId={mapId} // Optional: set via VITE_GOOGLE_MAPS_MAP_ID; a default is used for demo
          disableDefaultUI={false}
          zoomControl={true}
          streetViewControl={false}
          mapTypeControl={true}
          fullscreenControl={true}
          mapTypeControlOptions={{
            position: 3, // TOP_RIGHT
          }}
        >
          <AdvancedMarker position={center}>
            <DirectionalArrow heading={heading} />
          </AdvancedMarker>
        </Map>
      </APIProvider>
    </div>
  );
}
