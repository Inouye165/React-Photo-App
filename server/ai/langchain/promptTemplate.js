// Simple prompt builder for photo analysis. Keeps prompt content centralized so tests and chains can reuse it.
function buildPrompt({ dateTimeInfo = '', metadata = {}, device = '', gps = '', geoContext = null, locationAnalysis = null }) {
  let prompt = `You are an expert photo analyst and location detective. Given the image and metadata, generate the following in JSON (keys: caption, description, keywords, places, animals):

CRITICAL LOCATION DETECTION: You MUST identify and prominently feature the EXACT location in the description. Use GPS coordinates, time of day, nearby landmarks, and visual clues to pinpoint specific parks, cities, restaurants, or POIs. If in Yellowstone, identify specific features like geysers, lakes, or trails.

- caption: A short, human-friendly caption (max 10 words) that includes the location if identifiable.
- description: A detailed description that MUST BEGIN WITH THE EXACT LOCATION (park, city, restaurant, landmark name) and time. Include all visual elements, weather, lighting, and specifically name any identifiable places, restaurants, or landmarks visible in the photo.
- places: An array of specific place/facility/site names that are visible, strongly implied, or can be pinpointed from GPS/time/photo analysis.
- animals: An array of objects for animals detected with fields {type, breed (if identifiable), confidence (0-1)}; return an empty array if no animals.
- keywords: A comma-separated, extensive set of search keywords that MUST include GPS coordinates in the format "GPS:{latitude},{longitude}", camera device, specific place names, restaurant names, landmark names, and location context.

LOCATION ANALYSIS:`;

  if (locationAnalysis) {
    prompt += ` Primary Location: ${locationAnalysis.primaryLocation || 'Unknown'}.`;
    if (locationAnalysis.nearbyPOIs && locationAnalysis.nearbyPOIs.length > 0) {
      prompt += ` Nearby POIs: ${locationAnalysis.nearbyPOIs.map(poi => poi.name).join(', ')}.`;
    }
    if (locationAnalysis.timeContext) {
      prompt += ` Time Context: ${locationAnalysis.timeContext.timeOfDay} (${locationAnalysis.timeContext.hour}:${String(locationAnalysis.timeContext.minute).padStart(2, '0')}).`;
    }
  }

  prompt += `\n\nMetadata:`;

  if (dateTimeInfo) prompt += ` Date/Time: ${dateTimeInfo}.`;
  if (metadata && Object.keys(metadata).length) prompt += ` EXIF: ${JSON.stringify(metadata)}.`;
  prompt += `\nDevice Info: ${device}`;
  if (gps) prompt += `\nGPS Info: ${gps}`;

  if (geoContext && geoContext.address) {
    prompt += `\nReverse geocode: ${geoContext.address.display_name || ''}`;
  }
  if (geoContext && Array.isArray(geoContext.nearby) && geoContext.nearby.length > 0) {
    prompt += `\nNearby named features within radius: ${geoContext.nearby.join(', ')}`;
  }

  prompt += `\n\nRespond in JSON with keys: caption, description, keywords, places, animals.`;
  return prompt;
}// Basic sanity-check parser: try JSON.parse, else return null to let caller handle the raw string
function parseOutputToJSON(text) {
  if (!text) return null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = { buildPrompt, parseOutputToJSON };
