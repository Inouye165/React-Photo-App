import React from 'react';
import { APIProvider, Map, AdvancedMarker} from '@vis.gl/react-google-maps';

const containerStyle = {
  width: '100%',
  height: '100%'
};

const defaultCenter = {
  lat: 0,
  lng: 0
};

// Helper to extract lat/lon from metadata, similar to backend logic
function getPhotoLocation(photo) {
  if (!photo) return null;

  let heading = 0;
  // Try to find heading/bearing
  if (photo.metadata?.GPS?.imgDirection != null) heading = Number(photo.metadata.GPS.imgDirection);
  else if (photo.metadata?.GPSImgDirection != null) heading = Number(photo.metadata.GPSImgDirection);
  else if (photo.GPSImgDirection != null) heading = Number(photo.GPSImgDirection);
  
  // 1. Check top-level lat/lon (common from exifr)
  if (photo.latitude != null && photo.longitude != null) {
    return { lat: Number(photo.latitude), lng: Number(photo.longitude), heading };
  }
  
  const meta = photo.metadata || {};
  
  // 2. Check metadata top-level
  if (meta.latitude != null && meta.longitude != null) {
    return { lat: Number(meta.latitude), lng: Number(meta.longitude), heading };
  }
  
  // 3. Check GPS object
  if (meta.GPS) {
    if (meta.GPS.latitude != null && meta.GPS.longitude != null) {
       return { lat: Number(meta.GPS.latitude), lng: Number(meta.GPS.longitude), heading };
    }
  }

  // 4. Check for gps string "lat,lon" if available (some backend scripts populate this)
  if (photo.gps_string) {
    const parts = photo.gps_string.split(',');
    if (parts.length === 2) {
      return { lat: Number(parts[0]), lng: Number(parts[1]), heading };
    }
  }

  return null;
}

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
  
  const location = getPhotoLocation(photo);
  const hasLocation = location != null && !isNaN(location.lat) && !isNaN(location.lng);
  const center = hasLocation ? location : defaultCenter;
  const heading = location?.heading || 0;

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
        <div className="h-full w-full bg-white">
          <iframe
            title="Map (OpenStreetMap)"
            src={osmEmbedUrl}
            style={{ border: 0, width: '100%', height: '100%' }}
            loading="lazy"
          />
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
        <p className="text-sm">No GPS location data available.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          defaultZoom={15}
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
