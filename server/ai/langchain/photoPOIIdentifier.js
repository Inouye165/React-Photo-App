// Photo POI Identifier Node - Advanced LangChain node for photo location identification
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');
const OpenAI = require('openai');

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

// Haversine distance calculation
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
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

// Mock POI database - in production, integrate with Google Places, OSM, etc.
const MOCK_POI_DATABASE = {
  // Yellowstone National Park POIs
  yellowstone: [
    {
      name: "Old Faithful Geyser",
      type: "natural_landmark",
      category: "geyser",
      lat: 44.4605,
      lng: -110.8281,
      description: "Iconic geyser that erupts regularly",
      has_water_feature: true,
      visual_keywords: ["geyser", "steam", "eruption", "thermal", "hot spring"]
    },
    {
      name: "Lake Yellowstone Hotel Dining Room",
      type: "restaurant",
      category: "fine_dining",
      lat: 44.5439,
      lng: -110.4011,
      description: "Elegant dining room with lake views",
      has_water_feature: true,
      has_mountain_view: true,
      visual_keywords: ["dining", "tables", "lake", "elegant", "restaurant"]
    },
    {
      name: "Old Faithful Inn Dining Room",
      type: "restaurant",
      category: "casual_dining",
      lat: 44.4594,
      lng: -110.8300,
      description: "Rustic dining in historic lodge",
      visual_keywords: ["lodge", "rustic", "historic", "dining", "inn"]
    },
    {
      name: "Yellowstone Lake",
      type: "natural_landmark",
      category: "lake",
      lat: 44.5400,
      lng: -110.4000,
      description: "Large alpine lake in Yellowstone",
      has_water_feature: true,
      has_mountain_view: true,
      visual_keywords: ["lake", "water", "mountains", "shore", "alpine"]
    },
    {
      name: "Grand Canyon of the Yellowstone",
      type: "natural_landmark",
      category: "canyon",
      lat: 44.7417,
      lng: -110.4994,
      description: "Spectacular canyon with waterfalls",
      has_water_feature: true,
      visual_keywords: ["canyon", "falls", "river", "cliff", "waterfall"]
    }
  ],

  // Maui, Hawaii POIs
  maui: [
    {
      name: "Merriman's Maui",
      type: "restaurant",
      category: "fine_dining",
      lat: 20.9986,
      lng: -156.6673,
      description: "Renowned fine dining restaurant at Kapalua Bay Hotel",
      has_ocean_view: true,
      visual_keywords: ["seafood", "clams", "citrus", "fine dining", "kapalua", "maui", "ocean", "sunset"]
    },
    {
      name: "Mama's Fish House",
      type: "restaurant",
      category: "seafood",
      lat: 20.9271,
      lng: -156.6933,
      description: "Iconic oceanfront seafood restaurant in Paia",
      has_ocean_view: true,
      visual_keywords: ["seafood", "ocean", "fish", "clams", "tropical", "maui"]
    },
    {
      name: " Lahaina Grill",
      type: "restaurant",
      category: "fine_dining",
      lat: 20.8734,
      lng: -156.6799,
      description: "Upscale restaurant in Lahaina with Hawaiian cuisine",
      has_ocean_view: true,
      visual_keywords: ["hawaiian", "grill", "ocean", "lahaina", "upscale"]
    },
    {
      name: "Paia Fish Market",
      type: "restaurant",
      category: "casual_dining",
      lat: 20.9297,
      lng: -156.3667,
      description: "Casual seafood restaurant in Paia",
      has_ocean_view: true,
      visual_keywords: ["fish", "market", "paia", "casual", "seafood"]
    },
    {
      name: "Honolua Store",
      type: "store",
      category: "grocery",
      lat: 21.0158,
      lng: -156.6458,
      description: "Local grocery store in Honolua Bay area",
      has_ocean_view: true,
      visual_keywords: ["grocery", "store", "local", "honolua", "convenience"]
    },
    {
      name: "Napili Bay",
      type: "natural_landmark",
      category: "beach",
      lat: 20.9967,
      lng: -156.6672,
      description: "Beautiful beach in West Maui",
      has_ocean_view: true,
      has_water_feature: true,
      visual_keywords: ["beach", "ocean", "sand", "napili", "swimming"]
    }
  ],

  // Generic POI patterns for broader matching
  generic: [
    {
      name: "Local Restaurant",
      type: "restaurant",
      category: "restaurant",
      description: "Restaurant establishment",
      visual_keywords: ["food", "tables", "chairs", "menu", "dining"]
    },
    {
      name: "Local Seafood Restaurant",
      type: "restaurant",
      category: "seafood",
      description: "Seafood restaurant",
      visual_keywords: ["seafood", "fish", "ocean", "fresh", "marine"]
    },
    {
      name: "Local Park",
      type: "recreation",
      category: "park",
      description: "Public park area",
      visual_keywords: ["park", "trees", "grass", "bench", "playground"]
    },
    {
      name: "Local Store",
      type: "store",
      category: "retail",
      description: "Retail establishment",
      visual_keywords: ["shelves", "products", "shopping", "store", "retail"]
    }
  ]
};

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

  searchNearbyPOIs(lat, lng, sceneAnalysis) {
    const categories = sceneAnalysis.likely_categories || [];
    const radius = this.getSearchRadius(sceneAnalysis.scene_type);

    const nearbyPOIs = [];

    // Search through all POI databases
    Object.values(MOCK_POI_DATABASE).forEach(poiList => {
      poiList.forEach(poi => {
        const distance = calculateDistance(lat, lng, poi.lat, poi.lng);

        if (distance <= radius) {
          // Check if POI matches scene analysis
          const categoryMatch = categories.length > 0 ? categories.some(cat =>
            poi.category.toLowerCase().includes(cat.toLowerCase()) ||
            cat.toLowerCase().includes(poi.category.toLowerCase())
          ) : false; // No category matching if no categories from vision

          const keywordMatch = this.checkKeywordMatch(sceneAnalysis, poi);

          // Check for business name match from visible text
          const businessNameMatch = this.checkBusinessNameMatch(sceneAnalysis, poi);

          // If vision analysis failed (low confidence), be more permissive and include nearby POIs
          const visionFailed = sceneAnalysis.confidence === 'low';
          const shouldInclude = visionFailed || categoryMatch || keywordMatch || businessNameMatch;

          if (shouldInclude) {
            nearbyPOIs.push({
              ...poi,
              distance_miles: distance,
              category_match: categoryMatch,
              keyword_match: keywordMatch,
              business_name_match: businessNameMatch,
              included_due_to_vision_failure: visionFailed && !categoryMatch && !keywordMatch && !businessNameMatch
            });
          }
        }
      });
    });

    return nearbyPOIs;
  }

  checkKeywordMatch(sceneAnalysis, poi) {
    const searchKeywords = sceneAnalysis.search_keywords || [];
    const visualKeywords = sceneAnalysis.visual_elements || [];
    const poiKeywords = poi.visual_keywords || [];

    const allSearchTerms = [...searchKeywords, ...visualKeywords];

    return allSearchTerms.some(term =>
      poiKeywords.some(poiKeyword =>
        poiKeyword.toLowerCase().includes(term.toLowerCase()) ||
        term.toLowerCase().includes(poiKeyword.toLowerCase())
      )
    );
  }

  checkBusinessNameMatch(sceneAnalysis, poi) {
    const businessName = sceneAnalysis.business_name;
    const visibleText = sceneAnalysis.visible_text || [];

    if (!businessName) return false;

    // Check if business name matches POI name
    const nameMatch = poi.name.toLowerCase().includes(businessName.toLowerCase()) ||
                     businessName.toLowerCase().includes(poi.name.toLowerCase());

    // Check if business name appears in visible text
    const textMatch = visibleText.some(text =>
      text.toLowerCase().includes(businessName.toLowerCase())
    );

    return nameMatch || textMatch;
  }

  getSearchRadius(sceneType) {
    return CONFIG.category_specific_radius[sceneType] || CONFIG.default_search_radius_miles;
  }

  rankPOIs(pois, sceneAnalysis, userLocation) {
    return pois.map(poi => {
      const score = this.calculatePOIScore(poi, sceneAnalysis);
      const confidence = this.calculateConfidence(score);

      return {
        name: poi.name,
        type: poi.category,
        distance_miles: Math.round(poi.distance_miles * 100) / 100,
        confidence: confidence,
        coordinates: { lat: poi.lat, lng: poi.lng },
        relevance_reason: this.generateRelevanceReason(poi, sceneAnalysis, score)
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

  generateRelevanceReason(poi, sceneAnalysis, score) {
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
      // Step 2: Search for nearby POIs (always try this)
      const nearbyPOIs = this.searchNearbyPOIs(latitude, longitude, sceneAnalysis);

      // Step 3: Rank POIs by relevance
      const rankedPOIs = this.rankPOIs(nearbyPOIs, sceneAnalysis, { lat: latitude, lng: longitude });

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

module.exports = { PhotoPOIIdentifierNode, photoPOIIdentifierTool };