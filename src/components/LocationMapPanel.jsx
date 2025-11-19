import React from 'react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';

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

export default function LocationMapPanel({ photo }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey || ''
  });

  const location = getPhotoLocation(photo);
  const hasLocation = location != null && !isNaN(location.lat) && !isNaN(location.lng);
  const center = hasLocation ? location : defaultCenter;

  if (!apiKey) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500 text-sm p-4 text-center">
        Map configuration missing.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 text-red-500 text-sm p-4 text-center">
        Error loading map.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500 text-sm">
        Loading Map...
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
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={15}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      <Marker position={center} />
    </GoogleMap>
  );
}
