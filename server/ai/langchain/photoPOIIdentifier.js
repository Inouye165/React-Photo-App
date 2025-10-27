// Photo POI Identifier Node - Advanced LangChain node for photo location identification
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const OpenAI = require('openai');
// Use real-world POI lookups via OpenStreetMap Overpass/Nominatim
const { geolocate } = require('./geolocateTool');
const Fuse = require('fuse.js');

// Configuration constants
const CONFIG = {
  default_search_radius_miles: 0.5,
  max_pois_to_return: 10,
  min_confidence_threshold: 0.3,
  category_specific_radius: {
    restaurant: 0.25,
    natural_landmark: 1.0,
    store: 0.25,
    park: 0.75,
    aerial_view: 50.0,
    transportation: 0.5
  },
  vision_model: 'gpt-4o'
};

// Haversine distance calculation (used to compute real distances to OSM POIs)
function calculateDistance(lat1, lng1, lat2, lng2) {
  const aLat = parseFloat(lat1);
  const aLng = parseFloat(lng1);
  const bLat = parseFloat(lat2);
  const bLng = parseFloat(lng2);
  if (![aLat, aLng, bLat, bLng].every(n => Number.isFinite(n))) return 0;
  const R = 3959; // Earth's radius in miles
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Vision analysis prompt for photo understanding
const VISION_ANALYSIS_PROMPT = `You are an expert at identifying locations from photos and GPS data.

Analyze this photo carefully and provide a detailed JSON response about what you see. Pay special attention to identifying specific business names, restaurant names, or distinctive location identifiers:

{
  "scene_type": "restaurant|natural_landmark|store|transportation|recreation|other",
  "confidence": "high|medium|low",
  "visual_elements": ["list", "of", "key", "visual", "features"],
  "likely_categories": ["specific", "poi", "types", "to", "search"],
  "distinctive_features": ["unique", "identifiers", "for", "this", "location"],
  "has_ocean_view": true/false,
  "has_mountain_view": true/false,
  "has_water_feature": true/false,
  "indoor_outdoor": "indoor|outdoor|mixed",
  "time_of_day": "morning|afternoon|evening|night|unknown",
  "visible_text": ["any", "readable", "text", "signs", "menus", "business", "names"],
  "business_name": "specific restaurant/store name if visible in text or distinctive branding",
  "search_keywords": ["relevant", "search", "terms", "for", "POI", "lookup"],
  "activity_indicators": ["what", "people", "might", "be", "doing", "here"],
  "architectural_style": "description of building style if visible",
  "natural_features": ["mountains", "ocean", "forest", "desert", "etc"]
}

IMPORTANT: If you can read any text in the photo (restaurant name, menu items, business signage), include it in "visible_text" and "business_name". Look for distinctive architectural features, logos, or branding that could identify the specific location.`;

// NOTE: The old MOCK_POI_DATABASE and local helper search functions were removed
// in favor of live Overpass/Nominatim queries via `geolocateTool.geolocate`.
// This file now performs: (1) Vision Analysis -> (2) Real POI Fetch -> (3) Rank & Match

// Helper to normalize OSM tags into app-specific categories
function normalizePOICategory(tags) {
  if (!tags) return 'poi';

  // 1. Restaurants / Food
  if (tags.amenity) {
    if (tags.amenity === 'restaurant' || tags.amenity === 'cafe' || tags.amenity === 'fast_food' || tags.amenity === 'bar' || tags.amenity === 'pub') {
      return 'restaurant';
    }
  }

  // 2. Stores / Shops
  if (tags.shop) {
    return 'store'; // Covers supermarket, convenience, clothes, etc.
  }

  // 3. Parks / Recreation
  if (tags.leisure) {
    if (tags.leisure === 'park' || tags.leisure === 'nature_reserve' || tags.leisure === 'playground' || tags.leisure === 'garden' || tags.leisure === 'fitness_centre') {
      return 'park';
    }
  }

  // 4. Landmarks / Tourism (Man-made)
  if (tags.tourism) {
    if (tags.tourism === 'hotel' || tags.tourism === 'museum' || tags.tourism === 'attraction' || tags.tourism === 'viewpoint' || tags.tourism === 'gallery') {
      return 'landmark';
    }
  }
  if (tags.historic) {
    if (tags.historic === 'monument' || tags.historic === 'castle' || tags.historic === 'ruins' || tags.historic === 'memorial') {
      return 'landmark';
    }
  }

  // 5. Natural Landmarks
  if (tags.natural) {
    if (tags.natural === 'peak' || tags.natural === 'volcano' || tags.natural === 'beach' || tags.natural === 'coastline' || tags.natural === 'geyser' || tags.natural === 'hot_spring') {
      return 'natural_landmark';
    }
  }

  return 'poi'; // Default category
}

// Helper to match vision analysis (text, keywords) against real POI data
function performVisionMatching(realPOIs, sceneAnalysis) {
  if (!sceneAnalysis || (!sceneAnalysis.business_name && (sceneAnalysis.visible_text || []).length === 0 && (sceneAnalysis.search_keywords || []).length === 0)) {
    // No visual data to match against, return POIs as-is
    return realPOIs;
  }

  // 1. Prepare search terms from vision
  const nameQueries = [sceneAnalysis.business_name, ...(sceneAnalysis.visible_text || [])].filter(Boolean);
  const keywordQueries = [...(sceneAnalysis.search_keywords || []), ...(sceneAnalysis.visual_elements || [])];

  // 2. Configure Fuse.js for fuzzy name matching
  const fuse = new Fuse(realPOIs, {
    keys: ['name'],
    threshold: 0.4, // 0.0 = perfect match, 1.0 = any match. 0.4 is a good starting point.
    includeScore: true,
  });

  // 3. Perform fuzzy search for business names
  const nameMatches = new Map();
  if (nameQueries.length > 0) {
    nameQueries.forEach(query => {
      const results = fuse.search(query);
      results.forEach(result => {
        if (result.score <= 0.4) { // Only accept good matches
          nameMatches.set(result.item.name, true);
        }
      });
    });
  }

  // 4. Perform simple keyword matching
  const keywordMatches = new Map();
  if (keywordQueries.length > 0) {
    realPOIs.forEach(poi => {
      const poiText = [poi.name, ...(poi.visual_keywords || [])].join(' ').toLowerCase();
      const hasKeywordMatch = keywordQueries.some(kw => poiText.includes(String(kw || '').toLowerCase()));
      if (hasKeywordMatch) {
        keywordMatches.set(poi.name, true);
      }
    });
  }

  // 5. Return updated POI list with match flags
  return realPOIs.map(poi => ({
    ...poi,
    business_name_match: nameMatches.has(poi.name) || false,
    keyword_match: keywordMatches.has(poi.name) || false,
  }));
}

class PhotoPOIIdentifierNode {
  constructor(openaiApiKey) {
    this.openai = new OpenAI({ 
      apiKey: openaiApiKey,
      timeout: 30000 // 30 second timeout for POI analysis
    });
  }

  async analyzeImage(imageData, mimeType = 'image/jpeg') {
    try {
      const response = await this.openai.chat.completions.create({
        model: CONFIG.vision_model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_ANALYSIS_PROMPT },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${imageData}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.1
      });

      const content = response.choices[0].message.content;
      return this.parseVisionResponse(content);
    } catch (error) {
      console.error('Vision analysis error:', error);
      return this.getFallbackAnalysis();
    }
  }

  parseVisionResponse(content) {
    try {
      // Extract JSON from response (handle potential markdown formatting)
      const jsonMatch = content.match(/```json\s*(\{[\s\S]*?\})\s*```/) ||
                       content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      }

      // Fallback parsing for unstructured response
      return this.parseUnstructuredResponse(content);
    } catch (error) {
      console.error('JSON parsing error:', error);
      return this.getFallbackAnalysis();
    }
  }

  parseUnstructuredResponse(content) {
    // Basic fallback parsing for non-JSON responses
    const analysis = {
      scene_type: "other",
      confidence: "low",
      visual_elements: [],
      likely_categories: [],
      distinctive_features: [],
      has_ocean_view: false,
      has_mountain_view: false,
      has_water_feature: false,
      indoor_outdoor: "unknown",
      time_of_day: "unknown",
      visible_text: [],
      search_keywords: [],
      activity_indicators: [],
      architectural_style: "",
      natural_features: []
    };

    // Extract keywords from content
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('restaurant') || lowerContent.includes('food') || lowerContent.includes('dining')) {
      analysis.scene_type = 'restaurant';
      analysis.likely_categories = ['restaurant', 'cafe', 'bar'];
    } else if (lowerContent.includes('mountain') || lowerContent.includes('geyser') || lowerContent.includes('nature')) {
      analysis.scene_type = 'natural_landmark';
      analysis.likely_categories = ['park', 'trail', 'natural_feature'];
    } else if (lowerContent.includes('store') || lowerContent.includes('shop') || lowerContent.includes('retail')) {
      analysis.scene_type = 'store';
      analysis.likely_categories = ['retail', 'shop', 'store'];
    }

    return analysis;
  }

  getFallbackAnalysis() {
    return {
      scene_type: "other",
      confidence: "low",
      visual_elements: ["photo analysis unavailable"],
      likely_categories: ["unknown"],
      distinctive_features: [],
      has_ocean_view: false,
      has_mountain_view: false,
      has_water_feature: false,
      indoor_outdoor: "unknown",
      time_of_day: "unknown",
      visible_text: [],
      search_keywords: [],
      activity_indicators: [],
      architectural_style: "",
      natural_features: []
    };
  }
 

  // Note: Local keyword and business-name matching logic was intentionally removed.
  // The ranker now receives POI objects returned from the external `geolocate` tool
  // and uses the existing `rankPOIs` flow to score and return results.

  getSearchRadius(sceneType) {
    return CONFIG.category_specific_radius[sceneType] || CONFIG.default_search_radius_miles;
  }

  rankPOIs(pois, sceneAnalysis, _userLocation) {
    return pois.map(poi => {
      const _score = this.calculatePOIScore(poi, sceneAnalysis);
      const confidence = this.calculateConfidence(_score);

      return {
        name: poi.name,
        type: poi.category,
        distance_miles: Math.round(poi.distance_miles * 100) / 100,
        confidence: confidence,
        coordinates: { lat: poi.lat, lng: poi.lng },
        relevance_reason: this.generateRelevanceReason(poi, sceneAnalysis, _score)
      };
    }).sort((a, b) => {
      // Sort by confidence first, then by distance
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
      return confDiff !== 0 ? confDiff : a.distance_miles - b.distance_miles;
    }).slice(0, CONFIG.max_pois_to_return);
  }

  calculatePOIScore(poi, sceneAnalysis) {
    let score = 0;

    // Distance score (inverse relationship - closer is better)
    if (poi.distance_miles < 0.1) score += 50;
    else if (poi.distance_miles < 0.25) score += 30;
    else if (poi.distance_miles < 0.5) score += 20;
    else if (poi.distance_miles < 1.0) score += 10;

    // Business name match gets highest priority
    if (poi.business_name_match) score += 50;

    // Category match bonus
    if (poi.category_match) score += 30;

    // Keyword match bonus
    if (poi.keyword_match) score += 20;

    // Visual feature matches
    if (sceneAnalysis.has_ocean_view && poi.has_ocean_view) score += 15;
    if (sceneAnalysis.has_mountain_view && poi.has_mountain_view) score += 15;
    if (sceneAnalysis.has_water_feature && poi.has_water_feature) score += 15;

    // Scene type alignment
    if (sceneAnalysis.scene_type === poi.type) score += 25;

    return score;
  }

  calculateConfidence(score) {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  generateRelevanceReason(poi, sceneAnalysis, _score) {
    const reasons = [];

    if (poi.distance_miles < 0.1) reasons.push('Very close proximity');
    else if (poi.distance_miles < 0.25) reasons.push('Close proximity');
    else reasons.push(`${Math.round(poi.distance_miles * 100) / 100} miles away`);

    if (poi.business_name_match) reasons.push('Business name matches visible text/signage');
    if (poi.category_match) reasons.push('Category matches scene type');
    if (poi.keyword_match) reasons.push('Visual features match photo content');

    if (sceneAnalysis.has_ocean_view && poi.has_ocean_view) reasons.push('Has ocean view');
    if (sceneAnalysis.has_mountain_view && poi.has_mountain_view) reasons.push('Has mountain view');
    if (sceneAnalysis.has_water_feature && poi.has_water_feature) reasons.push('Has water features');

    return reasons.join(', ');
  }

  async identifyPOI(imageData, latitude, longitude, timestamp = null) {
    let sceneAnalysis = null;

    try {
      // Step 1: Analyze the image (may fail)
      sceneAnalysis = await this.analyzeImage(imageData);
    } catch (error) {
      console.error('Vision analysis failed, falling back to location-only search:', error.message);
      // Create a minimal scene analysis for location-based search
      sceneAnalysis = {
        scene_type: 'unknown',
        confidence: 'low',
        visual_elements: [],
        distinctive_features: [],
        activity_indicators: [],
        indoor_outdoor: 'unknown',
        has_ocean_view: false,
        has_mountain_view: false,
        has_water_feature: false
      };
    }


    try {
      // Step 2: Fetch real-world POIs using the geolocate tool
      let realPOIs = [];
      try {
        // geolocate expects a gpsString like "lat,lon"
        const gpsString = `${latitude},${longitude}`;
        const geoData = await geolocate({ gpsString });

        // Format the real POI object array into the object array our ranker expects
        if (geoData && geoData.nearby) {
          realPOIs = geoData.nearby.map(p => {
            // Support both legacy string "name" entries and new object entries
            if (!p) return null;
            if (typeof p === 'string') {
              return {
                name: p,
                type: 'poi',
                category: 'poi',
                lat: latitude,
                lng: longitude,
                distance_miles: 0,
                visual_keywords: [String(p).toLowerCase()],
                has_ocean_view: false,
                has_mountain_view: false,
                has_water_feature: false,
                category_match: false,
                keyword_match: false,
                business_name_match: false,
                included_due_to_vision_failure: false
              };
            }

            const poiLat = p.lat || (p.center && p.center.lat) || latitude;
            const poiLon = p.lon || (p.center && p.center.lon) || longitude;
            const distance = calculateDistance(latitude, longitude, poiLat, poiLon) || 0;

            // Try to infer a category from common OSM tags and normalize it
            const tags = p.tags || {};
            const category = normalizePOICategory(tags);

            // Visual keywords: include name and up to a few tag values
            const tagValues = Object.values(tags || {}).slice(0, 3).map(v => String(v).toLowerCase());
            const visualKeywords = [String(p.name).toLowerCase(), category, ...tagValues];

            const has_water_feature = (tags && (tags.natural === 'water' || tags.natural === 'beach' || tags.waterway));

            return {
              name: p.name,
              type: category,
              category: category,
              lat: poiLat,
              lng: poiLon,
              distance_miles: distance,
              visual_keywords: visualKeywords.filter(Boolean),
              has_ocean_view: (tags && (tags.natural === 'coastline' || tags.natural === 'beach')),
              has_mountain_view: (tags && (tags.natural === 'peak' || tags.natural === 'volcano')),
              has_water_feature: !!has_water_feature,
              // business_name_match and keyword_match will be set after vision matching
            };
          }).filter(Boolean);
        }
      } catch (geoError) {
        console.error('Real-time POI lookup failed:', geoError && geoError.message ? geoError.message : geoError);
        // Continue with empty POI list
        realPOIs = [];
      }

  // Step 3: Match visual analysis against real POIs
  const matchedPOIs = performVisionMatching(realPOIs, sceneAnalysis);

  // Step 4: Rank POIs by relevance using matched POIs
  const rankedPOIs = this.rankPOIs(matchedPOIs, sceneAnalysis, { lat: latitude, lng: longitude });

      // Step 4: Determine best match
      const bestMatch = rankedPOIs.length > 0 ? {
        name: rankedPOIs[0].name,
        confidence: rankedPOIs[0].confidence
      } : null;

      // Step 5: Format final output
      return {
        scene_type: sceneAnalysis.scene_type,
        scene_description: sceneAnalysis.confidence === 'low' ? 'location-based analysis only' : this.generateSceneDescription(sceneAnalysis),
        search_radius_miles: this.getSearchRadius(sceneAnalysis.scene_type),
        poi_list: rankedPOIs,
        best_match: bestMatch,
        analysis_confidence: sceneAnalysis.confidence,
        timestamp: timestamp,
        search_location: { lat: latitude, lng: longitude }
      };

    } catch (error) {
      console.error('POI identification error:', error);
      return {
        error: error.message,
        scene_type: "unknown",
        scene_description: "Analysis failed",
        search_radius_miles: CONFIG.default_search_radius_miles,
        poi_list: [],
        best_match: null,
        analysis_confidence: "low",
        timestamp: timestamp,
        search_location: { lat: latitude, lng: longitude }
      };
    }
  }

  generateSceneDescription(sceneAnalysis) {
    const elements = sceneAnalysis.visual_elements || [];
    const features = sceneAnalysis.distinctive_features || [];
    const activities = sceneAnalysis.activity_indicators || [];

    const parts = [];

    if (sceneAnalysis.indoor_outdoor !== 'unknown') {
      parts.push(`${sceneAnalysis.indoor_outdoor} scene`);
    }

    if (elements.length > 0) {
      parts.push(`showing ${elements.slice(0, 3).join(', ')}`);
    }

    if (features.length > 0) {
      parts.push(`with ${features.slice(0, 2).join(' and ')}`);
    }

    if (activities.length > 0) {
      parts.push(`where ${activities.slice(0, 2).join(' and ')}`);
    }

    return parts.length > 0 ? parts.join(', ') : 'Photo scene analysis';
  }
}

// Create LangChain tool wrapper
const photoPOIIdentifierTool = tool(
  async ({ imageData, latitude, longitude, timestamp }) => {
    const identifier = new PhotoPOIIdentifierNode(process.env.OPENAI_API_KEY);

    const result = await identifier.identifyPOI(
      imageData,
      parseFloat(latitude),
      parseFloat(longitude),
      timestamp
    );

    return JSON.stringify(result);
  },
  {
    name: 'photo_poi_identifier',
    description: 'Advanced tool that analyzes photos and GPS coordinates to identify specific Points of Interest (POIs) where the photo was taken. Returns scene classification, nearby POIs ranked by relevance, and best match identification.',
    schema: z.object({
      imageData: z.string().describe('Base64 encoded image data'),
      latitude: z.string().describe('GPS latitude in decimal format'),
      longitude: z.string().describe('GPS longitude in decimal format'),
      timestamp: z.string().optional().describe('Photo timestamp (ISO format)')
    })
  }
);

module.exports = { PhotoPOIIdentifierNode, photoPOIIdentifierTool, performVisionMatching, normalizePOICategory };