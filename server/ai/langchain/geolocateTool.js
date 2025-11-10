const { tool } = require('@langchain/core/tools');

const GOOGLE_PLACES_RADIUS_METERS = 1200; // ~0.75 miles

function feetToMeters(feet) {
  return Math.max(1, Math.round(feet * 0.3048));
}

async function nominatimReverse(lat, lon, userAgent) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'User-Agent': userAgent || 'React-Photo-App/1.0' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function overpassNearby(lat, lon, radiusMeters = 50, userAgent) {
  try {
    const q = `[
out:json][timeout:25];(
  node(around:${radiusMeters},${lat},${lon})["name"];
  way(around:${radiusMeters},${lat},${lon})["name"];
  rel(around:${radiusMeters},${lat},${lon})["name"];
  node(around:${radiusMeters},${lat},${lon})["amenity"="shopping_center"];
  way(around:${radiusMeters},${lat},${lon})["amenity"="shopping_center"];
  rel(around:${radiusMeters},${lat},${lon})["amenity"="shopping_center"];
  way(around:${radiusMeters},${lat},${lon})["landuse"="retail"];
  rel(around:${radiusMeters},${lat},${lon})["landuse"="retail"];
);out center tags bb;`;
    const url = 'https://overpass-api.de/api/interpreter';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': userAgent || 'React-Photo-App/1.0' },
      body: `data=${encodeURIComponent(q)}`,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const pois = [];
    const seen = new Set();
    if (data.elements && Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (el.tags && el.tags.name) {
          // Determine coordinates: node has lat/lon, way/rel may have center
          const latVal = el.lat || (el.center && el.center.lat) || null;
          const lonVal = el.lon || (el.center && el.center.lon) || null;
          const key = `${el.tags.name}:${latVal ?? ''}:${lonVal ?? ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          pois.push({
            name: el.tags.name,
            lat: latVal,
            lon: lonVal,
            bounds: el.bounds || null,
            category: el.tags.amenity || el.tags.landuse || el.tags.leisure || el.tags.shop || el.tags.tourism || null,
            osmType: el.type,
            tags: el.tags
          });
        }
      }
    }
    return pois;
  } catch {
    return [];
  }
}

async function geolocate({ gpsString, radiusFeet = 50, userAgent }) {
  if (!gpsString) return { address: null, nearby: [] };
  const parts = gpsString.split(',').map(s => s && s.trim());
  if (!parts[0] || !parts[1]) return { address: null, nearby: [] };
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return { address: null, nearby: [] };
  const radiusMeters = feetToMeters(radiusFeet);
  const [addr, nearby] = await Promise.all([
    nominatimReverse(lat, lon, userAgent),
    overpassNearby(lat, lon, radiusMeters, userAgent),
  ]);
  return { address: addr, nearby: nearby || [] };
}

// LangChain Tool version
const geolocateTool = tool(
  async ({ gpsString, radiusFeet, userAgent }) => {
    const result = await geolocate({ gpsString, radiusFeet: radiusFeet || 50, userAgent });
    return JSON.stringify(result);
  },
  {
    name: 'geolocate',
    description: 'Get location information from GPS coordinates, including reverse geocoded address and nearby named places.',
    schema: {
      type: 'object',
      properties: {
        gpsString: {
          type: 'string',
          description: 'GPS coordinates as "lat,lon" string.',
        },
        radiusFeet: {
          type: 'number',
          description: 'Radius in feet to search for nearby places (default 50).',
        },
        userAgent: {
          type: 'string',
          description: 'User agent string for API requests.',
        },
      },
      required: ['gpsString'],
    },
  }
);

module.exports = { geolocate, geolocateTool, GOOGLE_PLACES_RADIUS_METERS };
