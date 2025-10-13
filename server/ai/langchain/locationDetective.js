// Location detective tool for pinpointing exact locations using GPS, time, and photo content
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

// Mock location database with GPS coordinates - in production, this could connect to Google Places, Yelp, or other POI APIs
const LOCATION_DATABASE = {
  // Yellowstone National Park locations with GPS coordinates
  'yellowstone': {
    parks: [
      { name: 'Yellowstone National Park', lat: 44.4280, lng: -110.5885 },
      { name: 'Old Faithful', lat: 44.4605, lng: -110.8281 },
      { name: 'Grand Canyon of the Yellowstone', lat: 44.7417, lng: -110.4994 },
      { name: 'Yellowstone Lake', lat: 44.5400, lng: -110.4000 },
      { name: 'Mammoth Hot Springs', lat: 44.9707, lng: -110.6987 }
    ],
    restaurants: [
      { name: 'Lake Yellowstone Hotel Dining Room', lat: 44.5439, lng: -110.4011 },
      { name: 'Old Faithful Inn Dining Room', lat: 44.4594, lng: -110.8300 },
      { name: 'Grant Village Dining Room', lat: 44.3889, lng: -110.5625 }
    ],
    landmarks: [
      { name: 'Old Faithful Geyser', lat: 44.4605, lng: -110.8281 },
      { name: 'Lower Falls', lat: 44.7114, lng: -110.4994 },
      { name: 'Artist Point', lat: 44.7417, lng: -110.4994 },
      { name: 'Fishing Bridge', lat: 44.5700, lng: -110.4000 },
      { name: 'Norris Geyser Basin', lat: 44.7267, lng: -110.7011 }
    ]
  }
};

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

function detectLocationFromGPS(gpsString) {
  if (!gpsString) return null;

  try {
    const [lat, lng] = gpsString.split(',').map(coord => parseFloat(coord.trim()));

    // Check all locations in database for proximity (within 500 feet)
    const nearbyLocations = [];
    const MAX_DISTANCE_FEET = 500;

    Object.values(LOCATION_DATABASE).forEach(region => {
      Object.values(region).forEach(locationArray => {
        locationArray.forEach(location => {
          if (location.lat && location.lng) {
            const distance = calculateDistance(lat, lng, location.lat, location.lng);
            if (distance <= MAX_DISTANCE_FEET) {
              nearbyLocations.push({
                ...location,
                distance: Math.round(distance),
                type: Object.keys(region).find(key => region[key].includes(location)) || 'unknown'
              });
            }
          }
        });
      });
    });

    if (nearbyLocations.length > 0) {
      // Sort by distance (closest first)
      nearbyLocations.sort((a, b) => a.distance - b.distance);

      return {
        region: 'Yellowstone National Park', // Assuming all current locations are in Yellowstone
        confidence: 0.9,
        nearbyLocations: nearbyLocations.slice(0, 5) // Top 5 closest locations
      };
    }

    return null;
  } catch {
    return null;
  }
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
        context: `Within ${location.distance} feet based on GPS and content match`
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

    // 1. GPS-based location detection with proximity filtering
    const gpsLocation = detectLocationFromGPS(gpsString);
    let nearbyLocations = [];

    if (gpsLocation) {
      results.primaryLocation = gpsLocation.region;
      nearbyLocations = gpsLocation.nearbyLocations;
      results.nearbyPOIs = nearbyLocations.map(loc => ({
        name: loc.name,
        type: loc.type,
        confidence: 0.7,
        distance: loc.distance,
        context: `${gpsLocation.region} - ${loc.distance} feet away`
      }));
      results.confidence = Math.max(results.confidence, gpsLocation.confidence);
    }

    // 2. Time-based context
    const timeInfo = detectLocationFromTime(dateTimeInfo);
    if (timeInfo) {
      results.timeContext = timeInfo;
    }

    // 3. Photo content analysis (only against GPS-nearby locations)
    const contentLocations = analyzePhotoContentForLocations(description, keywords, nearbyLocations);
    results.nearbyPOIs = [...results.nearbyPOIs, ...contentLocations];

    // Remove duplicates and sort by distance
    const uniquePOIs = results.nearbyPOIs.filter((poi, index, self) =>
      index === self.findIndex(p => p.name === poi.name)
    ).sort((a, b) => (a.distance || 999999) - (b.distance || 999999));

    results.nearbyPOIs = uniquePOIs;

    // 4. Incorporate reverse geocode data
    if (geoContext && geoContext.address) {
      const address = geoContext.address.display_name || '';
      if (address && !results.primaryLocation) {
        results.primaryLocation = address;
        results.confidence = Math.max(results.confidence, 0.8);
      }
    }

    if (geoContext && Array.isArray(geoContext.nearby)) {
      geoContext.nearby.forEach(feature => {
        results.nearbyPOIs.push({
          name: feature,
          type: 'nearby',
          confidence: 0.5,
          context: 'Nearby feature'
        });
      });
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