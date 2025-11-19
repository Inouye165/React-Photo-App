import React from 'react';
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';

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
  
  // 1. Check top-level lat/lon (common from exifr)
  if (photo.latitude != null && photo.longitude != null) {
    return { lat: Number(photo.latitude), lng: Number(photo.longitude) };
  }
  
  const meta = photo.metadata || {};
  
  // 2. Check metadata top-level
  if (meta.latitude != null && meta.longitude != null) {
    return { lat: Number(meta.latitude), lng: Number(meta.longitude) };
  }
  
  // 3. Check GPS object
  if (meta.GPS) {
    if (meta.GPS.latitude != null && meta.GPS.longitude != null) {
       return { lat: Number(meta.GPS.latitude), lng: Number(meta.GPS.longitude) };
    }
  }

  // 4. Check for gps string "lat,lon" if available (some backend scripts populate this)
  if (photo.gps_string) {
    const parts = photo.gps_string.split(',');
    if (parts.length === 2) {
      return { lat: Number(parts[0]), lng: Number(parts[1]) };
    }
  }

  return null;
}

// Helper to extract heading/bearing from metadata
function getPhotoHeading(photo) {
  if (!photo) return 0;
  const meta = photo.metadata || {};
  
  // 1. Check top-level properties
  if (meta.heading != null) return Number(meta.heading);
  if (meta.bearing != null) return Number(meta.bearing);
  if (meta.GPSImgDirection != null) return Number(meta.GPSImgDirection);
  if (meta.GPSDestBearing != null) return Number(meta.GPSDestBearing);
  
  // 2. Check nested GPS object
  if (meta.GPS) {
    if (meta.GPS.GPSImgDirection != null) return Number(meta.GPS.GPSImgDirection);
    if (meta.GPS.GPSDestBearing != null) return Number(meta.GPS.GPSDestBearing);
  }
  
  return 0;
}

function DirectionalMarker({ position, heading }) {
  // Ensure Google Maps API is loaded before accessing google.maps.SymbolPath
  if (typeof window === 'undefined' || !window.google || !window.google.maps) return null;

  const icon = {
    path: window.google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 5,
    fillColor: 'blue',
    fillOpacity: 1,
    strokeWeight: 1,
    rotation: heading || 0,
  };

  return <Marker position={position} icon={icon} />;
}

export default function LocationMapPanel({ photo }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';
  
  const location = getPhotoLocation(photo);
  const heading = getPhotoHeading(photo);
  const hasLocation = location != null && !isNaN(location.lat) && !isNaN(location.lng);
  const center = hasLocation ? location : defaultCenter;

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
          disableDefaultUI={true}
          zoomControl={true}
          streetViewControl={false}
          mapTypeControl={true}
          fullscreenControl={false}
        >
          <DirectionalMarker position={center} heading={heading} />
        </Map>
      </APIProvider>
    </div>
  );
}
