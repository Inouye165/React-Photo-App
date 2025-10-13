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

### Robust Error Handling
- **Fallback Processing**: Automatic fallback between processing methods
- **Rate Limiting**: Built-in delays and retry logic for API calls
- **Validation**: Comprehensive input/output validation and error recovery

### Standardized Output
- **GPS Formatting**: Consistent "GPS:{lat},{lng}" format across all methods
- **Structured Metadata**: JSON-structured AI responses with confidence scores
- **Location Context**: Time-of-day analysis and nearby POI identification

## Usage

The pipeline is integrated into the main photo processing service (`../service.js`) and supports three processing modes:

```javascript
// Direct OpenAI processing
const result1 = await processWithOpenAI(imagePath, metadata);

// Simple chain processing
const result2 = await processWithSimpleChain(imagePath, metadata);

// Full LangChain agent processing
const result3 = await processWithLangChain(imagePath, metadata);
```

## Configuration

All AI processing is configured via environment variables:
- `OPENAI_API_KEY` - Required for all processing methods
- `AI_PROCESSING_METHOD` - Default method (openai|simplechain|langchain)
- `AI_FALLBACK_ENABLED` - Enable automatic fallback on failures

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
