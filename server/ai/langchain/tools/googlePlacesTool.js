const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const logger = require('../../../logger');

const GOOGLE_PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchNearby';

function parseGpsString(gpsString) {
  if (!gpsString) return null;
  const parts = gpsString.split(',').map(value => value && value.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

async function fetchGooglePlaces({ gpsString, radiusMeters = 75, typeFilter }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('Google Places API key not configured. Set GOOGLE_PLACES_API_KEY to enable commercial POI lookups.');
  }

  const coords = parseGpsString(gpsString);
  if (!coords) {
    throw new Error('Invalid gpsString provided to Google Places search tool.');
  }

  const normalizedRadius = Math.min(Math.max(Number(radiusMeters) || 1, 1), 50000);

  const requestBody = {
    locationRestriction: {
      circle: {
        center: {
          latitude: coords.lat,
          longitude: coords.lon
        },
        radius: normalizedRadius
      }
    },
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    languageCode: 'en'
  };

  if (typeFilter) {
    requestBody.includedTypes = [typeFilter];
  }

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.shortFormattedAddress',
    'places.types',
    'places.rating',
    'places.userRatingCount',
    'places.businessStatus',
    'places.location'
  ].join(',');

  const response = await fetch(GOOGLE_PLACES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Google Places request failed: ${response.status} ${bodyText}`);
  }

  const data = await response.json();
  if (data.error) {
    const errorMessage = data.error.message || data.error.status || 'Unknown error';
    throw new Error(`Google Places API error: ${errorMessage}`);
  }

  const places = Array.isArray(data.places) ? data.places : [];
  const formatted = places.map(place => ({
    name: (place.displayName && place.displayName.text) || place.displayName || place.name || null,
    business_status: place.businessStatus || null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    user_ratings_total: typeof place.userRatingCount === 'number' ? place.userRatingCount : null,
    types: Array.isArray(place.types) ? place.types : [],
    lat: place.location && typeof place.location.latitude === 'number' ? place.location.latitude : null,
    lon: place.location && typeof place.location.longitude === 'number' ? place.location.longitude : null,
    place_id: place.id || null,
    vicinity: place.shortFormattedAddress || place.formattedAddress || null,
    open_now: null,
    source: 'google_places'
  })).filter(place => place && place.name);

  logger.debug('[googlePlacesTool] Retrieved Google Places results', {
    count: formatted.length,
    radiusMeters: normalizedRadius,
    typeFilter,
    endpointVersion: 'v1'
  });

  return formatted;
}

const googlePlacesTool = tool(
  async ({ gpsString, radiusMeters, typeFilter }) => {
    const normalizedRadius = typeof radiusMeters === 'number' && Number.isFinite(radiusMeters)
      ? radiusMeters
      : 75;
    const normalizedType = typeof typeFilter === 'string' && typeFilter.trim().length > 0
      ? typeFilter.trim()
      : undefined;

    const results = await fetchGooglePlaces({ gpsString, radiusMeters: normalizedRadius, typeFilter: normalizedType });
    return JSON.stringify({ pois: results });
  },
  {
    name: 'google_places_search',
    description: 'Look up nearby commercial points of interest (restaurants, stores, venues) using Google Places. Returns structured POI data including names, status, rating, and types.',
    schema: z.object({
      gpsString: z.string().describe('GPS coordinates as "lat,lon"'),
      radiusMeters: z.number().min(1).max(5000).default(75).describe('Search radius in meters (default 75m).'),
      typeFilter: z.string().default('').describe('Google Places type filter, e.g., "restaurant" or "store". Leave blank for no filter.')
    })
  }
);

module.exports = {
  googlePlacesTool,
  fetchGooglePlaces
};
