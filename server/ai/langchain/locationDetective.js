// Location detective tool for pinpointing exact locations using GPS, time, and photo content
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

// Calculate distance between two GPS coordinates in feet
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceMiles = R * c;
  return distanceMiles * 5280; // Convert to feet
}

function parseGpsString(gpsString) {
  if (!gpsString) return null;
  const parts = gpsString.split(',').map(value => value && value.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

function detectLocationFromTime(dateTimeInfo) {
  if (!dateTimeInfo) return null;

  // Extract time of day
  const timeMatch = dateTimeInfo.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);
    const ampm = timeMatch[3].toUpperCase();

    let hour24 = hour;
    if (ampm === 'PM' && hour !== 12) hour24 += 12;
    if (ampm === 'AM' && hour === 12) hour24 = 0;

    const timeOfDay = hour24 < 6 ? 'dawn' :
                     hour24 < 12 ? 'morning' :
                     hour24 < 18 ? 'afternoon' : 'evening';

    return { timeOfDay, hour: hour24, minute };
  }

  return null;
}

function analyzePhotoContentForLocations(description, keywords, nearbyLocations = []) {
  const locations = [];
  const text = `${description} ${keywords}`.toLowerCase();

  // Only match against locations that are already nearby based on GPS
  nearbyLocations.forEach(location => {
    const locationName = location.name.toLowerCase();
    const words = locationName.split(' ');

    // Check if any significant words from the location name appear in the photo content
    const hasMatch = words.some(word => {
      if (word.length < 4) return false; // Skip short words
      return text.includes(word);
    });

    if (hasMatch) {
      locations.push({
        name: location.name,
        type: location.type,
        confidence: 0.8,
        distance: location.distance,
        bounds: location.bounds || null,
        tags: location.tags || {},
        context: location.distance
          ? `Within ${location.distance} feet based on GPS and content match`
          : 'Strong textual match to nearby POI'
      });
    }
  });

  return locations;
}

const locationDetectiveTool = tool(
  async ({ gpsString, dateTimeInfo, description, keywords, geoContext }) => {
    const results = {
      primaryLocation: null,
      nearbyPOIs: [],
      timeContext: null,
      confidence: 0
    };

    const gpsCoords = parseGpsString(gpsString);
    let nearbyLocations = [];

    // 2. Time-based context
    const timeInfo = detectLocationFromTime(dateTimeInfo);
    if (timeInfo) {
      results.timeContext = timeInfo;
    }

    // 3. Nearby POIs supplied via geoContext (typically from geolocate tool)
    if (geoContext && Array.isArray(geoContext.nearby)) {
      nearbyLocations = geoContext.nearby
        .filter(feature => feature && feature.name)
        .map(feature => {
          const rawLat = feature.lat != null ? feature.lat : feature.center?.lat;
          const rawLon = feature.lon != null ? feature.lon : feature.center?.lon;
          const featureLat = typeof rawLat === 'string' ? parseFloat(rawLat) : rawLat;
          const featureLon = typeof rawLon === 'string' ? parseFloat(rawLon) : rawLon;

          let distance = null;
          if (
            gpsCoords &&
            featureLat != null && !Number.isNaN(featureLat) &&
            featureLon != null && !Number.isNaN(featureLon)
          ) {
            distance = Math.round(
              calculateDistance(gpsCoords.lat, gpsCoords.lon, featureLat, featureLon)
            );
          }

          const inferredType = feature.category || feature.tags?.amenity || feature.tags?.landuse || 'poi';
          const distanceConfidence = distance != null && distance <= 500 ? 0.75 : 0.55;

          return {
            name: feature.name,
            type: inferredType,
            distance,
            bounds: feature.bounds || null,
            tags: feature.tags || {},
            source: feature.osmType || 'unknown',
            confidence: distance != null ? distanceConfidence : 0.5,
            context: distance != null
              ? `${distance} feet from provided GPS coordinates`
              : 'Distance unknown (missing geometry)'
          };
        });

      results.nearbyPOIs = [...results.nearbyPOIs, ...nearbyLocations];
      if (nearbyLocations.length > 0) {
        results.confidence = Math.max(results.confidence, 0.7);
      }
    }

    // 4. Photo content analysis (only against nearby location candidates)
    const contentLocations = analyzePhotoContentForLocations(description, keywords, nearbyLocations);
    results.nearbyPOIs = [...results.nearbyPOIs, ...contentLocations];

    // Remove duplicates and sort by distance
    const uniquePOIs = results.nearbyPOIs.filter((poi, index, self) =>
      index === self.findIndex(p => p.name === poi.name)
    ).sort((a, b) => (a.distance || 999999) - (b.distance || 999999));

    results.nearbyPOIs = uniquePOIs;

    // 5. Incorporate reverse geocode or best-match POI data
    if (geoContext && geoContext.bestMatchPOI) {
      const best = geoContext.bestMatchPOI;
      const bestName = typeof best === 'string' ? best : best.name;
      const bestConfidence = best && typeof best === 'object' && typeof best.confidence === 'number'
        ? best.confidence
        : 0.8;

      if (bestName) {
        results.primaryLocation = bestName;
        results.confidence = Math.max(results.confidence, bestConfidence);
      }
    }

    if (geoContext && geoContext.address) {
      const address = geoContext.address.display_name || '';
      if (address && !results.primaryLocation) {
        results.primaryLocation = address;
        results.confidence = Math.max(results.confidence, 0.8);
      }
    }

    return JSON.stringify(results);
  },
  {
    name: 'location_detective',
    description: 'Expert detective tool that analyzes GPS coordinates, time, and photo content to pinpoint exact locations, identify nearby POIs, and provide location context.',
    schema: z.object({
      gpsString: z.string().optional().describe('GPS coordinates as "latitude,longitude"'),
      dateTimeInfo: z.string().optional().describe('Date and time information from EXIF'),
      description: z.string().optional().describe('AI-generated description of the photo'),
      keywords: z.string().optional().describe('AI-generated keywords'),
      geoContext: z.any().optional().describe('Reverse geocode and nearby features data')
    })
  }
);

module.exports = { locationDetectiveTool };