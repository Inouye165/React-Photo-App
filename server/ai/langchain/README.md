LangChain AI Pipeline for Photo Processing
=========================================

This directory contains a comprehensive LangChain-based AI pipeline for intelligent photo analysis, location detection, and metadata enhancement.

## Architecture Overview

The pipeline implements multiple AI processing methods with increasing sophistication:

### Processing Methods
1. **OpenAI Direct** - Basic OpenAI Vision API calls
2. **Simple Chain** - LangChain LLMChain with custom tools
3. **LangChain Full** - Complete LangChain pipeline with agent orchestration

### Core Components

#### Tools (`*.js` files)
- **`exifTool.js`** - Extracts EXIF metadata using the `exifr` library
- **`geolocateTool.js`** - Performs reverse geocoding via Nominatim and finds nearby POIs via Overpass API
- **`locationDetective.js`** - Expert location identification using GPS proximity (within 500ft), time context, and photo content analysis
- **`photoPOIIdentifier.js`** - Advanced LangChain node for comprehensive photo POI identification using vision AI and GPS proximity
- **`promptTemplate.js`** - Centralized prompt building with standardized GPS formatting and location intelligence

#### Adapters (`*Adapter.js` files)
- **`langchainAdapter.js`** - Full LangChain implementation with agent orchestration
- **`simpleChain.js`** - Simplified LangChain chain without full agent capabilities
- **`chainAdapter.js`** - Unified interface for all processing methods

## Key Features

### Intelligent Location Detection
- **GPS Proximity Filtering**: Only suggests locations within 500 feet of photo coordinates
- **Multi-Source Intelligence**: Combines GPS, EXIF time data, and photo content analysis
- **POI Database**: Curated database of Yellowstone National Park locations with precise coordinates
- **Distance Calculation**: Haversine formula for accurate distance measurements

### Advanced Photo POI Identification
- **Vision-Powered Analysis**: GPT-4V integration for detailed scene understanding
- **Scene Classification**: Automatic categorization (restaurant, natural landmark, store, transportation, recreation)
- **Contextual POI Search**: Dynamic search radii based on scene type (0.25 miles for restaurants, 1.0 miles for natural landmarks)
- **Multi-Factor Ranking**: Combines distance, category match, visual features, and keyword relevance
- **Confidence Scoring**: High/medium/low confidence levels with detailed relevance explanations

### Robust Error Handling
- **Fallback Processing**: Automatic fallback between processing methods
- **Rate Limiting**: Built-in delays and retry logic for API calls
- **Validation**: Comprehensive input/output validation and error recovery

### Standardized Output
- **GPS Formatting**: Consistent "GPS:{latitude},{longitude}" format across all methods
- **Structured Metadata**: JSON-structured AI responses with confidence scores
- **Location Context**: Time-of-day analysis and nearby POI identification

## Photo POI Identifier Node

The `photoPOIIdentifier.js` implements a comprehensive LangChain node for identifying Points of Interest from photos and GPS coordinates.

### Features
- **Vision AI Analysis**: Uses GPT-4V to analyze photo content and classify scenes
- **Scene Classification**: Categorizes photos into restaurant, natural landmark, store, transportation, recreation, or other
- **Dynamic POI Search**: Searches for relevant POIs based on scene type with appropriate search radii
- **Intelligent Ranking**: Multi-factor scoring combining distance, category match, visual features, and keyword relevance
- **Structured Output**: Returns detailed JSON with scene analysis, POI rankings, and confidence scores

### Recent Change: Real POI lookups

- The `photoPOIIdentifier` has been refactored to remove the local MOCK_POI_DATABASE.
- It now calls the `geolocateTool` internally to fetch real-world POI names from OpenStreetMap (Nominatim + Overpass) and converts those into the internal POI shape for ranking against the GPT vision analysis.
- This makes the POI suggestions dynamic and up-to-date with live OSM data; tests mock the `geolocate` function to avoid network calls in CI.

### Usage
```javascript
const { photoPOIIdentifierTool } = require('./photoPOIIdentifier.js');

// In LangChain pipeline
const result = await photoPOIIdentifierTool.invoke({
  imageData: base64ImageData,
  latitude: "44.4605",
  longitude: "-110.8281",
  timestamp: "2024-01-15T10:30:00Z"
});
```

### Output Format
```json
{
  "scene_type": "natural_landmark",
  "scene_description": "outdoor scene showing geyser, steam, thermal, eruption with erupting geyser, hot springs where watching geyser",
  "search_radius_miles": 1.0,
  "poi_list": [
    {
      "name": "Old Faithful Geyser",
      "type": "geyser",
      "distance_miles": 0,
      "confidence": "high",
      "coordinates": {"lat": 44.4605, "lng": -110.8281},
      "relevance_reason": "Very close proximity, Category matches scene type, Visual features match photo content, Has water features"
    }
  ],
  "best_match": {
    "name": "Old Faithful Geyser",
    "confidence": "high"
  },
  "analysis_confidence": "high"
}
```

## Configuration

**LangChain is now the default processing method** for advanced AI features including POI identification, location analysis, and multi-step reasoning. All photos will automatically use the full LangChain pipeline unless explicitly disabled.

All AI processing is configured via environment variables:
- `OPENAI_API_KEY` - Required for all processing methods
- `USE_LANGCHAIN=false` - Disable LangChain and use basic OpenAI method instead
- `USE_SIMPLE_CHAIN=true` - Use simple chain processing (overrides LangChain)
- `AI_PROCESSING_METHOD` - Alternative method selection (openai|simplechain|langchain)
- `AI_FALLBACK_ENABLED` - Enable automatic fallback on failures

**Default Behavior**: LangChain processing with POI identification, location detective, and enhanced analysis.

## Development Notes

- **Incremental Adoption**: Tools are designed for gradual LangChain integration
- **Modular Design**: Each component can be tested and developed independently
- **Performance**: Implements caching and batch processing optimizations
- **Extensibility**: Easy to add new tools or processing methods

## Testing

Comprehensive test suite covers:
- Tool functionality (`tests/chainAdapter.test.js`)
- Photo processing integration (`tests/processPhotoAI.test.js`)
- HEIC format handling (`tests/processPhotoAI.heic.test.js`)

Run tests with: `npm test`
